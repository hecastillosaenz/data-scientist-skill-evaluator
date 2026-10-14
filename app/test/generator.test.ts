import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentError, type AgentRunOptions } from '../server/agents/agent-runner';
import { buildApp, type App } from '../server/app';
import { scanChallenges } from '../server/challenges/challenge-fs';
import { DEFAULT_CALIBRATION } from '../server/generator/calibration';
import { generateChallenge, type GenerateDeps } from '../server/generator/generator-service';
import { checkAgainstPlan, planChallenge, type ChallengePlan } from '../server/generator/plan';
import { readGraph } from '../server/persistence/graph-store';
import { findDeliverable, parseNotebook } from '../server/verify/notebook-parser';
import type { GenerateEvent } from '../shared/generate';

const realRoot = path.resolve(import.meta.dirname, '../..');
const python = path.join(realRoot, '.venv', 'bin', 'python');
const hasDuckdb = existsSync(python) && spawnSync(python, ['-c', 'import duckdb']).status === 0;

const SEED = `CREATE TABLE clientes (id INTEGER PRIMARY KEY, nombre VARCHAR, ciudad VARCHAR);
INSERT INTO clientes VALUES (1,'Ana','Panamá'),(2,'Luis','David'),(3,'Marta','Panamá'),(4,'Pedro','Colón');
CREATE TABLE pedidos (id INTEGER PRIMARY KEY, cliente_id INTEGER, monto DECIMAL(10,2));
INSERT INTO pedidos VALUES (1,1,100.50),(2,1,50.00),(3,2,200.00),(4,3,75.25),(5,3,24.75),(6,4,10.00);`;

const QUERIES = [
  { sql: 'SELECT c.ciudad, COUNT(*) AS n_pedidos, ROUND(SUM(p.monto), 2) AS total FROM pedidos p JOIN clientes c ON c.id = p.cliente_id GROUP BY c.ciudad ORDER BY total DESC', columns: ['ciudad', 'n_pedidos', 'total'], rows: [['Panamá', 4, 250.5], ['David', 1, 200], ['Colón', 1, 10]] },
  { sql: 'SELECT c.nombre, COUNT(*) AS n_pedidos FROM clientes c JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.nombre ORDER BY n_pedidos DESC, c.nombre', columns: ['nombre', 'n_pedidos'], rows: [['Ana', 2], ['Marta', 2], ['Luis', 1], ['Pedro', 1]] },
];

const skeletonFor = (plan: ChallengePlan, over: Record<string, unknown> = {}) => ({
  title: 'Pedidos: ventas por ciudad',
  dataset: 'Pedidos de una tienda',
  objectives: { lookingFor: 'Que aprendas a agregar ventas por ciudad con JOIN y GROUP BY.', outcomes: ['Una tabla de ventas por ciudad', 'Un conteo de pedidos por cliente'], skills: ['JOIN', 'GROUP BY'] },
  scenario: 'Eres analista en una tienda con sucursales en tres ciudades y debes decidir dónde abrir un nuevo punto de venta.',
  task: 'Resume las ventas y los pedidos por ciudad y por cliente para recomendar dónde invertir.',
  data: {
    engine: 'duckdb',
    tables: [
      { name: 'clientes', description: 'Clientes', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'nombre', type: 'VARCHAR' }, { name: 'ciudad', type: 'VARCHAR' }], rowCount: 4, sampleRows: [[1, 'Ana', 'Panamá'], [2, 'Luis', 'David'], [3, 'Marta', 'Panamá'], [4, 'Pedro', 'Colón']] },
      { name: 'pedidos', description: 'Pedidos', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'cliente_id', type: 'INTEGER', fk: { table: 'clientes', column: 'id' } }, { name: 'monto', type: 'DECIMAL(10,2)' }], rowCount: 6, sampleRows: [[1, 1, 100.5], [2, 1, 50], [3, 2, 200]] },
    ],
    seedSql: SEED,
  },
  businessQuestions: [1, 2, 3].map((n) => ({ text: `Pregunta de negocio número ${n}: ¿qué harías con este resultado?`, reflectionGuide: `Guía ${n}` })),
  stages: plan.stages.map((s) => ({ number: s.number, title: `Etapa ${s.number} del caso`, description: `Tarea concreta de la etapa ${s.number} con columnas exactas.`, estimatedMinutes: 25, conceptIds: [...s.conceptIds] })),
  ...over,
});

