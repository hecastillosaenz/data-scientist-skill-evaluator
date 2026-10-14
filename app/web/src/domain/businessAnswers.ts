import type { BusinessAnswer, BusinessQuestion } from '../../../shared/types';

/** Última respuesta guardada de cada pregunta de un challenge. */
export function latestAnswers(answers: BusinessAnswer[], challengeId: string): Map<string, BusinessAnswer> {
  const latest = new Map<string, BusinessAnswer>();
  for (const a of answers) {
    if (a.challengeId !== challengeId) continue;
    const prev = latest.get(a.questionId);
    if (!prev || a.at >= prev.at) latest.set(a.questionId, a);
  }
  return latest;
}

/**
 * Qué borradores hay que guardar: los no vacíos y distintos de la última versión guardada.
 * Así «Guardar respuestas» no duplica registros idénticos, pero un cambio crea uno nuevo (R22, append-only).
 */
export function answersToSave(
  drafts: Record<string, string>,
  questions: BusinessQuestion[],
  saved: Map<string, BusinessAnswer>,
): { questionId: string; text: string }[] {
  return questions
    .map((q) => ({ questionId: q.id, text: (drafts[q.id] ?? '').trim() }))
    .filter((item) => item.text.length > 0 && item.text !== saved.get(item.questionId)?.text);
}

/** La guía de reflexión de una pregunta solo se muestra después de haber guardado su respuesta (R22). */
export const reflectionVisible = (questionId: string, saved: Map<string, BusinessAnswer>): boolean => saved.has(questionId);

/** Cuántas versiones guardadas tiene una pregunta (el historial no se sobrescribe). */
export function versionsSaved(answers: BusinessAnswer[], challengeId: string, questionId: string): number {
  return answers.filter((a) => a.challengeId === challengeId && a.questionId === questionId).length;
}
