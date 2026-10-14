import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GenerateEvent } from '../../shared/generate';
import type { TemaPedido } from '../../shared/objetivos';
import type { Challenge, Concept, DomainId, TestQuestion } from '../../shared/types';
import { recordAgent } from '../agents/registro';
import { AgentError, hasClaude as defaultHasClaude, runAgent as defaultRunAgent } from '../agents/agent-runner';
import { strictStageErrors, validateChallenge } from '../challenges/validate';
import { configDir } from '../paths';
import { GraphError } from '../persistence/graph-store';
import { readState } from '../persistence/state';
import { assembleChallenge, buildNotebook, businessQuestionCount, logHeader } from './assemble';
import { CalibrationError, loadCalibration, type CalibrationConfig } from './calibration';
import { loadLearning } from './aprendizaje';
import { checkAgainstPlan, planChallenge, TemaError, type ChallengePlan } from './plan';
import { extractJson, generatorSystem, repairMessage, skeletonMessage, stageMessage, testMessage } from './prompts';
import { checkDataset, checkReference } from './reference';
import {
  discardWork,
  isStale,
  publish,
  PublishError,
  readGenerationState,
  workDir,
  writeGenerationState,
  type GenerationState,
  type Skeleton,
} from './workspace';

export interface GenerateDeps {
  runAgent: typeof defaultRunAgent;
  hasClaude: () => boolean;
  /** Intérprete Python con el que el orquestador ejecuta el seed y las soluciones (por defecto `.venv/bin/python`). */
  python?: string;
  now?: () => Date;
}

export interface GenerateParams {
  repoRoot: string;
  /** Elección manual opcional; por defecto lo recomienda el grafo (R38). */
  domain?: DomainId;
  /** Tema a pedido (R43): ya resuelto a un concepto del grafo. */
  tema?: TemaPedido;
  /** Retoma el trabajo conservado desde la última fase válida en vez de empezar de cero (R39). */
  resume?: boolean;
  /** Multiplica el presupuesto por fase: 2 = «Reintentar con el doble». */
  budgetFactor?: number;
  signal?: AbortSignal;
  deps?: Partial<GenerateDeps>;
}

const defaults: GenerateDeps = { runAgent: defaultRunAgent, hasClaude: () => defaultHasClaude() };
/** Por debajo de esto no vale la pena lanzar otra llamada: se trata como presupuesto agotado. */
const MIN_CALL_USD = 0.05;
const MAX_EXTRA_CONCEPTS = 3;

const step = (id: string, label: string, status: 'running' | 'ok' | 'error', detail?: string, cost?: number): GenerateEvent => ({ type: 'step', id, label, status, ...(detail ? { detail } : {}), ...(cost !== undefined ? { cost: Math.round(cost * 10_000) / 10_000 } : {}) });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

/** Convierte lo que devolvió el Generador en un `Skeleton` sin lanzar: lo que falte se devuelve como errores. */
function parseSkeleton(value: unknown): { skeleton?: Skeleton; errors: string[] } {
  if (!isObject(value)) return { errors: ['La respuesta debe ser un objeto JSON.'] };
  const errors: string[] = [];
  for (const k of ['title', 'dataset', 'scenario', 'task'] as const) if (!isString(value[k])) errors.push(`Falta «${k}» (texto).`);
  if (!isObject(value.objectives)) errors.push('Falta «objectives» (lookingFor, outcomes, skills).');
  if (!isObject(value.data) || !Array.isArray(value.data.tables) || !isString(value.data.seedSql)) errors.push('Falta «data» con `tables` y `seedSql`.');
  else if (value.data.engine !== 'duckdb') errors.push('`data.engine` debe ser «duckdb» (el orquestador solo construye datasets DuckDB).');
  if (!Array.isArray(value.businessQuestions)) errors.push('Falta «businessQuestions» (lista).');
  if (!Array.isArray(value.stages) || value.stages.some((s) => !isObject(s) || typeof s.number !== 'number')) errors.push('Falta «stages» (lista de objetos con `number`, `title`, `description`, `estimatedMinutes`).');
  if (errors.length > 0) return { errors };
  return { skeleton: value as unknown as Skeleton, errors: [] };
}

interface Ctx {
  params: GenerateParams;
  deps: GenerateDeps;
  config: CalibrationConfig;
  state: GenerationState;
  concepts: Concept[];
  python: string;
  budget: number;
  dir: string;
  /** Carpetas del material del usuario que el Generador puede leer (R49). */
  materialDirs: string[];
}

