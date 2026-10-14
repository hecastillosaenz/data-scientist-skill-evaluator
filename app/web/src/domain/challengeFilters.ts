import type { Bloom, Challenge, ChallengeStatus, Difficulty, DomainId } from '../../../shared/types';

export interface ChallengeFilters {
  domains: Set<DomainId>;
  difficulties: Set<Difficulty>;
  blooms: Set<Bloom>;
  statuses: Set<ChallengeStatus>;
}

export const emptyFilters = (): ChallengeFilters => ({
  domains: new Set(),
  difficulties: new Set(),
  blooms: new Set(),
  statuses: new Set(),
});

/**
 * Un grupo vacío no filtra. Dominio y Bloom incluyen el challenge si ALGUNA etapa cumple la condición
 * (UI-UX §4.2); dificultad y estado se evalúan sobre el challenge completo.
 */
export function filterChallenges(
  challenges: Challenge[],
  filters: ChallengeFilters,
  statusOf: (c: Challenge) => ChallengeStatus,
): Challenge[] {
  return challenges.filter(
    (c) =>
      (filters.domains.size === 0 || c.stages.some((s) => filters.domains.has(s.domain))) &&
      (filters.blooms.size === 0 || c.stages.some((s) => filters.blooms.has(s.bloom))) &&
      (filters.difficulties.size === 0 || filters.difficulties.has(c.difficulty)) &&
      (filters.statuses.size === 0 || filters.statuses.has(statusOf(c))),
  );
}

/** Orden por defecto: en curso → pendientes recomendados → otros pendientes → completados. */
export function sortChallenges(challenges: Challenge[], statusOf: (c: Challenge) => ChallengeStatus): Challenge[] {
  const rank = (c: Challenge) => {
    const status = statusOf(c);
    if (status === 'en_curso') return 0;
    if (status === 'pendiente') return c.recommended ? 1 : 2;
    return 3;
  };
  return [...challenges].sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}
