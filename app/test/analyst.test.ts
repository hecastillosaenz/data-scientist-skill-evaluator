import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentError, type AgentRunOptions } from '../server/agents/agent-runner';
import { analyzeEvidence, AnalystQueue, type AnalysisOutcome } from '../server/analyst/analyst-service';
import { buildApp, type App } from '../server/app';
import { readGraph } from '../server/persistence/graph-store';
import type { StatePayload } from '../shared/state';
import type { Challenge, Evidence } from '../shared/types';

const realRoot = path.resolve(import.meta.dirname, '../..');
const challenge = JSON.parse(readFileSync(path.join(realRoot, 'challenge', 'challenge-001', 'challenge.json'), 'utf8')) as Challenge;
const stage1 = challenge.stages[0]!;
const concept = stage1.conceptIds[0]!;
const FIXED = new Date('2026-10-14T21:00:00.000Z');

let tmp: string;
let app: App | undefined;
const file = (...p: string[]) => path.join(tmp, ...p);
const graphFile = () => file('configuracion-retos', 'knowledge-graph.json');
const readGraphText = () => readFileSync(graphFile(), 'utf8');

type Answer = string | Error;
let calls: { message: string; maxUsd: number | undefined }[];
let answers: (Answer | ((o: AgentRunOptions) => Answer | Promise<Answer>))[];
const deps = {
  hasClaude: () => true,
  now: () => FIXED,
  runAgent: async (o: AgentRunOptions) => {
    calls.push({ message: o.message, maxUsd: o.maxUsd });
    const next = answers.shift() ?? new Error('sin respuesta preparada');
    const answer = typeof next === 'function' ? await next(o) : next;
    if (answer instanceof Error) throw answer;
    return { text: answer, cost: 0.05, sessionId: null };
  },
};
const proposal = (value: unknown) => `Listo.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

const evidence = (id: string, over: Partial<Evidence> = {}): Evidence => ({
  id, challengeId: 'challenge-001', stageId: stage1.id, at: '2026-10-14T20:00:00.000Z', result: 'fallida', withHelp: false, apoyo: 'pistas', actualMinutes: 30, ...over,
});
const save = (e: Evidence) => app!.inject({ method: 'POST', url: '/api/challenges/challenge-001/evidence', payload: e as unknown as object });
const analyze = (id: string, extra: Partial<typeof deps> = {}): Promise<AnalysisOutcome> => analyzeEvidence({ repoRoot: tmp, evidenceId: id, deps: { ...deps, ...extra } });
const state = async () => (await app!.inject('/api/state')).json() as StatePayload;

const boot = async (autoAnalyze = false) => {
  app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, now: () => FIXED, autoAnalyze, analystDeps: deps });
  return app;
};

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-analyst-'));
  mkdirSync(file('challenge', 'challenge-001'), { recursive: true });
  cpSync(path.join(realRoot, 'challenge', 'challenge-001', 'challenge.json'), file('challenge', 'challenge-001', 'challenge.json'));
  mkdirSync(file('configuracion-retos'));
  // Catálogo del repo sin observaciones ni candidatos: los tests parten siempre de un grafo limpio.
  const catalog = JSON.parse(readFileSync(path.join(realRoot, 'configuracion-retos', 'knowledge-graph.json'), 'utf8'));
  writeFileSync(graphFile(), `${JSON.stringify({ version: 1, concepts: catalog.concepts }, null, 2)}\n`);
  calls = [];
  answers = [];
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(tmp, { recursive: true, force: true });
});

describe('qué se analiza (R12, AC-R12a)', () => {
  it('una Evidence sin notas ni bloqueo se omite sin llamar al agente y es idempotente', async () => {
    await boot();
    await save(evidence('ev-omit01', { result: 'aprobada' }));
    expect(await analyze('ev-omit01')).toEqual({ status: 'omitida' });
    expect(calls).toHaveLength(0);
    const graph = await readGraph(tmp);
    expect(graph.observations).toEqual([{ evidenceId: 'ev-omit01', at: FIXED.toISOString(), status: 'omitida', conceptIds: [], diagnosis: '' }]);
    expect(await analyze('ev-omit01')).toEqual({ status: 'ya_analizada' });
  });

  it('AC-R12b: con notas el agente propone y se guarda una observación vinculada a conceptos existentes', async () => {
    await boot();
    await save(evidence('ev-nota01', { notes: 'Me confundí con el LEFT JOIN y el denominador', blocker: 'enfoque' }));
    answers.push(proposal({ conceptIds: [concept], diagnosis: 'Confunde el grano de las tablas al unir.' }));
    const out = await analyze('ev-nota01');
    expect(out).toMatchObject({ status: 'ok', cost: 0.05, observation: { evidenceId: 'ev-nota01', conceptIds: [concept] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.maxUsd).toBe(0.3); // presupuestoUsdAnalisis
    expect(calls[0]!.message).toContain('Me confundí con el LEFT JOIN');
    expect(calls[0]!.message).toContain(concept);
    expect((await readGraph(tmp)).observations![0]).toMatchObject({ status: 'ok', diagnosis: 'Confunde el grano de las tablas al unir.' });
  });

  it('un bloqueo marcado basta para analizar aunque no haya notas', async () => {
    await boot();
    await save(evidence('ev-bloq01', { blocker: 'concepto' }));
    answers.push(proposal({ conceptIds: [], diagnosis: 'Sin más datos.' }));
    expect((await analyze('ev-bloq01')).status).toBe('sin_hallazgos');
    expect(calls).toHaveLength(1);
  });
});

describe('AC-R13: qué archivos toca el Analista', () => {
  it('solo knowledge-graph.json y su copia .prev, y la copia es el estado anterior', async () => {
    await boot();
    writeFileSync(file('configuracion-retos', 'usuario.json'), '{"name":"Helio"}\n');
    const before = readGraphText();
    await save(evidence('ev-arch01', { notes: 'nota' }));
    answers.push(proposal({ conceptIds: [concept], diagnosis: 'x' }));
    await analyze('ev-arch01');
    expect(readdirSync(file('configuracion-retos')).sort()).toEqual(['knowledge-graph.json', 'knowledge-graph.json.prev', 'usuario.json']);
    expect(readFileSync(`${graphFile()}.prev`, 'utf8')).toBe(before);
    expect(readGraphText()).not.toBe(before);
  });
});

describe('crear y enlazar a través del servicio (R41)', () => {
  it('AC-R41b: el tema se crea en la segunda Evidence distinta, no en la primera', async () => {
    await boot();
    const uncovered = { uncovered: [{ label: 'Doble conteo por JOIN', domain: 'sql' }] };
    const create = { createConcepts: [{ name: 'Doble conteo por JOIN', domain: 'sql', prerequisites: [concept], candidateLabel: 'Doble conteo por JOIN' }] };
    await save(evidence('ev-crea001', { notes: 'Me salió el doble de filas' }));
    await save(evidence('ev-crea002', { notes: 'Otra vez filas duplicadas al unir', at: '2026-10-14T20:30:00.000Z' }));

    answers.push(proposal({ conceptIds: [concept], diagnosis: 'a', ...uncovered, ...create }));
    const first = await analyze('ev-crea001');
    expect(first).toMatchObject({ status: 'ok', applied: { created: [] } });
    expect((await readGraph(tmp)).candidates).toEqual([{ label: 'Doble conteo por JOIN', domain: 'sql', evidenceIds: ['ev-crea001'] }]);

    answers.push(proposal({ conceptIds: [concept], diagnosis: 'b', ...uncovered, ...create }));
    const second = await analyze('ev-crea002');
    expect(second).toMatchObject({ status: 'ok', applied: { created: [{ id: 'sql:doble-conteo-por-join', origin: 'analista' }] } });
    const graph = await readGraph(tmp);
    expect(graph.concepts.some((c) => c.id === 'sql:doble-conteo-por-join' && c.since === FIXED.toISOString())).toBe(true);
    expect(graph.candidates).toEqual([]);
    expect(graph.observations).toHaveLength(2);
  });

  it('AC-R41a: un enlace que crea un ciclo se descarta y el resto del análisis se aplica', async () => {
    await boot();
    const g = await readGraph(tmp);
    const withPrereq = g.concepts.find((c) => c.prerequisites.length > 0)!;
    const prereq = withPrereq.prerequisites[0]!;
    await save(evidence('ev-ciclo01', { notes: 'nota' }));
    // «prereq» ya es base de «withPrereq»: pedir lo contrario cerraría un ciclo.
    answers.push(proposal({ conceptIds: [prereq], diagnosis: 'Falta base.', addPrerequisites: [{ concept: prereq, prerequisite: withPrereq.id, why: 'x' }] }));
    const out = await analyze('ev-ciclo01');
    expect(out).toMatchObject({ status: 'ok', applied: { links: [] } });
    expect((out as { discarded: { reason: string }[] }).discarded[0]!.reason).toContain('ciclo');
    expect((await readGraph(tmp)).observations).toHaveLength(1);
  });
});

describe('fallos (R42, AC-R42)', () => {
  const failureLeavesEverythingIntact = async (out: AnalysisOutcome, code: string) => {
    expect(out).toMatchObject({ status: 'error', code });
    expect(readGraphText()).toBe(before);
    const s = await state();
    expect(s.data.evidence.map((e) => e.id)).toContain('ev-fallo01'); // la Evidence sigue guardada
    expect(s.analysis.pending).toContain('ev-fallo01'); // y queda pendiente de análisis
  };
  let before: string;
  beforeEach(async () => {
    await boot();
    before = readGraphText();
    await save(evidence('ev-fallo01', { notes: 'nota' }));
  });

  it('presupuesto agotado: no se aplica nada', async () => {
    answers.push(new AgentError('Se agotó', 'budget'));
    await failureLeavesEverythingIntact(await analyze('ev-fallo01'), 'budget');
  });

  it('salida inválida tras una reparación: no se aplica nada', async () => {
    answers.push('No tengo JSON, perdón.', 'Tampoco aquí.');
    await failureLeavesEverythingIntact(await analyze('ev-fallo01'), 'invalid_output');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.message).toContain('Tu respuesta anterior fue rechazada');
  });

  it('una reparación puede arreglarlo', async () => {
    answers.push('No tengo JSON.', proposal({ conceptIds: [concept], diagnosis: 'ok' }));
    expect((await analyze('ev-fallo01')).status).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('una propuesta que no es un objeto se trata como salida inválida', async () => {
    answers.push(proposal([1, 2, 3]), proposal('texto'));
    await failureLeavesEverythingIntact(await analyze('ev-fallo01'), 'invalid_output');
  });

  it('sin Claude Code: queda pendiente sin tocar nada', async () => {
    await failureLeavesEverythingIntact(await analyze('ev-fallo01', { hasClaude: () => false }), 'no_claude');
    expect(calls).toHaveLength(0);
  });

  it('una Evidence inexistente se informa', async () => {
    expect(await analyze('ev-no-existe')).toMatchObject({ status: 'error', code: 'not_found' });
  });
});

describe('cola serial en segundo plano (R12, AC-R12c, AC-R12d)', () => {
  it('procesa de uno en uno, sin duplicar, y recuerda lo que falló', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const queue = new AnalystQueue(async (id) => {
      order.push(`start:${id}`);
      if (id === 'a') await gate;
      order.push(`end:${id}`);
      return id === 'b' ? { status: 'error', code: 'budget', message: 'sin presupuesto' } : { status: 'omitida' };
    });
    queue.enqueue('a');
    queue.enqueue('b');
    queue.enqueue('b'); // duplicado
    queue.enqueue('a'); // ya en curso
    await new Promise((r) => setImmediate(r));
    expect(queue.status()).toEqual({ running: 'a', queued: ['b'], failed: {} });
    release();
    await queue.idle();
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
    expect(queue.status()).toEqual({ running: null, queued: [], failed: { b: 'sin presupuesto' } });
    queue.enqueue('b'); // «Analizar ahora» lo vuelve a intentar y limpia el fallo
    expect(queue.status().failed).toEqual({});
    await queue.idle();
  });

  it('AC-R12c: «Registrar etapa» responde sin esperar al Analista, que termina después', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    answers.push(async () => {
      await gate;
      return proposal({ conceptIds: [concept], diagnosis: 'en segundo plano' });
    });
    await boot(true);
    const res = await save(evidence('ev-bg00001', { notes: 'nota' }));
    expect(res.statusCode).toBe(200); // respondió con el análisis aún detenido
    expect((await state()).analysis).toMatchObject({ running: true, pending: ['ev-bg00001'] });
    release();
    await app!.analyst.idle();
    const after = await state();
    expect(after.analysis).toMatchObject({ running: false, pending: [] });
    expect(after.data.observations).toHaveLength(1);
    expect(after.data.observations![0]!.diagnosis).toBe('en segundo plano');
  });

  it('un registro sin notas se procesa solo (omitida) sin llamar al agente', async () => {
    await boot(true);
    await save(evidence('ev-auto001', { result: 'aprobada' }));
    await app!.analyst.idle();
    expect(calls).toHaveLength(0);
    expect((await state()).data.observations![0]).toMatchObject({ evidenceId: 'ev-auto001', status: 'omitida' });
  });

  it('AC-R12d: sin autoAnalyze (arranque) lo pendiente no se lanza solo; «Analizar ahora» lo encola', async () => {
    await boot(false);
    await save(evidence('ev-pend001', { notes: 'nota' }));
    await save(evidence('ev-pend002', { result: 'aprobada' }));
    expect(calls).toHaveLength(0);
    const pending = (await app!.inject('/api/analysis')).json();
    expect(pending).toMatchObject({ running: null, queued: 0, pending: ['ev-pend001', 'ev-pend002'] });

    answers.push(proposal({ conceptIds: [concept], diagnosis: 'ahora sí' }));
    const res = await app!.inject({ method: 'POST', url: '/api/analysis/pending' });
    expect(res.json()).toEqual({ queued: 2 });
    await app!.analyst.idle();
    expect(calls).toHaveLength(1);
    expect((await app!.inject('/api/analysis')).json()).toMatchObject({ pending: [], failed: {} });
  });

  it('un fallo en segundo plano no afecta al registro y se informa en /api/analysis', async () => {
    answers.push(new AgentError('Se agotó', 'budget'));
    await boot(true);
    const res = await save(evidence('ev-bgfail1', { notes: 'nota' }));
    expect(res.statusCode).toBe(200);
    await app!.analyst.idle();
    const status = (await app!.inject('/api/analysis')).json();
    expect(status.pending).toEqual(['ev-bgfail1']);
    expect(status.failed['ev-bgfail1']).toContain('presupuesto');
    expect((await state()).data.evidence).toHaveLength(1);
  });

  it('las rutas del Analista exigen Host local (R25)', async () => {
    await boot();
    const res = await app!.inject({ method: 'POST', url: '/api/analysis/pending', headers: { host: 'evil.example.com' } });
    expect(res.statusCode).toBe(403);
  });
});
