import type { Apoyo, AppData } from './types';

/** Un challenge de `challenge/challenge-NNN/` que no cumple el contrato (R29), con sus errores en español. */
export interface InvalidChallengeInfo {
  folder: string;
  errors: string[];
}

/** Respuesta de `GET /api/state` (SDD §8.3): todo lo que la UI necesita para arrancar. */
export interface StatePayload {
  data: AppData;
  /** Apoyo vigente por etapa (sobrescribe el inicial del challenge). */
  apoyos: Record<string, Apoyo>;
  /** Fecha ISO de inicio por challenge. */
  started: Record<string, string>;
  invalid: InvalidChallengeInfo[];
  /** Archivos de progreso ilegibles (R33): se muestran en un aviso, no se tocan. */
  problems: string[];
  /** Estado del Analista (R12, R42). */
  analysis: {
    /** Evidence sin observación: aún no procesadas por el Analista. */
    pending: string[];
    /** Hay un análisis en curso o en cola. */
    running: boolean;
    /** Análisis que fallaron en esta sesión, con su motivo. */
    failed: Record<string, string>;
  };
}
