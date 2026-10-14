import { describe, expect, it } from 'vitest';
import { emptyFilters, filterChallenges, sortChallenges } from '../../web/src/domain/challengeFilters';
import { buildChallenges } from '../../web/src/data/sample/challenges';
import { buildSampleData } from '../../web/src/data/sample';
import { challengeStatus } from '../../web/src/domain/progress';

const data = buildSampleData('normal', new Date('2026-10-13T20:00:00Z'));
const statusOf = (c: (typeof data.challenges)[number]) => challengeStatus(c, data.evidence);
const all = buildChallenges();

describe('filterChallenges', () => {
  it('sin filtros devuelve todo', () => {
    expect(filterChallenges(all, emptyFilters(), statusOf)).toHaveLength(all.length);
  });

  it('por dominio incluye el challenge si alguna etapa cumple', () => {
    const f = { ...emptyFilters(), domains: new Set(['math' as const]) };
    const ids = filterChallenges(all, f, statusOf).map((c) => c.title);
    expect(ids).toEqual(['A/B test del checkout', 'Filtro de phishing y probabilidad real de alerta']); // los que tienen etapas de Matemática
    // …aunque su dificultad global no sea "matemática": el filtro mira las etapas
  });

  it('por Bloom incluye el challenge si alguna etapa cumple', () => {
    const f = { ...emptyFilters(), blooms: new Set([6 as const]) };
    expect(filterChallenges(all, f, statusOf).map((c) => c.stages.some((s) => s.bloom === 6))).not.toContain(false);
  });

  it('combina grupos con AND', () => {
    const f = { ...emptyFilters(), domains: new Set(['sql' as const]), difficulties: new Set([3 as const]) };
    const out = filterChallenges(all, f, statusOf);
    expect(out.every((c) => c.difficulty === 3 && c.stages.some((s) => s.domain === 'sql'))).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('por estado usa el estado derivado', () => {
    const f = { ...emptyFilters(), statuses: new Set(['completada' as const]) };
    expect(filterChallenges(data.challenges, f, statusOf).every((c) => statusOf(c) === 'completada')).toBe(true);
  });
});

describe('sortChallenges', () => {
  it('en curso → pendientes recomendados → pendientes → completados', () => {
    const order = sortChallenges(data.challenges, statusOf).map((c) => {
      const s = statusOf(c);
      return s === 'pendiente' ? (c.recommended ? 'rec' : 'pen') : s;
    });
    const rank = { en_curso: 0, rec: 1, pen: 2, completada: 3 } as const;
    const ranks = order.map((o) => rank[o]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
