import type { Concept, DomainId } from '../../../shared/types';
import { DOMAINS } from '../../../shared/domains';

export const X_GAP = 120;
export const Y_STEP = 16;
export const PAD_X = 150; // espacio a la izquierda para el rótulo de cada carril
export const PAD_Y = 20;
export const LANE_PAD = 6;

export interface LayoutNode {
  id: string;
  concept: Concept;
  x: number;
  y: number;
  layer: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
}

export interface Lane {
  domain: DomainId;
  y: number;
  height: number;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  lanes: Lane[];
  width: number;
  height: number;
  byId: Map<string, LayoutNode>;
}

/**
 * Disposición por capas de izquierda a derecha (UI-UX §4.5): la capa de un concepto es el camino más largo
 * hasta una raíz, así que todo prerrequisito queda siempre a su izquierda. Cada dominio ocupa un carril
 * horizontal propio, de modo que los 6 dominios se ven a la vez y las aristas entre dominios cruzan carriles.
 * Dentro de cada celda (dominio × capa) se ordena por baricentro para reducir cruces. Determinista.
 */
export function layoutGraph(concepts: Concept[]): GraphLayout {
  const byConcept = new Map(concepts.map((c) => [c.id, c]));

  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const prereqs = byConcept.get(id)?.prerequisites.filter((p) => byConcept.has(p)) ?? [];
    const d = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map(depthOf));
    depth.set(id, d);
    return d;
  };
  concepts.forEach((c) => depthOf(c.id));

  // Celdas dominio × capa.
  const cells = new Map<string, Concept[]>();
  const cellKey = (domain: DomainId, layer: number) => `${domain}|${layer}`;
  for (const c of concepts) {
    const key = cellKey(c.domain, depth.get(c.id)!);
    cells.set(key, [...(cells.get(key) ?? []), c]);
  }
  for (const list of cells.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const maxLayer = Math.max(0, ...depth.values());
  const lanes: Lane[] = [];
  let cursor = PAD_Y;
  for (const { id } of DOMAINS) {
    let rows = 1;
    for (let l = 0; l <= maxLayer; l++) rows = Math.max(rows, cells.get(cellKey(id, l))?.length ?? 0);
    const height = rows * Y_STEP + LANE_PAD * 2;
    lanes.push({ domain: id, y: cursor, height });
    cursor += height;
  }
  const laneOf = new Map(lanes.map((l) => [l.domain, l]));

  const y = new Map<string, number>();
  const place = (domain: DomainId, list: Concept[]) => {
    const lane = laneOf.get(domain)!;
    const offset = lane.y + (lane.height - list.length * Y_STEP) / 2 + Y_STEP / 2;
    list.forEach((c, i) => y.set(c.id, offset + i * Y_STEP));
  };
  for (const [key, list] of cells) place(key.split('|')[0] as DomainId, list);

  const successors = new Map<string, string[]>();
  for (const c of concepts) for (const p of c.prerequisites) if (byConcept.has(p)) successors.set(p, [...(successors.get(p) ?? []), c.id]);

  const mean = (ids: string[], fallback: number) => (ids.length ? ids.reduce((s, id) => s + y.get(id)!, 0) / ids.length : fallback);
  const sweep = (layers: number[], neighbors: (c: Concept) => string[]) => {
    for (const l of layers) {
      for (const { id: domain } of DOMAINS) {
        const list = cells.get(cellKey(domain, l));
        if (!list) continue;
        const score = new Map(list.map((c) => [c.id, mean(neighbors(c), y.get(c.id)!)]));
        list.sort((a, b) => score.get(a.id)! - score.get(b.id)! || a.name.localeCompare(b.name, 'es'));
        place(domain, list);
      }
    }
  };
  const forward = Array.from({ length: maxLayer + 1 }, (_, i) => i);
  const backward = [...forward].reverse();
  const prereqsOf = (c: Concept) => c.prerequisites.filter((p) => byConcept.has(p));
  sweep(forward, prereqsOf);
  sweep(backward, (c) => successors.get(c.id) ?? []);
  sweep(forward, prereqsOf);

  const nodes: LayoutNode[] = concepts.map((concept) => ({
    id: concept.id,
    concept,
    layer: depth.get(concept.id)!,
    x: PAD_X + depth.get(concept.id)! * X_GAP,
    y: y.get(concept.id)!,
  }));
  const edges: LayoutEdge[] = concepts.flatMap((c) => prereqsOf(c).map((p) => ({ id: `${p}->${c.id}`, from: p, to: c.id })));

  return {
    nodes,
    edges,
    lanes,
    width: PAD_X + maxLayer * X_GAP + 110,
    height: cursor + PAD_Y,
    byId: new Map(nodes.map((n) => [n.id, n])),
  };
}
