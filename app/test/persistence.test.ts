import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../server/app';
import { GraphError, readGraph, validateGraph, writeGraph } from '../server/persistence/graph-store';
import type { StatePayload } from '../shared/state';
import type { Challenge, Evidence } from '../shared/types';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const challenge = JSON.parse(readFileSync(path.join(repoRoot, 'app', 'test', 'fixtures', 'challenge-001', 'challenge.json'), 'utf8')) as Challenge;
const stage1 = challenge.stages[0]!;
const FIXED = new Date('2026-10-14T15:30:00.000Z');

let tmp: string;
let app: App | undefined;

const boot = async () => {
  app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, now: () => FIXED });
  return app;
};
const evidence = (id: string, over: Partial<Evidence> = {}): Evidence => ({
  id,
  challengeId: 'challenge-001',
  stageId: stage1.id,
  at: '2026-10-14T15:00:00.000Z',
  result: 'aprobada',
  withHelp: false,
  apoyo: 'pistas',
  actualMinutes: 24,
  timeSource: 'cronometro',
  ...over,
});
const post = (url: string, payload?: unknown) => app!.inject({ method: 'POST', url, ...(payload === undefined ? {} : { payload: payload as object }) });
const state = async () => (await app!.inject('/api/state')).json() as StatePayload;
const file = (...p: string[]) => path.join(tmp, ...p);
const read = (...p: string[]) => readFileSync(file(...p), 'utf8');

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-persist-'));
  cpSync(path.join(repoRoot, 'app', 'test', 'fixtures', 'challenge-001', 'challenge.json'), (mkdirSync(file('challenge', 'challenge-001'), { recursive: true }), file('challenge', 'challenge-001', 'challenge.json')));
  writeFileSync(file('challenge', 'challenge-001', 'logs-avance.md'), '# Logs de avance · challenge-001\n');
  mkdirSync(file('configuracion-retos'));
  cpSync(path.join(repoRoot, 'configuracion-retos', 'knowledge-graph.json'), file('configuracion-retos', 'knowledge-graph.json'));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(tmp, { recursive: true, force: true });
});

describe('GET /api/state', () => {
  it('arranca sin historial: catálogo de conceptos, el challenge real y nada de progreso (AC-R36)', async () => {
    await boot();
    const s = await state();
    expect(s.data.concepts.length).toBeGreaterThan(200);
    expect(s.data.challenges.map((c) => c.id)).toEqual(['challenge-001']);
    expect(s.data.user.name).toBe('Usuario');
    expect(s.data.evidence).toEqual([]);
    expect(s.started).toEqual({});
    expect(s.problems).toEqual([]);
  });

  it('los conceptos de las etapas y del test de challenge-001 existen en el catálogo (AC-R35)', async () => {
    const graph = await readGraph(repoRoot);
    const ids = new Set(graph.concepts.map((c) => c.id));
    const used = [...challenge.stages.flatMap((s) => s.conceptIds), ...(challenge.finalTest ?? []).map((q) => q.conceptId)];
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('un progreso ilegible se reporta en `problems` sin romper el resto', async () => {
    writeFileSync(file('challenge', 'challenge-001', 'progreso.json'), '{no es json');
    await boot();
    const s = await state();
    expect(s.data.challenges).toHaveLength(1);
    expect(s.problems[0]).toContain('challenge-001/progreso.json');
  });

  it('un knowledge-graph.json corrupto da 503 y no se modifica (AC-R35)', async () => {
    const bad = JSON.stringify({ version: 1, concepts: [{ id: 'a', name: 'A', domain: 'sql', prerequisites: ['no-existe'] }] });
    writeFileSync(file('configuracion-retos', 'knowledge-graph.json'), bad);
    await boot();
    const res = await app!.inject('/api/state');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'graph_corrupt' });
    expect(res.json().message).toContain('no-existe');
    expect(read('configuracion-retos', 'knowledge-graph.json')).toBe(bad);
  });
});

