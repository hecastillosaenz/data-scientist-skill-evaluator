import type { AttemptResult } from '../../../shared/types';
import type { VerifyEvent } from '../../../shared/verify';

export interface VerifyStep {
  id: string;
  label: string;
  status: 'running' | 'ok' | 'error';
  detail?: string;
}

export interface VerifyState {
  phase: 'running' | 'done' | 'error' | 'cancelled';
  steps: VerifyStep[];
  output: { stream: 'stdout' | 'stderr'; text: string }[];
  tools: string[];
  feedback: string[];
  result: { status: AttemptResult; summary: string } | null;
  cost: number;
  error: { message: string; code?: string } | null;
}

export const startedState = (): VerifyState => ({ phase: 'running', steps: [], output: [], tools: [], feedback: [], result: null, cost: 0, error: null });

/** Aplica un evento NDJSON (SDD R26) al estado de la ventana de verificación. */
export function reduceVerify(state: VerifyState, event: VerifyEvent): VerifyState {
  switch (event.type) {
    case 'step': {
      const next: VerifyStep = { id: event.id, label: event.label, status: event.status, ...(event.detail ? { detail: event.detail } : {}) };
      const index = state.steps.findIndex((s) => s.id === event.id);
      const steps = index === -1 ? [...state.steps, next] : state.steps.map((s, i) => (i === index ? next : s));
      return { ...state, steps };
    }
    case 'output':
      return { ...state, output: [...state.output, { stream: event.stream, text: event.text }] };
    case 'tool':
      return { ...state, tools: [...state.tools, event.text] };
    case 'feedback':
      return { ...state, feedback: [...state.feedback, event.text] };
    case 'result':
      return { ...state, result: { status: event.status, summary: event.summary } };
    case 'done':
      return { ...state, phase: 'done', cost: event.cost };
    case 'error':
      return {
        ...state,
        phase: event.code === 'aborted' ? 'cancelled' : 'error',
        error: { message: event.message, ...(event.code ? { code: event.code } : {}) },
        // Un paso que seguía «en curso» al fallar la verificación se marca como fallido.
        steps: state.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s)),
      };
  }
}

/** Cancelación pedida por el usuario desde la ventana. */
export const cancelledState = (state: VerifyState): VerifyState => ({
  ...state,
  phase: 'cancelled',
  error: { message: 'Verificación cancelada.', code: 'aborted' },
  steps: state.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s)),
});

/** El stream se cortó sin `done` ni `error` (p. ej. se cayó el servidor). */
export function interruptedState(state: VerifyState): VerifyState {
  if (state.phase !== 'running') return state;
  return { ...state, phase: 'error', error: { message: 'Se interrumpió la conexión con el orquestador antes de terminar.', code: 'interrupted' }, steps: state.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s)) };
}

/** Lee un stream NDJSON y emite un objeto por línea; ignora líneas vacías o corruptas. */
export async function* readNdjson<T = VerifyEvent>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let rest = '';
  const parse = (line: string): T | null => {
    if (!line.trim()) return null;
    try {
      return JSON.parse(line) as T;
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
      const lines = rest.split('\n');
      rest = lines.pop() ?? '';
      for (const line of lines) {
        const event = parse(line);
        if (event) yield event;
      }
    }
    const last = parse(rest + decoder.decode());
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}
