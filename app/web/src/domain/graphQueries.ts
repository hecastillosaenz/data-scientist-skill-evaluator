import type { Challenge, Concept, DomainId } from '../../../shared/types';
import { stageIndex, type StageRef } from './stats';

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Búsqueda por nombre (hasta `limit` resultados): primero los que empiezan por la consulta, luego los que la contienen. */
export function searchConcepts(query: string, concepts: Concept[], limit = 7): Concept[] {
  const q = normalize(query);
  if (!q) return [];
  const starts: Concept[] = [];
  const contains: Concept[] = [];
  for (const c of concepts) {
    const name = normalize(c.name);
    if (name.startsWith(q)) starts.push(c);
    else if (name.includes(q)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Opacidad de un dominio según los chips activos. R15: los chips atenúan, nunca ocultan,
 * así que la opacidad es siempre > 0 y sin selección todos los dominios se ven por completo.
 */
export const DIMMED_OPACITY = 0.18;
export function domainOpacity(domain: DomainId, active: ReadonlySet<DomainId>): number {
  return active.size === 0 || active.has(domain) ? 1 : DIMMED_OPACITY;
}

export function stagesForConcept(conceptId: string, challenges: Challenge[]): StageRef[] {
  return [...stageIndex(challenges).values()].filter((ref) => ref.stage.conceptIds.includes(conceptId));
}

/** Conceptos relacionados (máx. `limit`): dependientes directos y compañeros de etapa, sin repetir ni incluir prerrequisitos. */
export function relatedConcepts(concept: Concept, concepts: Concept[], challenges: Challenge[], limit = 8): Concept[] {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const out = new Map<string, Concept>();
  const add = (c: Concept | undefined) => {
    if (c && c.id !== concept.id && !concept.prerequisites.includes(c.id) && !out.has(c.id)) out.set(c.id, c);
  };
  concepts.filter((c) => c.prerequisites.includes(concept.id)).forEach(add);
  for (const ref of stagesForConcept(concept.id, challenges)) ref.stage.conceptIds.forEach((id) => add(byId.get(id)));
  return [...out.values()].slice(0, limit);
}
