import type { ChallengePlan } from '../server/generator/plan';

export type GenerateErrorCode =
  | 'no_claude'
  | 'budget'
  | 'invalid_output'
  | 'gate_failed'
  | 'calibration'
  | 'state'
  | 'conflict'
  | 'aborted'
  | 'internal';

/**
 * Eventos NDJSON de la generación de un challenge (SDD R39). Mismo patrón que la verificación: `step` con la fase y
 * su estado, `tool` con lo que lee el agente, y un `result` o un `error` antes de `done`.
 */
export type GenerateEvent =
  | { type: 'plan'; plan: ChallengePlan }
  | { type: 'step'; id: string; label: string; status: 'running' | 'ok' | 'error'; detail?: string }
  | { type: 'tool'; text: string }
  | { type: 'result'; challengeId: string; title: string }
  | {
      type: 'error';
      code: GenerateErrorCode;
      message: string;
      /** Fase en la que ocurrió (`esqueleto`, `etapa-2`, `test`, `publicar`…). */
      phase?: string;
      /** Hay trabajo ya validado que «Reintentar» puede retomar (R39). */
      canResume?: boolean;
    }
  | { type: 'done'; cost: number };

/** Lo que la UI necesita saber para ofrecer «Reintentar» tras recargar la página. */
export interface PendingGeneration {
  challengeId: string;
  /** Fases ya validadas (p. ej. `esqueleto`, `etapa-1`). */
  completed: string[];
  /** Antigüedad del trabajo conservado, en horas. */
  ageHours: number;
}
