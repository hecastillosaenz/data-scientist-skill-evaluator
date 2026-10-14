import { describe, expect, it } from 'vitest';
import { answersToSave, latestAnswers, reflectionVisible, versionsSaved } from '../../web/src/domain/businessAnswers';
import type { BusinessAnswer, BusinessQuestion } from '../../shared/types';

const questions: BusinessQuestion[] = [
  { id: 'q1', text: 'Uno', reflectionGuide: 'Guía 1' },
  { id: 'q2', text: 'Dos', reflectionGuide: 'Guía 2' },
];
const ans = (id: string, questionId: string, at: string, text: string): BusinessAnswer => ({ id, challengeId: 'c1', questionId, at, text });

describe('respuestas de negocio (R22)', () => {
  it('la guía está oculta hasta que se guarda la respuesta (AC-R22)', () => {
    const none = latestAnswers([], 'c1');
    expect(reflectionVisible('q1', none)).toBe(false);
    const saved = latestAnswers([ans('a', 'q1', '2026-10-01T10:00:00Z', 'mi respuesta')], 'c1');
    expect(reflectionVisible('q1', saved)).toBe(true);
    expect(reflectionVisible('q2', saved)).toBe(false); // solo la pregunta respondida
  });

  it('guarda solo borradores no vacíos', () => {
    expect(answersToSave({ q1: '  ', q2: 'algo' }, questions, new Map())).toEqual([{ questionId: 'q2', text: 'algo' }]);
    expect(answersToSave({}, questions, new Map())).toEqual([]);
  });

  it('no duplica una respuesta idéntica a la ya guardada, pero sí guarda un cambio', () => {
    const saved = latestAnswers([ans('a', 'q1', '2026-10-01T10:00:00Z', 'versión 1')], 'c1');
    expect(answersToSave({ q1: 'versión 1 ' }, questions, saved)).toEqual([]);
    expect(answersToSave({ q1: 'versión 2' }, questions, saved)).toEqual([{ questionId: 'q1', text: 'versión 2' }]);
  });

  it('es append-only: la última versión manda y el historial se conserva', () => {
    const all = [ans('a', 'q1', '2026-10-01T10:00:00Z', 'v1'), ans('b', 'q1', '2026-10-02T10:00:00Z', 'v2')];
    expect(latestAnswers(all, 'c1').get('q1')?.text).toBe('v2');
    expect(versionsSaved(all, 'c1', 'q1')).toBe(2);
  });

  it('ignora respuestas de otros challenges', () => {
    const other: BusinessAnswer = { id: 'x', challengeId: 'c2', questionId: 'q1', at: '2026-10-03T00:00:00Z', text: 'otro' };
    expect(latestAnswers([other], 'c1').size).toBe(0);
  });
});