/**
 * Genera un challenge de forma transaccional (SDD R38, R39). El orquestador calcula el plan; el Generador (solo lectura)
 * escribe el contenido por fases; cada fase se valida (esquema, plan, dataset, solución de referencia, conceptos) y se
 * guarda en `estado.json`. Solo si todo pasa se publica con un `rename` en `challenge/challenge-NNN/`.
 */
export async function* generateChallenge(params: GenerateParams): AsyncGenerator<GenerateEvent> {
  const { repoRoot, signal } = params;
  const deps = { ...defaults, ...params.deps };
  const now = deps.now ?? (() => new Date());
  const aborted = () => signal?.aborted === true;
  const cancelled = async (): Promise<GenerateEvent> => {
    await discardWork(repoRoot); // R39c: «Detener» borra el área de trabajo
    return { type: 'error', code: 'aborted', message: 'Generación cancelada. No se creó ningún challenge.' };
  };

  try {
    // Antes de empezar: si `claude` no está, falla de inmediato y no se crea nada (R39).
    if (!deps.hasClaude()) {
      yield { type: 'error', code: 'no_claude', message: 'No encuentro Claude Code. Instálalo y ejecuta «claude» una vez en una terminal para iniciar sesión.' };
      return;
    }

    yield step('plan', 'Calculando el plan de calibración con tu grafo', 'running');
    let config: CalibrationConfig;
    try {
      config = await loadCalibration(repoRoot);
    } catch (err) {
      if (!(err instanceof CalibrationError)) throw err;
      yield step('plan', 'Calculando el plan de calibración con tu grafo', 'error', err.message);
      yield { type: 'error', code: 'calibration', message: err.message };
      return;
    }
    let appState;
    try {
      appState = await readState({ repoRoot, strict: true, now });
    } catch (err) {
      if (!(err instanceof GraphError)) throw err;
      yield step('plan', 'Calculando el plan de calibración con tu grafo', 'error', err.message);
      yield { type: 'error', code: 'state', message: err.message };
      return;
    }
    const { data } = appState;

    // Objetivos de aprendizaje (R44, R45): sesgan el plan y su material viaja al Generador como contexto.
    const { focos, context: learning, materialDirs } = await loadLearning(repoRoot, data.concepts, config, now());

    // ¿Se retoma lo conservado o se empieza de cero?
    const existing = await readGenerationState(repoRoot);
    const taken = (id: string) => existsSync(path.join(repoRoot, 'challenge', id));
    let state: GenerationState;
    if (params.resume && existing && !isStale(existing, config.horasConservacion, now()) && !taken(existing.plan.id)) {
      state = existing;
    } else {
      await discardWork(repoRoot);
      let plan: ChallengePlan;
      try {
        plan = planChallenge({
          concepts: data.concepts,
          challenges: data.challenges,
          evidence: data.evidence,
          testResults: data.testResults,
          config,
          now: now(),
          ...(params.domain ? { domain: params.domain } : {}),
          ...(params.tema ? { tema: params.tema } : {}),
          focos,
        });
      } catch (err) {
        if (!(err instanceof TemaError)) throw err;
        yield step('plan', 'Calculando el plan de calibración con tu grafo', 'error', err.message);
        yield { type: 'error', code: 'state', message: err.message };
        return;
      }
      state = { version: 1, createdAt: now().toISOString(), plan, stages: {}, completed: [], spentUsd: 0 };
      await mkdir(workDir(repoRoot, plan.id), { recursive: true });
      await writeGenerationState(repoRoot, state);
    }
    const { plan } = state;
    yield step('plan', 'Calculando el plan de calibración con tu grafo', 'ok', `${plan.id} · ${plan.stages.length} etapas · ${plan.mode === 'arranque' ? 'modo arranque' : 'calibrado'}`);
    yield { type: 'plan', plan };

    const ctx: Ctx = {
      params,
      deps,
      config,
      state,
      concepts: data.concepts,
      python: deps.python ?? path.join(repoRoot, '.venv', 'bin', 'python'),
      budget: config.presupuestoUsdPorFase * Math.max(1, params.budgetFactor ?? 1),
      dir: workDir(repoRoot, plan.id),
      materialDirs,
    };
    const save = () => writeGenerationState(repoRoot, ctx.state);
    const done = async (id: string) => {
      if (!ctx.state.completed.includes(id)) ctx.state.completed.push(id);
      await save();
    };

    // ── Fase 1: esqueleto ──────────────────────────────────────────────────
    if (!state.completed.includes('esqueleto') || !state.skeleton) {
      const skeleton = yield* runPhase<Skeleton>(ctx, 'esqueleto', 'Diseñando el caso y los datos', skeletonMessage(repoRoot, plan, data.concepts, learning), async (json, signalAbort) => {
        const parsed = parseSkeleton(json);
        if (!parsed.skeleton) return { errors: parsed.errors };
        return validateSkeleton(ctx, parsed.skeleton, signalAbort);
      });
      if (!skeleton) return;
      ctx.state.skeleton = skeleton;
      await done('esqueleto');
    } else {
      yield step('esqueleto', 'Diseñando el caso y los datos', 'ok', 'Retomado: ya estaba validado');
    }
    const skeleton = ctx.state.skeleton!;

    // ── Fase 2: una etapa por llamada ──────────────────────────────────────
    for (const planned of plan.stages) {
      const id = `etapa-${planned.number}`;
      const title = skeleton.stages.find((s) => s.number === planned.number)?.title ?? '';
      const label = `Escribiendo la Etapa ${planned.number}: ${title}`;
      if (ctx.state.completed.includes(id) && ctx.state.stages[String(planned.number)]) {
        yield step(id, label, 'ok', 'Retomado: ya estaba validado');
        continue;
      }
      const proposed = skeleton.stages.find((s) => s.number === planned.number);
      const extra = (proposed?.conceptIds ?? []).filter((c) => !planned.conceptIds.includes(c));
      const content = yield* runPhase<unknown>(ctx, id, label, stageMessage(repoRoot, plan, data.concepts, skeleton, planned.number, extra, learning), (json, abortSignal) => validateStage(ctx, planned.number, json, abortSignal));
      if (!content) return;
      ctx.state.stages[String(planned.number)] = content;
      await done(id);
    }

    // ── Fase 3: test final ────────────────────────────────────────────────
    if (!ctx.state.completed.includes('test') || !ctx.state.finalTest) {
      const stageConcepts = [...new Set(assembleChallenge(plan, skeleton, ctx.state.stages).stages.flatMap((s) => s.conceptIds))];
      const test = yield* runPhase<TestQuestion[]>(ctx, 'test', 'Preparando el test final', testMessage(repoRoot, plan, data.concepts, skeleton, stageConcepts, learning), async (json) => validateTest(ctx, json));
      if (!test) return;
      ctx.state.finalTest = test;
      await done('test');
    } else {
      yield step('test', 'Preparando el test final', 'ok', 'Retomado: ya estaba validado');
    }

    // ── Publicar: validación final y rename ───────────────────────────────
    yield step('publicar', 'Validando y publicando el challenge', 'running');
    if (aborted()) return void (yield await cancelled());
    const challenge = assembleChallenge(plan, skeleton, ctx.state.stages, ctx.state.finalTest);
    const gate = [...checkAgainstPlan(challenge, plan), ...validateChallenge(challenge, { strict: true }).errors];
    if (gate.length > 0) {
      yield step('publicar', 'Validando y publicando el challenge', 'error', gate[0]);
      yield { type: 'error', code: 'gate_failed', phase: 'publicar', message: `El challenge no pasó la validación final:\n${gate.slice(0, 6).map((e) => `• ${e}`).join('\n')}` };
      return;
    }
    await writeFile(path.join(ctx.dir, 'challenge.json'), `${JSON.stringify(challenge, null, 2)}\n`);
    await writeFile(path.join(ctx.dir, 'notebook.ipynb'), buildNotebook(challenge));
    await writeFile(path.join(ctx.dir, 'logs-avance.md'), logHeader(plan.id));
    try {
      await publish(repoRoot, plan.id);
    } catch (err) {
      if (!(err instanceof PublishError)) throw err;
      yield step('publicar', 'Validando y publicando el challenge', 'error', err.message);
      yield { type: 'error', code: 'conflict', phase: 'publicar', message: err.message };
      return;
    }
    yield step('publicar', 'Validando y publicando el challenge', 'ok', `challenge/${plan.id}/`);
    yield { type: 'result', challengeId: plan.id, title: challenge.title };
    yield { type: 'done', cost: ctx.state.spentUsd };
  } catch (err) {
    if (aborted() || (err instanceof AgentError && err.code === 'aborted')) return void (yield await cancelled());
    yield { type: 'error', code: 'internal', message: `Error inesperado al generar: ${(err as Error).message}`, canResume: true };
  }
}

