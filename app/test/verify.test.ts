import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../server/app';
import { isAllowedRequest } from '../server/guard';
import { verifyStage, type VerifyDeps } from '../server/verify/verify-service';
import type { AgentRunOptions } from '../server/agents/agent-runner';
import type { VerifyEvent } from '../shared/verify';

let repo: string;
const python = process.env.PYTHON ?? 'python3';

const nb = (cells: { type: 'code' | 'markdown'; src: string }[]) =>
  JSON.stringify({ cells: cells.map((c) => ({ cell_type: c.type, source: c.src, metadata: {} })), metadata: {}, nbformat: 4, nbformat_minor: 5 });

const stageBase = { challengeId: 'challenge-001', domain: 'sql', difficulty: 1, bloom: 3, estimatedMinutes: 20, apoyo: 'pistas', conceptIds: ['sql:cte'], description: 'Tarea de prueba para la etapa' };

const challenge = {
  id: 'challenge-001',
  number: 1,
  title: 'Challenge de prueba',
  dataset: 'Datos de prueba',
  difficulty: 1,
  recommended: false,
  objectives: { lookingFor: 'Que compruebes el flujo de verificación de punta a punta.', outcomes: ['Un resultado verificado', 'Un feedback legible'], skills: ['Verificación'] },
  scenario: 'Escenario mínimo de prueba para el orquestador de verificación.',
  task: '',
  businessQuestions: [
    { id: 'challenge-001-bq1', text: 'Pregunta de negocio de prueba número uno.' },
    { id: 'challenge-001-bq2', text: 'Pregunta de negocio de prueba número dos.' },
  ],
  stages: [
    { ...stageBase, id: 'challenge-001-s1', number: 1, title: 'Etapa SQL', mechanism: 'codigo_assert', content: { deliverables: ['Devuelve k y v'], expected: { columns: ['k', 'v'], rows: [['a', 1], ['b', 2]] } } },
    { ...stageBase, id: 'challenge-001-s2', number: 2, title: 'Etapa conceptual', domain: 'business', mechanism: 'rubric_claude', content: { deliverables: ['Recomienda algo'], solution: { code: 'REFERENCIA SECRETA' } } },
    { ...stageBase, id: 'challenge-001-s3', number: 3, title: 'Etapa con asserts', domain: 'python', mechanism: 'codigo_assert', content: { asserts: 'assert x == 3, "x debía valer 3"' } },
  ],
};

function writeNotebook(cells: { type: 'code' | 'markdown'; src: string }[]) {
  writeFileSync(join(repo, 'challenge-001', 'notebook.ipynb'), nb(cells));
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'dsc-repo-'));
  mkdirSync(join(repo, 'challenge-001'));
  writeFileSync(join(repo, 'challenge-001', 'challenge.json'), JSON.stringify(challenge));
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

interface AgentCall { message: string; system?: string; addDirs?: string[] }
function fakeDeps(opts: { text?: string; hasClaude?: boolean; calls?: AgentCall[]; gate?: Promise<void> } = {}): Partial<VerifyDeps> {
  return {
    python,
    strict: false,
    hasClaude: () => opts.hasClaude ?? true,
    runAgent: async (o: AgentRunOptions) => {
      opts.calls?.push({ message: o.message, ...(o.system ? { system: o.system } : {}), ...(o.addDirs ? { addDirs: o.addDirs } : {}) });
      o.onEvent?.({ type: 'tool', text: 'Read notebook.ipynb' });
      if (opts.gate) await opts.gate;
      const text = opts.text ?? 'Buen trabajo.';
      o.onEvent?.({ type: 'text', text });
      return { text, cost: 0.01, sessionId: 's' };
    },
  };
}

async function collect(stageNumber: number, deps: Partial<VerifyDeps>, extra: { signal?: AbortSignal; apoyo?: 'guiado' | 'pistas' | 'autonomo' } = {}): Promise<VerifyEvent[]> {
  const events: VerifyEvent[] = [];
  for await (const e of verifyStage({ repoRoot: repo, challengeId: 'challenge-001', stageNumber, apoyo: extra.apoyo ?? 'pistas', deps, ...(extra.signal ? { signal: extra.signal } : {}) })) events.push(e);
  return events;
}
const summary = (events: VerifyEvent[]) => events.map((e) => (e.type === 'step' ? `${e.id}:${e.status}` : e.type));
const find = <T extends VerifyEvent['type']>(events: VerifyEvent[], type: T) => events.find((e) => e.type === type) as Extract<VerifyEvent, { type: T }> | undefined;

