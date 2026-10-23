import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../server/app';
import { readAttempt, readAttempts, saveAttempt, attemptsDir, type NewAttempt } from '../server/attempts/attempt-store';
import { classifyCodeFailure, classifyConceptualFailure } from '../server/verify/classify-failure';
import type { RunResult } from '../server/verify/notebook-runner';
import type { StatePayload } from '../shared/state';
import type { Challenge } from '../shared/types';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const challenge = JSON.parse(readFileSync(path.join(repoRoot, 'app', 'test', 'fixtures', 'challenge-001', 'challenge.json'), 'utf8')) as Challenge;
const stage1 = challenge.stages[0]!;
let tmp: string;
let dir: string;
let app: App | undefined;

const attempt = (over: Partial<NewAttempt> = {}): NewAttempt => ({
  challengeId: 'challenge-001', stageId: stage1.id, stageNumber: 1, at: '2026-10-14T15:00:00.000Z', apoyo: 'pistas', result: 'fallida', mechanism: 'codigo_assert',
  kind: 'code', cost: 0.01, entregable: 'resultado = 1', feedback: 'Revisa el JOIN.', fallo: { tipo: 'error_python', resumen: 'NameError: x' }, ...over,
});
const run = (over: Partial<RunResult> = {}): RunResult => ({ exitCode: 0, timedOut: false, stdout: '', stderr: '', truncated: false, durationMs: 10, ...over });

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-attempts-'));
  dir = path.join(tmp, 'challenge', 'challenge-001');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'challenge.json'), JSON.stringify(challenge));
  mkdirSync(path.join(tmp, 'configuracion-retos'));
  cpSync(path.join(repoRoot, 'configuracion-retos', 'knowledge-graph.json'), path.join(tmp, 'configuracion-retos', 'knowledge-graph.json'));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(tmp, { recursive: true, force: true });
});

describe('clasificación del fallo (R52)', () => {
  it('cada causa tiene su tipo y un resumen concreto', () => {
    expect(classifyCodeFailure({ passed: true, run: run(), comparison: null })).toBeUndefined();
    expect(classifyCodeFailure({ passed: false, run: run({ timedOut: true, exitCode: null }), comparison: null })).toMatchObject({ tipo: 'tiempo_agotado' });
    expect(classifyCodeFailure({ passed: false, run: run({ harnessError: 'Tu celda no define la variable `resultado`.' }), comparison: null })).toMatchObject({ tipo: 'sin_resultado' });
    expect(classifyCodeFailure({ passed: false, run: run({ exitCode: 1, stderr: 'Traceback…\n  File "x"\nKeyError: \'precio\'\n' }), comparison: null })).toEqual({ tipo: 'error_python', resumen: "KeyError: 'precio'" });
    expect(classifyCodeFailure({ passed: false, run: run({ exitCode: 1, stderr: 'Traceback\nAssertionError: x debía valer 3' }), comparison: null })).toEqual({ tipo: 'assert_fallido', resumen: 'AssertionError: x debía valer 3' });
    expect(classifyCodeFailure({ passed: false, run: run(), comparison: { match: false, problems: ['Fila 2: esperaba 2 y obtuve 99', 'Fila 3 sobra'] } as never })).toEqual({ tipo: 'resultado_incorrecto', resumen: 'Fila 2: esperaba 2 y obtuve 99 (y 1 diferencia más)' });
  });
  it('en errores con contexto posterior (DuckDB) resume con la línea de la excepción, no con «^»', () => {
    const stderr = 'Traceback (most recent call last):\n  File "x", line 3\nduckdb.ParserException: Parser Error: syntax error at or near ")"\nLINE 12:     )\n              ^\n';
    expect(classifyCodeFailure({ passed: false, run: run({ exitCode: 1, stderr }), comparison: null })).toEqual({ tipo: 'error_python', resumen: 'duckdb.ParserException: Parser Error: syntax error at or near ")"' });
    expect(classifyCodeFailure({ passed: false, run: run({ exitCode: 1, stderr: 'algo raro\nsin forma de excepción' }), comparison: null })!.resumen).toBe('sin forma de excepción');
  });
  it('las etapas conceptuales se clasifican por el veredicto', () => {
    expect(classifyConceptualFailure('aprobada', 'ok')).toBeUndefined();
    expect(classifyConceptualFailure('parcial', 'Falta la cifra')).toEqual({ tipo: 'respuesta_parcial', resumen: 'Falta la cifra' });
    expect(classifyConceptualFailure('fallida', 'No cumple')).toMatchObject({ tipo: 'respuesta_incorrecta' });
  });
  it('un resumen muy largo se recorta', () => {
    const long = 'x'.repeat(500);
    expect(classifyCodeFailure({ passed: false, run: run({ exitCode: 1, stderr: `ValueError: ${long}` }), comparison: null })!.resumen.length).toBeLessThanOrEqual(240);
  });
});

