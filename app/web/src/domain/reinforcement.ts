import type { Apoyo, Difficulty } from '../../../shared/types';
import type { ReviewItem } from './reviewQueue';

export interface Reinforcement {
  title: string;
  difficulty: Difficulty;
  minutes: number;
  apoyo: Apoyo;
  conceptIds: string[];
}

/**
 * Reto de refuerzo para un ítem de la cola (UI-UX §4.4): un escalón menos de dificultad, 5 min menos de tiempo
 * y Apoyo sugerido Pistas. SIMULADO: la generación real queda para el Generador (P3, bloqueado por R2/R4).
 */
export function buildReinforcement(item: ReviewItem): Reinforcement {
  const { stage } = item.source;
  return {
    title: `Refuerzo: ${item.concept.name}`,
    difficulty: Math.max(1, stage.difficulty - 1) as Difficulty,
    minutes: Math.max(10, stage.estimatedMinutes - 5),
    apoyo: 'pistas',
    conceptIds: stage.conceptIds,
  };
}