type Validation<T> = { errors: string[]; value?: T };

/**
 * Una fase: llama al Generador, valida y, si falla, repara hasta `reparacionesPorFase` veces con los errores del
 * validador dentro de la misma operación (R39). Las reparaciones cuentan para el presupuesto de la fase.
 */
async function* runPhase<T>(
  ctx: Ctx,
  id: string,
  label: string,
  message: string,
  validate: (json: unknown, signal?: AbortSignal) => Promise<Validation<T>>,
): AsyncGenerator<GenerateEvent, T | null> {
  const { params, deps, config } = ctx;
  const aborted = () => params.signal?.aborted === true;
  yield step(id, label, 'running');
  let spent = 0;
  let previous = '';
  let errors: string[] = [];

  for (let attempt = 0; attempt <= config.reparacionesPorFase; attempt++) {
    const remaining = ctx.budget - spent;
    if (remaining < MIN_CALL_USD) return yield* budgetStop(ctx, id, label);
    const tools: GenerateEvent[] = [];
    let text = '';
    let failure: unknown = null;
    try {
      const result = await recordAgent(params.repoRoot, 'generador', deps.runAgent, { challengeId: ctx.state.plan.id, fase: id }, deps.now)({
        message: attempt === 0 ? message : repairMessage(message, previous, errors),
        system: generatorSystem(),
        addDirs: [path.join(configDir(params.repoRoot), 'plantillas'), ...ctx.materialDirs],
        maxUsd: Math.round(remaining * 100) / 100,
        ...(params.signal ? { signal: params.signal } : {}),
        onEvent: (e) => e.type === 'tool' && tools.push({ type: 'tool', text: e.text }),
      });
      spent += result.cost;
      ctx.state.spentUsd += result.cost;
      text = result.text;
    } catch (err) {
      failure = err;
    }
    for (const t of tools) yield t; // lo que alcanzó a leer el agente se muestra aunque la llamada falle
    if (failure) {
      const err = failure;
      if (err instanceof AgentError && err.code === 'budget') {
        ctx.state.spentUsd += remaining;
        return yield* budgetStop(ctx, id, label);
      }
      if (err instanceof AgentError && err.code === 'aborted') throw err;
      const message = (err as Error).message;
      yield step(id, label, 'error', message);
      yield { type: 'error', code: err instanceof AgentError && err.code === 'no_claude' ? 'no_claude' : 'internal', phase: id, message, canResume: true };
      return null;
    }
    if (aborted()) throw new AgentError('Generación cancelada.', 'aborted');
    previous = text;
    if (process.env.DSC_DEBUG_DIR) {
      await mkdir(process.env.DSC_DEBUG_DIR, { recursive: true });
      await writeFile(path.join(process.env.DSC_DEBUG_DIR, `${ctx.state.plan.id}-${id}-intento${attempt}.txt`), text);
    }

    const json = extractJson(text);
    const checked = json.ok ? await validate(json.value, params.signal) : { errors: [json.error] };
    if (checked.errors.length === 0 && checked.value !== undefined) {
      yield step(id, label, 'ok', attempt > 0 ? `Listo tras ${attempt} ${attempt === 1 ? 'reparación' : 'reparaciones'}` : undefined, spent);
      return checked.value;
    }
    errors = checked.errors;
    if (attempt < config.reparacionesPorFase) yield step(id, label, 'running', `Reparando (${attempt + 1} de ${config.reparacionesPorFase}): ${errors[0]}`);
  }

  yield step(id, label, 'error', errors[0], spent);
  yield {
    type: 'error',
    code: 'invalid_output',
    phase: id,
    canResume: true,
    message: `El Generador no produjo una salida válida en «${label}» tras ${config.reparacionesPorFase} ${config.reparacionesPorFase === 1 ? 'reparación' : 'reparaciones'}:\n${errors.slice(0, 5).map((e) => `• ${e}`).join('\n')}`,
  };
  return null;
}

