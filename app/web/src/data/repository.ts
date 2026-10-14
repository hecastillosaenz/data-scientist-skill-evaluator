import type { Apoyo, AppData, BusinessAnswer, Challenge, Evidence, TestResult } from '../../../shared/types';
import type { InvalidChallengeInfo, StatePayload } from '../../../shared/state';
import { mergeChallenges } from '../domain/mergeChallenges';
import { buildSampleData, SCENARIOS, type Scenario } from './sample';

/**
 * Único punto de acceso a datos de la UI. Con datos reales (por defecto) todo viene del orquestador y se guarda en
 * `challenge/challenge-NNN/progreso.json` (R33–R36); con `?datos=ejemplo` se cargan datos sintéticos que nunca se persisten.
 */
export type DataSource = 'real' | 'ejemplo';

export function sourceFromSearch(search: string): DataSource {
  return new URLSearchParams(search).get('datos') === 'ejemplo' ? 'ejemplo' : 'real';
}

export function scenarioFromSearch(search: string): Scenario {
  const value = new URLSearchParams(search).get('escenario');
  return SCENARIOS.includes(value as Scenario) ? (value as Scenario) : 'normal';
}

export interface LoadedState {
  source: DataSource;
  data: AppData;
  /** Apoyo vigente por etapa (sobrescribe el inicial). */
  apoyos: Record<string, Apoyo>;
  /** Ids de challenges iniciados. */
  started: string[];
  invalid: InvalidChallengeInfo[];
  problems: string[];
  /** Estado del Analista (R12): pendientes, en curso y fallidos. */
  analysis: StatePayload['analysis'];
  /** Intentos guardados (R51); vacío con los datos de ejemplo, que no se guardan. */
  attempts: StatePayload['attempts'];
}

/** Error legible para mostrar tal cual: el orquestador manda `message`; si no responde, se explica. */
export class ApiError extends Error {}

const UNREACHABLE = 'No pude conectar con el orquestador. ¿Sigue corriendo `npm run app`?';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!res.ok) {
    let message = `El orquestador respondió ${res.status}.`;
    try {
      const json = (await res.json()) as { message?: unknown };
      if (typeof json.message === 'string') message = json.message;
    } catch {
      /* cuerpo no JSON: se deja el mensaje genérico */
    }
    throw new ApiError(message);
  }
  return (await res.json()) as T;
}

/** Challenges reales servidos por el orquestador; en modo ejemplo, si no responde, solo hay ejemplos. */
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

export async function loadAppState(source: DataSource, scenario: Scenario): Promise<LoadedState> {
  if (source === 'ejemplo') {
    const [real] = await Promise.all([fetchRealChallenges(), new Promise((resolve) => setTimeout(resolve, 350))]);
    const sample = buildSampleData(scenario);
    return { source, data: { ...sample, challenges: mergeChallenges(real, sample.challenges) }, apoyos: {}, started: [], invalid: [], problems: [], analysis: { pending: [], running: false, failed: {} }, attempts: [] };
  }
  const state = await request<StatePayload>('GET', '/api/state');
  return { source, data: state.data, apoyos: state.apoyos, started: Object.keys(state.started), invalid: state.invalid, problems: state.problems, analysis: state.analysis, attempts: state.attempts };
}

/** Escrituras de progreso (R33). Cada una lanza `ApiError` con un mensaje legible si el guardado falla. */
/** Respuesta de `GET /api/analysis`. */
export interface AnalysisStatus {
  running: string | null;
  queued: number;
  pending: string[];
  failed: Record<string, string>;
}

export const progressApi = {
  getAnalysis: () => request<AnalysisStatus>('GET', '/api/analysis'),
  /** «Analizar ahora» (R12): encola las Evidence sin observación. */
  analyzePending: () => request<{ queued: number }>('POST', '/api/analysis/pending'),
  start: (challengeId: string) => request<{ startedAt: string }>('POST', `/api/challenges/${challengeId}/start`),
  setApoyo: (challengeId: string, stageId: string, apoyo: Apoyo) =>
    request<{ apoyo: Apoyo }>('PUT', `/api/challenges/${challengeId}/stages/${stageId}/apoyo`, { apoyo }),
  addEvidence: (evidence: Evidence) => request<{ evidence: Evidence }>('POST', `/api/challenges/${evidence.challengeId}/evidence`, evidence),
  addBusinessAnswers: (challengeId: string, answers: BusinessAnswer[]) =>
    request<{ saved: number }>('POST', `/api/challenges/${challengeId}/business-answers`, { answers }),
  addTestResults: (challengeId: string, results: TestResult[]) =>
    request<{ saved: number }>('POST', `/api/challenges/${challengeId}/test-results`, { results }),
};
