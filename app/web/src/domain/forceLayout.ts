/**
 * Disposición por fuerzas, determinista (SDD R32): repulsión entre todos los nodos, resortes en las aristas, atracción
 * suave hacia el ancla de su grupo y una gravedad leve al centro. Solo el estado inicial usa un generador con semilla.
 */
export interface ForceNode {
  id: string;
  /** Grupo (p. ej. dominio): sus miembros se agrupan hacia el ancla del grupo. */
  group?: string;
}

export interface ForceEdge {
  from: string;
  to: string;
  /** Longitud de reposo del resorte. */
  length: number;
  /** 0–1: rigidez del resorte. */
  strength?: number;
}

export interface ForceOptions {
  width?: number;
  height?: number;
  iterations?: number;
  seed?: number;
  /** Ancla de cada grupo en coordenadas del lienzo (0..width, 0..height). */
  anchors?: Record<string, { x: number; y: number }>;
  groupPull?: number;
  /** Radio máximo de la repulsión: más allá no se empujan (ahorra cálculo y evita aplanar el grafo). */
  repulsionRadius?: number;
}

export interface Placed {
  x: number;
  y: number;
}

export interface ForceResult {
  positions: Map<string, Placed>;
  width: number;
  height: number;
}

/** Generador pseudoaleatorio con semilla (mulberry32): mismos datos → misma disposición. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function layoutForce(nodes: ForceNode[], edges: ForceEdge[], options: ForceOptions = {}): ForceResult {
  const width = options.width ?? 1800;
  const height = options.height ?? 1200;
  const iterations = options.iterations ?? 320;
  const groupPull = options.groupPull ?? 0.012;
  const radius = options.repulsionRadius ?? 160;
  const rand = seeded(options.seed ?? 7);
  const n = nodes.length;
  const cx = width / 2;
  const cy = height / 2;

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);

  const neighbors: number[][] = nodes.map(() => []);
  const springs = edges
    .map((e) => ({ a: index.get(e.from), b: index.get(e.to), length: e.length, strength: e.strength ?? 0.4 }))
    .filter((s): s is { a: number; b: number; length: number; strength: number } => s.a !== undefined && s.b !== undefined && s.a !== s.b);
  for (const s of springs) {
    neighbors[s.a]!.push(s.b);
    neighbors[s.b]!.push(s.a);
  }

  // Posiciones iniciales: los nodos con grupo cerca de su ancla; los demás, en el centroide de sus vecinos ya colocados.
  const placed = new Array<boolean>(n).fill(false);
  nodes.forEach((node, i) => {
    const anchor = node.group ? options.anchors?.[node.group] : undefined;
    if (anchor) {
      x[i] = anchor.x + (rand() - 0.5) * 220;
      y[i] = anchor.y + (rand() - 0.5) * 220;
      placed[i] = true;
    }
  });
  nodes.forEach((_node, i) => {
    if (placed[i]) return;
    const near = neighbors[i]!.filter((j) => placed[j]);
    if (near.length > 0) {
      x[i] = near.reduce((s, j) => s + x[j]!, 0) / near.length + (rand() - 0.5) * 80;
      y[i] = near.reduce((s, j) => s + y[j]!, 0) / near.length + (rand() - 0.5) * 80;
    } else {
      x[i] = cx + (rand() - 0.5) * 400;
      y[i] = cy + (rand() - 0.5) * 400;
    }
    placed[i] = true;
  });

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const r2 = radius * radius;
  for (let it = 0; it < iterations; it++) {
    const heat = 1 - it / iterations;
    fx.fill(0);
    fy.fill(0);

    // Repulsión entre pares cercanos.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = x[i]! - x[j]!;
        let dy = y[i]! - y[j]!;
        let d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        if (d2 < 0.01) {
          dx = rand() - 0.5;
          dy = rand() - 0.5;
          d2 = dx * dx + dy * dy + 0.01;
        }
        const d = Math.sqrt(d2);
        const force = 520 / d2; // decae con el cuadrado de la distancia
        fx[i]! += (dx / d) * force;
        fy[i]! += (dy / d) * force;
        fx[j]! -= (dx / d) * force;
        fy[j]! -= (dy / d) * force;
      }
    }
    // Resortes.
    for (const s of springs) {
      const dx = x[s.b]! - x[s.a]!;
      const dy = y[s.b]! - y[s.a]!;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (d - s.length) * s.strength * 0.1;
      fx[s.a]! += (dx / d) * force;
      fy[s.a]! += (dy / d) * force;
      fx[s.b]! -= (dx / d) * force;
      fy[s.b]! -= (dy / d) * force;
    }
    // Atracción al ancla del grupo y gravedad al centro.
    nodes.forEach((node, i) => {
      const anchor = node.group ? options.anchors?.[node.group] : undefined;
      if (anchor) {
        fx[i]! += (anchor.x - x[i]!) * groupPull;
        fy[i]! += (anchor.y - y[i]!) * groupPull;
      }
      fx[i]! += (cx - x[i]!) * 0.0018;
      fy[i]! += (cy - y[i]!) * 0.0018;
    });
    // Integración con amortiguación y paso máximo que se enfría.
    const maxStep = 14 * heat + 0.6;
    for (let i = 0; i < n; i++) {
      vx[i] = (vx[i]! + fx[i]!) * 0.82;
      vy[i] = (vy[i]! + fy[i]!) * 0.82;
      const v = Math.hypot(vx[i]!, vy[i]!);
      if (v > maxStep) {
        vx[i] = (vx[i]! / v) * maxStep;
        vy[i] = (vy[i]! / v) * maxStep;
      }
      x[i]! += vx[i]!;
      y[i]! += vy[i]!;
    }
  }

  // Normaliza al recuadro con un margen, conservando la proporción.
  const pad = 60;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]!);
    maxX = Math.max(maxX, x[i]!);
    minY = Math.min(minY, y[i]!);
    maxY = Math.max(maxY, y[i]!);
  }
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const positions = new Map<string, Placed>();
  nodes.forEach((node, i) => {
    positions.set(node.id, { x: pad + (x[i]! - minX) * scale, y: pad + (y[i]! - minY) * scale });
  });
  return { positions, width: pad * 2 + spanX * scale, height: pad * 2 + spanY * scale };
}
