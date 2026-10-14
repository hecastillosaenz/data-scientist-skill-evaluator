import type { Challenge, Concept, ConceptState, Difficulty, Evidence, Bloom } from '../../../shared/types';

/**
 * Estado de un Concept según R11: se calcula SOLO con el último intento de cada etapa vinculada,
 * nunca con el historial completo. Reglas provisionales (el PRD §11.3 no está en el repo):
 *  - sin intentos en ninguna etapa vinculada  -> no_visto
 *  - algún último intento fallido             -> con_fallos
 *  - todos aprobados y sin ayuda              -> dominado
 *  - cualquier otro caso (parcial / con ayuda) -> visto
 */
export function latestAttemptByStage(evidence: Evidence[]): Map<string, Evidence> {
  const latest = new Map<string, Evidence>();
  for (const e of evidence) {
    const prev = latest.get(e.stageId);
    if (!prev || e.at > prev.at) latest.set(e.stageId, e);
  }
  return latest;
}

export function conceptStateFromAttempts(attempts: Evidence[]): ConceptState {
  if (attempts.length === 0) return 'no_visto';
  if (attempts.some((a) => a.result === 'fallida')) return 'con_fallos';
  if (attempts.every((a) => a.result === 'aprobada' && !a.withHelp)) return 'dominado';
  return 'visto';
}

export interface ConceptInsight {
  state: ConceptState;
  /** Última práctica (ISO) o null. */
  lastPracticed: string | null;
  /** Etapas vinculadas con al menos un intento. */
  stageIds: string[];
  /** Mayor nivel de Bloom con un intento aprobado sin ayuda. */
  maxBloom: Bloom | null;
  /** Mayor dificultad aprobada sin ayuda (nivel actual del concepto). */
  level: Difficulty | null;
}

export function computeInsights(concepts: Concept[], challenges: Challenge[], evidence: Evidence[]): Map<string, ConceptInsight> {
  const latest = latestAttemptByStage(evidence);
  const stageIdsByConcept = new Map<string, string[]>();
  const stageById = new Map(challenges.flatMap((c) => c.stages).map((s) => [s.id, s] as const));
  for (const stage of stageById.values()) {
    for (const cid of stage.conceptIds) {
      const list = stageIdsByConcept.get(cid) ?? [];
      list.push(stage.id);
      stageIdsByConcept.set(cid, list);
    }
  }

  const out = new Map<string, ConceptInsight>();
  for (const concept of concepts) {
    const attempts: Evidence[] = [];
    for (const sid of stageIdsByConcept.get(concept.id) ?? []) {
      const a = latest.get(sid);
      if (a) attempts.push(a);
    }
    let maxBloom: Bloom | null = null;
    let level: Difficulty | null = null;
    for (const a of attempts) {
      if (a.result !== 'aprobada' || a.withHelp) continue;
      const stage = stageById.get(a.stageId);
      if (!stage) continue;
      if (maxBloom === null || stage.bloom > maxBloom) maxBloom = stage.bloom;
      if (level === null || stage.difficulty > level) level = stage.difficulty;
    }
    out.set(concept.id, {
      state: conceptStateFromAttempts(attempts),
      lastPracticed: attempts.reduce<string | null>((acc, a) => (acc === null || a.at > acc ? a.at : acc), null),
      stageIds: attempts.map((a) => a.stageId),
      maxBloom,
      level,
    });
  }
  return out;
}
