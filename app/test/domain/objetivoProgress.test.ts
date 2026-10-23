import { describe, expect, it } from 'vitest';
import type { Foco } from '../../shared/objetivos';
import type { Challenge, Concept, Evidence, Stage } from '../../shared/types';
import { computeInsights } from '../../web/src/domain/conceptState';
import { computeFocoProgress } from '../../web/src/domain/objetivoProgress';

const concept = (id: string): Concept => ({ id, name: id, domain: 'math', prerequisites: [] });
const concepts = [concept('math:a'), concept('math:b'), concept('math:c')];
const stage = (n: number, conceptIds: string[], bloom: Stage['bloom']): Stage => ({ id: `c1-s${n}`, challengeId: 'c1', number: n, title: 't', domain: 'math', difficulty: 1, bloom, estimatedMinutes: 20, mechanism: 'codigo_assert', description: '', conceptIds, apoyo: 'pistas', content: {} });
const challenge = { id: 'c1', title: 'Reto 1', stages: [stage(1, ['math:a'], 3), stage(2, ['math:b'], 2)] } as unknown as Challenge;
const ev = (stageId: string, at: string, result: Evidence['result'] = 'aprobada'): Evidence => ({ id: `${stageId}-${at}`, challengeId: 'c1', stageId, at, result, withHelp: false, apoyo: 'pistas', actualMinutes: 20 });
const foco = (pasos: { conceptId: string; bloom: 1 | 2 | 3 | 4 | 5 | 6 }[]): Foco => ({
  id: 'f', titulo: 'F', estado: 'activo', conceptIds: [], material: '',
  plan: { estado: 'aceptado', creadoAt: '2026-10-01T00:00:00Z', resumen: '', pasos: pasos.map((p) => ({ ...p, porque: 'x' })) },
});
const run = (f: Foco, evidence: Evidence[]) => {
  const data = { concepts, challenges: [challenge], evidence, testResults: [] };
  return computeFocoProgress(f, data, computeInsights(concepts, [challenge], evidence));
};

describe('avance de un objetivo (R56)', () => {
  it('sin práctica: 0 %, nada empezado y el siguiente paso es el primero', () => {
    const p = run(foco([{ conceptId: 'math:a', bloom: 3 }, { conceptId: 'math:b', bloom: 2 }]), []);
    expect(p).toMatchObject({ pct: 0, done: 0, started: 0, series: [], lastActivity: null });
    expect(p.next!.paso.conceptId).toBe('math:a');
  });

  it('el avance compara el Bloom demostrado con el objetivo: Bloom 3 en un objetivo de 6 vale 50 %', () => {
    const p = run(foco([{ conceptId: 'math:a', bloom: 6 }]), [ev('c1-s1', '2026-10-05T10:00:00Z')]);
    expect(p.pasos[0]).toMatchObject({ maxBloom: 3, score: 0.5, done: false });
    expect(p.pct).toBe(50);
  });

  it('cumplir el Bloom objetivo marca el paso y avanza al siguiente', () => {
    const p = run(foco([{ conceptId: 'math:a', bloom: 3 }, { conceptId: 'math:b', bloom: 2 }]), [ev('c1-s1', '2026-10-05T10:00:00Z')]);
    expect(p).toMatchObject({ done: 1, started: 1, pct: 50 });
    expect(p.next!.paso.conceptId).toBe('math:b');
  });

  it('enlaza retos con el objetivo por los conceptos de sus etapas y su evolución por día', () => {
    const p = run(foco([{ conceptId: 'math:a', bloom: 3 }, { conceptId: 'math:b', bloom: 2 }]), [ev('c1-s1', '2026-10-05T10:00:00Z'), ev('c1-s2', '2026-10-07T10:00:00Z')]);
    expect(p.retos).toHaveLength(1);
    expect(p.retos[0]!.cells).toEqual([{ conceptId: 'math:a', stageNumbers: [1] }, { conceptId: 'math:b', stageNumbers: [2] }]);
    expect(p.retos[0]!.last).toBe('2026-10-07T10:00:00Z');
    expect(p.series).toEqual([{ at: '2026-10-05', pct: 50 }, { at: '2026-10-07', pct: 100 }]);
  });

  it('un reto que no toca ningún concepto del objetivo no aparece; sin plan se usan los conceptos sueltos', () => {
    const p = run(foco([{ conceptId: 'math:c', bloom: 3 }]), []);
    expect(p.retos).toEqual([]);
    const legacy = run({ id: 'f', titulo: 'F', estado: 'activo', conceptIds: ['math:a'], material: '' }, [ev('c1-s1', '2026-10-05T10:00:00Z')]);
    expect(legacy.pasos[0]!.paso.bloom).toBe(3);
    expect(legacy.pct).toBe(100);
  });
});
