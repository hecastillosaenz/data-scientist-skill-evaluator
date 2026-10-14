import type { AppData } from '../../../shared/types';
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

export async function loadAppData(scenario: Scenario): Promise<AppData> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  return buildSampleData(scenario);
}
