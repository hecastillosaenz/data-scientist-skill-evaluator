import { FALLO_TIPOS, type AttemptSummary, type FalloTipo } from '../../../shared/intentos';
import type { Challenge } from '../../../shared/types';

/** Intentos de una etapa, en orden (SDD R54). */
export const attemptsOfStage = (attempts: readonly AttemptSummary[], stageId: string): AttemptSummary[] =>
  attempts.filter((a) => a.stageId === stageId).sort((a, b) => a.number - b.number);

const failed = (a: AttemptSummary) => a.result !== 'aprobada';

/** Intentos fallidos por tipo de fallo, de más a menos frecuentes (R54). Los tipos sin casos no aparecen. */
export function failureBreakdown(attempts: readonly AttemptSummary[]): { tipo: FalloTipo; count: number }[] {
  const counts = new Map<FalloTipo, number>();
  for (const a of attempts) if (failed(a) && a.fallo) counts.set(a.fallo.tipo, (counts.get(a.fallo.tipo) ?? 0) + 1);
  return FALLO_TIPOS.map((tipo) => ({ tipo, count: counts.get(tipo) ?? 0 })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count || FALLO_TIPOS.indexOf(a.tipo) - FALLO_TIPOS.indexOf(b.tipo));
}

/** Conceptos con más intentos fallidos: cada intento cuenta en todos los conceptos de su etapa (R54). */
export function failuresByConcept(attempts: readonly AttemptSummary[], challenges: readonly Challenge[], limit = 5): { conceptId: string; count: number }[] {
  const conceptsOf = new Map(challenges.flatMap((c) => c.stages.map((s) => [s.id, s.conceptIds] as const)));
  const counts = new Map<string, number>();
  for (const a of attempts) if (failed(a)) for (const id of conceptsOf.get(a.stageId) ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([conceptId, count]) => ({ conceptId, count })).sort((a, b) => b.count - a.count || a.conceptId.localeCompare(b.conceptId)).slice(0, limit);
}

/**
 * Cuántos intentos hizo cada etapa hasta aprobar (R54): se cuentan los intentos hasta el primero aprobado, inclusive.
 * Las etapas sin ningún intento aprobado no cuentan.
 */
export function attemptsToApprove(attempts: readonly AttemptSummary[]): { stages: number; average: number; max: number } {
  const byStage = new Map<string, AttemptSummary[]>();
  for (const a of [...attempts].sort((x, y) => x.number - y.number)) byStage.set(a.stageId, [...(byStage.get(a.stageId) ?? []), a]);
  const tries: number[] = [];
  for (const list of byStage.values()) {
    const i = list.findIndex((a) => a.result === 'aprobada');
    if (i >= 0) tries.push(i + 1);
  }
  if (tries.length === 0) return { stages: 0, average: 0, max: 0 };
  return { stages: tries.length, average: tries.reduce((s, n) => s + n, 0) / tries.length, max: Math.max(...tries) };
}

/** Intentos dentro de una ventana de fechas (el periodo de Analítica). */
export const attemptsSince = (attempts: readonly AttemptSummary[], from: Date): AttemptSummary[] => attempts.filter((a) => Date.parse(a.at) >= from.getTime());
