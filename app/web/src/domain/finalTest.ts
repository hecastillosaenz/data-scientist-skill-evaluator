import type { Challenge, StageStatus, TestQuestion, TestResult } from '../../../shared/types';

/** El test final se desbloquea al completar todas las etapas (R21). */
export function isTestUnlocked(challenge: Challenge, statuses: Map<string, StageStatus>): boolean {
  return challenge.stages.length > 0 && challenge.stages.every((s) => statuses.get(s.id) === 'completada');
}

export type TestAnswer = { choice?: number; text?: string };

export interface Graded {
  correct: boolean;
  /** Las preguntas de texto se califican con una heurística hasta que exista el Evaluador conceptual (P4). */
  simulated: boolean;
  /** Descripción de la respuesta correcta, para mostrarla junto a la explicación. */
  expected: string;
}

/** Acepta coma o punto decimal: «10,7» y «10.7». */
export function parseNumber(text: string | undefined): number | null {
  if (!text) return null;
  const n = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function isAnswered(q: TestQuestion, a: TestAnswer | undefined): boolean {
  if (!a) return false;
  if (q.kind === 'opcion_multiple') return typeof a.choice === 'number';
  if (q.kind === 'numerica') return parseNumber(a.text) !== null;
  return (a.text ?? '').trim().length > 0;
}

export function gradeQuestion(q: TestQuestion, a: TestAnswer): Graded {
  if (q.kind === 'opcion_multiple') {
    return { correct: a.choice === q.correctIndex, simulated: false, expected: q.options?.[q.correctIndex ?? -1] ?? '' };
  }
  if (q.kind === 'numerica') {
    const value = parseNumber(a.text);
    const tolerance = q.tolerance ?? 0;
    return {
      correct: value !== null && q.answer !== undefined && Math.abs(value - q.answer) <= tolerance + 1e-9,
      simulated: false,
      expected: String(q.answer ?? '').replace('.', ','),
    };
  }
  // Texto: heurística provisoria (una respuesta desarrollada cuenta como correcta) hasta P4.
  return { correct: (a.text ?? '').trim().length >= 40, simulated: true, expected: q.rubric ?? '' };
}

/** Último resultado de cada pregunta (R23: el historial no se sobrescribe, pero cuenta el más reciente). */
export function latestResults(results: TestResult[], challengeId: string): Map<string, TestResult> {
  const latest = new Map<string, TestResult>();
  for (const r of results) {
    if (r.challengeId !== challengeId) continue;
    const prev = latest.get(r.questionId);
    if (!prev || r.at >= prev.at) latest.set(r.questionId, r);
  }
  return latest;
}

export function scoreOf(results: Map<string, TestResult>, questions: TestQuestion[]): { correct: number; total: number } | null {
  const answered = questions.filter((q) => results.has(q.id));
  if (answered.length === 0) return null;
  return { correct: answered.filter((q) => results.get(q.id)!.correct).length, total: questions.length };
}
