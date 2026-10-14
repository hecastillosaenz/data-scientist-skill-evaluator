import type { AttemptResult } from './types';

/** Eventos NDJSON de la verificación (SDD R26), en el orden `step … feedback … result … done`. */
export type VerifyEvent =
  | { type: 'step'; id: string; label: string; status: 'running' | 'ok' | 'error'; detail?: string }
  | { type: 'output'; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'tool'; text: string }
  | { type: 'feedback'; text: string }
  | { type: 'result'; status: AttemptResult; summary: string }
  | { type: 'done'; cost: number }
  | { type: 'error'; message: string; code?: string };

export interface VerifyRequest {
  /** Apoyo vigente de la etapa: el evaluador ajusta cuánto revela. */
  apoyo: 'guiado' | 'pistas' | 'autonomo';
}
