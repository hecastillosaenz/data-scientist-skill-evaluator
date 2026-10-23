import { randomBytes } from 'node:crypto';
import { AgentError, hasClaude as defaultHasClaude, runAgent as defaultRunAgent } from '../agents/agent-runner';
import { extractJson } from '../agents/json';
import { recordAgent } from '../agents/registro';
import { MATERIAL_DIR, scanMaterial } from '../generator/material';
import { loadCalibration } from '../generator/calibration';
import { GraphError, readGraph } from '../persistence/graph-store';
import { ObjetivosError, readObjetivos, writeObjetivos } from '../persistence/objetivos-store';
import { CONVERSACION_MAX, MENSAJE_MAX_ALMACENADO, MENSAJE_MAX_USUARIO, type MensajeFoco, type PlanFoco } from '../../shared/objetivos';
import { computeInsights } from '../../web/src/domain/conceptState';
import { computeFocoProgress } from '../../web/src/domain/objetivoProgress';
import { readState } from '../persistence/state';
import { buildPlan, PlanInvalidError } from './apply';
import { chatMessage, chatRepair, chatSystem } from './chat';
import { plannerMessage, plannerRepair, plannerSystem } from './prompts';

export interface PlannerDeps {
  runAgent: typeof defaultRunAgent;
  hasClaude: () => boolean;
  now?: () => Date;
}

export type PlanErrorCode = 'not_found' | 'no_claude' | 'budget' | 'invalid_output' | 'objetivos' | 'graph' | 'internal';
export type PlanOutcome = { status: 'ok'; plan: PlanFoco; cost: number } | { status: 'error'; code: PlanErrorCode; message: string };

const defaults: PlannerDeps = { runAgent: defaultRunAgent, hasClaude: () => defaultHasClaude() };

/**
 * Arma el plan de estudio de un foco (R56). El Planificador (solo lectura) propone conceptos y niveles de Bloom; el
 * orquestador valida contra el grafo, ordena por prerrequisitos y guarda el plan como **propuesto** en `objetivos.json`
 * (escritura atómica). Hasta que el usuario lo acepte no influye en los challenges. Si algo falla no se guarda nada.
 */
export async function planFoco(params: { repoRoot: string; focoId: string; signal?: AbortSignal; deps?: Partial<PlannerDeps> }): Promise<PlanOutcome> {
  const { repoRoot, focoId, signal } = params;
  const deps = { ...defaults, ...params.deps };
  const now = () => (deps.now ?? (() => new Date()))();
  try {
    const [graph, config] = await Promise.all([readGraph(repoRoot), loadCalibration(repoRoot)]);
    const ctx = { conceptIds: new Set(graph.concepts.map((c) => c.id)), focosActivosMax: config.focosActivosMax };
    const objetivos = await readObjetivos(repoRoot, ctx);
    const foco = objetivos.focos.find((f) => f.id === focoId);
    if (!foco) return { status: 'error', code: 'not_found', message: `No encontré el foco «${focoId}». Guarda tus objetivos primero.` };
    if (!deps.hasClaude()) return { status: 'error', code: 'no_claude', message: 'No encuentro Claude Code: no puedo armar el plan ahora.' };

    const [lib, own] = await Promise.all([scanMaterial(repoRoot, MATERIAL_DIR), foco.carpeta ? scanMaterial(repoRoot, foco.carpeta) : null]);
    const biblioteca = lib.dir && lib.files.length > 0 ? { dir: lib.dir, archivos: lib.files } : undefined;
    const carpeta = own?.dir && own.files.length > 0 ? { dir: own.dir, archivos: own.files } : undefined;
    const addDirs = [...new Set([biblioteca?.dir, carpeta?.dir].filter((d): d is string => !!d))];
    const message = plannerMessage({ foco, rol: objetivos.rol, concepts: graph.concepts, biblioteca, carpeta });

    let spent = 0;
    let previous = '';
    let problem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = config.presupuestoUsdPlan - spent;
      if (remaining < 0.02) return { status: 'error', code: 'budget', message: `Se agotó el presupuesto del plan (US$ ${config.presupuestoUsdPlan}).` };
      let text: string;
      try {
        const result = await recordAgent(repoRoot, 'planificador', deps.runAgent, { focoId }, deps.now)({
          message: attempt === 0 ? message : plannerRepair(previous, problem),
          system: plannerSystem(),
          maxUsd: Math.round(remaining * 100) / 100,
          addDirs,
          ...(signal ? { signal } : {}),
        });
        spent += result.cost;
        text = result.text;
      } catch (err) {
        if (err instanceof AgentError && err.code === 'budget') return { status: 'error', code: 'budget', message: `Se agotó el presupuesto del plan (US$ ${config.presupuestoUsdPlan}).` };
        if (err instanceof AgentError && err.code === 'no_claude') return { status: 'error', code: 'no_claude', message: err.message };
        return { status: 'error', code: 'internal', message: (err as Error).message };
      }
      previous = text;
      const json = extractJson(text);
      if (!json.ok) {
        problem = json.error;
        continue;
      }
      let plan: PlanFoco;
      try {
        plan = buildPlan(json.value, graph.concepts, now().toISOString());
      } catch (err) {
        if (err instanceof PlanInvalidError) {
          problem = err.message;
          continue;
        }
        throw err;
      }
      // Se relee el archivo: el usuario pudo editar otros focos mientras el agente pensaba. Solo cambia el plan de este.
      const fresh = await readObjetivos(repoRoot, ctx);
      if (!fresh.focos.some((f) => f.id === focoId)) return { status: 'error', code: 'not_found', message: 'El foco ya no existe: el plan no se guardó.' };
      await writeObjetivos(repoRoot, { ...fresh, focos: fresh.focos.map((f) => (f.id === focoId ? { ...f, plan } : f)) }, ctx);
      return { status: 'ok', plan, cost: spent };
    }
    return { status: 'error', code: 'invalid_output', message: `El Planificador no produjo un plan válido: ${problem}` };
  } catch (err) {
    if (err instanceof ObjetivosError) return { status: 'error', code: 'objetivos', message: err.message };
    if (err instanceof GraphError) return { status: 'error', code: 'graph', message: err.message };
    return { status: 'error', code: 'internal', message: (err as Error).message };
  }
}

