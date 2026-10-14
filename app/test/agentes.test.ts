import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentError, type AgentResult, type AgentRunOptions } from '../server/agents/agent-runner';
import { MAX_EVENTS, MAX_INPUT, MAX_OUTPUT, isRunId, purgeRuns, readRun, readRuns, recordAgent, runsDir, summarize } from '../server/agents/registro';
import { buildApp, type App } from '../server/app';
import type { AgentesPayload } from '../shared/agentes';

const repoRoot = path.resolve(import.meta.dirname, '../..');
let tmp: string;
const T0 = new Date('2026-10-14T15:00:00.000Z');
const clock = (start = T0) => {
  let t = start.getTime();
  return () => new Date((t += 1000));
};
const ok = (text = 'listo', cost = 0.12): ((o: AgentRunOptions) => Promise<AgentResult>) => async (o) => {
  o.onEvent?.({ type: 'tool', text: 'Read plantilla.md' });
  o.onEvent?.({ type: 'text', text });
  return { text, cost, sessionId: 's' };
};

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-agentes-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('registro de ejecuciones (R46)', () => {
  it('AC-R46a: una ejecución exitosa guarda rol, entrada, eventos, salida, costo y a qué pertenece', async () => {
    const run = recordAgent(tmp, 'generador', ok('Hola', 0.2), { challengeId: 'challenge-004', fase: 'etapa-2' }, clock());
    const result = await run({ message: 'Genera la etapa 2', maxUsd: 0.75 });
    expect(result.text).toBe('Hola');
    const [r] = await readRuns(tmp);
    expect(r).toMatchObject({ rol: 'generador', outcome: 'ok', cost: 0.2, maxUsd: 0.75, challengeId: 'challenge-004', fase: 'etapa-2', input: 'Genera la etapa 2', output: 'Hola' });
    expect(r!.events).toEqual([{ type: 'tool', text: 'Read plantilla.md' }, { type: 'text', text: 'Hola' }]);
    expect(r!.durationMs).toBeGreaterThan(0);
    expect(r!.endedAt).toBeTruthy();
    expect(isRunId(r!.id)).toBe(true);
  });

  it('el onEvent original sigue recibiendo los eventos', async () => {
    const seen: string[] = [];
    await recordAgent(tmp, 'analista', ok(), {})({ message: 'x', onEvent: (e) => seen.push(e.type) });
    expect(seen).toEqual(['tool', 'text']);
  });

  it('un fallo se registra con su tipo y se vuelve a lanzar tal cual', async () => {
    const cases: [AgentError | Error, string][] = [
      [new AgentError('Se agotó', 'budget'), 'presupuesto'],
      [new AgentError('Cancelada', 'aborted'), 'cancelado'],
      [new AgentError('Falló', 'agent_failed'), 'error'],
      [new Error('raro'), 'error'],
    ];
    for (const [err, outcome] of cases) {
      const run = recordAgent(tmp, 'evaluador-codigo', async () => { throw err; }, {});
      await expect(run({ message: 'm' })).rejects.toBe(err);
      const latest = (await readRuns(tmp)).find((r) => r.errorMessage === err.message);
      expect(latest, err.message).toMatchObject({ outcome, errorMessage: err.message });
    }
  });

  it('AC-R46b: si no se puede escribir el registro, el agente termina igual', async () => {
    const blocker = path.join(tmp, 'archivo');
    writeFileSync(blocker, 'no soy una carpeta');
    const res = await recordAgent(blocker, 'generador', ok('sigue', 0.3), {})({ message: 'm' });
    expect(res).toEqual({ text: 'sigue', cost: 0.3, sessionId: 's' });
  });

  it('acota la entrada, la salida y la cantidad de eventos', async () => {
    const noisy = async (o: AgentRunOptions): Promise<AgentResult> => {
      for (let i = 0; i < MAX_EVENTS + 20; i++) o.onEvent?.({ type: 'tool', text: `Read f${i}` });
      return { text: 'y'.repeat(MAX_OUTPUT + 500), cost: 0, sessionId: null };
    };
    await recordAgent(tmp, 'generador', noisy, {})({ message: 'x'.repeat(MAX_INPUT + 500) });
    const [r] = await readRuns(tmp);
    expect(r!.input.length).toBeLessThanOrEqual(MAX_INPUT + 1);
    expect(r!.inputTruncated).toBe(true);
    expect(r!.output!.length).toBeLessThanOrEqual(MAX_OUTPUT + 1);
    expect(r!.outputTruncated).toBe(true);
    expect(r!.events).toHaveLength(MAX_EVENTS);
    expect(r!.eventsTruncated).toBe(true);
  });

  it('mientras corre figura «en curso»; una que quedó así en disco sin proceso es «interrumpida»', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const pending = recordAgent(tmp, 'analista', async () => { await gate; return { text: '', cost: 0, sessionId: null }; }, {})({ message: 'm' });
    await new Promise((r) => setTimeout(r, 50));
    expect((await readRuns(tmp))[0]!.outcome).toBe('en_curso');
    release();
    await pending;
    expect((await readRuns(tmp))[0]!.outcome).toBe('ok');

    const ghost = '20260101T000000000Z-analista-abcd';
    writeFileSync(path.join(runsDir(tmp), `${ghost}.json`), JSON.stringify({ id: ghost, rol: 'analista', startedAt: '2026-01-01T00:00:00.000Z', outcome: 'en_curso', cost: 0, input: '', events: [] }));
    expect((await readRun(tmp, ghost))!.outcome).toBe('interrumpida');
  });

  it('AC-R46c: se purgan los registros más viejos que los días configurados', async () => {
    mkdirSync(runsDir(tmp), { recursive: true });
    const put = (id: string) => writeFileSync(path.join(runsDir(tmp), `${id}.json`), JSON.stringify({ id, rol: 'generador', startedAt: '2026-01-01T00:00:00.000Z', outcome: 'ok', cost: 0, input: '', events: [] }));
    put('20260801T000000000Z-generador-aaaa'); // 74 días antes
    put('20261010T000000000Z-generador-bbbb'); // 4 días antes
    expect(await purgeRuns(tmp, 30, T0)).toBe(1);
    expect(readdirSync(runsDir(tmp))).toEqual(['20261010T000000000Z-generador-bbbb.json']);
  });

  it('los ids inválidos no leen nada (sin salir de la carpeta del registro)', async () => {
    expect(isRunId('../../etc/passwd')).toBe(false);
    expect(await readRun(tmp, '../knowledge-graph')).toBeNull();
    expect(await readRuns(tmp)).toEqual([]); // carpeta ausente
  });

  it('el resumen quita lo pesado pero conserva cuántos eventos hubo', async () => {
    await recordAgent(tmp, 'generador', ok(), {})({ message: 'm' });
    const s = summarize((await readRuns(tmp))[0]!);
    expect(s).not.toHaveProperty('input');
    expect(s).not.toHaveProperty('events');
    expect(s).not.toHaveProperty('output');
    expect(s.eventCount).toBe(2);
  });

  it('AC-R46d: registro-agentes/ está en .gitignore', () => {
    expect(readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')).toMatch(/^registro-agentes\/$/m);
  });
});