async function* budgetStop(ctx: Ctx, id: string, label: string): AsyncGenerator<GenerateEvent, null> {
  await writeGenerationState(ctx.params.repoRoot, ctx.state);
  const usd = ctx.budget.toFixed(2).replace('.', ',');
  yield step(id, label, 'error', `Se agotó el presupuesto de la fase (US$ ${usd})`);
  yield {
    type: 'error',
    code: 'budget',
    phase: id,
    canResume: true,
    message: `Se agotó el presupuesto de la fase «${label}» (US$ ${usd}). No se creó ningún challenge. «Reintentar» retoma desde la última fase válida; «Reintentar con el doble» duplica el presupuesto.`,
  };
  return null;
}

async function validateSkeleton(ctx: Ctx, skeleton: Skeleton, signal?: AbortSignal): Promise<Validation<Skeleton>> {
  const { state, concepts } = ctx;
  const plan = state.plan;
  const errors: string[] = [];

  const numbers = skeleton.stages.map((s) => s.number).sort((a, b) => a - b);
  if (numbers.join(',') !== plan.stages.map((s) => s.number).join(',')) errors.push(`«stages» debe tener exactamente las etapas ${plan.stages.map((s) => s.number).join(', ')} (el plan lo fija).`);
  const expectedQuestions = businessQuestionCount(plan.difficulty);
  if (skeleton.businessQuestions.length !== expectedQuestions) errors.push(`«businessQuestions» debe tener ${expectedQuestions} preguntas (dificultad ${plan.difficulty}) y tiene ${skeleton.businessQuestions.length}.`);
  const known = new Set(concepts.map((c) => c.id));
  for (const s of skeleton.stages) {
    const planned = plan.stages.find((p) => p.number === s.number);
    const extra = (s.conceptIds ?? []).filter((id) => !planned?.conceptIds.includes(id));
    if (extra.length > MAX_EXTRA_CONCEPTS) errors.push(`Etapa ${s.number}: «conceptIds» admite como máximo ${MAX_EXTRA_CONCEPTS} conceptos de apoyo además de los del plan.`);
    for (const id of extra) if (!known.has(id)) errors.push(`Etapa ${s.number}: el concepto «${id}» no existe en el grafo (R35); usa un id exacto del catálogo.`);
  }
  if (errors.length > 0) return { errors };

  const assembled = assembleChallenge(plan, skeleton, {});
  const structural = validateChallenge(assembled, { strict: false }).errors;
  if (structural.length > 0) return { errors: structural };

  // Dataset (R18, R24): el seed se escribe en el área de trabajo, se construye la base y se comprueba lo declarado.
  await mkdir(path.join(ctx.dir, 'datos'), { recursive: true });
  await writeFile(path.join(ctx.dir, 'datos', 'seed.sql'), `${skeleton.data.seedSql.trim()}\n`);
  const dataset = await checkDataset({ dir: ctx.dir, python: ctx.python, tables: skeleton.data.tables as never, ...(signal ? { signal } : {}) });
  if (dataset.length > 0) return { errors: dataset };
  return { errors: [], value: skeleton };
}

