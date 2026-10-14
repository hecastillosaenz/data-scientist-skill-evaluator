import { describe, expect, it } from 'vitest';
import { activityDays, currentStreakDays, dayKey, isoWeek, longestStreak, startOfWeek, timePoints } from '../../web/src/domain/stats';
import { timeReadingLine } from '../../web/src/domain/readingLines';
import type { Evidence } from '../../shared/types';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const ev = (date: Date, over: Partial<Evidence> = {}): Evidence => ({
  id: 'e', challengeId: 'c1', stageId: 'c1-s1', at: date.toISOString(), result: 'aprobada',
  withHelp: false, apoyo: 'pistas', actualMinutes: 20, ...over,
});

describe('rachas', () => {
  const now = at(2026, 10, 13);
  it('cuenta desde hoy', () => {
    const days = activityDays([ev(at(2026, 10, 13)), ev(at(2026, 10, 12)), ev(at(2026, 10, 11)), ev(at(2026, 10, 8))]);
    expect(currentStreakDays(days, now)).toHaveLength(3);
  });
  it('si hoy no se practicó, la racha sigue viva desde ayer', () => {
    const days = activityDays([ev(at(2026, 10, 12)), ev(at(2026, 10, 11))]);
    expect(currentStreakDays(days, now)).toHaveLength(2);
  });
  it('se rompe si pasaron 2 o más días sin practicar', () => {
    expect(currentStreakDays(activityDays([ev(at(2026, 10, 10))]), now)).toHaveLength(0);
  });
  it('longestStreak encuentra la mayor racha del periodo', () => {
    const days = activityDays([1, 2, 3, 4, 10, 11].map((d) => ev(at(2026, 9, d))));
    expect(longestStreak(days)).toBe(4);
  });
});

describe('semanas', () => {
  it('startOfWeek devuelve el lunes', () => {
    expect(dayKey(startOfWeek(at(2026, 10, 13)))).toBe('2026-10-12'); // martes -> lunes
    expect(dayKey(startOfWeek(at(2026, 10, 18)))).toBe('2026-10-12'); // domingo -> lunes
  });
  it('isoWeek', () => {
    expect(isoWeek(at(2026, 1, 1))).toBe(1);
    expect(isoWeek(at(2026, 10, 13))).toBe(42);
  });
});

describe('timeReadingLine', () => {
  const point = (real: number, estimated = 30) => ({ at: new Date(), stageTitle: 't', real, estimated });
  it('sin datos suficientes lo dice', () => {
    expect(timeReadingLine([point(30)], 30)).toContain('Aún no hay suficientes');
  });
  it('rama "bajó ... sigue por encima"', () => {
    const line = timeReadingLine([point(50), point(48), point(40), point(38)], 30);
    expect(line).toBe('Tu tiempo real bajó de ~49 min a ~39 min en 30 días; sigue 9 min por encima del estimado.');
  });
  it('rama "ya está cerca del estimado"', () => {
    expect(timeReadingLine([point(40), point(38), point(31), point(30)], 30)).toContain('ya está cerca del estimado');
  });
});

describe('timePoints', () => {
  it('ignora intentos no aprobados y los fuera de ventana', () => {
    const challenges = [{ id: 'c1', stages: [{ id: 'c1-s1', title: 'T', estimatedMinutes: 20 }] }] as never;
    const now = at(2026, 10, 13);
    const points = timePoints([ev(at(2026, 10, 12)), ev(at(2026, 10, 11), { result: 'fallida' }), ev(at(2026, 8, 1))], challenges, now, 30);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ stageTitle: 'T', real: 20, estimated: 20 });
  });
});