describe('escrituras de progreso (R33, R34)', () => {
  it('registrar una etapa persiste, sobrevive a un reinicio y agrega una entrada legible al log (AC-R33, AC-R34)', async () => {
    await boot();
    const res = await post('/api/challenges/challenge-001/evidence', evidence('ev-aaa111', { blocker: 'enfoque', notes: 'Me confundí con el LEFT JOIN' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().duplicate).toBe(false);

    await app!.close();
    await boot();
    const s = await state();
    expect(s.data.evidence.map((e) => e.id)).toEqual(['ev-aaa111']);

    const log = read('challenge', 'challenge-001', 'logs-avance.md');
    expect(log.startsWith('# Logs de avance · challenge-001\n')).toBe(true);
    expect(log).toContain(`Etapa 1 · ${stage1.title} · Aprobada`);
    expect(log).toContain('Apoyo: Pistas · Tiempo real: 24 min (cronómetro)');
    expect(log).toContain('Dónde te trabaste: Enfoque');
    expect(log).toContain('> Me confundí con el LEFT JOIN');
  });

  it('un id repetido no duplica el registro ni el log (idempotente)', async () => {
    await boot();
    await post('/api/challenges/challenge-001/evidence', evidence('ev-dup001'));
    const second = await post('/api/challenges/challenge-001/evidence', evidence('ev-dup001'));
    expect(second.json().duplicate).toBe(true);
    expect((await state()).data.evidence).toHaveLength(1);
    expect(read('challenge', 'challenge-001', 'logs-avance.md').match(/Etapa 1/g)).toHaveLength(1);
  });

  it('un reintento aprobado tras un fallo deja dos registros distintos (AC-R10)', async () => {
    await boot();
    await post('/api/challenges/challenge-001/evidence', evidence('ev-fail01', { result: 'fallida' }));
    await post('/api/challenges/challenge-001/evidence', evidence('ev-pass01', { at: '2026-10-14T15:20:00.000Z' }));
    expect((await state()).data.evidence.map((e) => e.result)).toEqual(['fallida', 'aprobada']);
  });

  it('rechaza registros inválidos con un mensaje que nombra el campo', async () => {
    await boot();
    const bad = async (payload: unknown, contains: string) => {
      const res = await post('/api/challenges/challenge-001/evidence', payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain(contains);
    };
    await bad(evidence('ev-x00001', { stageId: 'otro-s9' }), 'stageId');
    await bad(evidence('ev-x00002', { challengeId: 'challenge-002' }), 'challengeId');
    await bad(evidence('ev-x00003', { result: 'genial' as never }), 'result');
    await bad(evidence('ev-x00004', { actualMinutes: -3 }), 'actualMinutes');
    await bad({ ...evidence('ev-x00005'), extra: 1 }, 'extra');
    expect((await state()).data.evidence).toEqual([]);
    const missing = await post('/api/challenges/challenge-999/evidence', evidence('ev-x00006'));
    expect(missing.statusCode).toBe(404);
  });

  it('inicio y Apoyo: se persisten una vez y el log lo cuenta', async () => {
    await boot();
    const first = await post('/api/challenges/challenge-001/start');
    expect(first.json().startedAt).toBe(FIXED.toISOString());
    await post('/api/challenges/challenge-001/start');
    expect((await state()).started).toEqual({ 'challenge-001': FIXED.toISOString() });

    const put = (apoyo: unknown) => app!.inject({ method: 'PUT', url: `/api/challenges/challenge-001/stages/${stage1.id}/apoyo`, payload: { apoyo } as object });
    expect((await put('autonomo')).statusCode).toBe(200);
    expect((await put('autonomo')).statusCode).toBe(200);
    expect((await put('mucho')).statusCode).toBe(400);
    expect((await state()).apoyos).toEqual({ [stage1.id]: 'autonomo' });

    const log = read('challenge', 'challenge-001', 'logs-avance.md');
    expect(log.match(/Challenge iniciado/g)).toHaveLength(1);
    expect(log.match(/Apoyo/g)).toHaveLength(1);
    expect(log).toContain(`Etapa 1 · Apoyo ${stage1.apoyo === 'guiado' ? 'Guiado' : stage1.apoyo === 'pistas' ? 'Pistas' : 'Autónomo'} → Autónomo`);
  });

  it('respuestas de negocio: append-only, la guía no se calcula en el servidor y el log las cita', async () => {
    await boot();
    const q = challenge.businessQuestions[0]!;
    const answer = (id: string, text: string) => ({ id, challengeId: 'challenge-001', questionId: q.id, at: '2026-10-14T16:00:00.000Z', text });
    const r1 = await post('/api/challenges/challenge-001/business-answers', { answers: [answer('ba-000001', 'Primera versión')] });
    expect(r1.json().saved).toBe(1);
    await post('/api/challenges/challenge-001/business-answers', { answers: [answer('ba-000002', 'Versión corregida')] });
    expect((await state()).data.businessAnswers.map((a) => a.text)).toEqual(['Primera versión', 'Versión corregida']);
    expect(read('challenge', 'challenge-001', 'logs-avance.md')).toContain('> Versión corregida');

    const bad = await post('/api/challenges/challenge-001/business-answers', { answers: [{ ...answer('ba-000003', 'x'), questionId: 'no-existe' }] });
    expect(bad.statusCode).toBe(400);
  });

  it('resultados del test final: se guardan por pregunta y el log resume el puntaje', async () => {
    await boot();
    const qs = challenge.finalTest!;
    const results = qs.map((q, i) => ({ id: `tr-${String(i).padStart(6, '0')}`, challengeId: 'challenge-001', questionId: q.id, conceptId: q.conceptId, bloom: q.bloom, at: '2026-10-14T16:30:00.000Z', correct: i !== 0 }));
    const res = await post('/api/challenges/challenge-001/test-results', { results });
    expect(res.json().saved).toBe(qs.length);
    expect((await state()).data.testResults).toHaveLength(qs.length);
    expect(read('challenge', 'challenge-001', 'logs-avance.md')).toContain(`Test final · ${qs.length - 1} de ${qs.length}`);

    const wrong = await post('/api/challenges/challenge-001/test-results', { results: [{ ...results[1]!, id: 'tr-zzzzzz', conceptId: 'sql:select' }] });
    expect(wrong.statusCode).toBe(400);
  });

  it('un progreso.json corrupto rechaza el guardado, nombra el archivo y no lo modifica (AC-R33)', async () => {
    const corrupt = '{"version": 1, "evidence": [';
    writeFileSync(file('challenge', 'challenge-001', 'progreso.json'), corrupt);
    await boot();
    const res = await post('/api/challenges/challenge-001/evidence', evidence('ev-bad001'));
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'progress_corrupt' });
    expect(res.json().message).toContain('challenge-001/progreso.json');
    expect(read('challenge', 'challenge-001', 'progreso.json')).toBe(corrupt);
    expect(read('challenge', 'challenge-001', 'logs-avance.md')).toBe('# Logs de avance · challenge-001\n');
  });

  it('escrituras concurrentes no se pierden (cola por archivo)', async () => {
    await boot();
    const ids = Array.from({ length: 12 }, (_, i) => `ev-par${String(i).padStart(3, '0')}`);
    const responses = await Promise.all(ids.map((id) => post('/api/challenges/challenge-001/evidence', evidence(id))));
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);
    expect((await state()).data.evidence.map((e) => e.id).sort()).toEqual([...ids].sort());
  });

  it('las escrituras exigen Host local (R25)', async () => {
    await boot();
    const res = await app!.inject({ method: 'POST', url: '/api/challenges/challenge-001/start', headers: { host: 'evil.example.com' } });
    expect(res.statusCode).toBe(403);
    expect(() => readFileSync(file('challenge', 'challenge-001', 'progreso.json'))).toThrow();
  });
});

