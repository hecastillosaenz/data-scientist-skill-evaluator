import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentError, type AgentRunOptions } from '../server/agents/agent-runner';
import { readRuns } from '../server/agents/registro';
import { buildApp } from '../server/app';
import { DEFAULT_CALIBRATION } from '../server/generator/calibration';
import { generateChallenge } from '../server/generator/generator-service';
import { planChallenge } from '../server/generator/plan';
import { readGraph } from '../server/persistence/graph-store';
import { PlanInvalidError } from '../server/planner/apply';
import { buildPropuesta, proponerReto } from '../server/planner/propuesta';
import type { GenerateEvent } from '../shared/generate';
import type { Concept } from '../shared/types';

const realRoot = path.resolve(import.meta.dirname, '../..');
const NOW = new Date('2026-10-19T12:00:00Z');
let tmp: string;
let concepts: Concept[];

const valida = (over: object = {}) => ({
  meta: 'Entender cómo cambia la salida de un modelo al ajustar su entrada, con derivadas.',
  etapas: 3,
  proyecto: false,
  razonEtapas: 'Dos ideas encadenadas más la interpretación.',
  pasos: [{ conceptId: 'math:chain-rule', bloom: 3, porque: 'Propaga el cambio.' }, { conceptId: 'math:derivatives', bloom: 2, porque: 'Mide el cambio.' }],
  integracion: { conceptId: 'business:kpis', porque: 'Traduce a una decisión.' },
  ...over,
});
const json = (v: unknown) => `Listo.\n\`\`\`json\n${JSON.stringify(v)}\n\`\`\``;

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
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-propuesta-'));
  mkdirSync(path.join(tmp, 'configuracion-retos'));
  writeFileSync(path.join(tmp, 'configuracion-retos', 'knowledge-graph.json'), readFileSync(path.join(realRoot, 'configuracion-retos', 'knowledge-graph.json')));
  concepts = (await readGraph(tmp)).concepts;
  calls = [];
  answers = [];
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('buildPropuesta (R61)', () => {
  it('ordena por prerrequisitos y exige un paso técnico por etapa menos la final', () => {
    const p = buildPropuesta(valida(), concepts, { etapas: null });
    expect(p.pasos.map((x) => x.conceptId)).toEqual(['math:derivatives', 'math:chain-rule']);
    expect(p.integracion?.conceptId).toBe('business:kpis');
    expect(() => buildPropuesta(valida({ etapas: 4 }), concepts, { etapas: null })).toThrow(/exactamente 3 pasos técnicos/);
  });

  it('respeta las etapas que pidió el usuario y rechaza ids, Bloom y metas inválidos', () => {
    expect(() => buildPropuesta(valida({ etapas: 3 }), concepts, { etapas: 5 })).toThrow(/exactamente 5 etapas/);
    expect(() => buildPropuesta(valida({ pasos: [{ conceptId: 'x:no', bloom: 3, porque: 'a' }, { conceptId: 'math:derivatives', bloom: 3, porque: 'a' }] }), concepts, { etapas: null })).toThrow(PlanInvalidError);
    expect(() => buildPropuesta(valida({ meta: ' ' }), concepts, { etapas: null })).toThrow(/meta/);
    expect(() => buildPropuesta(valida({ etapas: 9 }), concepts, { etapas: null })).toThrow(/2 a 6/);
    expect(() => buildPropuesta(valida({ integracion: { conceptId: 'math:derivatives', porque: 'x' } }), concepts, { etapas: null })).toThrow(/business/);
  });
});

