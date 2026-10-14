import type { Challenge, Concept, Evidence } from '../../../shared/types';
import { latestAttemptByStage } from './conceptState';
import { stageIndex, type StageRef } from './stats';

export type ReviewReason = 'fallos' | 'parcial' | 'ayuda' | 'olvido';
export type Priority = 'alta' | 'media' | 'baja';

export const REASON_LABEL: Record<ReviewReason, string> = {
  fallos: 'Fallaste este concepto',
  parcial: 'Respuesta parcial',
  ayuda: 'Resuelto con ayuda',
  olvido: 'Hace tiempo que no lo practicas',
};

export const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

export interface ReviewItem {
  concept: Concept;
  reason: ReviewReason;
  /** Etapa de la que sale el motivo. */
  source: StageRef;
  lastPracticed: string;
  score: number;
  priority: Priority;
  /** Cuántos conceptos dependen de este (peso en el grafo). */
  dependents: number;
}

const FORGET_DAYS = 21;
const BASE_SCORE: Record<ReviewReason, number> = { fallos: 100, parcial: 70, ayuda: 60, olvido: 40 };
const DAY_MS = 86_400_000;

/**
 * Cola de repaso derivada del grafo. Fórmula PROVISIONAL (el PRD §11 no está en el repo):
 * puntaje = base del motivo + 5 × fallos históricos de la etapa + 2 × conceptos dependientes + 0.3 × días desde la práctica.
 * El motivo sale del último intento de cada etapa vinculada (R11), no del historial completo.
 */
export function buildReviewQueue(concepts: Concept[], challenges: Challenge[], evidence: Evidence[], now: Date): ReviewItem[] {
  const index = stageIndex(challenges);
  const latest = latestAttemptByStage(evidence);
  const failuresByStage = new Map<string, number>();
  for (const e of evidence) if (e.result === 'fallida') failuresByStage.set(e.stageId, (failuresByStage.get(e.stageId) ?? 0) + 1);

  const dependents = new Map<string, number>();
  for (const c of concepts) for (const p of c.prerequisites) dependents.set(p, (dependents.get(p) ?? 0) + 1);

  const stagesByConcept = new Map<string, string[]>();
  for (const { stage } of index.values()) for (const cid of stage.conceptIds) stagesByConcept.set(cid, [...(stagesByConcept.get(cid) ?? []), stage.id]);

  const items: ReviewItem[] = [];
  for (const concept of concepts) {
    const attempts = (stagesByConcept.get(concept.id) ?? []).map((sid) => latest.get(sid)).filter((a): a is Evidence => !!a);
    if (attempts.length === 0) continue;
    const lastPracticed = attempts.reduce((acc, a) => (a.at > acc ? a.at : acc), '');
    const days = (now.getTime() - new Date(lastPracticed).getTime()) / DAY_MS;

    let reason: ReviewReason | null = null;
    let from: Evidence | undefined;
    if ((from = attempts.find((a) => a.result === 'fallida'))) reason = 'fallos';
    else if ((from = attempts.find((a) => a.result === 'parcial'))) reason = 'parcial';
    else if ((from = attempts.find((a) => a.withHelp))) reason = 'ayuda';
    else if (days > FORGET_DAYS) {
      reason = 'olvido';
      from = attempts.find((a) => a.at === lastPracticed);
    }
    if (!reason || !from) continue;

    const source = index.get(from.stageId);
    if (!source) continue;
    const deps = dependents.get(concept.id) ?? 0;
    const score = BASE_SCORE[reason] + 5 * (failuresByStage.get(from.stageId) ?? 0) + 2 * deps + 0.3 * days;
    items.push({
      concept,
      reason,
      source,
      lastPracticed,
      score,
      priority: score >= 110 ? 'alta' : score >= 75 ? 'media' : 'baja',
      dependents: deps,
    });
  }
  return items.sort((a, b) => b.score - a.score || a.concept.name.localeCompare(b.concept.name, 'es'));
}

/** Los `n` primeros de la cola, prefiriendo etapas de origen distintas para que no se repita la misma. */
export function topWeaknesses(queue: ReviewItem[], n: number): ReviewItem[] {
  const picked: ReviewItem[] = [];
  const seen = new Set<string>();
  for (const item of queue) {
    if (picked.length === n) break;
    if (seen.has(item.source.stage.id)) continue;
    seen.add(item.source.stage.id);
    picked.push(item);
  }
  for (const item of queue) {
    if (picked.length === n) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}