describe('API de monitoreo (R48)', () => {
  let app: App;
  const NOW = new Date('2026-10-14T18:00:00.000Z');
  beforeEach(async () => {
    mkdirSync(path.join(tmp, 'configuracion-retos'));
    writeFileSync(path.join(tmp, 'configuracion-retos', 'knowledge-graph.json'), JSON.stringify({
      version: 1,
      concepts: [
        { id: 'sql:join', name: 'JOIN', domain: 'sql', prerequisites: [] },
        { id: 'sql:grano', name: 'Grano de una tabla', domain: 'sql', prerequisites: ['sql:join'], origin: 'analista', since: '2026-10-14T16:00:00.000Z' },
      ],
      observations: [
        { evidenceId: 'ev-1', at: '2026-10-14T16:00:00.000Z', status: 'ok', conceptIds: ['sql:join'], diagnosis: 'Confunde el grano.' },
        { evidenceId: 'ev-2', at: '2026-10-14T17:00:00.000Z', status: 'omitida', conceptIds: [], diagnosis: '' },
      ],
    }));
    app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, now: () => NOW });
  });
  afterEach(() => app.close());

  it('AC-R48: trae los cuatro agentes con su estado, costos, línea de tiempo, análisis y errores', async () => {
    const at = clock(new Date('2026-10-14T15:00:00.000Z'));
    await recordAgent(tmp, 'generador', ok('a', 0.5), { challengeId: 'challenge-004', fase: 'esqueleto' }, at)({ message: 'm' });
    await recordAgent(tmp, 'evaluador-codigo', ok('b', 0.01), { challengeId: 'challenge-004', stageId: 's1' }, at)({ message: 'm' });
    await recordAgent(tmp, 'analista', ok('c', 0.1), { challengeId: 'challenge-004', evidenceId: 'ev-1' }, at)({ message: 'm' });
    await recordAgent(tmp, 'analista', async () => { throw new AgentError('Sin presupuesto', 'budget'); }, { evidenceId: 'ev-9' }, at)({ message: 'm' }).catch(() => {});

    const body = (await app.inject('/api/agentes')).json() as AgentesPayload;
    expect(body.agentes.map((a) => a.rol)).toEqual(['generador', 'evaluador-codigo', 'evaluador-conceptual', 'analista']);
    const by = Object.fromEntries(body.agentes.map((a) => [a.rol, a]));
    expect(by['generador']).toMatchObject({ enCurso: false, ejecuciones: 1, costoTotal: 0.5, errores: 0 });
    expect(by['evaluador-conceptual']).toMatchObject({ ejecuciones: 0, ultima: null, costoTotal: 0 });
    expect(by['analista']).toMatchObject({ ejecuciones: 2, errores: 1, costoTotal: 0.1 });
    expect(by['analista']!.ultima!.outcome).toBe('presupuesto');
    expect(body.ejecuciones).toHaveLength(4);
    expect(body.ejecuciones[0]).not.toHaveProperty('input');
    expect(body.errores.map((e) => e.outcome)).toEqual(['presupuesto']);
    expect(body.total).toBe(4);
    expect(body.retencionDias).toBe(30);
    // Últimos análisis: solo con hallazgos, enlazados a su ejecución y a su challenge.
    expect(body.analisis).toHaveLength(1);
    expect(body.analisis[0]).toMatchObject({ challengeId: 'challenge-004', observation: { evidenceId: 'ev-1', diagnosis: 'Confunde el grano.' } });
    expect(body.analisis[0]!.runId).toBeTruthy();
    expect(body.conceptosCreados).toEqual([{ id: 'sql:grano', name: 'Grano de una tabla', since: '2026-10-14T16:00:00.000Z' }]);
  });

  it('el costo de hoy cuenta solo lo de hoy', async () => {
    mkdirSync(runsDir(tmp), { recursive: true });
    const id = '20260101T100000000Z-generador-cccc';
    writeFileSync(path.join(runsDir(tmp), `${id}.json`), JSON.stringify({ id, rol: 'generador', startedAt: '2026-01-01T10:00:00.000Z', outcome: 'ok', cost: 0.7, input: '', events: [] }));
    const g = ((await app.inject('/api/agentes')).json() as AgentesPayload).agentes[0]!;
    expect(g).toMatchObject({ costoTotal: 0.7, costoHoy: 0 });
  });

  it('el detalle trae mensaje, eventos y salida; un id raro o inexistente da 404 y la API no lanza nada', async () => {
    await recordAgent(tmp, 'generador', ok('salida', 0.1), {})({ message: 'mensaje de entrada' });
    const list = (await app.inject('/api/agentes')).json() as AgentesPayload;
    const detail = (await app.inject(`/api/agentes/ejecuciones/${list.ejecuciones[0]!.id}`)).json() as { input: string; output: string; events: unknown[] };
    expect(detail).toMatchObject({ input: 'mensaje de entrada', output: 'salida' });
    expect(detail.events).toHaveLength(2);
    expect((await app.inject('/api/agentes/ejecuciones/20260101T000000000Z-generador-ffff')).statusCode).toBe(404);
    expect((await app.inject('/api/agentes/ejecuciones/..%2F..%2Fpackage')).statusCode).toBe(404);
    // AC-R48d: es de solo lectura; no hay forma de lanzar un agente desde aquí.
    for (const method of ['POST', 'PUT', 'DELETE'] as const) expect((await app.inject({ method, url: '/api/agentes' })).statusCode).toBe(404);
    expect(existsSync(path.join(tmp, 'challenge'))).toBe(false);
  });

  it('sin registro todavía, devuelve los cuatro agentes inactivos', async () => {
    const body = (await app.inject('/api/agentes')).json() as AgentesPayload;
    expect(body.agentes.every((a) => !a.enCurso && a.ejecuciones === 0)).toBe(true);
    expect(body.ejecuciones).toEqual([]);
  });
});
