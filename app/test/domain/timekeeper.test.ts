import { describe, expect, it } from 'vitest';
import { elapsedMs, formatClock, parseTimers, pause, reset, runningStageId, serializeTimers, start, toMinutes, type TimerState } from '../../web/src/domain/timekeeper';

const SEC = 1000;
const MIN = 60 * SEC;

describe('cronómetro por etapa', () => {
  it('acumula el tiempo entre inicio y pausa y lo conserva al reanudar', () => {
    let s: TimerState = start({}, 'a', 0);
    expect(elapsedMs(s['a'], 90 * SEC)).toBe(90 * SEC);
    s = pause(s, 'a', 90 * SEC);
    expect(elapsedMs(s['a'], 10 * MIN)).toBe(90 * SEC); // en pausa no corre
    s = start(s, 'a', 10 * MIN);
    expect(elapsedMs(s['a'], 10 * MIN + 30 * SEC)).toBe(120 * SEC);
  });

  it('solo una etapa corre a la vez: iniciar otra pausa la anterior (AC-R20)', () => {
    let s = start({}, 'a', 0);
    s = start(s, 'b', 5 * MIN);
    expect(runningStageId(s)).toBe('b');
    expect(s['a']).toEqual({ accumulatedMs: 5 * MIN, startedAt: null });
    expect(elapsedMs(s['a'], 60 * MIN)).toBe(5 * MIN);
  });

  it('iniciar una etapa ya iniciada no reinicia su tramo', () => {
    const s = start({}, 'a', 1000);
    expect(start(s, 'a', 9000)['a']!.startedAt).toBe(1000);
  });

  it('pause sobre una etapa desconocida no cambia nada y reset la elimina', () => {
    const s = start({}, 'a', 0);
    expect(pause(s, 'zzz', 5)).toBe(s);
    expect(reset(s, 'a')).toEqual({});
    expect(reset(s, 'otra')).toEqual(s);
  });

  it('el tiempo no retrocede si el reloj se adelanta o atrasa', () => {
    expect(elapsedMs({ accumulatedMs: 1000, startedAt: 5000 }, 4000)).toBe(1000);
  });

  it('sobrevive a una recarga: serializar y restaurar conserva el tiempo (AC-R20)', () => {
    const s = start(start({}, 'a', 0), 'b', 2 * MIN);
    const restored = parseTimers(serializeTimers(s));
    expect(restored).toEqual(s);
    expect(elapsedMs(restored['b'], 5 * MIN)).toBe(3 * MIN); // sigue corriendo tras la recarga
    expect(elapsedMs(restored['a'], 5 * MIN)).toBe(2 * MIN);
  });

  it('descarta datos corruptos sin lanzar', () => {
    expect(parseTimers(null)).toEqual({});
    expect(parseTimers('no es json')).toEqual({});
    expect(parseTimers('[1,2]')).toEqual({});
    expect(parseTimers(JSON.stringify({ a: { accumulatedMs: -5, startedAt: null }, b: { accumulatedMs: 10, startedAt: null }, c: 'x' }))).toEqual({
      b: { accumulatedMs: 10, startedAt: null },
    });
  });

  it('si el almacenamiento trae dos cronómetros corriendo, solo queda uno', () => {
    const raw = JSON.stringify({ a: { accumulatedMs: 0, startedAt: 100 }, b: { accumulatedMs: 0, startedAt: 200 } });
    const s = parseTimers(raw);
    expect(Object.values(s).filter((e) => e.startedAt !== null)).toHaveLength(1);
  });

  it('formatea mm:ss y h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(75 * SEC)).toBe('01:15');
    expect(formatClock(59 * MIN + 59 * SEC)).toBe('59:59');
    expect(formatClock(3600 * SEC + 5 * SEC)).toBe('1:00:05');
  });

  it('redondea a minutos con mínimo 1 si hubo tiempo medido', () => {
    expect(toMinutes(0)).toBe(0);
    expect(toMinutes(10 * SEC)).toBe(1);
    expect(toMinutes(89 * SEC)).toBe(1);
    expect(toMinutes(91 * SEC)).toBe(2);
    expect(toMinutes(31 * MIN)).toBe(31);
  });
});
