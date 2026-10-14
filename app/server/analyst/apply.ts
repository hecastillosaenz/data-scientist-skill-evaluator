import { DOMAINS } from '../../shared/domains';
import type { Candidate, Concept, DomainId, Evidence, Observation } from '../../shared/types';
import { findCycle, validateGraph, type GraphFile } from '../persistence/graph-store';

/**
 * Núcleo del Analista (SDD R41): el agente propone y el orquestador decide. Es puro y no llama a ningún agente, así que
 * todas las reglas se prueban sin gastar nada. Una pieza que no cumple se descarta con su motivo; las demás se aplican.
 */
export const ANALYST_RULES = {
  /** Evidence distintas que debe reunir un tema sin cubrir para convertirse en concepto. */
  recurrence: 2,
  maxLinks: 2,
  maxCreate: 1,
  maxDiagnosis: 300,
  maxWhy: 200,
} as const;

export type DiscardKind = 'concepto' | 'enlace' | 'creacion' | 'tema';
export interface Discarded {
  kind: DiscardKind;
  reason: string;
}

export interface AnalysisApplied {
  /** Prerrequisitos añadidos: `concept` ahora exige `prerequisite`. */
  links: { concept: string; prerequisite: string; why: string }[];
  /** Conceptos creados por el Analista. */
  created: Concept[];
  /** Temas sin cubrir que quedaron (o siguen) como candidatos. */
  candidates: string[];
}

export interface ApplyResult {
  graph: GraphFile;
  observation: Observation;
  applied: AnalysisApplied;
  discarded: Discarded[];
  /** La Evidence ya tenía observación: no se cambió nada (idempotente). */
  duplicate: boolean;
}

/** Una Evidence se analiza solo si trae notas libres o un bloqueo (R12); si no, no hay nada que aprender. */
export const shouldAnalyze = (e: Pick<Evidence, 'notes' | 'blocker'>): boolean => (e.notes?.trim() ?? '') !== '' || e.blocker !== undefined;

const DOMAIN_IDS = new Set<string>(DOMAINS.map((d) => d.id));
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Minúsculas, sin tildes ni signos, espacios colapsados: «Fan-out en JOIN» y «fan out en join» son el mismo tema. */
export const normalize = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slugOf = (text: string): string => normalize(text).replace(/ /g, '-');

/** ¿Alcanzaría `target` siguiendo prerrequisitos desde `from`? Sirve para saber si un enlace nuevo cerraría un ciclo. */
function dependsOn(concepts: Concept[], from: string, target: string): boolean {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.prerequisites ?? []));
  }
  return false;
}

export class AnalysisInvalidError extends Error {}

/** Registra una Evidence sin notas ni bloqueo como `omitida`, sin llamar al agente (R12). Idempotente. */
export function markOmitted(graph: GraphFile, evidenceId: string, now: string): GraphFile {
  if (graph.observations?.some((o) => o.evidenceId === evidenceId)) return graph;
  return { ...graph, observations: [...(graph.observations ?? []), { evidenceId, at: now, status: 'omitida', conceptIds: [], diagnosis: '' }] };
}