describe('verifyStage · etapas de código (R8, R26, R27)', () => {
  it('un acierto emite los eventos en orden step … feedback … result … done (AC-R26)', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nresultado = [{"k": "a", "v": 1}, {"k": "b", "v": 2}]' }]);
    const calls: AgentCall[] = [];
    const events = await collect(1, fakeDeps({ calls }));
    expect(summary(events)).toEqual([
      'load:running', 'load:ok', 'cell:running', 'cell:ok', 'run:running', 'run:ok', 'compare:running', 'compare:ok', 'agent:running', 'tool', 'feedback', 'agent:ok', 'result', 'done',
    ]);
    expect(find(events, 'result')).toMatchObject({ status: 'aprobada' });
    expect(find(events, 'feedback')?.text).toBe('Buen trabajo.');
    expect(find(events, 'done')?.cost).toBe(0.01);
    // El agente es de solo lectura sobre challenge-N y recibe el código y la ejecución que hizo el orquestador.
    expect(calls[0]!.addDirs).toEqual([join(repo, 'challenge-001')]);
    expect(calls[0]!.message).toContain('Veredicto ya decidido por el orquestador: APROBADA');
    expect(calls[0]!.system).toContain('solo lectura');
  });

  it('un fallo da veredicto «fallida» y cuenta qué fila no coincide, sin esperar al agente', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nresultado = [{"k": "a", "v": 1}, {"k": "b", "v": 99}]' }]);
    const calls: AgentCall[] = [];
    const events = await collect(1, fakeDeps({ calls }));
    expect(find(events, 'result')).toMatchObject({ status: 'fallida' });
    expect(find(events, 'result')!.summary).toContain('Fila 2');
    expect(events.find((e) => e.type === 'step' && e.id === 'compare' && e.status === 'error')).toBeDefined();
    expect(calls[0]!.message).toContain('NO PASÓ');
    expect(calls[0]!.message).toContain("esperaba ('b', 2) y obtuve ('b', 99)");
  });

  it('el agente no puede cambiar el veredicto de una etapa de código', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nresultado = [{"k": "z", "v": 0}]' }]);
    const events = await collect(1, fakeDeps({ text: 'Todo perfecto.\nVEREDICTO: correcta' }));
    expect(find(events, 'result')?.status).toBe('fallida');
  });

  it('ejecuta las celdas # Datos antes de la entregable (R27)', async () => {
    writeNotebook([
      { type: 'code', src: '# Datos\nbase = [{"k": "a", "v": 1}, {"k": "b", "v": 2}]' },
      { type: 'code', src: '# Entregable - Etapa 1:\nresultado = base' },
    ]);
    expect(find(await collect(1, fakeDeps()), 'result')?.status).toBe('aprobada');
  });

  it('un assert que falla deja la etapa en «fallida» y muestra el error', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 3:\nx = 2' }]);
    const events = await collect(3, fakeDeps());
    expect(find(events, 'result')?.status).toBe('fallida');
    expect(events.some((e) => e.type === 'output' && e.stream === 'stderr' && e.text.includes('x debía valer 3'))).toBe(true);
  });

  it('sin Claude Code, el resultado sale igual de la comprobación automática', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nresultado = [{"k": "a", "v": 1}, {"k": "b", "v": 2}]' }]);
    const events = await collect(1, fakeDeps({ hasClaude: false }));
    expect(find(events, 'result')?.status).toBe('aprobada');
    expect(events.find((e) => e.type === 'step' && e.id === 'agent' && e.status === 'error')).toMatchObject({ detail: expect.stringContaining('Claude Code no está disponible') });
    expect(find(events, 'feedback')?.text).toContain('pasó todas las comprobaciones');
  });

  it('avisa si la celda no define resultado', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nvalor = 1' }]);
    const events = await collect(1, fakeDeps({ hasClaude: false }));
    expect(find(events, 'result')).toMatchObject({ status: 'fallida', summary: expect.stringContaining('no define la variable `resultado`') });
  });

  it('un error de Python se muestra en la salida y la etapa no pasa', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nresultado = 1 / 0' }]);
    const events = await collect(1, fakeDeps({ hasClaude: false }));
    expect(events.some((e) => e.type === 'output' && e.text.includes('ZeroDivisionError'))).toBe(true);
    expect(find(events, 'result')?.status).toBe('fallida');
  });
});

