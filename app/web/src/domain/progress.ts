import type { Challenge, ChallengeStatus, Evidence, Stage, StageStatus } from '../../../shared/types';
import { latestAttemptByStage } from './conceptState';

/**
 * Estado de cada etapa derivado del último intento (R11):
 * aprobada -> completada, fallida -> con_fallos, parcial -> en_curso, sin intentos -> pendiente.
 * Si el challenge ya tiene actividad (o fue iniciado), la primera etapa pendiente se marca en_curso.
 */
export function stageStatuses(challenge: Challenge, evidence: Evidence[], started = false): Map<string, StageStatus> {
  const latest = latestAttemptByStage(evidence.filter((e) => e.challengeId === challenge.id));
  const out = new Map<string, StageStatus>();
  for (const stage of challenge.stages) {
    const last = latest.get(stage.id);
    out.set(stage.id, !last ? 'pendiente' : last.result === 'aprobada' ? 'completada' : last.result === 'fallida' ? 'con_fallos' : 'en_curso');
  }
  const isStarted = started || latest.size > 0;
  const allDone = challenge.stages.every((s) => out.get(s.id) === 'completada');
  if (isStarted && !allDone && !challenge.stages.some((s) => out.get(s.id) === 'en_curso' || out.get(s.id) === 'con_fallos')) {
    const next = challenge.stages.find((s) => out.get(s.id) === 'pendiente');
    if (next) out.set(next.id, 'en_curso');
  }
  return out;
}

export function challengeStatus(challenge: Challenge, evidence: Evidence[], started = false): ChallengeStatus {
  const statuses = [...stageStatuses(challenge, evidence, started).values()];
  if (statuses.length > 0 && statuses.every((s) => s === 'completada')) return 'completada';
  if (started || evidence.some((e) => e.challengeId === challenge.id)) return 'en_curso';
  return 'pendiente';
}

export function challengeMinutes(challenge: Challenge): number {
  return challenge.stages.reduce((sum: number, s: Stage) => sum + s.estimatedMinutes, 0);
}
