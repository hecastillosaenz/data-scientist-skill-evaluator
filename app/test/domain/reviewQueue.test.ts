import { describe, expect, it } from 'vitest';
import { buildReviewQueue } from '../../web/src/domain/reviewQueue';
import { buildSampleData } from '../../web/src/data/sample';

const now = new Date('2026-10-13T20:00:00Z');
const data = buildSampleData('normal', now);
const queue = buildReviewQueue(data.concepts, data.challenges, data.evidence, now);

describe('buildReviewQueue', () => {
  it('ordena por puntaje descendente', () => {
    for (let i = 1; i < queue.length; i++) expect(queue[i - 1]!.score).toBeGreaterThanOrEqual(queue[i]!.score);
  });

  it('prioriza los conceptos con fallos vigentes', () => {
    expect(queue[0]!.reason).toBe('fallos');
  });

  it('un fallo antiguo ya corregido (R11) no genera motivo "fallos"', () => {
    // c004-s2: fallo hace 24 días, aprobada con ayuda hace 22 → el motivo vigente es "ayuda"
    const item = queue.find((i) => i.concept.id === 'ml:logreg');
    expect(item?.reason).toBe('ayuda');
  });

  it('el motivo "olvido" aparece para conceptos dominados hace más de 21 días', () => {
    expect(queue.some((i) => i.reason === 'olvido')).toBe(true);
  });
});

import { topWeaknesses } from '../../web/src/domain/reviewQueue';

describe('topWeaknesses', () => {
  it('prefiere etapas de origen distintas', () => {
    const top = topWeaknesses(queue, 3);
    expect(top).toHaveLength(3);
    expect(new Set(top.map((i) => i.source.stage.id)).size).toBe(3);
  });
});