export type ChatOutcome =
  | { status: 'ok'; mensajes: MensajeFoco[]; plan: PlanFoco | undefined; planCambiado: boolean; cost: number }
  | { status: 'error'; code: PlanErrorCode | 'bad_request'; message: string };

/**
 * Conversa sobre un objetivo (R57): `feedback` responde a lo que la persona escribe y `revision` evalúa su avance. En
 * ambos casos puede proponer un plan nuevo, que queda como **propuesto** (hay que aceptarlo otra vez). El avance que ve
 * el agente lo calcula el orquestador con la Evidence; el agente no lo inventa. Si algo falla, no se guarda nada.
 */
export async function converseFoco(params: { repoRoot: string; focoId: string; accion: 'feedback' | 'revision'; texto?: string; signal?: AbortSignal; deps?: Partial<PlannerDeps> }): Promise<ChatOutcome> {
  const { repoRoot, focoId, accion, signal } = params;
  const deps = { ...defaults, ...params.deps };
  const now = () => (deps.now ?? (() => new Date()))();
  const texto = (params.texto ?? '').trim();
  if (accion === 'feedback' && (texto === '' || texto.length > MENSAJE_MAX_USUARIO)) return { status: 'error', code: 'bad_request', message: `Escribe tu feedback (hasta ${MENSAJE_MAX_USUARIO} caracteres).` };
  try {
    const [graph, config, state] = await Promise.all([readGraph(repoRoot), loadCalibration(repoRoot), readState({ repoRoot, strict: false })]);
    const ctx = { conceptIds: new Set(graph.concepts.map((c) => c.id)), focosActivosMax: config.focosActivosMax };
    const objetivos = await readObjetivos(repoRoot, ctx);
    const foco = objetivos.focos.find((f) => f.id === focoId);
    if (!foco) return { status: 'error', code: 'not_found', message: `No encontré el foco «${focoId}». Guarda tus objetivos primero.` };
    if (!deps.hasClaude()) return { status: 'error', code: 'no_claude', message: 'No encuentro Claude Code: no puedo responder ahora.' };

    const data = state.data;
    const progress = computeFocoProgress(foco, data, computeInsights(data.concepts, data.challenges, data.evidence, data.testResults));
    const wanted = new Set(progress.pasos.map((p) => p.paso.conceptId));
    const stageConcept = new Map(data.challenges.flatMap((c) => c.stages).map((s) => [s.id, s.conceptIds.find((id) => wanted.has(id))] as const));
    const nameOf = (id: string) => graph.concepts.find((c) => c.id === id)?.name ?? id;
    const notes = data.evidence
      .filter((e) => e.notes && stageConcept.get(e.stageId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6)
      .map((e) => ({ at: e.at, concept: nameOf(stageConcept.get(e.stageId)!), result: e.result, notes: e.notes!.slice(0, 300) }));

    const [lib, own] = await Promise.all([scanMaterial(repoRoot, MATERIAL_DIR), foco.carpeta ? scanMaterial(repoRoot, foco.carpeta) : null]);
    const addDirs = [...new Set([lib.dir && lib.files.length > 0 ? lib.dir : undefined, own?.dir && own.files.length > 0 ? own.dir : undefined].filter((d): d is string => !!d))];
    const message = chatMessage({ foco, rol: objetivos.rol, accion, texto, progress, history: foco.conversacion ?? [], concepts: graph.concepts, notes });

    let spent = 0;
    let previous = '';
    let problem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = config.presupuestoUsdPlan - spent;
      if (remaining < 0.02) return { status: 'error', code: 'budget', message: `Se agotó el presupuesto (US$ ${config.presupuestoUsdPlan}).` };
      let out: string;
      try {
        const result = await recordAgent(repoRoot, 'planificador', deps.runAgent, { focoId }, deps.now)({
          message: attempt === 0 ? message : chatRepair(previous, problem),
          system: chatSystem(),
          maxUsd: Math.round(remaining * 100) / 100,
          addDirs,
          ...(signal ? { signal } : {}),
        });
        spent += result.cost;
        out = result.text;
      } catch (err) {
        if (err instanceof AgentError && err.code === 'budget') return { status: 'error', code: 'budget', message: `Se agotó el presupuesto (US$ ${config.presupuestoUsdPlan}).` };
        if (err instanceof AgentError && err.code === 'no_claude') return { status: 'error', code: 'no_claude', message: err.message };
        return { status: 'error', code: 'internal', message: (err as Error).message };
      }
      previous = out;
      const json = extractJson(out);
      if (!json.ok) {
        problem = json.error;
        continue;
      }
      const v = json.value as Record<string, unknown> | null;
      const respuesta = v && typeof v.respuesta === 'string' ? v.respuesta.trim() : '';
      if (respuesta === '') {
        problem = 'Falta `respuesta` (texto).';
        continue;
      }
      let plan: PlanFoco | undefined;
      if (v!.plan !== undefined && v!.plan !== null) {
        try {
          plan = buildPlan(v!.plan, graph.concepts, now().toISOString());
        } catch (err) {
          if (err instanceof PlanInvalidError) {
            problem = err.message;
            continue;
          }
          throw err;
        }
      }
      const at = now().toISOString();
      const mk = (rol: MensajeFoco['rol'], tipo: MensajeFoco['tipo'], t: string, extra: Partial<MensajeFoco> = {}): MensajeFoco => ({ id: `m-${randomBytes(4).toString('hex')}`, at, rol, tipo, texto: t.slice(0, MENSAJE_MAX_ALMACENADO), ...extra });
      const mensajes: MensajeFoco[] = [
        ...(accion === 'feedback' ? [mk('usuario', 'feedback', texto)] : [mk('usuario', 'revision', 'Revisión de avance')]),
        mk('planificador', accion === 'feedback' ? 'respuesta' : 'revision', respuesta, plan ? { planCambiado: true } : {}),
      ];
      const fresh = await readObjetivos(repoRoot, ctx);
      if (!fresh.focos.some((f) => f.id === focoId)) return { status: 'error', code: 'not_found', message: 'El foco ya no existe: nada se guardó.' };
      await writeObjetivos(repoRoot, {
        ...fresh,
        focos: fresh.focos.map((f) => (f.id === focoId ? { ...f, ...(plan ? { plan } : {}), conversacion: [...(f.conversacion ?? []), ...mensajes].slice(-CONVERSACION_MAX) } : f)),
      }, ctx);
      return { status: 'ok', mensajes, plan, planCambiado: !!plan, cost: spent };
    }
    return { status: 'error', code: 'invalid_output', message: `El Planificador no produjo una respuesta válida: ${problem}` };
  } catch (err) {
    if (err instanceof ObjetivosError) return { status: 'error', code: 'objetivos', message: err.message };
    if (err instanceof GraphError) return { status: 'error', code: 'graph', message: err.message };
    return { status: 'error', code: 'internal', message: (err as Error).message };
  }
}
