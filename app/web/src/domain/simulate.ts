import type { AttemptResult } from '../../../shared/types';

export interface StageResult {
  status: AttemptResult;
  detail: string;
}

/**
 * Verificación SIMULADA mientras no exista el Evaluador (P4): alterna fallo y éxito según los intentos previos
 * para poder ver ambos estados en la UI. Se reemplaza por la llamada real al orquestador.
 */
export function simulateCodeVerification(stageNumber: number, priorAttempts: number): StageResult {
  if (priorAttempts % 2 === 0) {
    return {
      status: 'fallida',
      detail: `Falló 1 de 3 asserts de la Etapa ${stageNumber}: el resultado tiene 14 filas y se esperaban 12. Revisa el filtro o la agrupación.`,
    };
  }
  return { status: 'aprobada', detail: `Pasaron 3 de 3 asserts de la Etapa ${stageNumber}.` };
}

/** Evaluación conceptual SIMULADA: una respuesta corta es parcial, una desarrollada es correcta. */
export function simulateConceptEvaluation(answer: string): StageResult | null {
  const text = answer.trim();
  if (text.length === 0) return null;
  if (text.length < 120) {
    return {
      status: 'parcial',
      detail: 'Cubres la idea principal, pero falta respaldarla con una cifra o un ejemplo del dataset y cerrar con una acción concreta.',
    };
  }
  return {
    status: 'aprobada',
    detail: 'Correcta: usas cifras del dataset, distingues el síntoma de la causa y propones una acción medible.',
  };
}