describe('proponerReto (R61)', () => {
  it('manda la descripción como dato, deja que el modelo decida las etapas y registra al Planificador', async () => {
    answers.push(json(valida()));
    const out = await proponerReto({ repoRoot: tmp, descripcion: 'Quiero entender la derivada para ver cómo cambia un modelo si ajusto su entrada', etapas: null, proyecto: null, deps });
    expect(out).toMatchObject({ status: 'ok', propuesta: { etapas: 3 } });
    expect(calls[0]!.message).toContain('<intencion>\nQuiero entender la derivada');
    expect(calls[0]!.message).toContain('Decide TÚ cuántas etapas');
    expect(calls[0]!.maxUsd).toBe(DEFAULT_CALIBRATION.presupuestoUsdPlan);
    expect((await readRuns(tmp))[0]).toMatchObject({ rol: 'planificador', fase: 'propuesta' });
  });

  it('con etapas fijas se las exige al modelo; una respuesta que no las cumple se repara una vez', async () => {
    answers.push(json(valida({ etapas: 4 })), json(valida({ etapas: 3 })));
    const out = await proponerReto({ repoRoot: tmp, descripcion: '', etapas: 3, proyecto: false, deps });
    expect(out.status).toBe('ok');
    expect(calls[0]!.message).toContain('Exactamente 3 etapas');
    expect(calls[1]!.message).toContain('exactamente 3 etapas');
    answers.push('sin json', 'tampoco');
    expect(await proponerReto({ repoRoot: tmp, descripcion: 'x', etapas: null, proyecto: null, deps })).toMatchObject({ status: 'error', code: 'invalid_output' });
  });

  it('rechaza una descripción enorme o etapas fuera de rango sin llamar al agente, y avisa si no hay Claude', async () => {
    expect(await proponerReto({ repoRoot: tmp, descripcion: 'x'.repeat(900), etapas: null, proyecto: null, deps })).toMatchObject({ status: 'error', code: 'bad_request' });
    expect(await proponerReto({ repoRoot: tmp, descripcion: '', etapas: 9, proyecto: null, deps })).toMatchObject({ status: 'error', code: 'bad_request' });
    expect(await proponerReto({ repoRoot: tmp, descripcion: '', etapas: null, proyecto: null, deps: { ...deps, hasClaude: () => false } })).toMatchObject({ status: 'error', code: 'no_claude' });
    expect(calls).toHaveLength(0);
  });

  it('POST /api/generate/propuesta devuelve la propuesta y valida la entrada', async () => {
    answers.push(json(valida()));
    const app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, plannerDeps: deps });
    const ok = await app.inject({ method: 'POST', url: '/api/generate/propuesta', payload: { descripcion: 'derivadas', etapas: null } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().propuesta.pasos).toHaveLength(2);
    expect((await app.inject({ method: 'POST', url: '/api/generate/propuesta', payload: { etapas: 'tres' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/generate/propuesta', payload: { focoId: 'no-existe' } })).statusCode).toBe(422);
    await app.close();
  });
});

describe('una propuesta decide las etapas del reto (R61)', () => {
  const base = () => ({ concepts, challenges: [], evidence: [], config: DEFAULT_CALIBRATION, now: NOW });
  const mk = () => buildPropuesta(valida(), concepts, { etapas: null });

  it('cada paso es una etapa con su Bloom y la integración usa el concepto de business propuesto', () => {
    const plan = planChallenge({ ...base(), propuesta: mk() });
    expect(plan.stages.map((s) => s.conceptIds[0])).toEqual(['math:derivatives', 'math:chain-rule', 'business:kpis']);
    expect(plan.stages.map((s) => s.bloom)).toEqual([2, 3, 4]); // la integración sube al menos a Bloom 4
    expect(plan.stages.at(-1)!.role).toBe('integracion');
    expect(plan.rationale.join(' ')).toContain('Etapa 1 de tu propuesta');
  });

  it('manda sobre el refuerzo y el tema; con 5 etapas hay 4 pasos técnicos', () => {
    const cinco = buildPropuesta(valida({ etapas: 5, pasos: ['math:functions-m', 'math:derivatives', 'math:chain-rule', 'math:partial'].map((conceptId) => ({ conceptId, bloom: 3, porque: 'a' })) }), concepts, { etapas: null });
    const plan = planChallenge({ ...base(), tema: { conceptId: 'sql:select', texto: 'select' }, propuesta: cinco });
    expect(plan.stages).toHaveLength(5);
    expect(plan.stages.some((s) => s.conceptIds.includes('sql:select'))).toBe(false);
  });

  it('la descripción llega al Generador como dato y la propuesta inválida se rechaza antes de gastar', async () => {
    const calls2: AgentRunOptions[] = [];
    const events: GenerateEvent[] = [];
    for await (const e of generateChallenge({
      repoRoot: tmp,
      descripcion: 'Ver cómo cambia un modelo si ajusto su entrada',
      propuesta: mk(),
      deps: { hasClaude: () => true, now: () => NOW, runAgent: async (o: AgentRunOptions) => { calls2.push(o); throw new AgentError('sin presupuesto', 'budget'); } },
    })) events.push(e);
    expect(calls2[0]!.message).toContain('<intencion>\nVer cómo cambia un modelo si ajusto su entrada\n</intencion>');
    expect(calls2[0]!.message).toContain('Cómo la entendió el Planificador');
    expect(calls2[0]!.message).toContain('math:derivatives');

    const bad: GenerateEvent[] = [];
    for await (const e of generateChallenge({ repoRoot: tmp, propuesta: { ...mk(), pasos: [{ conceptId: 'x:no', bloom: 3, porque: 'a' }] }, deps: { hasClaude: () => true, now: () => NOW, runAgent: async () => { throw new Error('no debe llamarse'); } } })) bad.push(e);
    expect(bad.find((e) => e.type === 'error')).toMatchObject({ code: 'propuesta' });
  });
});