export function applyAnalysis(graph: GraphFile, input: { evidence: Pick<Evidence, 'id'>; proposal: unknown; now: string }): ApplyResult {
  const { evidence, now } = input;
  const existing = graph.observations?.find((o) => o.evidenceId === evidence.id);
  if (existing) return { graph, observation: existing, applied: { links: [], created: [], candidates: [] }, discarded: [], duplicate: true };
  if (!isRecord(input.proposal)) throw new AnalysisInvalidError('La propuesta del Analista debe ser un objeto JSON.');
  const proposal = input.proposal;

  const discarded: Discarded[] = [];
  const concepts: Concept[] = graph.concepts.map((c) => ({ ...c, prerequisites: [...c.prerequisites] }));
  const byId = () => new Map(concepts.map((c) => [c.id, c]));
  const candidates: Candidate[] = (graph.candidates ?? []).map((c) => ({ ...c, evidenceIds: [...c.evidenceIds] }));

  // 1) Conceptos a los que se refiere la nota: solo los que existen.
  const conceptIds: string[] = [];
  for (const id of [...new Set(strings(proposal.conceptIds))]) {
    if (byId().has(id)) conceptIds.push(id);
    else discarded.push({ kind: 'concepto', reason: `El concepto «${id}» no existe en el catálogo.` });
  }

  // 2) Diagnóstico acotado.
  let diagnosis = typeof proposal.diagnosis === 'string' ? proposal.diagnosis.trim() : '';
  if (diagnosis.length > ANALYST_RULES.maxDiagnosis) diagnosis = `${diagnosis.slice(0, ANALYST_RULES.maxDiagnosis - 1).trimEnd()}…`;

  // 3) Temas sin cubrir → candidatos (con la Evidence que los originó).
  const touched: string[] = [];
  const uncovered = Array.isArray(proposal.uncovered) ? proposal.uncovered : [];
  for (const item of uncovered) {
    const label = isRecord(item) && typeof item.label === 'string' ? item.label.trim() : '';
    const domain = isRecord(item) ? item.domain : undefined;
    if (!label || typeof domain !== 'string' || !DOMAIN_IDS.has(domain)) {
      discarded.push({ kind: 'tema', reason: `Un tema sin cubrir necesita \`label\` y un \`domain\` válido (${[...DOMAIN_IDS].join(', ')}).` });
      continue;
    }
    if (concepts.some((c) => normalize(c.name) === normalize(label))) {
      discarded.push({ kind: 'tema', reason: `«${label}» ya existe en el catálogo; vincúlalo en \`conceptIds\` en lugar de proponerlo como tema nuevo.` });
      continue;
    }
    let candidate = candidates.find((c) => normalize(c.label) === normalize(label) && c.domain === domain);
    if (!candidate) {
      candidate = { label, domain: domain as DomainId, evidenceIds: [] };
      candidates.push(candidate);
    }
    if (!candidate.evidenceIds.includes(evidence.id)) candidate.evidenceIds.push(evidence.id);
    touched.push(candidate.label);
  }

  // 4) Crear un concepto: solo si el candidato reúne la recurrencia mínima (R41b). Máximo 1 por análisis.
  const created: Concept[] = [];
  const creations = Array.isArray(proposal.createConcepts) ? proposal.createConcepts : [];
  for (const item of creations) {
    if (created.length >= ANALYST_RULES.maxCreate) {
      discarded.push({ kind: 'creacion', reason: `Se crea como máximo ${ANALYST_RULES.maxCreate} concepto por análisis.` });
      continue;
    }
    if (!isRecord(item)) continue;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const domain = typeof item.domain === 'string' ? item.domain : '';
    const label = typeof item.candidateLabel === 'string' ? item.candidateLabel : name;
    const candidate = candidates.find((c) => normalize(c.label) === normalize(label) && c.domain === domain);
    if (!name || !DOMAIN_IDS.has(domain)) {
      discarded.push({ kind: 'creacion', reason: 'Crear un concepto necesita `name` y un `domain` válido.' });
      continue;
    }
    if (!candidate || candidate.evidenceIds.length < ANALYST_RULES.recurrence) {
      discarded.push({ kind: 'creacion', reason: `«${name}» no se crea todavía: el tema debe aparecer en ${ANALYST_RULES.recurrence} Evidence distintas (tiene ${candidate?.evidenceIds.length ?? 0}).` });
      continue;
    }
    const proposedId = typeof item.id === 'string' ? item.id : '';
    const id = new RegExp(`^${domain}:[a-z0-9]+(-[a-z0-9]+)*$`).test(proposedId) ? proposedId : `${domain}:${slugOf(name)}`;
    if (byId().has(id) || concepts.some((c) => normalize(c.name) === normalize(name))) {
      discarded.push({ kind: 'creacion', reason: `Ya existe un concepto con el id «${id}» o el nombre «${name}».` });
      continue;
    }
    const prerequisites = [...new Set(strings(item.prerequisites))];
    const missing = prerequisites.filter((p) => !byId().has(p));
    if (missing.length > 0) {
      discarded.push({ kind: 'creacion', reason: `«${name}»: los prerrequisitos ${missing.map((m) => `«${m}»`).join(', ')} no existen.` });
      continue;
    }
    const concept: Concept = { id, name, domain: domain as DomainId, prerequisites, origin: 'analista', since: now };
    concepts.push(concept);
    created.push(concept);
    candidates.splice(candidates.indexOf(candidate), 1);
    conceptIds.push(id);
  }

  // 5) Prerrequisitos nuevos: ambos existen, distintos, no repetidos, sin ciclo y sobre un concepto de esta observación.
  const links: AnalysisApplied['links'] = [];
  const additions = Array.isArray(proposal.addPrerequisites) ? proposal.addPrerequisites : [];
  for (const item of additions) {
    if (links.length >= ANALYST_RULES.maxLinks) {
      discarded.push({ kind: 'enlace', reason: `Se añaden como máximo ${ANALYST_RULES.maxLinks} prerrequisitos por análisis.` });
      continue;
    }
    if (!isRecord(item)) continue;
    const concept = typeof item.concept === 'string' ? item.concept : '';
    const prerequisite = typeof item.prerequisite === 'string' ? item.prerequisite : '';
    const why = typeof item.why === 'string' ? item.why.trim().slice(0, ANALYST_RULES.maxWhy) : '';
    const target = byId().get(concept);
    const pre = byId().get(prerequisite);
    const tag = `«${concept}» necesita «${prerequisite}»`;
    if (!target || !pre) discarded.push({ kind: 'enlace', reason: `${tag}: ${!target ? `«${concept}»` : `«${prerequisite}»`} no existe.` });
    else if (concept === prerequisite) discarded.push({ kind: 'enlace', reason: `${tag}: un concepto no puede ser prerrequisito de sí mismo.` });
    else if (!conceptIds.includes(concept)) discarded.push({ kind: 'enlace', reason: `${tag}: «${concept}» no figura en los \`conceptIds\` de la observación (la nota debe tratar de él).` });
    else if (!why) discarded.push({ kind: 'enlace', reason: `${tag}: falta el motivo (\`why\`).` });
    else if (target.prerequisites.includes(prerequisite)) discarded.push({ kind: 'enlace', reason: `${tag}: ya es un prerrequisito.` });
    else if (dependsOn(concepts, prerequisite, concept)) discarded.push({ kind: 'enlace', reason: `${tag}: crearía un ciclo de prerrequisitos.` });
    else {
      target.prerequisites.push(prerequisite);
      links.push({ concept, prerequisite, why });
    }
  }

  const observation: Observation = {
    evidenceId: evidence.id,
    at: now,
    status: conceptIds.length > 0 ? 'ok' : 'sin_hallazgos',
    conceptIds,
    diagnosis,
  };
  const next: GraphFile = { ...graph, concepts, observations: [...(graph.observations ?? []), observation], candidates };
  // Red de seguridad: el grafo resultante debe ser válido completo (ids únicos, prerrequisitos existentes, sin ciclos).
  const check = validateGraph(next);
  if (!check.ok) throw new AnalysisInvalidError(`La propuesta dejaría el grafo inválido: ${check.errors[0]}`);
  if (findCycle(next.concepts)) throw new AnalysisInvalidError('La propuesta crearía un ciclo de prerrequisitos.');
  return { graph: next, observation, applied: { links, created, candidates: touched }, discarded, duplicate: false };
}
