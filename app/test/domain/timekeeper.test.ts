import { describe, expect, it } from 'vitest';
import {
  GAP_THRESHOLD_MS, beat, detectGap, elapsedMs, formatClock, initialTimer, isRunning, lapMs, parseTimer, pause, reset, resolveGap, serializeTimer, start, takeLap, toMinutes,
} from '../../web/src/domain/timekeeper';

const SEC = 1000;
const MIN = 60 * SEC;

describe('cronómetro global', () => {
  it('acumula entre inicio y pausa y lo conserva al reanudar', () => {
    let s = start(initialTimer(), 0);
    expect(elapsedMs(s, 90 * SEC)).toBe(90 * SEC);
    s = pause(s, 90 * SEC);
    expect(elapsedMs(s, 10 * MIN)).toBe(90 * SEC); // en pausa no corre
    expect(isRunning(s)).toBe(false);
    s = start(s, 10 * MIN);
    expect(elapsedMs(s, 10 * MIN + 30 * SEC)).toBe(120 * SEC);
  });

  it('iniciar uno ya iniciado no reinicia el tramo; pausar uno en pausa no cambia nada', () => {
    const s = start(initialTimer(), 1000);
    expect(start(s, 9000).startedAt).toBe(1000);
    const p = pause(s, 2000);
    expect(pause(p, 5000)).toBe(p);
  });

  it('el tiempo no retrocede si el reloj se atrasa', () => {
    expect(elapsedMs({ ...initialTimer(), accumulatedMs: 1000, startedAt: 5000 }, 4000)).toBe(1000);
  });

  it('reiniciar vuelve todo a cero', () => {
    expect(reset()).toEqual(initialTimer());
  });
});

describe('vueltas: el tiempo de cada etapa (AC-R20)', () => {
  it('cada registro toma solo el tiempo desde el registro anterior', () => {
    let s = start(initialTimer(), 0);
    const first = takeLap(s, 25 * MIN);
    expect(first.ms).toBe(25 * MIN);
    s = first.state;
    expect(lapMs(s, 25 * MIN)).toBe(0);
    expect(lapMs(s, 40 * MIN)).toBe(15 * MIN);
    const second = takeLap(s, 50 * MIN);
    expect(second.ms).toBe(25 * MIN); // 50 − 25, no 50
    expect(elapsedMs(second.state, 50 * MIN)).toBe(50 * MIN); // el reloj global no se reinicia
  });

  it('las pausas no cuentan dentro de una vuelta', () => {
    let s = start(initialTimer(), 0);
    s = pause(s, 10 * MIN); // trabajó 10
    s = start(s, 60 * MIN); // volvió 50 min después
    expect(takeLap(s, 70 * MIN).ms).toBe(20 * MIN); // 10 + 10
  });

  it('registrar con el reloj parado devuelve el tiempo acumulado y deja la base', () => {
    const s = pause(start(initialTimer(), 0), 12 * MIN);
    const lap = takeLap(s, 99 * MIN);
    expect(lap.ms).toBe(12 * MIN);
    expect(lapMs(lap.state, 99 * MIN)).toBe(0);
  });
});

