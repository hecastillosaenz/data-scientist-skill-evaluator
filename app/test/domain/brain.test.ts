import { describe, expect, it } from 'vitest';
import { layoutForce, seeded } from '../../web/src/domain/forceLayout';
import { BRAIN_KINDS, DIMMED, brainOpacity, buildBrainGraph, conceptNodeId, neighborsOf, searchBrain, type BrainGraph } from '../../web/src/domain/brainGraph';
import { computeInsights } from '../../web/src/domain/conceptState';
import { buildReviewQueue } from '../../web/src/domain/reviewQueue';
import { challengeStatus, stageStatuses } from '../../web/src/domain/progress';
import { latestResults, scoreOf } from '../../web/src/domain/finalTest';
import { buildSampleData } from '../../web/src/data/sample';
import { DOMAINS } from '../../shared/domains';
import type { DomainId } from '../../shared/types';

const now = new Date('2026-10-13T20:00:00Z');
const data = buildSampleData('normal', now);

function build(d = data): BrainGraph {
  const insights = computeInsights(d.concepts, d.challenges, d.evidence, d.testResults);
  return buildBrainGraph({
    data: d,
    insights,
    queue: buildReviewQueue(d.concepts, d.challenges, d.evidence, now, d.testResults),
    challengeStatus: (c) => challengeStatus(c, d.evidence),
    stageStatuses: (c) => stageStatuses(c, d.evidence),
    testScore: (c) => {
      const s = scoreOf(latestResults(d.testResults, c.id), c.finalTest ?? []);
      return s ? `${s.correct}/${s.total}` : null;
    },
  });
}
const graph = build();
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('seeded', () => {
  it('es determinista y está en [0, 1)', () => {
    const a = seeded(5);
    const b = seeded(5);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seeded(6)()).not.toBe(xs[0]);
  });
});

describe('layoutForce', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, group: i < 15 ? 'a' : 'b' }));
  const edges = Array.from({ length: 29 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, length: 40 }));
  const opts = { width: 900, height: 600, anchors: { a: { x: 200, y: 300 }, b: { x: 700, y: 300 } }, iterations: 200 };

  it('es determinista: mismos datos, misma disposición', () => {
    const a = layoutForce(nodes, edges, opts);
    const b = layoutForce(nodes, edges, opts);
    expect([...a.positions]).toEqual([...b.positions]);
  });

  it('no produce NaN ni nodos fuera del recuadro y no apila nodos', () => {
    const { positions, width, height } = layoutForce(nodes, edges, opts);
    const pts = [...positions.values()];
    for (const p of pts) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(width + 1);
      expect(p.y).toBeLessThanOrEqual(height + 1);
    }
    const minGap = Math.min(...pts.flatMap((p, i) => pts.slice(i + 1).map((q) => dist(p, q))));
    expect(minGap).toBeGreaterThan(0.5);
  });

  it('los nodos de un grupo quedan más cerca entre sí que de los del otro', () => {
    const { positions } = layoutForce(nodes, edges, opts);
    const a = nodes.filter((n) => n.group === 'a').map((n) => positions.get(n.id)!);
    const b = nodes.filter((n) => n.group === 'b').map((n) => positions.get(n.id)!);
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const within = mean(a.flatMap((p, i) => a.slice(i + 1).map((q) => dist(p, q))));
    const across = mean(a.flatMap((p) => b.map((q) => dist(p, q))));
    expect(within).toBeLessThan(across);
  });

  it('las aristas acercan a sus extremos frente a un par cualquiera', () => {
    const { positions } = layoutForce(nodes, edges, opts);
    const linked = edges.map((e) => dist(positions.get(e.from)!, positions.get(e.to)!));
    const ids = nodes.map((n) => n.id);
    const all = ids.flatMap((i, k) => ids.slice(k + 1).map((j) => dist(positions.get(i)!, positions.get(j)!)));
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean(linked)).toBeLessThan(mean(all));
  });

  it('tolera un grafo vacío, un solo nodo y aristas a nodos inexistentes', () => {
    expect(layoutForce([], []).positions.size).toBe(0);
    expect(layoutForce([{ id: 'x' }], []).positions.get('x')).toBeDefined();
    expect(() => layoutForce([{ id: 'x' }], [{ from: 'x', to: 'nada', length: 10 }])).not.toThrow();
  });
});

