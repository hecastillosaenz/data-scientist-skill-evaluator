import type { TableDef } from '../../../shared/types';

export const CARD_W = 244;
export const HEAD_H = 34;
export const ROW_H = 26;
export const COL_GAP = 120;
export const ROW_GAP = 28;
export const PAD = 16;

export interface SchemaNode {
  table: TableDef;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Nivel: 0 = tablas que nadie referencia hacia la izquierda (sin FK). */
  depth: number;
}

export interface SchemaEdge {
  id: string;
  /** Tabla con la FK. */
  from: string;
  fromColumn: string;
  /** Tabla referenciada (PK). */
  to: string;
  toColumn: string;
  /** Puntos de anclaje (borde de las tarjetas). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  self: boolean;
}

export interface SchemaLayout {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  width: number;
  height: number;
}

const rowCenter = (node: SchemaNode, column: string) => {
  const i = Math.max(0, node.table.columns.findIndex((c) => c.name === column));
  return node.y + HEAD_H + i * ROW_H + ROW_H / 2;
};

/**
 * Disposición del diagrama relacional: la columna de una tabla es 1 + la mayor de las tablas que referencia,
 * así que toda tabla referenciada queda a la izquierda de quien la referencia. Dentro de cada columna se apila
 * en el orden dado. Determinista y sin solapes.
 */
export function layoutSchema(tables: TableDef[]): SchemaLayout {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (name: string): number => {
    const known = depth.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) return 0; // ciclo: se corta
    visiting.add(name);
    const refs = (byName.get(name)?.columns ?? [])
      .map((c) => c.fk?.table)
      .filter((t): t is string => !!t && t !== name && byName.has(t));
    const d = refs.length ? 1 + Math.max(...refs.map(depthOf)) : 0;
    visiting.delete(name);
    depth.set(name, d);
    return d;
  };
  tables.forEach((t) => depthOf(t.name));

  const columns = new Map<number, TableDef[]>();
  for (const t of tables) columns.set(depth.get(t.name)!, [...(columns.get(depth.get(t.name)!) ?? []), t]);

  const nodes: SchemaNode[] = [];
  let maxBottom = 0;
  for (const [d, list] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    let y = PAD;
    for (const table of list) {
      const h = HEAD_H + table.columns.length * ROW_H;
      nodes.push({ table, x: PAD + d * (CARD_W + COL_GAP), y, w: CARD_W, h, depth: d });
      y += h + ROW_GAP;
    }
    maxBottom = Math.max(maxBottom, y - ROW_GAP);
  }
  const index = new Map(nodes.map((n) => [n.table.name, n]));

  const edges: SchemaEdge[] = [];
  for (const node of nodes) {
    for (const col of node.table.columns) {
      if (!col.fk) continue;
      const target = index.get(col.fk.table);
      if (!target) continue;
      const self = target === node;
      const y1 = rowCenter(node, col.name);
      const y2 = rowCenter(target, col.fk.column);
      edges.push({
        id: `${node.table.name}.${col.name}->${col.fk.table}.${col.fk.column}`,
        from: node.table.name,
        fromColumn: col.name,
        to: col.fk.table,
        toColumn: col.fk.column,
        x1: self ? node.x + node.w : node.x,
        y1,
        x2: target.x + target.w,
        y2,
        self,
      });
    }
  }

  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  return {
    nodes,
    edges,
    width: PAD * 2 + (maxDepth + 1) * CARD_W + maxDepth * COL_GAP,
    height: maxBottom + PAD,
  };
}

/** Texto accesible de una relación: «poliza_id de siniestros referencia a polizas.id (muchos a uno)». */
export function describeEdge(edge: SchemaEdge): string {
  return `${edge.fromColumn} de ${edge.from} referencia a ${edge.to}.${edge.toColumn} (muchos a uno)`;
}
