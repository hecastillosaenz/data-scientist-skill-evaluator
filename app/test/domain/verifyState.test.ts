import { describe, expect, it } from 'vitest';
import { cancelledState, interruptedState, readNdjson, reduceVerify, startedState } from '../../web/src/domain/verifyState';
import { simulateVerification } from '../../web/src/domain/simulateVerify';
import { isRealChallenge, mergeChallenges } from '../../web/src/domain/mergeChallenges';
import { buildChallenges } from '../../web/src/data/sample/challenges';
import type { VerifyEvent } from '../../shared/verify';

const apply = (events: VerifyEvent[]) => events.reduce(reduceVerify, startedState());

describe('reduceVerify (R26)', () => {
  it('agrupa un paso: «running» y luego «ok» ocupan la misma fila', () => {
    const s = apply([
      { type: 'step', id: 'cell', label: 'Buscando la celda', status: 'running' },
      { type: 'step', id: 'cell', label: 'Buscando la celda', status: 'ok', detail: 'Celda de 3 líneas' },
    ]);
    expect(s.steps).toEqual([{ id: 'cell', label: 'Buscando la celda', status: 'ok', detail: 'Celda de 3 líneas' }]);
  });

  it('acumula salida, herramientas y feedback, y termina con resultado y done', () => {
    const s = apply([
      { type: 'output', stream: 'stdout', text: 'hola' },
      { type: 'tool', text: 'Read notebook.ipynb' },
      { type: 'feedback', text: 'Bien' },
      { type: 'result', status: 'aprobada', summary: 'ok' },
      { type: 'done', cost: 0.02 },
    ]);
    expect(s).toMatchObject({ phase: 'done', cost: 0.02, result: { status: 'aprobada' }, output: [{ text: 'hola' }], tools: ['Read notebook.ipynb'], feedback: ['Bien'] });
  });

  it('un error marca como fallidos los pasos que seguían en curso', () => {
    const s = apply([
      { type: 'step', id: 'cell', label: 'Buscando', status: 'running' },
      { type: 'error', code: 'celda_no_encontrada', message: 'No encontré la celda' },
    ]);
    expect(s.phase).toBe('error');
    expect(s.steps[0]!.status).toBe('error');
    expect(s.error).toEqual({ message: 'No encontré la celda', code: 'celda_no_encontrada' });
  });

  it('un error «aborted» es una cancelación, no un fallo', () => {
    expect(apply([{ type: 'error', code: 'aborted', message: 'Verificación cancelada.' }]).phase).toBe('cancelled');
  });

  it('cancelar desde la ventana y que el stream se corte sin done', () => {
    const running = apply([{ type: 'step', id: 'run', label: 'Ejecutando', status: 'running' }]);
    expect(cancelledState(running)).toMatchObject({ phase: 'cancelled' });
    expect(interruptedState(running)).toMatchObject({ phase: 'error', error: { code: 'interrupted' } });
    const done = apply([{ type: 'done', cost: 0 }]);
    expect(interruptedState(done)).toBe(done); // un stream completo no se marca como interrumpido
  });
});

describe('readNdjson', () => {
  const stream = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
  const collect = async (chunks: string[]) => {
    const out: VerifyEvent[] = [];
    for await (const e of readNdjson(stream(chunks))) out.push(e);
    return out;
  };

  it('reconstruye líneas partidas entre trozos', async () => {
    const line = JSON.stringify({ type: 'feedback', text: 'hola mundo' });
    expect(await collect([line.slice(0, 10), line.slice(10) + '\n', JSON.stringify({ type: 'done', cost: 1 }) + '\n'])).toEqual([
      { type: 'feedback', text: 'hola mundo' },
      { type: 'done', cost: 1 },
    ]);
  });
  it('lee la última línea aunque no termine en salto de línea y salta basura', async () => {
    expect(await collect(['basura\n\n', JSON.stringify({ type: 'done', cost: 0 })])).toEqual([{ type: 'done', cost: 0 }]);
  });
  it('maneja caracteres multibyte partidos entre trozos', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ type: 'feedback', text: 'Probabilidad condicional ñ ✓' }) + '\n');
    const cut = bytes.length - 6;
    const s = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close(); } });
    const out: VerifyEvent[] = [];
    for await (const e of readNdjson(s)) out.push(e);
    expect(out).toEqual([{ type: 'feedback', text: 'Probabilidad condicional ñ ✓' }]);
  });
});

