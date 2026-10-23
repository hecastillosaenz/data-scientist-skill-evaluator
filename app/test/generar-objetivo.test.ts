import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentError, type AgentRunOptions } from '../server/agents/agent-runner';
import { buildApp } from '../server/app';
import { loadLearning } from '../server/generator/aprendizaje';
import { DEFAULT_CALIBRATION } from '../server/generator/calibration';
import { generateChallenge } from '../server/generator/generator-service';
import { elegirObjetivo, MODELO_VALIDO } from '../server/generator/objetivo';
import { planChallenge } from '../server/generator/plan';
import { minutosSugeridos } from '../server/generator/prompts';
import { readGraph } from '../server/persistence/graph-store';
import { objetivosPath } from '../server/persistence/objetivos-store';
import type { GenerateEvent } from '../shared/generate';
import type { Concept } from '../shared/types';

const realRoot = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-19T12:00:00Z');
let tmp: string;
let concepts: Concept[];

const plan = (estado = 'aceptado') => ({ estado, creadoAt: NOW.toISOString(), resumen: 'r', pasos: [{ conceptId: 'math:derivatives', bloom: 2, porque: 'a' }, { conceptId: 'math:chain-rule', bloom: 3, porque: 'b' }] });
const foco = (over: object = {}) => ({ id: 'calc', titulo: 'Cálculo para DL', estado: 'activo', conceptIds: [], material: 'Derivadas y regla de la cadena.', plan: plan(), ...over });
const write = (focos: object[]) => writeFileSync(objetivosPath(tmp), JSON.stringify({ version: 1, rol: 'DS', focos }));
const data = () => ({ concepts, challenges: [], evidence: [], testResults: [] });

beforeEach(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-gen-obj-'));
  mkdirSync(path.join(tmp, 'configuracion-retos'));
  writeFileSync(path.join(tmp, 'configuracion-retos', 'knowledge-graph.json'), readFileSync(path.join(realRoot, 'configuracion-retos', 'knowledge-graph.json')));
  concepts = (await readGraph(tmp)).concepts;
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('challenge para un objetivo (R58)', () => {
  it('el tema es el primer concepto del plan que aún no cumples; sin plan no hay tema fijo', async () => {
    write([foco()]);
    const r = await elegirObjetivo(tmp, 'calc', data());
    expect(r).toMatchObject({ ok: true, tema: { conceptId: 'math:derivatives' } });
    expect((r as { tema: { texto: string } }).tema.texto).toContain('Cálculo para DL');
    write([foco({ plan: undefined })]);
    expect(await elegirObjetivo(tmp, 'calc', data())).toEqual({ ok: true, foco: expect.objectContaining({ id: 'calc' }) });
  });

  it('un objetivo inexistente o logrado se rechaza con un mensaje', async () => {
    write([foco({ estado: 'logrado' })]);
    expect(await elegirObjetivo(tmp, 'nada', data())).toMatchObject({ ok: false });
    expect(await elegirObjetivo(tmp, 'calc', data())).toMatchObject({ ok: false, message: expect.stringContaining('logrado') });
  });

  it('con un objetivo elegido solo ese orienta el contexto, aunque esté pausado, y su plan manda aunque sea propuesto', async () => {
    write([foco({ id: 'a', estado: 'pausado', plan: plan('propuesto') }), foco({ id: 'b', titulo: 'Otro', conceptIds: ['sql:select'], plan: undefined })]);
    const sin = await loadLearning(tmp, concepts, DEFAULT_CALIBRATION, NOW);
    expect(sin.focos.map((f) => f.id)).toEqual(['b']);
    const con = await loadLearning(tmp, concepts, DEFAULT_CALIBRATION, NOW, { focoId: 'a' });
    expect(con.focos).toEqual([{ id: 'a', titulo: 'Cálculo para DL', conceptIds: ['math:derivatives', 'math:chain-rule'], dirige: true }]);
  });

  it('GET /api/plan?foco= orienta el plan hacia el objetivo y avisa si no existe', async () => {
    write([foco()]);
    const app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, now: () => NOW });
    const ok = await app.inject('/api/plan?foco=calc');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().focos).toEqual(['Cálculo para DL']);
    expect(ok.json().stages.flatMap((s: { conceptIds: string[] }) => s.conceptIds)).toContain('math:derivatives');
    expect((await app.inject('/api/plan?foco=nada')).statusCode).toBe(400);
    await app.close();
  });
});

