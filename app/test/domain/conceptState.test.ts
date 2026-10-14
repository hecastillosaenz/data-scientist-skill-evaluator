import { describe, expect, it } from 'vitest';
import { computeInsights, conceptStateFromAttempts, latestAttemptByStage } from '../../web/src/domain/conceptState';
import type { Challenge, Concept, Evidence, Stage } from '../../shared/types';

const ev = (over: Partial<Evidence>): Evidence => ({
  id: 'e', challengeId: 'c1', stageId: 'c1-s1', at: '2026-10-01T10:00:00Z', result: 'aprobada',
  withHelp: false, apoyo: 'autonomo', actualMinutes: 20, ...over,
});

const stage = (over: Partial<Stage>): Stage => ({
  id: 'c1-s1', challengeId: 'c1', number: 1, title: 't', domain: 'sql', difficulty: 2, bloom: 3,
  estimatedMinutes: 20, mechanism: 'codigo_assert', description: '', conceptIds: ['k'],
  apoyo: 'autonomo', content: {}, ...over,
});

const challenge = (stages: Stage[]): Challenge => ({
  id: 'c1', number: 1, title: 'c', dataset: 'd', difficulty: 2, recommended: false,
  objectives: { lookingFor: '', outcomes: [], skills: [] }, scenario: '', task: '', businessQuestions: [], stages,
});

const concept: Concept = { id: 'k', name: 'K', domain: 'sql', prerequisites: [] };

describe('conceptStateFromAttempts', () => {
  it('sin intentos -> no_visto', () => expect(conceptStateFromAttempts([])).toBe('no_visto'));
  it('fallo -> con_fallos', () => expect(conceptStateFromAttempts([ev({ result: 'fallida' })])).toBe('con_fallos'));
  it('aprobado sin ayuda -> dominado', () => expect(conceptStateFromAttempts([ev({})])).toBe('dominado'));
  it('aprobado con ayuda -> visto', () => expect(conceptStateFromAttempts([ev({ withHelp: true })])).toBe('visto'));
  it('parcial -> visto', () => expect(conceptStateFromAttempts([ev({ result: 'parcial' })])).toBe('visto'));
});

describe('latestAttemptByStage', () => {
  it('conserva solo el intento más reciente de cada etapa', () => {
    const latest = latestAttemptByStage([
      ev({ id: 'viejo', at: '2026-09-01T10:00:00Z', result: 'fallida' }),
      ev({ id: 'nuevo', at: '2026-10-01T10:00:00Z' }),
    ]);
    expect(latest.get('c1-s1')?.id).toBe('nuevo');
  });
});

describe('computeInsights (AC-R11)', () => {
  it('un fallo antiguo y un éxito reciente en la misma etapa reflejan solo el reciente', () => {
    const insights = computeInsights(
      [concept],
      [challenge([stage({})])],
      [ev({ id: 'a', at: '2026-09-01T10:00:00Z', result: 'fallida' }), ev({ id: 'b', at: '2026-10-01T10:00:00Z' })],
    );
    const i = insights.get('k')!;
    expect(i.state).toBe('dominado');
    expect(i.level).toBe(2);
    expect(i.maxBloom).toBe(3);
  });

  it('un reintento aprobado no borra el fallo previo del historial, pero no cuenta para el estado', () => {
    const evidence = [ev({ id: 'a', result: 'fallida', at: '2026-09-01T10:00:00Z' }), ev({ id: 'b' })];
    expect(evidence).toHaveLength(2);
    expect(conceptStateFromAttempts([...latestAttemptByStage(evidence).values()])).toBe('dominado');
  });

  it('un concepto sin etapas vinculadas con intentos es no_visto', () => {
    const insights = computeInsights([concept], [challenge([stage({})])], []);
    expect(insights.get('k')).toMatchObject({ state: 'no_visto', lastPracticed: null, level: null, maxBloom: null });
  });
});