describe('simulateVerification (challenges de ejemplo)', () => {
  const stages = buildChallenges().flatMap((c) => c.stages);
  const code = stages.find((s) => s.mechanism === 'codigo_assert')!;
  const concept = stages.find((s) => s.mechanism === 'rubric_claude')!;
  const run = async (opts: Parameters<typeof simulateVerification>[0]) => {
    const events: VerifyEvent[] = [];
    for await (const e of simulateVerification({ ...opts, delayMs: 0 })) events.push(e);
    return events;
  };

  it('emite los mismos eventos que el orquestador real, en el mismo orden', async () => {
    const events = await run({ stage: code, apoyo: 'pistas', priorAttempts: 1, answer: '' });
    expect(events.map((e) => (e.type === 'step' ? `${e.id}:${e.status}` : e.type))).toEqual([
      'load:running', 'load:ok', 'cell:running', 'cell:ok', 'run:running', 'run:ok', 'compare:running', 'compare:ok', 'agent:running', 'tool', 'feedback', 'agent:ok', 'result', 'done',
    ]);
  });

  it('alterna fallo y acierto según los intentos previos', async () => {
    expect((await run({ stage: code, apoyo: 'pistas', priorAttempts: 0, answer: '' })).find((e) => e.type === 'result')).toMatchObject({ status: 'fallida' });
    expect((await run({ stage: code, apoyo: 'pistas', priorAttempts: 1, answer: '' })).find((e) => e.type === 'result')).toMatchObject({ status: 'aprobada' });
  });

  it('una etapa conceptual sin respuesta da un error, y con respuesta larga aprueba', async () => {
    expect((await run({ stage: concept, apoyo: 'pistas', priorAttempts: 0, answer: '' })).at(-1)).toMatchObject({ type: 'error', code: 'respuesta_vacia' });
    expect((await run({ stage: concept, apoyo: 'pistas', priorAttempts: 0, answer: 'x'.repeat(200) })).find((e) => e.type === 'result')).toMatchObject({ status: 'aprobada' });
  });

  it('se puede cancelar a mitad', async () => {
    const ac = new AbortController();
    const events: VerifyEvent[] = [];
    setTimeout(() => ac.abort(), 30);
    for await (const e of simulateVerification({ stage: code, apoyo: 'pistas', priorAttempts: 0, answer: '', delayMs: 200, signal: ac.signal })) events.push(e);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'aborted' });
    expect(events.some((e) => e.type === 'result')).toBe(false);
  });
});

describe('mergeChallenges', () => {
  const sample = buildChallenges();
  const real = [{ ...sample.find((c) => c.title.startsWith('Seguros'))!, id: 'challenge-001' }];

  it('un reto real sustituye al de ejemplo con el mismo título', () => {
    const merged = mergeChallenges(real, sample);
    expect(merged.filter((c) => c.title.startsWith('Seguros'))).toHaveLength(1);
    expect(merged[0]!.id).toBe('challenge-001');
    expect(merged).toHaveLength(sample.length);
  });
  it('sin retos reales quedan todos los de ejemplo', () => {
    expect(mergeChallenges([], sample)).toEqual(sample);
  });
  it('distingue ids reales de ids de ejemplo', () => {
    expect(isRealChallenge('challenge-001')).toBe(true);
    expect(isRealChallenge('c010')).toBe(false);
  });
});