describe('buildBrainGraph (AC-R32)', () => {
  it('incluye los cinco tipos de nodo', () => {
    const kinds = new Set(graph.nodes.map((n) => n.kind));
    for (const k of BRAIN_KINDS) expect(kinds.has(k), k).toBe(true);
  });

  it('un nodo por concepto, challenge, etapa y debilidad abierta; un test por challenge con test', () => {
    const count = (k: string) => graph.nodes.filter((n) => n.kind === k).length;
    expect(count('concept')).toBe(data.concepts.length);
    expect(count('challenge')).toBe(data.challenges.length);
    expect(count('stage')).toBe(data.challenges.flatMap((c) => c.stages).length);
    expect(count('test')).toBe(data.challenges.filter((c) => c.finalTest?.length).length);
    expect(count('mejora')).toBe(buildReviewQueue(data.concepts, data.challenges, data.evidence, now, data.testResults).length);
  });

  it('los ids son únicos y toda arista une nodos existentes', () => {
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
    for (const e of graph.edges) {
      expect(graph.byId.has(e.from), e.id).toBe(true);
      expect(graph.byId.has(e.to), e.id).toBe(true);
    }
    expect(new Set(graph.edges.map((e) => e.id)).size).toBe(graph.edges.length);
  });

  it('relaciona challenge→etapa, etapa→concepto, test→concepto y mejora→concepto', () => {
    const edge = (kind: string) => graph.edges.filter((e) => e.kind === kind);
    for (const e of edge('contiene')) expect([graph.byId.get(e.from)!.kind, graph.byId.get(e.to)!.kind]).toEqual(['challenge', 'stage']);
    for (const e of edge('practica')) expect([graph.byId.get(e.from)!.kind, graph.byId.get(e.to)!.kind]).toEqual(['stage', 'concept']);
    for (const e of edge('evalua')) expect([graph.byId.get(e.from)!.kind, graph.byId.get(e.to)!.kind]).toEqual(['test', 'concept']);
    for (const e of edge('mejora')) expect([graph.byId.get(e.from)!.kind, graph.byId.get(e.to)!.kind]).toEqual(['mejora', 'concept']);
    expect(edge('prerequisito').length).toBe(data.concepts.reduce((s, c) => s + c.prerequisites.length, 0));
  });

  it('cada etapa cuelga de su challenge y practica sus conceptos', () => {
    const stage = graph.byId.get('stage:c010-s1')!;
    const ns = neighborsOf(graph, stage.id);
    expect(ns.some((n) => n.edge.kind === 'contiene' && n.node.id === 'challenge:c010')).toBe(true);
    expect(ns.filter((n) => n.edge.kind === 'practica').map((n) => n.node.ref).sort()).toEqual([...data.challenges.find((c) => c.id === 'c010')!.stages[0]!.conceptIds].sort());
  });

  it('las mejoras llevan el motivo y la prioridad de la cola de Repaso', () => {
    const m = graph.nodes.find((n) => n.kind === 'mejora')!;
    expect(m.reason).toBeTruthy();
    expect(['alta', 'media', 'baja']).toContain(m.priority);
    expect(m.label).toMatch(/^Mejorar «/);
  });

  it('los tests muestran su puntaje o quedan pendientes', () => {
    expect(graph.byId.get('test:c011')!.score).toBeNull();
    const d = build({ ...data, testResults: [{ id: 'r', challengeId: 'c011', questionId: 'c011-t1', conceptId: 'math:conditional', bloom: 2, at: '2026-10-13T10:00:00Z', correct: true }] });
    expect(d.byId.get('test:c011')!.score).toBe('1/5');
  });

  it('rotula el territorio de los 6 dominios dentro del mapa', () => {
    expect(graph.domainCenters.map((c) => c.domain).sort()).toEqual(DOMAINS.map((d) => d.id).sort());
    for (const c of graph.domainCenters) {
      expect(c.count).toBeGreaterThan(0);
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(graph.width);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(graph.height);
    }
    expect(graph.domainCenters.reduce((s, c) => s + c.count, 0)).toBe(data.concepts.length);
  });

  it('es determinista (misma disposición dos veces)', () => {
    expect(build().nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)])).toEqual(graph.nodes.map((n) => [n.id, Math.round(n.x), Math.round(n.y)]));
  });

  it('todas las posiciones son finitas y caben en el recuadro', () => {
    for (const n of graph.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y), n.id).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(graph.width + 1);
      expect(n.y).toBeLessThanOrEqual(graph.height + 1);
    }
  });

  it('los conceptos de un dominio quedan más juntos entre sí que con los de otros dominios', () => {
    const concepts = graph.nodes.filter((n) => n.kind === 'concept');
    const centroid = (d: DomainId) => {
      const ns = concepts.filter((n) => n.domain === d);
      return { x: ns.reduce((s, n) => s + n.x, 0) / ns.length, y: ns.reduce((s, n) => s + n.y, 0) / ns.length };
    };
    let nearest = 0;
    for (const n of concepts) {
      const own = dist(n, centroid(n.domain!));
      const others = DOMAINS.filter((d) => d.id !== n.domain).map((d) => dist(n, centroid(d.id)));
      if (own <= Math.min(...others)) nearest++;
    }
    // La mayoría de los conceptos está más cerca del centro de su propio dominio que del de cualquier otro.
    expect(nearest / concepts.length).toBeGreaterThan(0.6);
  });

  it('los challenges quedan cerca de los conceptos que practican', () => {
    const challenge = graph.byId.get('challenge:c010')!;
    const practiced = new Set(data.challenges.find((c) => c.id === 'c010')!.stages.flatMap((s) => s.conceptIds));
    const toPracticed = [...practiced].map((id) => dist(challenge, graph.byId.get(conceptNodeId(id))!));
    const toAll = graph.nodes.filter((n) => n.kind === 'concept').map((n) => dist(challenge, n));
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean(toPracticed)).toBeLessThan(mean(toAll));
  });
});

