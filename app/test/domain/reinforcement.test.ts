import { describe, expect, it } from 'vitest';
import { buildReinforcement } from '../../web/src/domain/reinforcement';
import { buildReviewQueue } from '../../web/src/domain/reviewQueue';
import { buildSampleData } from '../../web/src/data/sample';

const now = new Date('2026-10-13T20:00:00Z');
const data = buildSampleData('normal', now);
const queue = buildReviewQueue(data.concepts, data.challenges, data.evidence, now);

describe('buildReinforcement', () => {
  it('baja un nivel de dificultad y 5 minutos, con Apoyo Pistas', () => {
    const item = queue[0]!;
    const r = buildReinforcement(item);
    expect(r.difficulty).toBe(Math.max(1, item.source.stage.difficulty - 1));
    expect(r.minutes).toBe(Math.max(10, item.source.stage.estimatedMinutes - 5));
    expect(r.apoyo).toBe('pistas');
  });
  it('nunca baja de Básico ni de 10 minutos', () => {
    const base = queue[0]!;
    const easy = { ...base, source: { ...base.source, stage: { ...base.source.stage, difficulty: 1 as const, estimatedMinutes: 12 } } };
    const r = buildReinforcement(easy);
    expect(r.difficulty).toBe(1);
    expect(r.minutes).toBe(10);
  });
});
