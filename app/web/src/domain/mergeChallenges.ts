import type { Challenge } from '../../../shared/types';

/** Los ids de los challenges reales son el nombre de su carpeta (`challenge-001`); los de ejemplo, `c001`… */
export const isRealChallenge = (id: string): boolean => /^challenge-\d+$/.test(id);

/**
 * Combina los challenges reales (`challenge-N/challenge.json`) con los de ejemplo. Si un reto real tiene el mismo
 * título que uno de ejemplo, el real lo sustituye: es la misma práctica, ahora con notebook y verificación de verdad.
 */
export function mergeChallenges(real: Challenge[], sample: Challenge[]): Challenge[] {
  const realTitles = new Set(real.map((c) => c.title));
  return [...real, ...sample.filter((c) => !realTitles.has(c.title))];
}