describe('filtros: atenúan, nunca ocultan (R32, AC-R32)', () => {
  const none = new Set<never>();
  it('sin filtros todo se ve por completo', () => {
    for (const n of graph.nodes) expect(brainOpacity(n, graph, none, none)).toBe(1);
  });

  it('filtrar por un tipo atenúa los demás pero ninguno desaparece', () => {
    const kinds = new Set(['stage' as const]);
    const opacities = graph.nodes.map((n) => brainOpacity(n, graph, kinds, none));
    expect(opacities.every((o) => o > 0)).toBe(true);
    expect(graph.nodes.filter((n) => n.kind === 'stage').every((n) => brainOpacity(n, graph, kinds, none) === 1)).toBe(true);
    expect(graph.nodes.filter((n) => n.kind !== 'stage').every((n) => brainOpacity(n, graph, kinds, none) === DIMMED)).toBe(true);
  });

  it('filtrar por dominio mantiene los challenges que tienen alguna etapa de ese dominio', () => {
    const domains = new Set<DomainId>(['math']);
    expect(brainOpacity(graph.byId.get('challenge:c011')!, graph, none, domains)).toBe(1); // phishing tiene etapas de math
    expect(brainOpacity(graph.byId.get('challenge:c003')!, graph, none, domains)).toBe(DIMMED); // cohortes no
    expect(brainOpacity(graph.byId.get('concept:math:bayes')!, graph, none, domains)).toBe(1);
    expect(brainOpacity(graph.byId.get('concept:sql:cte')!, graph, none, domains)).toBe(DIMMED);
  });

  it('los dos filtros se combinan (AND) y siguen sin ocultar', () => {
    const kinds = new Set(['concept' as const]);
    const domains = new Set<DomainId>(['sql']);
    expect(brainOpacity(graph.byId.get('concept:sql:cte')!, graph, kinds, domains)).toBe(1);
    expect(brainOpacity(graph.byId.get('concept:python:regex')!, graph, kinds, domains)).toBe(DIMMED);
    expect(brainOpacity(graph.byId.get('stage:c010-s1')!, graph, kinds, domains)).toBe(DIMMED);
  });
});

describe('búsqueda', () => {
  it('encuentra conceptos, challenges y etapas sin tildes ni mayúsculas, hasta 7', () => {
    expect(searchBrain(graph, 'SEGUROS').map((n) => n.kind)).toContain('challenge');
    expect(searchBrain(graph, 'siniestralidad').some((n) => n.kind === 'stage')).toBe(true);
    expect(searchBrain(graph, 'regresion').map((n) => n.label)).toContain('Regresión lineal');
    expect(searchBrain(graph, 'a').length).toBeLessThanOrEqual(7);
    expect(searchBrain(graph, '   ')).toEqual([]);
  });
});