describe('verifyStage · errores explícitos (R16, R26)', () => {
  it('celda no encontrada: error claro y no se ejecuta nada', async () => {
    writeNotebook([{ type: 'code', src: 'resultado = []' }]);
    const events = await collect(1, fakeDeps());
    expect(find(events, 'error')).toMatchObject({ code: 'celda_no_encontrada', message: expect.stringContaining('# Entregable - Etapa 1:') });
    expect(events.some((e) => e.type === 'step' && e.id === 'run')).toBe(false);
  });

  it('el marcador de otra etapa se rechaza sin asumir cuál es la correcta (AC-R16)', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 2:\nresultado = []' }]);
    const events = await collect(1, fakeDeps());
    expect(find(events, 'error')).toMatchObject({ code: 'etapa_no_coincide', message: expect.stringContaining('no asumo cuál es la correcta') });
  });

  it('etapa o challenge inexistente', async () => {
    const events: VerifyEvent[] = [];
    for await (const e of verifyStage({ repoRoot: repo, challengeId: 'no-existe', stageNumber: 1, apoyo: 'pistas', deps: fakeDeps() })) events.push(e);
    expect(find(events, 'error')?.code).toBe('not_found');
    expect(find(await collect(9, fakeDeps()), 'error')?.code).toBe('not_found');
  });

  it('cancelar a mitad corta la verificación (AC-R26)', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nimport time\ntime.sleep(5)\nresultado = []' }]);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    const events = await collect(1, fakeDeps(), { signal: ac.signal });
    expect(find(events, 'error')).toMatchObject({ code: 'aborted' });
    expect(find(events, 'result')).toBeUndefined();
  });
});

describe('verifyStage · etapas conceptuales (HU7)', () => {
  it('el agente evalúa el texto de la celda markdown y su veredicto decide el resultado', async () => {
    writeNotebook([{ type: 'markdown', src: '# Entregable - Etapa 2:\nRecomiendo investigar hogar antes de retarifar.' }]);
    const calls: AgentCall[] = [];
    const events = await collect(2, fakeDeps({ text: 'Respuesta clara y con cifra.\nVEREDICTO: correcta', calls }));
    expect(find(events, 'result')?.status).toBe('aprobada');
    expect(find(events, 'feedback')?.text).toBe('Respuesta clara y con cifra.'); // sin la línea de veredicto
    expect(calls[0]!.message).toContain('Recomiendo investigar hogar');
    expect(calls[0]!.message).toContain('REFERENCIA SECRETA'); // la referencia llega al agente…
    expect(calls[0]!.message).toContain('no la reveles'); // …con la orden de no revelarla
  });

  it('veredicto parcial e incorrecta; sin veredicto cuenta como parcial', async () => {
    writeNotebook([{ type: 'markdown', src: '# Entregable - Etapa 2:\ntexto' }]);
    expect(find(await collect(2, fakeDeps({ text: 'Falta una cifra.\nVEREDICTO: parcial' })), 'result')?.status).toBe('parcial');
    expect(find(await collect(2, fakeDeps({ text: 'No cumple.\nVEREDICTO: incorrecta' })), 'result')?.status).toBe('fallida');
    expect(find(await collect(2, fakeDeps({ text: 'Sin veredicto.' })), 'result')?.status).toBe('parcial');
  });

  it('respuesta vacía: error explícito y no se llama al agente', async () => {
    writeNotebook([{ type: 'markdown', src: '# Entregable - Etapa 2:' }]);
    const calls: AgentCall[] = [];
    const events = await collect(2, fakeDeps({ calls }));
    expect(find(events, 'error')?.code).toBe('respuesta_vacia');
    expect(calls).toHaveLength(0);
  });

  it('sin Claude Code no se puede evaluar: error claro', async () => {
    writeNotebook([{ type: 'markdown', src: '# Entregable - Etapa 2:\nalgo' }]);
    expect(find(await collect(2, fakeDeps({ hasClaude: false })), 'error')?.code).toBe('no_claude');
  });
});