describe('GET /api/plan (R38)', () => {
  it('devuelve el plan del próximo challenge a partir del catálogo y del progreso real', async () => {
    await boot();
    const res = await app!.inject('/api/plan');
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan).toMatchObject({ mode: 'arranque', id: 'challenge-002', number: 2 });
    expect(plan.stages.length).toBe(3);
    expect(plan.avoid.datasets).toEqual([challenge.dataset]);
  });

  it('acepta un dominio y rechaza uno desconocido', async () => {
    await boot();
    const ok = await app!.inject('/api/plan?dominio=ml');
    expect(ok.json().domain).toBe('ml');
    const bad = await app!.inject('/api/plan?dominio=cocina');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toContain('dominio');
  });

  it('un calibracion.json inválido da 422 con el motivo', async () => {
    writeFileSync(file('configuracion-retos', 'calibracion.json'), JSON.stringify({ etapasPorChallenge: 99 }));
    await boot();
    const res = await app!.inject('/api/plan');
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toContain('etapasPorChallenge');
  });
});

describe('graph-store', () => {
  it('valida ids únicos, dominios y prerrequisitos existentes', () => {
    const r = validateGraph({
      version: 1,
      concepts: [
        { id: 'a', name: 'A', domain: 'sql', prerequisites: [] },
        { id: 'a', name: 'A2', domain: 'otro', prerequisites: ['zzz'] },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const text = r.errors.join('\n');
      expect(text).toContain('repetido');
      expect(text).toContain('domain');
      expect(text).toContain('«zzz»');
    }
  });

  it('writeGraph es atómico: un catálogo inválido no toca el archivo y no deja temporales', async () => {
    const before = read('configuracion-retos', 'knowledge-graph.json');
    await expect(writeGraph(tmp, { version: 1, concepts: [{ id: 'x', name: 'X', domain: 'sql', prerequisites: ['y'] }] })).rejects.toBeInstanceOf(GraphError);
    expect(read('configuracion-retos', 'knowledge-graph.json')).toBe(before);
    await writeGraph(tmp, { version: 1, concepts: [{ id: 'x', name: 'X', domain: 'sql', prerequisites: [] }] });
    expect((await readGraph(tmp)).concepts.map((c) => c.id)).toEqual(['x']);
  });

  it('un catálogo ausente equivale a uno vacío', async () => {
    rmSync(file('configuracion-retos', 'knowledge-graph.json'));
    expect((await readGraph(tmp)).concepts).toEqual([]);
  });
});