const contentFor = (plan: ChallengePlan, number: number, over: { expectedRows?: unknown[][]; code?: string } = {}) => {
  const planned = plan.stages.find((s) => s.number === number)!;
  const q = QUERIES[number - 1] ?? QUERIES[0]!;
  const base = {
    theory: [1, 2, 3].map((n) => ({ title: `Idea ${n}`, body: `Explicación aplicada ${n}.` })),
    workedExample: { domain: 'restaurantes', body: 'Ejemplo resuelto con otros datos.' },
    steps: ['Paso 1', 'Paso 2', 'Paso 3', 'Paso 4'],
    hints: ['Mira primero el grano de cada tabla.'],
    research: [{ conceptId: planned.conceptIds[0], why: 'Es la base del paso principal.', searchEs: 'consulta sql', searchEn: 'sql query' }],
    deliverables: ['Devuelve las columnas exactas', 'Terminado cuando coincide con la tabla esperada'],
    solution: { expectedResult: 'Ver la tabla esperada.', reasoning: 'Se agrega por ciudad.', conceptLinks: 'JOIN y GROUP BY.', businessInterpretation: 'Panamá lidera; limitación: pocos datos.', commonError: 'Un JOIN mal hecho duplica filas.', dsFlow: 'Exploración inicial.', skill: 'Agregación.' },
  };
  if (planned.mechanism === 'rubric_claude') return base;
  return {
    ...base,
    skeleton: { language: 'sql', code: 'SELECT ...\n-- TODO: JOIN y GROUP BY' },
    expected: { columns: q.columns, rows: over.expectedRows ?? q.rows },
    solution: { ...base.solution, code: over.code ?? q.sql },
  };
};

const testFor = (plan: ChallengePlan) => {
  const concepts = [...new Set(plan.stages.flatMap((s) => s.conceptIds))];
  const c = (i: number) => concepts[i % concepts.length]!;
  return {
    finalTest: [
      { conceptId: c(0), bloom: 1, kind: 'opcion_multiple', prompt: 'Una tienda une pedidos con clientes: ¿qué JOIN conserva todos los clientes?', options: ['INNER JOIN', 'LEFT JOIN desde clientes', 'CROSS JOIN'], correctIndex: 1, explanation: 'LEFT JOIN conserva la tabla izquierda completa.' },
      { conceptId: c(1), bloom: 2, kind: 'numerica', prompt: 'Si Panamá tiene 4 pedidos por 250,5 en total, ¿cuál es el ticket medio?', answer: 62.63, tolerance: 0.01, explanation: '250,5 entre 4 es 62,625.' },
      { conceptId: c(0), bloom: 2, kind: 'opcion_multiple', prompt: 'Un conteo sale inflado tras un JOIN: ¿cuál es la causa más probable?', options: ['Fan-out', 'Un índice', 'Un alias'], correctIndex: 0, explanation: 'Un JOIN muchos-a-uno repite filas.' },
      { conceptId: c(1), bloom: 3, kind: 'texto', prompt: 'Explica cómo evitarías duplicar las primas al unir con siniestros.', rubric: 'Menciona agregar antes de unir.', explanation: 'Se pre-agrega al grano correcto.' },
      { conceptId: c(0), bloom: 3, kind: 'numerica', prompt: 'Con 6 pedidos y 4 clientes, ¿cuántos pedidos por cliente hay en promedio?', answer: 1.5, tolerance: 0.01, explanation: '6 entre 4.' },
    ],
  };
};

