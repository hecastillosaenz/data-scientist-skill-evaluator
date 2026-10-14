import type { Apoyo, AttemptResult, EvalMechanism } from './types';

/** Por qué no se aprobó un intento (SDD R52). Lo clasifica el orquestador con lo que ejecutó, no el agente. */
export type FalloTipo =
  | 'error_python'
  | 'resultado_incorrecto'
  | 'assert_fallido'
  | 'tiempo_agotado'
  | 'sin_resultado'
  | 'respuesta_incorrecta'
  | 'respuesta_parcial';

export const FALLO_TIPOS: readonly FalloTipo[] = ['error_python', 'resultado_incorrecto', 'assert_fallido', 'tiempo_agotado', 'sin_resultado', 'respuesta_incorrecta', 'respuesta_parcial'];

export const FALLO_LABEL: Record<FalloTipo, string> = {
  error_python: 'Error de Python',
  resultado_incorrecto: 'Resultado incorrecto',
  assert_fallido: 'Assert fallido',
  tiempo_agotado: 'Tiempo agotado',
  sin_resultado: 'Sin resultado',
  respuesta_incorrecta: 'Respuesta incorrecta',
  respuesta_parcial: 'Respuesta parcial',
};

export interface Fallo {
  tipo: FalloTipo;
  /** Qué falló, concreto y en español (la última línea del error, la fila que no coincide…). */
  resumen: string;
}

/**
 * Un intento (SDD R51): una verificación que llegó a un resultado. NO es la Evidence (R10): no cambia el estado de ningún
 * Concept. Se guarda en `challenge/challenge-NNN/intentos/NNN-etapa-X/` como archivos versionables (R53).
 */
export interface AttemptSummary {
  id: string;
  /** Correlativo por challenge. */
  number: number;
  challengeId: string;
  stageId: string;
  stageNumber: number;
  at: string;
  apoyo: Apoyo;
  result: AttemptResult;
  mechanism: EvalMechanism;
  /** `code` (celda de Python) o `markdown` (respuesta escrita). */
  kind: 'code' | 'markdown';
  fallo?: Fallo;
  cost: number;
  /** Carpeta del intento relativa al challenge, p. ej. `intentos/004-etapa-1`. */
  folder: string;
}

/** El intento completo: lo que se pide al abrirlo (snapshot del entregable y feedback del Evaluador). */
export interface Attempt extends AttemptSummary {
  entregable: string;
  feedback: string;
}
