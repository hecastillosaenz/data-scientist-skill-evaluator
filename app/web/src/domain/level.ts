import type { Challenge, Difficulty, DomainId, Evidence } from '../../../shared/types';
import { DOMAINS } from '../../../shared/domains';

/** Nivel del usuario por dominio (SDD R40): se deriva de la evidencia y nunca se almacena. */
export type UserLevel = 'Trainee' | 'Básico' | 'Intermedio' | 'Avanzado';
export const LEVELS: readonly UserLevel[] = ['Trainee', 'Básico', 'Intermedio', 'Avanzado'];

/** Etapas que deben contar, en el dominio, para alcanzar cada nivel: `count` etapas de dificultad ≥ `minDifficulty`. */
export const LEVEL_RULES: readonly { level: UserLevel; count: number; minDifficulty: Difficulty }[] = [
  { level: 'Básico', count: 2, minDifficulty: 1 },
  { level: 'Intermedio', count: 3, minDifficulty: 2 },
  { level: 'Avanzado', count: 3, minDifficulty: 3 },
];

export interface DomainLevel {
  level: UserLevel;
  /** 0 = Trainee … 3 = Avanzado. */
  index: number;
  /** Etapas de este dominio que cuentan (una vez cada una). */
  counted: number;
  /** Siguiente nivel y lo que falta; `null` si ya es Avanzado. */
  next: { level: UserLevel; have: number; need: number; minDifficulty: Difficulty } | null;
}

/**
 * Cuenta una etapa si alguno de sus intentos fue aprobado, sin ayuda y con Apoyo Autónomo (R6: en Guiado o Pistas el
 * Nivel no sube). Con «alguno» y no «el último», un fallo posterior en la misma etapa no quita nivel.
 */
export function countingStages(challenges: Challenge[], evidence: Evidence[]): Map<DomainId, Map<string, Difficulty>> {
  const stages = new Map(challenges.flatMap((c) => c.stages.map((s) => [s.id, s] as const)));
  const byDomain = new Map<DomainId, Map<string, Difficulty>>(DOMAINS.map((d) => [d.id, new Map()]));
  for (const e of evidence) {
    const stage = stages.get(e.stageId);
    if (stage && e.result === 'aprobada' && !e.withHelp && e.apoyo === 'autonomo') byDomain.get(stage.domain)!.set(stage.id, stage.difficulty);
  }
  return byDomain;
}

export function levelByDomain(challenges: Challenge[], evidence: Evidence[]): Record<DomainId, DomainLevel> {
  const counting = countingStages(challenges, evidence);
  const result = {} as Record<DomainId, DomainLevel>;
  for (const { id } of DOMAINS) {
    const difficulties = [...counting.get(id)!.values()];
    const have = (min: Difficulty) => difficulties.filter((d) => d >= min).length;
    let index = 0;
    LEVEL_RULES.forEach((rule, i) => {
      if (have(rule.minDifficulty) >= rule.count) index = i + 1;
    });
    const nextRule = LEVEL_RULES[index];
    result[id] = {
      level: LEVELS[index]!,
      index,
      counted: difficulties.length,
      next: nextRule ? { level: nextRule.level, have: Math.min(have(nextRule.minDifficulty), nextRule.count), need: nextRule.count, minDifficulty: nextRule.minDifficulty } : null,
    };
  }
  return result;
}

/** Nivel global (solo para mostrar): mediana de los niveles de los ocho dominios, redondeada hacia abajo; pide amplitud. */
export function globalLevel(levels: Record<DomainId, DomainLevel>): UserLevel {
  const sorted = Object.values(levels).map((l) => l.index).sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[Math.floor(mid)]!;
  return LEVELS[Math.floor(median)]!;
}