const fenced = (value: unknown) => `Aquí va.\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

type Script = (opts: AgentRunOptions, phase: string, call: number) => string | Error | Promise<string | Error>;

interface Harness {
  tmp: string;
  plan: ChallengePlan;
  calls: { phase: string; maxUsd: number | undefined; message: string }[];
  run: (opts?: { resume?: boolean; budgetFactor?: number; signal?: AbortSignal; deps?: Partial<GenerateDeps> }) => Promise<GenerateEvent[]>;
  script: Script;
  setScript: (s: Script) => void;
}

const phaseOf = (message: string): string => {
  if (message.includes('Fase 1 · Esqueleto')) return 'esqueleto';
  const m = /Fase 2 · Contenido de la Etapa (\d+)/.exec(message);
  if (m) return `etapa-${m[1]}`;
  return message.includes('Fase 3 · Test final') ? 'test' : 'desconocida';
};

async function collect(gen: AsyncGenerator<GenerateEvent>): Promise<GenerateEvent[]> {
  const out: GenerateEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

let tmp: string;
let plan: ChallengePlan;
let calls: Harness['calls'];
let script: Script;
let app: App | undefined;

const happy: Script = (_o, phase) => {
  if (phase === 'esqueleto') return fenced(skeletonFor(plan));
  if (phase.startsWith('etapa-')) return fenced(contentFor(plan, Number(phase.split('-')[1])));
  return fenced(testFor(plan));
};

const run: Harness['run'] = async (opts = {}) =>
  collect(
    generateChallenge({
      repoRoot: tmp,
      ...(opts.resume ? { resume: true } : {}),
      ...(opts.budgetFactor ? { budgetFactor: opts.budgetFactor } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
      deps: {
        python,
        hasClaude: () => true,
        now: () => new Date('2026-10-14T12:00:00.000Z'),
        runAgent: async (o) => {
          const phase = phaseOf(o.message);
          calls.push({ phase, maxUsd: o.maxUsd, message: o.message });
          const answer = await script(o, phase, calls.filter((c) => c.phase === phase).length);
          if (answer instanceof Error) throw answer;
          return { text: answer, cost: 0.2, sessionId: null };
        },
        ...opts.deps,
      },
    }),
  );

const types = (events: GenerateEvent[]) => events.map((e) => e.type);
const last = (events: GenerateEvent[]) => events.at(-1)!;
const errorOf = (events: GenerateEvent[]) => events.find((e) => e.type === 'error') as Extract<GenerateEvent, { type: 'error' }> | undefined;
const pub = () => path.join(tmp, 'challenge', plan.id);
const work = () => path.join(tmp, 'challenge', '.generando');

beforeEach(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-gen-'));
  mkdirSync(path.join(tmp, 'configuracion-retos'));
  cpSync(path.join(realRoot, 'configuracion-retos', 'knowledge-graph.json'), path.join(tmp, 'configuracion-retos', 'knowledge-graph.json'));
  const graph = await readGraph(tmp);
  plan = planChallenge({ concepts: graph.concepts, challenges: [], evidence: [], config: DEFAULT_CALIBRATION, now: new Date('2026-10-14T12:00:00.000Z') });
  calls = [];
  script = happy;
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(tmp, { recursive: true, force: true });
});

describe.skipIf(!hasDuckdb)('Generador (R38, R39)', () => {
  it('genera, valida y publica un challenge completo en challenge/challenge-NNN/', async () => {
    expect(plan.stages.map((s) => s.mechanism)).toEqual(['codigo_assert', 'codigo_assert', 'rubric_claude']); // el fixture asume este plan
    const events = await run();
    expect(errorOf(events)).toBeUndefined();
    expect(types(events).at(-2)).toBe('result');
    expect(last(events)).toMatchObject({ type: 'done', cost: 1 }); // 5 llamadas × 0,2
    const steps = events.filter((e) => e.type === 'step' && e.status === 'ok').map((e) => (e as { id: string }).id);
    expect(steps).toEqual(['plan', 'esqueleto', 'etapa-1', 'etapa-2', 'etapa-3', 'test', 'publicar']);

    for (const f of ['challenge.json', 'notebook.ipynb', 'datos/seed.sql', 'datos/challenge.duckdb', 'logs-avance.md']) expect(existsSync(path.join(pub(), f)), f).toBe(true);
    expect(existsSync(work())).toBe(false);

    // Lo publicado cumple el contrato estricto y el plan, y su notebook tiene los marcadores de entrega.
    const scan = await scanChallenges(tmp, { strict: true });
    expect(scan.invalid).toEqual([]);
    const challenge = scan.loaded[0]!.challenge;
    expect(checkAgainstPlan(challenge, plan)).toEqual([]);
    expect(challenge.id).toBe('challenge-001');
    expect(challenge.finalTest).toHaveLength(5);
    expect(challenge.finalTest!.map((q) => q.id)).toEqual(['challenge-001-t1', 'challenge-001-t2', 'challenge-001-t3', 'challenge-001-t4', 'challenge-001-t5']);
    const cells = parseNotebook(readFileSync(path.join(pub(), 'notebook.ipynb'), 'utf8'));
    expect(findDeliverable(cells, 1).source).toContain('resultado = con.sql');
    expect(findDeliverable(cells, 3).kind).toBe('markdown');
  }, 60_000);

  it('AC-R39a: si el presupuesto se agota en la etapa 2 no se publica nada, el error nombra la fase y «Reintentar» retoma ahí', async () => {
    script = (_o, phase) => (phase === 'etapa-2' ? new AgentError('Se agotó el presupuesto', 'budget') : happy(_o, phase, 1));
    const first = await run();
    const err = errorOf(first)!;
    expect(err).toMatchObject({ code: 'budget', phase: 'etapa-2', canResume: true });
    expect(err.message).toContain('Escribiendo la Etapa 2');
    expect(existsSync(pub())).toBe(false);
    const state = JSON.parse(readFileSync(path.join(work(), 'estado.json'), 'utf8'));
    expect(state.completed).toEqual(['esqueleto', 'etapa-1']);

    // «Reintentar»: no vuelve a pagar el esqueleto ni la etapa 1.
    script = happy;
    calls.length = 0;
    const second = await run({ resume: true });
    expect(errorOf(second)).toBeUndefined();
    expect(calls.map((c) => c.phase)).toEqual(['etapa-2', 'etapa-3', 'test']);
    expect(second.filter((e) => e.type === 'step' && e.detail === 'Retomado: ya estaba validado')).toHaveLength(2);
    expect(existsSync(pub())).toBe(true);
    expect(existsSync(work())).toBe(false);
  }, 60_000);

  it('sin «resume», un reintento empieza de cero y descarta lo conservado', async () => {
    script = (_o, phase) => (phase === 'etapa-2' ? new AgentError('Se agotó el presupuesto', 'budget') : happy(_o, phase, 1));
    await run();
    script = happy;
    calls.length = 0;
    await run();
    expect(calls.map((c) => c.phase)[0]).toBe('esqueleto');
  }, 60_000);

  it('«Reintentar con el doble» duplica el tope por fase y respeta calibracion.json', async () => {
    await run();
    expect(calls[0]!.maxUsd).toBe(DEFAULT_CALIBRATION.presupuestoUsdPorFase);
    rmSync(pub(), { recursive: true, force: true });
    calls.length = 0;
    await run({ budgetFactor: 2 });
    expect(calls[0]!.maxUsd).toBe(DEFAULT_CALIBRATION.presupuestoUsdPorFase * 2);
  }, 60_000);

  it('AC-R39b: una salida inválida se repara con el error del validador como máximo 2 veces y luego se muestra el campo', async () => {
    script = (_o, phase) => {
      if (phase === 'esqueleto') return fenced(skeletonFor(plan, { scenario: 'corto' })); // scenario necesita ≥ 40 caracteres
      return happy(_o, phase, 1);
    };
    const events = await run();
    const err = errorOf(events)!;
    expect(err).toMatchObject({ code: 'invalid_output', phase: 'esqueleto', canResume: true });
    expect(err.message).toContain('scenario');
    expect(calls.filter((c) => c.phase === 'esqueleto')).toHaveLength(3); // 1 intento + 2 reparaciones
    expect(calls[1]!.message).toContain('Tu respuesta anterior fue rechazada');
    expect(calls[1]!.message).toContain('scenario');
    expect(existsSync(pub())).toBe(false);
  }, 60_000);

  it('una reparación puede arreglar la salida: el segundo intento válido se publica', async () => {
    script = (_o, phase, call) => {
      if (phase === 'esqueleto' && call === 1) return 'No devolví JSON, perdón.';
      return happy(_o, phase, call);
    };
    const events = await run();
    expect(errorOf(events)).toBeUndefined();
    expect(events.some((e) => e.type === 'step' && e.id === 'esqueleto' && e.detail?.startsWith('Reparando'))).toBe(true);
    expect(calls.filter((c) => c.phase === 'esqueleto')).toHaveLength(2);
    expect(existsSync(pub())).toBe(true);
  }, 60_000);

  it('AC-R39d/AC-R19: si la solución de referencia no reproduce `expected`, el challenge no se publica', async () => {
    script = (_o, phase) => {
      if (phase === 'etapa-1') return fenced(contentFor(plan, 1, { expectedRows: [['Panamá', 4, 999], ['David', 1, 200], ['Colón', 1, 10]] }));
      return happy(_o, phase, 1);
    };
    const events = await run();
    const err = errorOf(events)!;
    expect(err).toMatchObject({ code: 'invalid_output', phase: 'etapa-1' });
    expect(err.message).toContain('NO reproduce `expected`');
    const repair = calls.filter((c) => c.phase === 'etapa-1')[1]!;
    expect(repair.message).toContain('Tu respuesta anterior fue rechazada');
    expect(repair.message).toContain('250.5'); // la reparación recibe la salida real de la ejecución
    expect(existsSync(pub())).toBe(false);
  }, 60_000);

  it('una solución de referencia que falla al ejecutarse también rechaza el challenge', async () => {
    script = (_o, phase) => (phase === 'etapa-1' ? fenced(contentFor(plan, 1, { code: 'SELECT * FROM tabla_que_no_existe' })) : happy(_o, phase, 1));
    const err = errorOf(await run())!;
    expect(err.phase).toBe('etapa-1');
    expect(err.message).toContain('falla al ejecutarse');
  }, 60_000);

  it('comprueba el dataset declarado: rowCount, sampleRows y llaves (R18)', async () => {
    const wrong = skeletonFor(plan) as { data: { tables: { rowCount: number }[] } };
    wrong.data.tables[0]!.rowCount = 9;
    script = (_o, phase) => (phase === 'esqueleto' ? fenced(wrong) : happy(_o, phase, 1));
    const err = errorOf(await run())!;
    expect(err.phase).toBe('esqueleto');
    expect(err.message).toContain('rowCount 9');
    expect(err.message).toContain('4 filas');
  }, 60_000);

  it('un seed que no corre se rechaza con el error de DuckDB', async () => {
    const broken = skeletonFor(plan, { data: { ...skeletonFor(plan).data, seedSql: 'CREATE TABLE x (id INTEGER); INSERT INTO y VALUES (1);' } });
    script = (_o, phase) => (phase === 'esqueleto' ? fenced(broken) : happy(_o, phase, 1));
    const err = errorOf(await run())!;
    expect(err.phase).toBe('esqueleto');
    expect(err.message.toLowerCase()).toContain('base de datos');
    expect(err.message).toContain('does not exist');
  }, 60_000);

  it('rechaza conceptos de apoyo que no existen en el grafo (R35)', async () => {
    const bad = skeletonFor(plan) as { stages: { conceptIds: string[] }[] };
    bad.stages[0]!.conceptIds.push('sql:inventado');
    script = (_o, phase) => (phase === 'esqueleto' ? fenced(bad) : happy(_o, phase, 1));
    const err = errorOf(await run())!;
    expect(err.message).toContain('sql:inventado');
  }, 60_000);

  it('rechaza un número de preguntas de negocio que no sigue la dificultad', async () => {
    script = (_o, phase) => (phase === 'esqueleto' ? fenced(skeletonFor(plan, { businessQuestions: [{ text: 'Solo una pregunta de negocio aquí.' }] })) : happy(_o, phase, 1));
    expect(errorOf(await run())!.message).toContain('businessQuestions');
  }, 60_000);

  it('AC-R39c: «Detener» aborta, borra el área de trabajo y no deja nada en challenge/', async () => {
    const controller = new AbortController();
    script = (_o, phase) => {
      if (phase === 'etapa-1') controller.abort();
      return happy(_o, phase, 1);
    };
    const events = await run({ signal: controller.signal });
    expect(errorOf(events)).toMatchObject({ code: 'aborted' });
    expect(existsSync(work())).toBe(false);
    expect(existsSync(pub())).toBe(false);
  }, 60_000);

  it('sin Claude Code falla de inmediato y no crea nada', async () => {
    const events = await run({ deps: { hasClaude: () => false } });
    expect(errorOf(events)).toMatchObject({ code: 'no_claude' });
    expect(calls).toHaveLength(0);
    expect(existsSync(path.join(tmp, 'challenge'))).toBe(false);
  });

  it('un trabajo conservado más allá de las horas de conservación no se retoma', async () => {
    script = (_o, phase) => (phase === 'etapa-2' ? new AgentError('Se agotó el presupuesto', 'budget') : happy(_o, phase, 1));
    await run();
    script = happy;
    calls.length = 0;
    await run({ resume: true, deps: { now: () => new Date('2026-10-16T12:00:00.000Z') } }); // 48 h después
    expect(calls[0]!.phase).toBe('esqueleto');
  }, 60_000);

  it('el agente es de solo lectura y recibe el plan como contrato', async () => {
    await run();
    const first = calls[0]!.message;
    expect(first).toContain(plan.id);
    expect(first).toContain('NO lo cambies');
    expect(first).toContain('contrato-generador.md');
    for (const s of plan.stages) expect(first).toContain(s.conceptIds[0]);
  }, 60_000);
});

describe.skipIf(!hasDuckdb)('endpoints de generación', () => {
  const boot = async () => {
    app = await buildApp({
      webDist: '/no/existe',
      repoRoot: tmp,
      generateDeps: {
        python,
        hasClaude: () => true,
        runAgent: async (o) => {
          const phase = phaseOf(o.message);
          const answer = await script(o, phase, 1);
          if (answer instanceof Error) throw answer;
          return { text: answer, cost: 0.1, sessionId: null };
        },
      },
    });
    return app;
  };
  const ndjson = (body: string) => body.trim().split('\n').map((l) => JSON.parse(l) as GenerateEvent);

  it('POST /api/generate emite plan, fases, result y done en orden', async () => {
    await boot();
    const res = await app!.inject({ method: 'POST', url: '/api/generate', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    const events = ndjson(res.body);
    expect(types(events)[0]).toBe('step');
    expect(events.find((e) => e.type === 'plan')).toBeDefined();
    expect(types(events).slice(-2)).toEqual(['result', 'done']);
    expect(existsSync(pub())).toBe(true);
    const state = await app!.inject('/api/state');
    expect(state.json().data.challenges.map((c: { id: string }) => c.id)).toEqual(['challenge-001']);
  }, 60_000);

  it('GET /api/generate/pending ofrece «Reintentar» tras un fallo de presupuesto', async () => {
    script = (_o, phase) => (phase === 'etapa-2' ? new AgentError('Se agotó el presupuesto', 'budget') : happy(_o, phase, 1));
    await boot();
    expect((await app!.inject('/api/generate/pending')).json()).toEqual({ pending: null });
    const res = await app!.inject({ method: 'POST', url: '/api/generate', payload: {} });
    expect(errorOf(ndjson(res.body))).toMatchObject({ code: 'budget', phase: 'etapa-2' });
    const pending = (await app!.inject('/api/generate/pending')).json().pending;
    expect(pending).toMatchObject({ challengeId: 'challenge-001', completed: ['esqueleto', 'etapa-1'] });

    script = happy;
    const retry = await app!.inject({ method: 'POST', url: '/api/generate', payload: { resume: true, budgetFactor: 2 } });
    expect(types(ndjson(retry.body)).slice(-2)).toEqual(['result', 'done']);
    expect((await app!.inject('/api/generate/pending')).json()).toEqual({ pending: null });
  }, 60_000);

  it('rechaza un dominio desconocido, exige Host local y devuelve 409 si hay otra operación', async () => {
    await boot();
    expect((await app!.inject({ method: 'POST', url: '/api/generate', payload: { dominio: 'cocina' } })).statusCode).toBe(400);
    expect((await app!.inject({ method: 'POST', url: '/api/generate', payload: {}, headers: { host: 'evil.example.com' } })).statusCode).toBe(403);
    const release = app!.mutex.acquire('verificar');
    const busy = await app!.inject({ method: 'POST', url: '/api/generate', payload: {} });
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toMatchObject({ error: 'operation_busy', operation: 'verificar' });
    release();
    expect(existsSync(path.join(tmp, 'challenge'))).toBe(false);
  });
});
