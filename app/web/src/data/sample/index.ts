import type { AppData, Evidence } from '../../../../shared/types';
import { SAMPLE_CONCEPTS } from './concepts';
import { buildChallenges } from './challenges';
import { buildEvidence } from './evidence';

export type Scenario = 'normal' | 'nuevo' | 'sin-challenge' | 'racha-rota';

export const SCENARIOS: Scenario[] = ['normal', 'nuevo', 'sin-challenge', 'racha-rota'];

/** Los estados de UI-UX §4.1 se pueden ver con `?escenario=nuevo|sin-challenge|racha-rota`. */
export function buildSampleData(scenario: Scenario = 'normal', now: Date = new Date()): AppData {
  let evidence: Evidence[] = buildEvidence(now);
  if (scenario === 'nuevo') evidence = [];
  if (scenario === 'sin-challenge') evidence = evidence.filter((e) => e.challengeId !== 'c006' && e.challengeId !== 'c004');
  if (scenario === 'racha-rota') {
    const cutoff = now.getTime() - 3 * 86_400_000;
    evidence = evidence.filter((e) => new Date(e.at).getTime() < cutoff);
  }
  return {
    user: { name: 'Helio' },
    now: now.toISOString(),
    concepts: SAMPLE_CONCEPTS,
    challenges: buildChallenges(),
    evidence,
    businessAnswers: [],
    testResults: [],
  };
}