describe('un plan aceptado dirige el reto (R59)', () => {
  const base = () => ({ concepts, challenges: [], evidence: [], config: DEFAULT_CALIBRATION, now: NOW });
  const ruta = ['math:functions-m', 'math:derivatives', 'math:chain-rule'];

  it('sin tema pedido, el siguiente concepto del plan decide qué se practica aunque sus fundamentos no estén vistos', () => {
    const plan = planChallenge({ ...base(), focos: [{ id: 'calc', titulo: 'Cálculo para DL', conceptIds: ruta, dirige: true }] });
    expect(plan.stages.some((s) => s.conceptIds.some((id) => id.startsWith('math:')))).toBe(true);
    expect(plan.focos).toEqual(['Cálculo para DL']);
    expect(plan.rationale.join(' ')).toContain('Tu objetivo «Cálculo para DL»');
    expect(plan.tema).toBeUndefined(); // no es un tema escrito por el usuario
  });

  it('un foco que no dirige (conceptos sueltos o plan sin aceptar) sigue solo desempatando', () => {
    const plan = planChallenge({ ...base(), focos: [{ id: 'calc', titulo: 'Cálculo', conceptIds: ruta }] });
    expect(plan.stages.every((s) => !s.conceptIds.some((id) => id.startsWith('math:')))).toBe(true);
  });

  it('un tema escrito por el usuario manda sobre el del objetivo; con la ruta dominada no dirige nada', () => {
    const plan = planChallenge({ ...base(), tema: { conceptId: 'sql:select', texto: 'select' }, focos: [{ id: 'calc', titulo: 'Cálculo', conceptIds: ruta, dirige: true }] });
    expect(plan.tema?.conceptId).toBe('sql:select');
    expect(plan.stages.some((s) => s.conceptIds.includes('sql:select'))).toBe(true);
  });
});

describe('etapas y proyecto de punta a punta (R60)', () => {
  const base = () => ({ concepts, challenges: [], evidence: [], config: DEFAULT_CALIBRATION, now: NOW });

  it('el número de etapas lo decide quien genera (2–6) y por defecto sigue la calibración', () => {
    expect(planChallenge(base()).stages).toHaveLength(3);
    expect(planChallenge({ ...base(), etapas: 5 }).stages).toHaveLength(5);
    expect(planChallenge({ ...base(), etapas: 99 }).stages).toHaveLength(6);
  });

  it('un proyecto recorre Feature Engineering → Model Training → reporte, con conceptos de cada dominio y el reporte al final', () => {
    const plan = planChallenge({ ...base(), etapas: 5, proyecto: true });
    expect(plan.proyecto).toBe(true);
    expect(plan.stages.map((s) => s.domain)).toEqual(['features', 'features', 'training', 'training', 'business']);
    expect(plan.stages.at(-1)!.role).toBe('integracion');
    expect(new Set(plan.stages.flatMap((s) => s.conceptIds)).size).toBe(5); // sin repetir conceptos
    expect(plan.stages.slice(0, 4).every((s) => s.mechanism === 'codigo_assert')).toBe(true);
    expect(plan.stages.at(-1)!.mechanism).toBe('rubric_claude');
  });

  it('con 6 etapas el proyecto empieza por limpieza, y un proyecto ignora el refuerzo y el tema pedido', () => {
    const plan = planChallenge({ ...base(), etapas: 6, proyecto: true, tema: { conceptId: 'sql:select', texto: 'select' } });
    expect(plan.stages.map((s) => s.domain)).toEqual(['cleaning', 'features', 'features', 'training', 'training', 'business']);
    expect(plan.tema).toBeUndefined();
  });

  it('el tiempo sugerido crece con la dificultad y con el proyecto', () => {
    expect(minutosSugeridos({ difficulty: 1 }).tipico).toBe(90);
    expect(minutosSugeridos({ difficulty: 3 }).tipico).toBeGreaterThan(minutosSugeridos({ difficulty: 2 }).tipico);
    expect(minutosSugeridos({ difficulty: 1, proyecto: true }).tipico).toBeGreaterThan(90);
  });

  it('el endpoint valida etapas y el plan acepta proyecto', async () => {
    const app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, now: () => NOW });
    expect((await app.inject({ method: 'POST', url: '/api/generate', payload: { etapas: 12 } })).statusCode).toBe(400);
    expect((await app.inject('/api/plan?etapas=1')).statusCode).toBe(400);
    const ok = await app.inject('/api/plan?etapas=4&proyecto=1');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().stages).toHaveLength(4);
    expect(ok.json().proyecto).toBe(true);
    await app.close();
  });
});

describe('modelo del Generador', () => {
  it('se pasa a la llamada del agente como --model', async () => {
    write([foco()]);
    const calls: AgentRunOptions[] = [];
    const events: GenerateEvent[] = [];
    for await (const e of generateChallenge({
      repoRoot: tmp,
      modelo: 'opus',
      focoId: 'calc',
      deps: { hasClaude: () => true, now: () => NOW, runAgent: async (o: AgentRunOptions) => { calls.push(o); throw new AgentError('sin presupuesto', 'budget'); } },
    })) events.push(e);
    expect(calls[0]!.model).toBe('opus');
    expect(calls[0]!.message).toContain('Cálculo para DL');
    expect(events.find((e) => e.type === 'plan')).toBeTruthy();
  });

  it('el endpoint valida el modelo y el objetivo antes de lanzar nada', async () => {
    const app = await buildApp({ webDist: '/no/existe', repoRoot: tmp });
    const post = (payload: object) => app.inject({ method: 'POST', url: '/api/generate', payload });
    expect((await post({ modelo: 'opus; rm -rf /' })).statusCode).toBe(400);
    expect((await post({ focoId: '' })).statusCode).toBe(400);
    expect(MODELO_VALIDO.test('claude-opus-5-5')).toBe(true);
    expect(MODELO_VALIDO.test('sonnet[1m]')).toBe(true);
    expect(MODELO_VALIDO.test('--help')).toBe(false);
    await app.close();
  });
});
