import type { AppData, Challenge, ChallengeStatus, Concept, ConceptState, DomainId, Stage, StageStatus } from '../../../shared/types';
import { DOMAINS } from '../../../shared/domains';
import { layoutForce, type ForceEdge, type ForceNode, type Placed } from './forceLayout';
import type { ConceptInsight } from './conceptState';
import type { ReviewItem } from './reviewQueue';

export type BrainKind = 'concept' | 'challenge' | 'stage' | 'test' | 'mejora';
export const BRAIN_KINDS: BrainKind[] = ['concept', 'challenge', 'stage', 'test', 'mejora'];
export const KIND_LABEL: Record<BrainKind, string> = { concept: 'Conceptos', challenge: 'Challenges', stage: 'Etapas', test: 'Tests', mejora: 'Mejoras' };
export const KIND_LABEL_SINGULAR: Record<BrainKind, string> = { concept: 'Concepto', challenge: 'Challenge', stage: 'Etapa', test: 'Test final', mejora: 'Mejora' };

export type BrainEdgeKind = 'prerequisito' | 'contiene' | 'practica' | 'evalua' | 'cierra' | 'mejora';

export interface BrainNode {
  /** Único: `<tipo>:<referencia>`. */
  id: string;
  kind: BrainKind;
  label: string;
  /** Concepto, challenge, etapa o test al que corresponde (id del dato original). */
  ref: string;
  /** Challenge al que pertenece, para etapas y tests. */
  challengeId?: string;
  /** Dominio: de los conceptos y las etapas. */
  domain?: DomainId;
  conceptState?: ConceptState;
  status?: ChallengeStatus | StageStatus;
  /** Para tests: resultado más reciente («5/7») o null si está pendiente. */
  score?: string | null;
  /** Para mejoras: motivo y prioridad. */
  reason?: ReviewItem['reason'];
  priority?: ReviewItem['priority'];
  x: number;
  y: number;
}

export interface BrainEdge {
  id: string;
  from: string;
  to: string;
  kind: BrainEdgeKind;
}

export interface DomainCenter {
  domain: DomainId;
  x: number;
  y: number;
  /** Cuántos conceptos del dominio hay. */
  count: number;
}

export interface BrainGraph {
  nodes: BrainNode[];
  /** Centro de cada dominio (centroide de sus conceptos), para rotular el «territorio» en el mapa. */
  domainCenters: DomainCenter[];
  edges: BrainEdge[];
  byId: Map<string, BrainNode>;
  width: number;
  height: number;
}

export interface BrainInput {
  data: AppData;
  insights: Map<string, ConceptInsight>;
  /** Debilidades abiertas (cola de Repaso): cada una es un nodo «mejora». */
  queue: ReviewItem[];
  challengeStatus: (c: Challenge) => ChallengeStatus;
  stageStatuses: (c: Challenge) => Map<string, StageStatus>;
  /** Resultado más reciente del test de un challenge, o null. */
  testScore: (c: Challenge) => string | null;
}

export const conceptNodeId = (id: string) => `concept:${id}`;

const SPRING: Record<BrainEdgeKind, { length: number; strength: number }> = {
  prerequisito: { length: 34, strength: 0.5 },
  contiene: { length: 64, strength: 0.6 },
  practica: { length: 70, strength: 0.28 },
  evalua: { length: 90, strength: 0.18 },
  cierra: { length: 60, strength: 0.4 },
  mejora: { length: 20, strength: 0.9 },
};

/**
 * Grafo unificado (SDD R32, «second brain»): conceptos, challenges, etapas, tests y mejoras con sus relaciones.
 * Es una función pura de los datos; la posición sale de una disposición por fuerzas determinista en la que los
 * conceptos se agrupan por dominio y los challenges quedan entre los conceptos que practican.
 */