describe('almacén de intentos (R51, R53)', () => {
  it('numera de forma correlativa, por challenge, entre todas las etapas', async () => {
    const a = await saveAttempt(dir, attempt());
    const b = await saveAttempt(dir, attempt({ stageNumber: 2, stageId: 's2', kind: 'markdown', entregable: 'texto' }));
    const c = await saveAttempt(dir, attempt());
    expect([a.number, b.number, c.number]).toEqual([1, 2, 3]);
    expect([a.folder, b.folder, c.folder]).toEqual(['intentos/001-etapa-1', 'intentos/002-etapa-2', 'intentos/003-etapa-1']);
    expect(a.id).toBe('challenge-001-i001');
    expect((await readAttempts(dir)).map((x) => x.number)).toEqual([1, 2, 3]);
  });

  it('AC-R53b: nunca reescribe un intento existente, aunque la numeración se desfase', async () => {
    const first = await saveAttempt(dir, attempt({ entregable: 'original' }));
    const before = readFileSync(path.join(dir, first.folder, 'entregable.py'), 'utf8');
    // Una carpeta que ya ocupa el siguiente número (p. ej. creada a mano) se salta, no se pisa.
    mkdirSync(path.join(attemptsDir(dir), '002-etapa-1'));
    const next = await saveAttempt(dir, attempt({ entregable: 'nuevo' }));
    expect(next.number).toBe(3);
    expect(readFileSync(path.join(dir, first.folder, 'entregable.py'), 'utf8')).toBe(before);
  });

  it('una carpeta a medias (sin intento.json) se ignora y la lectura completa trae código y feedback', async () => {
    const saved = await saveAttempt(dir, attempt({ entregable: 'resultado = 42', feedback: 'Va bien.' }));
    mkdirSync(path.join(attemptsDir(dir), '009-etapa-1'));
    expect((await readAttempts(dir)).map((x) => x.number)).toEqual([saved.number]);
    expect(await readAttempt(dir, 9)).toBeNull();
    expect(await readAttempt(dir, 77)).toBeNull();
    expect(await readAttempt(dir, saved.number)).toMatchObject({ entregable: 'resultado = 42\n', feedback: 'Va bien.', fallo: { tipo: 'error_python' } });
  });

  it('sin carpeta de intentos devuelve una lista vacía', async () => {
    expect(await readAttempts(dir)).toEqual([]);
  });
});

describe('API (R51, R54)', () => {
  const boot = async () => (app = await buildApp({ webDist: '/no/existe', repoRoot: tmp, now: () => new Date('2026-10-14T15:30:00.000Z') }));

  it('GET /api/state trae los intentos de todos los challenges y el detalle trae el código', async () => {
    await saveAttempt(dir, attempt({ entregable: 'resultado = 7' }));
    await saveAttempt(dir, attempt({ result: 'aprobada', fallo: undefined as never }));
    await boot();
    const state = (await app!.inject('/api/state')).json() as StatePayload;
    expect(state.attempts.map((a) => a.number)).toEqual([1, 2]);
    expect(state.attempts[0]).not.toHaveProperty('entregable');
    expect(state.attempts[0]).not.toHaveProperty('feedback');
    const detail = (await app!.inject('/api/challenges/challenge-001/attempts/1')).json() as { entregable: string; feedback: string };
    expect(detail).toMatchObject({ entregable: 'resultado = 7\n', feedback: 'Revisa el JOIN.' });
    expect((await app!.inject('/api/challenges/challenge-001/attempts/99')).statusCode).toBe(404);
    expect((await app!.inject('/api/challenges/challenge-001/attempts/abc')).statusCode).toBe(404);
    expect((await app!.inject('/api/challenges/no-existe/attempts/1')).statusCode).toBe(404);
  });

  it('AC-R51c: registrar la etapa (Evidence) ni crea intentos ni los cambia, y los intentos no crean Evidence', async () => {
    const saved = await saveAttempt(dir, attempt());
    await boot();
    const before = ((await app!.inject('/api/state')).json() as StatePayload);
    expect(before.data.evidence).toEqual([]); // un intento no es Evidence
    const res = await app!.inject({
      method: 'POST', url: '/api/challenges/challenge-001/evidence',
      payload: { id: 'ev-1', challengeId: 'challenge-001', stageId: stage1.id, at: '2026-10-14T15:20:00.000Z', result: 'aprobada', withHelp: false, apoyo: 'pistas', actualMinutes: 20, timeSource: 'cronometro' },
    });
    expect(res.statusCode).toBeLessThan(300);
    const after = ((await app!.inject('/api/state')).json() as StatePayload);
    expect(after.data.evidence).toHaveLength(1);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.attempts[0]!.id).toBe(saved.id);
    // Con una sola Evidence aprobada el estado del concepto sale de ella, no del intento fallido.
  });
});
