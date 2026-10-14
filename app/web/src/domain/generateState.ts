import type { GenerateErrorCode, GenerateEvent } from '../../../shared/generate';
import type { ChallengePlan } from '../../../server/generator/plan';

export interface GenerateStep {
  id: string;
  label: string;
  status: 'running' | 'ok' | 'error';
  detail?: string;
}

export interface GenerateState {
  phase: 'running' | 'done' | 'error' | 'cancelled';
  plan: ChallengePlan | null;
  steps: GenerateStep[];
  tools: string[];
  result: { challengeId: string; title: string } | null;
  cost: number;
  error: { message: string; code: GenerateErrorCode; phase?: string; canResume: boolean } | null;
}

export const startedGenerate = (): GenerateState => ({ phase: 'running', plan: null, steps: [], tools: [], result: null, cost: 0, error: null });

const failRunning = (steps: GenerateStep[]): GenerateStep[] => steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s));

/** Aplica un evento NDJSON de la generación (SDD R39) al estado del diálogo. */
export function reduceGenerate(state: GenerateState, event: GenerateEvent): GenerateState {
  switch (event.type) {
    case 'plan':
      return { ...state, plan: event.plan };
    case 'step': {
      const next: GenerateStep = { id: event.id, label: event.label, status: event.status, ...(event.detail ? { detail: event.detail } : {}) };
      const index = state.steps.findIndex((s) => s.id === event.id);
      return { ...state, steps: index === -1 ? [...state.steps, next] : state.steps.map((s, i) => (i === index ? next : s)) };
    }
    case 'tool':
      return { ...state, tools: [...state.tools.slice(-7), event.text] };
    case 'result':
      return { ...state, result: { challengeId: event.challengeId, title: event.title } };
    case 'done':
      return { ...state, phase: 'done', cost: event.cost };
    case 'error':
      return {
        ...state,
        phase: event.code === 'aborted' ? 'cancelled' : 'error',
        steps: failRunning(state.steps),
        error: { message: event.message, code: event.code, ...(event.phase ? { phase: event.phase } : {}), canResume: event.canResume === true },
      };
  }
}

export const cancelledGenerate = (state: GenerateState): GenerateState => ({
  ...state,
  phase: 'cancelled',
  steps: failRunning(state.steps),
  error: { message: 'Generación cancelada. No se creó ningún challenge.', code: 'aborted', canResume: false },
});

/** El stream se cortó sin `done` ni `error` (p. ej. se cayó el servidor). */
export function interruptedGenerate(state: GenerateState): GenerateState {
  if (state.phase !== 'running') return state;
  return { ...state, phase: 'error', steps: failRunning(state.steps), error: { message: 'Se interrumpió la conexión con el orquestador antes de terminar.', code: 'internal', canResume: true } };
}

/** Texto de la fase donde falló, para el botón «Reintentar». */
export const PHASE_LABEL = (phase: string | undefined): string => {
  if (!phase) return 'la generación';
  if (phase === 'esqueleto') return 'el diseño del caso';
  if (phase === 'test') return 'el test final';
  if (phase === 'publicar') return 'la publicación';
  return phase.startsWith('etapa-') ? `la etapa ${phase.slice(6)}` : phase;
};
