import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentRunOptions } from '../server/agents/agent-runner';
import { readRuns } from '../server/agents/registro';
import { buildApp } from '../server/app';
import { DEFAULT_CALIBRATION } from '../server/generator/calibration';
import { loadLearning } from '../server/generator/aprendizaje';
import { readGraph } from '../server/persistence/graph-store';
import { objetivosPath, readObjetivos, validateObjetivos } from '../server/persistence/objetivos-store';
import { buildPlan, PlanInvalidError } from '../server/planner/apply';
import { plannerMessage } from '../server/planner/prompts';
import { converseFoco, planFoco } from '../server/planner/planner-service';
import type { Concept } from '../shared/types';

const realRoot = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-19T12:00:00Z');
let tmp: string;
let concepts: Concept[];
let ctx: { conceptIds: Set<string>; focosActivosMax: number };

const foco = (over: object = {}) => ({ id: 'calc', titulo: 'Cálculo para deep learning', estado: 'activo', conceptIds: [], material: 'Entender derivadas parciales y la regla de la cadena para seguir backpropagation.', ...over });
const write = (focos: object[]) => writeFileSync(objetivosPath(tmp), JSON.stringify({ version: 1, rol: 'Data Scientist', focos }));
const proposal = (value: unknown) => `Listo.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
const good = { resumen: 'De la derivada a la regla de la cadena.', pasos: [{ conceptId: 'math:chain-rule', bloom: 3, porque: 'Es la base de backpropagation.' }, { conceptId: 'math:derivatives', bloom: 2, porque: 'Sin derivadas no hay regla de la cadena.' }] };

let calls: AgentRunOptions[];
let answers: string[];
const deps = {
  hasClaude: () => true,
  now: () => NOW,
  runAgent: async (o: AgentRunOptions) => {
    calls.push(o);
    return { text: answers.shift() ?? 'sin respuesta', cost: 0.1, sessionId: null };
  },
};

beforeEach(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-planner-'));
  mkdirSync(path.join(tmp, 'configuracion-retos'));
  writeFileSync(path.join(tmp, 'configuracion-retos', 'knowledge-graph.json'), readFileSync(path.join(realRoot, 'configuracion-retos', 'knowledge-graph.json')));
  concepts = (await readGraph(tmp)).concepts;
  ctx = { conceptIds: new Set(concepts.map((c) => c.id)), focosActivosMax: 3 };
  calls = [];
  answers = [];
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('buildPlan (R56)', () => {
  it('ordena los prerrequisitos antes de lo que los necesita y arranca como propuesto', () => {
    const plan = buildPlan(good, concepts, NOW.toISOString());
    expect(plan.estado).toBe('propuesto');
    expect(plan.pasos.map((p) => p.conceptId)).toEqual(['math:derivatives', 'math:chain-rule']);
  });
  it('rechaza conceptos inexistentes, Bloom fuera de rango y planes vacíos, y descarta repetidos', () => {
    expect(() => buildPlan({ pasos: [{ conceptId: 'x:no', bloom: 3, porque: 'a' }] }, concepts, 'now')).toThrow(PlanInvalidError);
    expect(() => buildPlan({ pasos: [{ conceptId: 'math:derivatives', bloom: 9, porque: 'a' }] }, concepts, 'now')).toThrow(/bloom/);
    expect(() => buildPlan({ pasos: [] }, concepts, 'now')).toThrow(/vacío/);
    const dup = buildPlan({ pasos: [{ conceptId: 'math:derivatives', bloom: 2, porque: 'a' }, { conceptId: 'math:derivatives', bloom: 3, porque: 'b' }] }, concepts, 'now');
    expect(dup.pasos).toHaveLength(1);
  });
});

describe('planFoco (R56)', () => {
  it('guarda el plan propuesto en el foco, registra al Planificador y le pasa el objetivo como dato', async () => {
    write([foco()]);
    answers.push(proposal(good));
    const out = await planFoco({ repoRoot: tmp, focoId: 'calc', deps });
    expect(out).toMatchObject({ status: 'ok', cost: 0.1 });
    expect(calls[0]!.maxUsd).toBe(DEFAULT_CALIBRATION.presupuestoUsdPlan);
    expect(calls[0]!.message).toContain('<objetivo>\nEntender derivadas parciales');
    expect(calls[0]!.message).toContain('math:chain-rule | Regla de la cadena');
    const saved = await readObjetivos(tmp, ctx);
    expect(saved.focos[0]!.plan).toMatchObject({ estado: 'propuesto', pasos: [{ conceptId: 'math:derivatives' }, { conceptId: 'math:chain-rule' }] });
    expect((await readRuns(tmp))[0]).toMatchObject({ rol: 'planificador', focoId: 'calc', outcome: 'ok' });
  });

  it('una respuesta inválida se repara una vez; si sigue mal, no se guarda nada', async () => {
    write([foco()]);
    answers.push(proposal({ pasos: [{ conceptId: 'x:no', bloom: 3, porque: 'a' }] }), proposal(good));
    expect((await planFoco({ repoRoot: tmp, focoId: 'calc', deps })).status).toBe('ok');
    expect(calls[1]!.message).toContain('no existe en el grafo');

    write([foco()]);
    answers.push('sin json', 'tampoco');
    const bad = await planFoco({ repoRoot: tmp, focoId: 'calc', deps });
    expect(bad).toMatchObject({ status: 'error', code: 'invalid_output' });
    expect((await readObjetivos(tmp, ctx)).focos[0]!.plan).toBeUndefined();
  });

  it('un foco inexistente o sin Claude no llama al agente', async () => {
    write([foco()]);
    expect(await planFoco({ repoRoot: tmp, focoId: 'otro', deps })).toMatchObject({ status: 'error', code: 'not_found' });
    expect(await planFoco({ repoRoot: tmp, focoId: 'calc', deps: { ...deps, hasClaude: () => false } })).toMatchObject({ status: 'error', code: 'no_claude' });
    expect(calls).toHaveLength(0);
  });

  it('el índice de la biblioteca y de la fuente principal llegan al prompt y se dan como carpetas legibles', async () => {
    write([foco({ carpeta: 'material/curso' })]);
    mkdirSync(path.join(tmp, 'material', 'curso'), { recursive: true });
    writeFileSync(path.join(tmp, 'material', 'curso', 'W1.pdf'), Buffer.alloc(2048));
    writeFileSync(path.join(tmp, 'material', 'libro.pdf'), Buffer.alloc(2048));
    answers.push(proposal(good));
    await planFoco({ repoRoot: tmp, focoId: 'calc', deps });
    expect(calls[0]!.message).toContain('principal fuente de estudio');
    expect(calls[0]!.message).toContain('- W1.pdf');
    expect(calls[0]!.message).toContain('- libro.pdf');
    expect(calls[0]!.addDirs!.length).toBeGreaterThan(0);
  });

  it('POST /api/objetivos/:id/plan devuelve el plan; sin foco, 404', async () => {
    write([foco()]);
    answers.push(proposal(good));
    const app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, plannerDeps: deps });
    const ok = await app.inject({ method: 'POST', url: '/api/objetivos/calc/plan' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().plan.estado).toBe('propuesto');
    expect((await app.inject({ method: 'POST', url: '/api/objetivos/nada/plan' })).statusCode).toBe(404);
    await app.close();
  });
});

describe('plan en objetivos.json y su efecto en los retos (R56)', () => {
  const plan = (estado: string) => ({ estado, creadoAt: NOW.toISOString(), resumen: 'r', pasos: [{ conceptId: 'math:derivatives', bloom: 2, porque: 'a' }] });

  it('valida el plan: concepto inexistente o estado desconocido se rechazan', () => {
    expect(validateObjetivos({ version: 1, rol: '', focos: [foco({ plan: plan('propuesto') })] }, ctx).ok).toBe(true);
    const bad = validateObjetivos({ version: 1, rol: '', focos: [foco({ plan: { ...plan('xx'), pasos: [{ conceptId: 'x:no', bloom: 2, porque: 'a' }] } })] }, ctx);
    expect(bad.ok).toBe(false);
  });

  it('solo un plan aceptado sesga el plan de los challenges; uno propuesto no', async () => {
    write([foco({ conceptIds: ['sql:select'], plan: plan('propuesto') })]);
    expect((await loadLearning(tmp, concepts, DEFAULT_CALIBRATION, NOW)).focos[0]!.conceptIds).toEqual(['sql:select']);
    write([foco({ conceptIds: ['sql:select'], plan: plan('aceptado') })]);
    expect((await loadLearning(tmp, concepts, DEFAULT_CALIBRATION, NOW)).focos[0]!.conceptIds).toEqual(['math:derivatives']);
  });

  it('plannerMessage sin objetivo pide deducir el alcance del título', () => {
    const msg = plannerMessage({ foco: { ...(foco() as object), material: '' } as never, rol: '', concepts: concepts.slice(0, 3) });
    expect(msg).toContain('deduce el alcance del título');
  });
});

describe('conversación con el Planificador (R57)', () => {
  const withPlan = () => foco({ plan: { estado: 'aceptado', creadoAt: NOW.toISOString(), resumen: 'r', pasos: [{ conceptId: 'math:derivatives', bloom: 2, porque: 'a' }] } });
  const reply = (extra: object = {}) => proposal({ respuesta: 'Entendido: añado la regla de la cadena.', ...extra });

  it('el feedback se responde, queda guardado y, si cambia el plan, este vuelve a «propuesto»', async () => {
    write([withPlan()]);
    answers.push(reply({ plan: good }));
    const out = await converseFoco({ repoRoot: tmp, focoId: 'calc', accion: 'feedback', texto: 'Falta la regla de la cadena', deps });
    expect(out).toMatchObject({ status: 'ok', planCambiado: true });
    expect(calls[0]!.message).toContain('<usuario>\nFalta la regla de la cadena\n</usuario>');
    expect(calls[0]!.message).toContain('Avance 0 %');
    const saved = (await readObjetivos(tmp, ctx)).focos[0]!;
    expect(saved.plan!.estado).toBe('propuesto');
    expect(saved.plan!.pasos.map((p) => p.conceptId)).toEqual(['math:derivatives', 'math:chain-rule']);
    expect(saved.conversacion!.map((m) => [m.rol, m.tipo])).toEqual([['usuario', 'feedback'], ['planificador', 'respuesta']]);
    expect(saved.conversacion![1]!.planCambiado).toBe(true);
  });

  it('una revisión de avance sin plan nuevo deja el plan aceptado tal cual', async () => {
    write([withPlan()]);
    answers.push(reply());
    const out = await converseFoco({ repoRoot: tmp, focoId: 'calc', accion: 'revision', deps });
    expect(out).toMatchObject({ status: 'ok', planCambiado: false });
    const saved = (await readObjetivos(tmp, ctx)).focos[0]!;
    expect(saved.plan!.estado).toBe('aceptado');
    expect(saved.conversacion![1]).toMatchObject({ tipo: 'revision' });
    expect((await readRuns(tmp))[0]).toMatchObject({ rol: 'planificador', focoId: 'calc' });
  });

  it('rechaza feedback vacío sin llamar al agente; una respuesta mala se repara y, si sigue mal, no guarda nada', async () => {
    write([withPlan()]);
    expect(await converseFoco({ repoRoot: tmp, focoId: 'calc', accion: 'feedback', texto: '  ', deps })).toMatchObject({ status: 'error', code: 'bad_request' });
    expect(calls).toHaveLength(0);
    answers.push(proposal({ sin: 'respuesta' }), proposal({ respuesta: 'ok', plan: { pasos: [{ conceptId: 'x:no', bloom: 3, porque: 'a' }] } }));
    expect(await converseFoco({ repoRoot: tmp, focoId: 'calc', accion: 'revision', deps })).toMatchObject({ status: 'error', code: 'invalid_output' });
    expect((await readObjetivos(tmp, ctx)).focos[0]!.conversacion).toBeUndefined();
  });

  it('la conversación guardada conserva solo los 40 mensajes más recientes', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `m-${i}`, at: NOW.toISOString(), rol: 'usuario', tipo: 'feedback', texto: `n${i}` }));
    write([foco({ conversacion: many })]);
    answers.push(reply());
    await converseFoco({ repoRoot: tmp, focoId: 'calc', accion: 'feedback', texto: 'uno más', deps });
    const conv = (await readObjetivos(tmp, ctx)).focos[0]!.conversacion!;
    expect(conv).toHaveLength(40);
    expect(conv[conv.length - 2]!.texto).toBe('uno más');
  });

  it('Agentes muestra la revisión con la ejecución que la produjo', async () => {
    write([withPlan()]);
    answers.push(reply());
    const app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, plannerDeps: deps });
    await app.inject({ method: 'POST', url: '/api/objetivos/calc/conversacion', payload: { accion: 'revision' } });
    const body = (await app.inject('/api/agentes')).json() as { revisiones: { focoId: string; tipo: string; runId: string | null }[] };
    expect(body.revisiones).toHaveLength(1);
    expect(body.revisiones[0]).toMatchObject({ focoId: 'calc', tipo: 'revision' });
    expect(body.revisiones[0]!.runId).toBeTruthy();
    await app.close();
  });

  it('POST /api/objetivos/:id/conversacion valida la acción', async () => {
    write([withPlan()]);
    answers.push(reply());
    const app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, plannerDeps: deps });
    expect((await app.inject({ method: 'POST', url: '/api/objetivos/calc/conversacion', payload: { accion: 'x' } })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/api/objetivos/calc/conversacion', payload: { accion: 'revision' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().mensajes).toHaveLength(2);
    await app.close();
  });
});
