import { describe, expect, it } from 'vitest';
import { layoutGraph } from '../../web/src/domain/graphLayout';
import { domainOpacity, normalize, relatedConcepts, searchConcepts } from '../../web/src/domain/graphQueries';
import { SAMPLE_CONCEPTS } from '../../web/src/data/sample/concepts';
import { buildChallenges } from '../../web/src/data/sample/challenges';
import { DOMAINS } from '../../shared/domains';
import type { DomainId } from '../../shared/types';

const layout = layoutGraph(SAMPLE_CONCEPTS);

describe('layoutGraph', () => {
  it('coloca todos los conceptos y todas las aristas', () => {
    expect(layout.nodes).toHaveLength(SAMPLE_CONCEPTS.length);
    expect(layout.edges.length).toBeGreaterThan(300);
  });

  it('todo prerrequisito queda estrictamente a la izquierda de su dependiente', () => {
    for (const e of layout.edges) expect(layout.byId.get(e.from)!.x).toBeLessThan(layout.byId.get(e.to)!.x);
  });

  it('ningún par de nodos se solapa', () => {
    const seen = new Set<string>();
    for (const n of layout.nodes) {
      const key = `${n.x},${n.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('cada nodo cae dentro del carril de su dominio', () => {
    const lanes = new Map(layout.lanes.map((l) => [l.domain, l]));
    for (const n of layout.nodes) {
      const lane = lanes.get(n.concept.domain)!;
      expect(n.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.y).toBeLessThanOrEqual(lane.y + lane.height);
    }
  });

  it('es determinista', () => {
    const again = layoutGraph(SAMPLE_CONCEPTS);
    expect(again.nodes.map((n) => [n.id, n.x, n.y])).toEqual(layout.nodes.map((n) => [n.id, n.x, n.y]));
  });
});

describe('R15 / AC-R15: los dominios nunca se ocultan', () => {
  it('sin selección, los 6 dominios se ven por completo', () => {
    for (const d of DOMAINS) expect(domainOpacity(d.id, new Set())).toBe(1);
  });
  it('con cualquier selección, ningún dominio queda invisible', () => {
    const active = new Set<DomainId>(['sql']);
    for (const d of DOMAINS) expect(domainOpacity(d.id, active)).toBeGreaterThan(0);
    expect(domainOpacity('sql', active)).toBe(1);
    expect(domainOpacity('python', active)).toBeLessThan(1);
  });
  it('el layout inicial contiene nodos de los 6 dominios', () => {
    expect(new Set(layout.nodes.map((n) => n.concept.domain)).size).toBe(6);
  });
});

describe('búsqueda', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalize('Regresión')).toBe('regresion');
    expect(searchConcepts('REGRESION', SAMPLE_CONCEPTS).map((c) => c.name)).toContain('Regresión lineal');
  });
  it('devuelve como máximo 7 resultados', () => {
    expect(searchConcepts('a', SAMPLE_CONCEPTS).length).toBeLessThanOrEqual(7);
  });
  it('consulta vacía no devuelve nada', () => {
    expect(searchConcepts('  ', SAMPLE_CONCEPTS)).toEqual([]);
  });
});

describe('relatedConcepts', () => {
  it('devuelve como máximo 8, sin repetidos ni el propio concepto', () => {
    const concept = SAMPLE_CONCEPTS.find((c) => c.id === 'sql:select')!;
    const related = relatedConcepts(concept, SAMPLE_CONCEPTS, buildChallenges());
    expect(related.length).toBeLessThanOrEqual(8);
    expect(new Set(related.map((c) => c.id)).size).toBe(related.length);
    expect(related.some((c) => c.id === concept.id)).toBe(false);
  });
});

import { centerOn, clampZoom, fitView, MAX_ZOOM, MIN_ZOOM, zoomAt } from '../../web/src/domain/graphView';

describe('vista del grafo (zoom y pan)', () => {
  it('el ajuste inicial respeta los límites de zoom y centra el contenido', () => {
    const v = fitView({ width: layout.width, height: layout.height }, { width: 880, height: 540 });
    expect(v.k).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(v.k).toBeLessThanOrEqual(MAX_ZOOM);
  });
  it('con el layout de ejemplo, ajustar da una escala cercana al mínimo (todo el mapa casi cabe)', () => {
    const v = fitView({ width: layout.width, height: layout.height }, { width: 880, height: 540 });
    expect(v.k).toBeLessThan(0.65);
  });
  it('zoomAt mantiene fijo el punto bajo el cursor', () => {
    const v0 = { k: 1, x: 40, y: 20 };
    const px = 300, py = 200;
    const world = { x: (px - v0.x) / v0.k, y: (py - v0.y) / v0.k };
    const v1 = zoomAt(v0, 1.6, px, py);
    expect((px - v1.x) / v1.k).toBeCloseTo(world.x);
    expect((py - v1.y) / v1.k).toBeCloseTo(world.y);
  });
  it('zoomAt no pasa de los límites', () => {
    expect(zoomAt({ k: 2.4, x: 0, y: 0 }, 5, 0, 0).k).toBe(MAX_ZOOM);
    expect(zoomAt({ k: 0.6, x: 0, y: 0 }, 0.1, 0, 0).k).toBe(MIN_ZOOM);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
  });
  it('centerOn deja el nodo en el centro', () => {
    const v = centerOn({ k: 0.5, x: 0, y: 0 }, 400, 300, { width: 800, height: 540 });
    expect(v.k).toBe(1);
    expect(400 * v.k + v.x).toBeCloseTo(400);
    expect(300 * v.k + v.y).toBeCloseTo(270);
  });
});