async function validateStage(ctx: Ctx, number: number, json: unknown, signal?: AbortSignal): Promise<Validation<unknown>> {
  if (!isObject(json)) return { errors: ['La respuesta debe ser el objeto `content` de la etapa.'] };
  const { state } = ctx;
  const assembled = assembleChallenge(state.plan, state.skeleton!, { ...state.stages, [String(number)]: json });
  const stage = assembled.stages.find((s) => s.number === number)!;
  const mine = (e: string) => e.includes(`stages[${number}]`) || e.includes(`Etapa ${number}`) || e.includes(`etapa ${number}`);
  const errors = [...validateChallenge(assembled, { strict: false }).errors.filter(mine), ...strictStageErrors(stage)];
  if (errors.length > 0) return { errors };
  const reference = await checkReference({ dir: ctx.dir, python: ctx.python, stage, ...(signal ? { signal } : {}) });
  return reference.length > 0 ? { errors: reference } : { errors: [], value: json };
}

async function validateTest(ctx: Ctx, json: unknown): Promise<Validation<TestQuestion[]>> {
  const test = isObject(json) ? json.finalTest : undefined;
  if (!Array.isArray(test)) return { errors: ['Falta «finalTest» (lista de 5 a 8 preguntas).'] };
  const { state } = ctx;
  const assembled: Challenge = assembleChallenge(state.plan, state.skeleton!, state.stages, test as TestQuestion[]);
  const errors = validateChallenge(assembled, { strict: false }).errors.filter((e) => /finalTest|Test «|test/i.test(e));
  if (test.length < 5 || test.length > 8) errors.push(`«finalTest» debe tener de 5 a 8 preguntas y tiene ${test.length}.`);
  return errors.length > 0 ? { errors } : { errors: [], value: assembled.finalTest! };
}
