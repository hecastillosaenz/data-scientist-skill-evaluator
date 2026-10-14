import type { Apoyo, Blocker, Challenge, Concept, Difficulty, DomainId, Evidence } from '../../../shared/types';
import { DOMAINS } from '../../../shared/domains';
import { addDays, dayKey, longestStreak, stageIndex } from './stats';

const DAY_MS = 86_400_000;

export const inPeriod = (evidence: Evidence[], now: Date, days: number, offsetDays = 0): Evidence[] => {
  const to = now.getTime() - offsetDays * DAY_MS;
  const from = to - days * DAY_MS;
  return evidence.filter((e) => {
    const t = new Date(e.at).getTime();
    return t > from && t <= to;
  });
};

export interface BlockerTrend {
  blocker: Blocker;
  count: number;
  /** Frecuencia en el periodo anterior de igual duración. */
  previous: number;
  delta: number;
}

/** Los 3 bloqueos más frecuentes del periodo y su variación frente al periodo anterior. */
export function blockerTrend(evidence: Evidence[], now: Date, days: number): { items: BlockerTrend[]; total: number } {
  const count = (list: Evidence[]) => {
    const map = new Map<Blocker, number>();
    for (const e of list) if (e.blocker) map.set(e.blocker, (map.get(e.blocker) ?? 0) + 1);
    return map;
  };
  const current = count(inPeriod(evidence, now, days));
  const previous = count(inPeriod(evidence, now, days, days));
  const items = [...current.entries()]
    .map(([blocker, n]) => ({ blocker, count: n, previous: previous.get(blocker) ?? 0, delta: n - (previous.get(blocker) ?? 0) }))
    .sort((a, b) => b.count - a.count || a.blocker.localeCompare(b.blocker))
    .slice(0, 3);
  const total = [...current.values()].reduce((a, b) => a + b, 0);
  return { items, total };
}

export interface DomainGap {
  domain: DomainId;
  total: number;
  withEvidence: number;
  missing: number;
}

/** Conceptos de cada dominio con y sin evidencia en los últimos `days` días. */
export function domainGaps(concepts: Concept[], challenges: Challenge[], evidence: Evidence[], now: Date, days: number): DomainGap[] {
  const index = stageIndex(challenges);
  const practiced = new Set<string>();
  for (const e of inPeriod(evidence, now, days)) for (const id of index.get(e.stageId)?.stage.conceptIds ?? []) practiced.add(id);
  return DOMAINS.map(({ id }) => {
    const own = concepts.filter((c) => c.domain === id);
    const withEvidence = own.filter((c) => practiced.has(c.id)).length;
    return { domain: id, total: own.length, withEvidence, missing: own.length - withEvidence };
  });
}

export interface DomainApoyo {
  domain: DomainId;
  byApoyo: Record<Apoyo, number>;
  total: number;
}

/** Intentos del periodo por dominio de la etapa, separados por Apoyo usado. */
export function stagesByDomainApoyo(evidence: Evidence[], challenges: Challenge[], now: Date, days: number): DomainApoyo[] {
  const index = stageIndex(challenges);
  const rows = new Map<DomainId, DomainApoyo>(
    DOMAINS.map(({ id }) => [id, { domain: id, byApoyo: { guiado: 0, pistas: 0, autonomo: 0 }, total: 0 }]),
  );
  for (const e of inPeriod(evidence, now, days)) {
    const ref = index.get(e.stageId);
    if (!ref) continue;
    const row = rows.get(ref.stage.domain)!;
    row.byApoyo[e.apoyo] += 1;
    row.total += 1;
  }
  return [...rows.values()];
}

export interface DifficultyPerformance {
  difficulty: Difficulty;
  attempts: number;
  passed: number;
  avgReal: number | null;
  avgEstimated: number | null;
  /** Minutos reales menos estimados (media). */
  deviation: number | null;
}

/** Rendimiento acumulado desde el inicio, por dificultad de la etapa. */
export function performanceByDifficulty(evidence: Evidence[], challenges: Challenge[]): DifficultyPerformance[] {
  const index = stageIndex(challenges);
  return ([1, 2, 3] as Difficulty[]).map((difficulty) => {
    const rows = evidence.filter((e) => index.get(e.stageId)?.stage.difficulty === difficulty);
    const passed = rows.filter((e) => e.result === 'aprobada');
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const avgReal = mean(passed.map((e) => e.actualMinutes));
    const avgEstimated = mean(passed.map((e) => index.get(e.stageId)!.stage.estimatedMinutes));
    return {
      difficulty,
      attempts: rows.length,
      passed: passed.length,
      avgReal,
      avgEstimated,
      deviation: avgReal !== null && avgEstimated !== null ? avgReal - avgEstimated : null,
    };
  });
}

export interface HeatCell {
  day: Date;
  key: string;
  count: number;
  /** 0 = vacío; 1–4 = intensidad. */
  level: 0 | 1 | 2 | 3 | 4;
}

export function activityHeatmap(evidence: Evidence[], now: Date, days: number): HeatCell[] {
  const counts = new Map<string, number>();
  for (const e of evidence) counts.set(dayKey(new Date(e.at)), (counts.get(dayKey(new Date(e.at))) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(now, -(days - 1 - i));
    const count = counts.get(dayKey(day)) ?? 0;
    return { day, key: dayKey(day), count, level: (count === 0 ? 0 : Math.min(4, count)) as HeatCell['level'] };
  });
}

/** Días practicados y racha más larga dentro del periodo. */
export function periodActivity(evidence: Evidence[], now: Date, days: number): { practicedDays: number; longest: number } {
  const keys = new Set(activityHeatmap(evidence, now, days).filter((c) => c.count > 0).map((c) => c.key));
  return { practicedDays: keys.size, longest: longestStreak(keys) };
}