describe('R25 · guardia de Host y Origin', () => {
  it('acepta solo hosts y orígenes locales', () => {
    expect(isAllowedRequest('127.0.0.1:4317', undefined)).toBe(true);
    expect(isAllowedRequest('localhost:5173', 'http://localhost:5173')).toBe(true);
    expect(isAllowedRequest('127.0.0.1:4317', 'http://127.0.0.1:4317')).toBe(true);
    expect(isAllowedRequest('[::1]:4317', undefined)).toBe(true);
  });
  it('rechaza DNS rebinding, orígenes ajenos y orígenes que no coinciden con el host', () => {
    expect(isAllowedRequest('evil.com', undefined)).toBe(false);
    expect(isAllowedRequest('127.0.0.1.evil.com:4317', undefined)).toBe(false);
    expect(isAllowedRequest('127.0.0.1:4317', 'https://evil.com')).toBe(false);
    expect(isAllowedRequest('127.0.0.1:4317', 'http://localhost:9999')).toBe(false);
    expect(isAllowedRequest('127.0.0.1:4317', 'null')).toBe(false);
    expect(isAllowedRequest(undefined, undefined)).toBe(false);
  });
});

describe('POST /api/challenges/:id/stages/:n/verify', () => {
  let app: App | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });
  const url = '/api/challenges/challenge-001/stages/1/verify';
  const parse = (body: string) => body.trim().split('\n').map((l) => JSON.parse(l) as VerifyEvent);

  it('responde NDJSON con los eventos en orden', async () => {
    writeNotebook([{ type: 'code', src: '# Entregable - Etapa 1:\nresultado = [{"k": "a", "v": 1}, {"k": "b", "v": 2}]' }]);
    app = await buildApp({ repoRoot: repo, webDist: '/no/existe', strictChallenges: false, verifyDeps: fakeDeps() });
    const res = await app.inject({ method: 'POST', url, payload: { apoyo: 'guiado' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    const events = parse(res.body);
    expect(events[0]).toMatchObject({ type: 'step', id: 'load' });
    expect(events.at(-2)).toMatchObject({ type: 'result', status: 'aprobada' });
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('rechaza con 403 un Host ajeno sin lanzar ningún proceso (AC-R25)', async () => {
    const calls: AgentCall[] = [];
    app = await buildApp({ repoRoot: repo, webDist: '/no/existe', strictChallenges: false, verifyDeps: fakeDeps({ calls }) });
    const res = await app.inject({ method: 'POST', url, headers: { host: 'evil.com' }, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(calls).toHaveLength(0);
    const cross = await app.inject({ method: 'POST', url, headers: { host: '127.0.0.1:4317', origin: 'https://evil.com' }, payload: {} });
    expect(cross.statusCode).toBe(403);
  });

  it('una segunda verificación en vuelo recibe 409 y el mutex se libera al terminar', async () => {
    writeNotebook([{ type: 'markdown', src: '# Entregable - Etapa 2:\ntexto' }]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    app = await buildApp({ repoRoot: repo, webDist: '/no/existe', strictChallenges: false, verifyDeps: fakeDeps({ gate, text: 'ok\nVEREDICTO: correcta' }) });
    const stage2 = '/api/challenges/challenge-001/stages/2/verify';
    const first = app.inject({ method: 'POST', url: stage2, payload: {} });
    await new Promise((r) => setTimeout(r, 150));
    expect((await app.inject('/api/status')).json()).toEqual({ busy: true, operation: 'verificar' });
    const second = await app.inject({ method: 'POST', url: stage2, payload: {} });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: 'operation_busy', operation: 'verificar' });
    release();
    expect((await first).statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect((await app.inject('/api/status')).json()).toEqual({ busy: false, operation: null });
  });

  it('valida el número de etapa', async () => {
    app = await buildApp({ repoRoot: repo, webDist: '/no/existe', strictChallenges: false, verifyDeps: fakeDeps() });
    expect((await app.inject({ method: 'POST', url: '/api/challenges/challenge-001/stages/abc/verify', payload: {} })).statusCode).toBe(400);
  });

  it('GET /api/challenges lista los challenge.json reales', async () => {
    app = await buildApp({ repoRoot: repo, webDist: '/no/existe', strictChallenges: false });
    const res = await app.inject('/api/challenges');
    expect(res.json().challenges.map((c: { id: string }) => c.id)).toEqual(['challenge-001']);
  });
});
