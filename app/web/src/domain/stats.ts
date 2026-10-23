import type { Challenge, DomainId, Evidence, Stage } from '../../../shared/types';
import { DOMAINS } from '../../../shared/domains';
import { latestAttemptByStage } from './conceptState';

/** Meta semanal de etapas (provisional: el PRD §11 no está en el repo). */
export const WEEKLY_GOAL = 5;
const DAY_MS = 86_400_000;

export interface StageRef {
  stage: Stage;
  challenge: Challenge;
}

export function stageIndex(challenges: Challenge[]): Map<string, StageRef> {
  const index = new Map<string, StageRef>();
  for (const challenge of challenges) for (const stage of challenge.stages) index.set(stage.id, { stage, challenge });
  return index;
}

/** Clave de día en hora local: `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function activityDays(evidence: Evidence[]): Set<string> {
  return new Set(evidence.map((e) => dayKey(new Date(e.at))));
}

/** Días consecutivos con práctica; cuenta desde hoy, o desde ayer si hoy aún no se practicó. */
export function currentStreakDays(days: Set<string>, now: Date): string[] {
  let cursor = days.has(dayKey(now)) ? now : addDays(now, -1);
  const keys: string[] = [];
  while (days.has(dayKey(cursor))) {
    keys.push(dayKey(cursor));
    cursor = addDays(cursor, -1);
  }
  return keys;
}

export function longestStreak(days: Set<string>): number {
  let best = 0;
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    const date = new Date(y, m - 1, d);
    if (days.has(dayKey(addDays(date, -1)))) continue; // no es el inicio de una racha
    let len = 0;
    for (let cursor = date; days.has(dayKey(cursor)); cursor = addDays(cursor, 1)) len++;
    best = Math.max(best, len);
  }
  return best;
}

/** Lunes de la semana de `date`, a las 00:00 locales. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Semana ISO 8601. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
}

export interface DayDomainCounts {
  day: Date;
  counts: Record<DomainId, number>;
  total: number;
}

const emptyCounts = (): Record<DomainId, number> =>
  Object.fromEntries(DOMAINS.map((d) => [d.id, 0])) as Record<DomainId, number>;

/** Intentos por día (lunes a domingo de la semana de `now`), apilados por dominio de la etapa. */
export function weeklyByDomain(evidence: Evidence[], challenges: Challenge[], now: Date): DayDomainCounts[] {
  const index = stageIndex(challenges);
  const monday = startOfWeek(now);
  const days: DayDomainCounts[] = Array.from({ length: 7 }, (_, i) => ({ day: addDays(monday, i), counts: emptyCounts(), total: 0 }));
  const byKey = new Map(days.map((d) => [dayKey(d.day), d]));
  for (const e of evidence) {
    const bucket = byKey.get(dayKey(new Date(e.at)));
    const ref = index.get(e.stageId);
    if (!bucket || !ref) continue;
    bucket.counts[ref.stage.domain] += 1;
    bucket.total += 1;
  }
  return days;
}

/** Actividad de los últimos `days` días (el último es hoy): intentos por dominio y minutos registrados. */
export function dailyActivity(evidence: Evidence[], challenges: Challenge[], now: Date, days: number): (DayDomainCounts & { minutes: number })[] {
  const index = stageIndex(challenges);
  const list = Array.from({ length: days }, (_, i) => ({ day: addDays(now, i - (days - 1)), counts: emptyCounts(), total: 0, minutes: 0 }));
  const byKey = new Map(list.map((d) => [dayKey(d.day), d]));
  for (const e of evidence) {
    const bucket = byKey.get(dayKey(new Date(e.at)));
    const ref = index.get(e.stageId);
    if (!bucket || !ref) continue;
    bucket.counts[ref.stage.domain] += 1;
    bucket.total += 1;
    bucket.minutes += e.actualMinutes;
  }
  return list;
}

/** Etapas distintas aprobadas durante la semana de `now`. */
export function stagesCompletedThisWeek(evidence: Evidence[], now: Date): number {
  const from = startOfWeek(now).getTime();
  return new Set(evidence.filter((e) => e.result === 'aprobada' && new Date(e.at).getTime() >= from).map((e) => e.stageId)).size;
}

export function completedStageCount(challenges: Challenge[], evidence: Evidence[]): { done: number; total: number } {
  const latest = latestAttemptByStage(evidence);
  const stages = challenges.flatMap((c) => c.stages);
  return { done: stages.filter((s) => latest.get(s.id)?.result === 'aprobada').length, total: stages.length };
}

export function averageActualMinutes(evidence: Evidence[]): number | null {
  const passed = evidence.filter((e) => e.result === 'aprobada');
  if (passed.length === 0) return null;
  return passed.reduce((sum, e) => sum + e.actualMinutes, 0) / passed.length;
}

export function averageEstimatedMinutes(evidence: Evidence[], challenges: Challenge[]): number | null {
  const index = stageIndex(challenges);
  const passed = evidence.filter((e) => e.result === 'aprobada' && index.has(e.stageId));
  if (passed.length === 0) return null;
  return passed.reduce((sum, e) => sum + index.get(e.stageId)!.stage.estimatedMinutes, 0) / passed.length;
}

export interface TimePoint {
  at: Date;
  stageTitle: string;
  real: number;
  estimated: number;
}

/** Un punto por intento aprobado en los últimos `days` días. */
export function timePoints(evidence: Evidence[], challenges: Challenge[], now: Date, days: number): TimePoint[] {
  const index = stageIndex(challenges);
  const from = now.getTime() - days * DAY_MS;
  return evidence
    .filter((e) => e.result === 'aprobada' && new Date(e.at).getTime() >= from && index.has(e.stageId))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => ({
      at: new Date(e.at),
      stageTitle: index.get(e.stageId)!.stage.title,
      real: e.actualMinutes,
      estimated: index.get(e.stageId)!.stage.estimatedMinutes,
    }));
}
