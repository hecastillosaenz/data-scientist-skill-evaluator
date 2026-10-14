import type { AppData } from '../../../shared/types';
import type { Challenge } from '../../../shared/types';
import { mergeChallenges } from '../domain/mergeChallenges';
import { buildSampleData, SCENARIOS, type Scenario } from './sample';

/**
 * Único punto de acceso a datos de la UI. Hoy devuelve datos de ejemplo;
 * al cablear el orquestador (P1–P5) se reemplaza por `fetch` a `/api/...` sin tocar las pantallas.
 */
export const USING_SAMPLE_DATA = true;

export function scenarioFromSearch(search: string): Scenario {
  const value = new URLSearchParams(search).get('escenario');
  return SCENARIOS.includes(value as Scenario) ? (value as Scenario) : 'normal';
}

/** Challenges reales servidos por el orquestador (`challenge-N/challenge.json`); si no responde, solo hay ejemplos. */
async function fetchRealChallenges(): Promise<Challenge[]> {
  try {
    const res = await fetch('/api/challenges');
    if (!res.ok) return [];
    const body = (await res.json()) as { challenges?: Challenge[] };
    return Array.isArray(body.challenges) ? body.challenges : [];
  } catch {
    return [];
  }
}

export async function loadAppData(scenario: Scenario): Promise<AppData> {
  const [real] = await Promise.all([fetchRealChallenges(), new Promise((resolve) => setTimeout(resolve, 350))]);
  const sample = buildSampleData(scenario);
  return { ...sample, challenges: mergeChallenges(real, sample.challenges) };
}