describe('ausencias (R30, AC-R30)', () => {
  const T = 1_000_000;

  it('con señal reciente no hay ausencia', () => {
    let s = start(initialTimer(), T);
    s = beat(s, T + 60 * SEC);
    expect(detectGap(s, T + 60 * SEC + GAP_THRESHOLD_MS)).toBe(s); // justo en el umbral no cuenta
  });

  it('sin señal por más de 3 minutos congela el reloj en la última señal y registra la ausencia', () => {
    let s = start(initialTimer(), T);
    s = beat(s, T + 20 * MIN); // trabajó 20 min con la pestaña abierta
    const back = T + 30 * MIN; // vuelve 10 min después, sin señal
    const g = detectGap(s, back);
    expect(g.gap).toEqual({ from: T + 20 * MIN, to: back });
    expect(isRunning(g)).toBe(false);
    expect(elapsedMs(g, back)).toBe(20 * MIN); // los 10 min ausentes NO se suman en silencio
    expect(elapsedMs(g, back + 5 * MIN)).toBe(20 * MIN); // y el reloj no avanza mientras se decide
  });

  it('no inicia el reloj ni cambia nada mientras hay una ausencia sin resolver', () => {
    const g = detectGap(beat(start(initialTimer(), 0), 10 * MIN), 30 * MIN);
    expect(start(g, 31 * MIN)).toBe(g);
    expect(detectGap(g, 60 * MIN)).toBe(g);
  });

  it('descartar (por defecto): no cuenta el intervalo y el reloj sigue desde ahora', () => {
    const back = 30 * MIN;
    const g = detectGap(beat(start(initialTimer(), 0), 20 * MIN), back);
    const r = resolveGap(g, 'descartar', back);
    expect(r.gap).toBeNull();
    expect(isRunning(r)).toBe(true);
    expect(elapsedMs(r, back + 5 * MIN)).toBe(25 * MIN);
  });

  it('contar: suma el intervalo y sigue', () => {
    const back = 30 * MIN;
    const g = detectGap(beat(start(initialTimer(), 0), 20 * MIN), back);
    const r = resolveGap(g, 'contar', back);
    expect(elapsedMs(r, back)).toBe(30 * MIN);
    expect(isRunning(r)).toBe(true);
  });

  it('pausar: no cuenta el intervalo y deja el reloj en pausa', () => {
    const back = 30 * MIN;
    const g = detectGap(beat(start(initialTimer(), 0), 20 * MIN), back);
    const r = resolveGap(g, 'pausar', back);
    expect(r.gap).toBeNull();
    expect(isRunning(r)).toBe(false);
    expect(elapsedMs(r, back + 99 * MIN)).toBe(20 * MIN);
  });

  it('una ausencia no afecta a las vueltas: la vuelta solo suma tiempo contado', () => {
    let s = start(initialTimer(), 0);
    const { state } = takeLap(s, 10 * MIN);
    s = beat(state, 20 * MIN);
    const back = 60 * MIN;
    const r = resolveGap(detectGap(s, back), 'descartar', back);
    expect(lapMs(r, back + 5 * MIN)).toBe(15 * MIN); // 10 (hasta la señal) + 5 desde que volvió
  });

  it('con el reloj en pausa no hay ausencia por más que pase el tiempo', () => {
    const p = pause(start(initialTimer(), 0), MIN);
    expect(detectGap(p, 999 * MIN)).toBe(p);
  });
});

describe('persistencia (AC-R20)', () => {
  it('sobrevive a una recarga y sigue corriendo', () => {
    const s = beat(start(initialTimer(), 0), 2 * MIN);
    const restored = parseTimer(serializeTimer(s));
    expect(restored).toEqual(s);
    expect(elapsedMs(restored, 5 * MIN)).toBe(5 * MIN);
  });

  it('conserva la base de la vuelta y la ausencia pendiente', () => {
    const lap = takeLap(start(initialTimer(), 0), 10 * MIN).state;
    const gapped = detectGap(beat(lap, 12 * MIN), 40 * MIN);
    expect(parseTimer(serializeTimer(gapped))).toEqual(gapped);
  });

  it('descarta datos corruptos o negativos sin lanzar', () => {
    for (const raw of [null, undefined, '', 'no es json', '[1]', '{"accumulatedMs": -5, "lapBaseMs": 0}', '{"accumulatedMs": 5, "lapBaseMs": 0, "startedAt": "ayer"}', 'null']) {
      expect(parseTimer(raw as string | null | undefined)).toEqual(initialTimer());
    }
  });

  it('si estaba corriendo y faltaba la señal guardada, usa el inicio del tramo', () => {
    const r = parseTimer(JSON.stringify({ accumulatedMs: 0, lapBaseMs: 0, startedAt: 500, heartbeatAt: null, gap: null }));
    expect(r.heartbeatAt).toBe(500);
  });
});

describe('formato', () => {
  it('formatea mm:ss y h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(75 * SEC)).toBe('01:15');
    expect(formatClock(59 * MIN + 59 * SEC)).toBe('59:59');
    expect(formatClock(3600 * SEC + 5 * SEC)).toBe('1:00:05');
    expect(formatClock(-5)).toBe('00:00');
  });
  it('redondea a minutos con mínimo 1 si hubo tiempo medido', () => {
    expect(toMinutes(0)).toBe(0);
    expect(toMinutes(10 * SEC)).toBe(1);
    expect(toMinutes(89 * SEC)).toBe(1);
    expect(toMinutes(91 * SEC)).toBe(2);
    expect(toMinutes(31 * MIN)).toBe(31);
  });
});