export function buildBrainGraph(input: BrainInput): BrainGraph {
  const { data, insights, queue } = input;
  const raw: Omit<BrainNode, 'x' | 'y'>[] = [];
  const edges: BrainEdge[] = [];
  const conceptIds = new Set(data.concepts.map((c) => c.id));
  const edge = (from: string, to: string, kind: BrainEdgeKind) => edges.push({ id: `${kind}:${from}>${to}`, from, to, kind });

  for (const c of data.concepts) {
    raw.push({ id: conceptNodeId(c.id), kind: 'concept', label: c.name, ref: c.id, domain: c.domain, conceptState: insights.get(c.id)?.state ?? 'no_visto' });
  }
  for (const c of data.concepts) for (const p of c.prerequisites) if (conceptIds.has(p)) edge(conceptNodeId(p), conceptNodeId(c.id), 'prerequisito');

  for (const challenge of data.challenges) {
    const challengeId = `challenge:${challenge.id}`;
    const stageStatus = input.stageStatuses(challenge);
    raw.push({ id: challengeId, kind: 'challenge', label: challenge.title, ref: challenge.id, status: input.challengeStatus(challenge) });
    for (const stage of challenge.stages) {
      const stageId = `stage:${stage.id}`;
      raw.push({ id: stageId, kind: 'stage', label: `Etapa ${stage.number} · ${stage.title}`, ref: stage.id, challengeId: challenge.id, domain: stage.domain, status: stageStatus.get(stage.id) ?? 'pendiente' });
      edge(challengeId, stageId, 'contiene');
      for (const cid of stage.conceptIds) if (conceptIds.has(cid)) edge(stageId, conceptNodeId(cid), 'practica');
    }
    if (challenge.finalTest && challenge.finalTest.length > 0) {
      const testId = `test:${challenge.id}`;
      raw.push({ id: testId, kind: 'test', label: `Test · ${challenge.title}`, ref: challenge.id, challengeId: challenge.id, score: input.testScore(challenge) });
      edge(challengeId, testId, 'cierra');
      for (const cid of new Set(challenge.finalTest.map((q) => q.conceptId))) if (conceptIds.has(cid)) edge(testId, conceptNodeId(cid), 'evalua');
    }
  }

  for (const item of queue) {
    const id = `mejora:${item.concept.id}`;
    raw.push({ id, kind: 'mejora', label: `Mejorar «${item.concept.name}»`, ref: item.concept.id, domain: item.concept.domain, reason: item.reason, priority: item.priority });
    edge(id, conceptNodeId(item.concept.id), 'mejora');
  }

  // Anclas de dominio en círculo: los conceptos de un mismo dominio se agrupan y los dominios se separan.
  const width = 1500;
  const height = 1000;
  const anchors: Record<string, Placed> = {};
  DOMAINS.forEach((d, i) => {
    const angle = (i / DOMAINS.length) * Math.PI * 2 - Math.PI / 2;
    anchors[d.id] = { x: width / 2 + Math.cos(angle) * 430, y: height / 2 + Math.sin(angle) * 290 };
  });
  const forceNodes: ForceNode[] = raw.map((n) => ({ id: n.id, ...(n.kind === 'concept' && n.domain ? { group: n.domain } : {}) }));
  const forceEdges: ForceEdge[] = edges.map((e) => ({ from: e.from, to: e.to, ...SPRING[e.kind] }));
  const layout = layoutForce(forceNodes, forceEdges, { width, height, anchors, groupPull: 0.014, iterations: 300, seed: 11 });

  const nodes: BrainNode[] = raw.map((n) => ({ ...n, ...layout.positions.get(n.id)! }));
  const domainCenters: DomainCenter[] = DOMAINS.map((d) => {
    const own = nodes.filter((n) => n.kind === 'concept' && n.domain === d.id);
    return { domain: d.id, x: own.reduce((s, n) => s + n.x, 0) / (own.length || 1), y: own.reduce((s, n) => s + n.y, 0) / (own.length || 1), count: own.length };
  }).filter((c) => c.count > 0);
  return { nodes, domainCenters, edges, byId: new Map(nodes.map((n) => [n.id, n])), width: layout.width, height: layout.height };
}

/** Vecinos directos de un nodo, agrupados por tipo de relación, para el panel de detalle. */
export function neighborsOf(graph: BrainGraph, nodeId: string): { node: BrainNode; edge: BrainEdge; direction: 'out' | 'in' }[] {
  const out: { node: BrainNode; edge: BrainEdge; direction: 'out' | 'in' }[] = [];
  for (const e of graph.edges) {
    if (e.from === nodeId) out.push({ node: graph.byId.get(e.to)!, edge: e, direction: 'out' });
    else if (e.to === nodeId) out.push({ node: graph.byId.get(e.from)!, edge: e, direction: 'in' });
  }
  return out;
}

/** Opacidad de un nodo según los filtros activos: atenúan, nunca ocultan (R32, como R15). */
export const DIMMED = 0.16;
export function brainOpacity(node: BrainNode, graph: BrainGraph, kinds: ReadonlySet<BrainKind>, domains: ReadonlySet<DomainId>): number {
  const kindOk = kinds.size === 0 || kinds.has(node.kind);
  let domainOk = domains.size === 0;
  if (!domainOk) {
    if (node.domain) domainOk = domains.has(node.domain);
    else {
      // Challenges y tests no tienen dominio propio: cuentan si alguna de sus etapas es de un dominio activo.
      const challengeId = node.challengeId ?? node.ref;
      domainOk = graph.nodes.some((n) => n.kind === 'stage' && n.challengeId === challengeId && n.domain && domains.has(n.domain));
    }
  }
  return kindOk && domainOk ? 1 : DIMMED;
}

export function searchBrain(graph: BrainGraph, query: string, limit = 7): BrainNode[] {
  const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const q = norm(query);
  if (!q) return [];
  const starts: BrainNode[] = [];
  const contains: BrainNode[] = [];
  for (const n of graph.nodes) {
    const label = norm(n.label);
    if (label.startsWith(q)) starts.push(n);
    else if (label.includes(q)) contains.push(n);
  }
  return [...starts, ...contains].slice(0, limit);
}

export type { Concept, Stage };
