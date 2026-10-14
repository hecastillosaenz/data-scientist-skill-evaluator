import { describe, expect, it } from 'vitest';
import { gradeQuestion, isAnswered, isTestUnlocked, latestResults, parseNumber, scoreOf } from '../../web/src/domain/finalTest';
import { computeInsights } from '../../web/src/domain/conceptState';
import { buildReviewQueue, reasonText } from '../../web/src/domain/reviewQueue';
import { buildSampleData } from '../../web/src/data/sample';
import type { StageStatus, TestQuestion, TestResult } from '../../shared/types';

const now = new Date('2026-10-13T20:00:00Z');
const data = buildSampleData('normal', now);
const seguros = data.challenges.find((c) => c.id === 'c010')!;

const mc: TestQuestion = { id: 'q1', conceptId: 'sql:cte', bloom: 2, kind: 'opcion_multiple', prompt: 'p', options: ['a', 'b', 'c'], correctIndex: 1, explanation: 'e' };
const num: TestQuestion = { id: 'q2', conceptId: 'sql:agg', bloom: 3, kind: 'numerica', prompt: 'p', answer: 10.7, tolerance: 0.2, explanation: 'e' };
const txt: TestQuestion = { id: 'q3', conceptId: 'business:risk', bloom: 3, kind: 'texto', prompt: 'p', rubric: 'r', explanation: 'e' };

const result = (over: Partial<TestResult>): TestResult => ({
  id: 'r', challengeId: 'c010', questionId: 'c010-t2', conceptId: 'sql:joins-outer', bloom: 3, at: '2026-10-13T10:00:00Z', correct: true, ...over,
});

describe('desbloqueo del test (AC-R21)', () => {
  const statuses = (...s: StageStatus[]) => new Map(seguros.stages.map((st, i) => [st.id, s[i] ?? 'pendiente'] as const));
  it('está bloqueado mientras falte alguna etapa', () => {
    expect(isTestUnlocked(seguros, statuses('completada', 'en_curso'))).toBe(false);
    expect(isTestUnlocked(seguros, statuses('completada', 'con_fallos'))).toBe(false);
  });
  it('se desbloquea con todas las etapas completadas', () => {
    expect(isTestUnlocked(seguros, statuses('completada', 'completada'))).toBe(true);
  });
});

describe('calificación', () => {
  it('opción múltiple', () => {
    expect(gradeQuestion(mc, { choice: 1 }).correct).toBe(true);
    expect(gradeQuestion(mc, { choice: 0 }).correct).toBe(false);
    expect(gradeQuestion(mc, { choice: 1 }).expected).toBe('b');
  });
  it('numérica con tolerancia y coma decimal', () => {
    expect(gradeQuestion(num, { text: '10,7' }).correct).toBe(true);
    expect(gradeQuestion(num, { text: '10.5' }).correct).toBe(true); // dentro de ±0,2 (10,5 está a 0,2)
    expect(gradeQuestion(num, { text: '10.4' }).correct).toBe(false);
    expect(gradeQuestion(num, { text: 'abc' }).correct).toBe(false);
  });
  it('texto se califica con una heurística marcada como simulada', () => {
    const short = gradeQuestion(txt, { text: 'no sé' });
    expect(short).toMatchObject({ correct: false, simulated: true });
    expect(gradeQuestion(txt, { text: 'La muestra es de solo dos pólizas y un siniestro grande domina el resultado.' }).correct).toBe(true);
  });
  it('detecta si una pregunta está respondida', () => {
    expect(isAnswered(mc, undefined)).toBe(false);
    expect(isAnswered(mc, { choice: 0 })).toBe(true);
    expect(isAnswered(num, { text: 'x' })).toBe(false);
    expect(isAnswered(num, { text: '3' })).toBe(true);
    expect(isAnswered(txt, { text: '  ' })).toBe(false);
  });
  it('parseNumber', () => {
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('')).toBeNull();
  });
});

describe('resultados y puntaje', () => {
  it('el último resultado por pregunta manda y el historial se conserva', () => {
    const all = [result({ id: 'a', at: '2026-10-01T10:00:00Z', correct: false }), result({ id: 'b', at: '2026-10-02T10:00:00Z', correct: true })];
    expect(latestResults(all, 'c010').get('c010-t2')?.correct).toBe(true);
    expect(all).toHaveLength(2);
  });
  it('puntaje sobre el total de preguntas', () => {
    const latest = latestResults([result({ questionId: 'c010-t1' }), result({ questionId: 'c010-t2', correct: false })], 'c010');
    expect(scoreOf(latest, seguros.finalTest!)).toEqual({ correct: 1, total: seguros.finalTest!.length });
    expect(scoreOf(new Map(), seguros.finalTest!)).toBeNull();
  });
});

describe('el test alimenta el grafo (AC-R23)', () => {
  it('un fallo reciente en el test deja el concepto «Con fallos» aunque la etapa estuviera aprobada', () => {
    const stage = seguros.stages[0]!;
    const approved = { id: 'e1', challengeId: 'c010', stageId: stage.id, at: '2026-10-01T10:00:00Z', result: 'aprobada' as const, withHelp: false, apoyo: 'guiado' as const, actualMinutes: 25 };
    const before = computeInsights(data.concepts, data.challenges, [approved]);
    expect(before.get('sql:joins-outer')?.state).toBe('dominado');
    const after = computeInsights(data.concepts, data.challenges, [approved], [result({ correct: false })]);
    expect(after.get('sql:joins-outer')?.state).toBe('con_fallos');
  });

  it('un acierto en el test aporta Bloom B1–B3 al concepto', () => {
    const insights = computeInsights(data.concepts, data.challenges, [], [result({ bloom: 2, correct: true })]);
    expect(insights.get('sql:joins-outer')).toMatchObject({ state: 'dominado', maxBloom: 2 });
  });

  it('reintentar el test cuenta solo el último resultado de la pregunta (R11)', () => {
    const results = [result({ id: 'a', at: '2026-10-01T10:00:00Z', correct: false }), result({ id: 'b', at: '2026-10-02T10:00:00Z', correct: true })];
    expect(computeInsights(data.concepts, data.challenges, [], results).get('sql:joins-outer')?.state).toBe('dominado');
  });

  it('un fallo en el test entra a la cola de Repaso con el motivo del test final', () => {
    const stage = seguros.stages[0]!;
    const approved = { id: 'e1', challengeId: 'c010', stageId: stage.id, at: '2026-10-12T10:00:00Z', result: 'aprobada' as const, withHelp: false, apoyo: 'guiado' as const, actualMinutes: 25 };
    const queue = buildReviewQueue(data.concepts, data.challenges, [approved], now, [result({ correct: false, at: '2026-10-13T10:00:00Z' })]);
    const item = queue.find((i) => i.concept.id === 'sql:joins-outer');
    expect(item).toMatchObject({ reason: 'fallos', via: 'test' });
    expect(reasonText(item!)).toBe('Fallaste este concepto en el test final');
  });

  it('si el concepto se acierta después, sale de la cola por el test', () => {
    const results = [result({ id: 'a', at: '2026-10-12T10:00:00Z', correct: false }), result({ id: 'b', at: '2026-10-13T10:00:00Z', correct: true })];
    const queue = buildReviewQueue(data.concepts, data.challenges, [], now, results);
    expect(queue.find((i) => i.concept.id === 'sql:joins-outer')).toBeUndefined();
  });
});

describe('el contenido de ejemplo del test', () => {
  const withTest = data.challenges.filter((c) => c.finalTest);
  it('hay test en los retos ricos', () => {
    expect(withTest.map((c) => c.id).sort()).toEqual(['c006', 'c010', 'c011']);
  });
  it('cada pregunta tiene 5–8 por challenge, concepto de sus etapas y Bloom 1–3', () => {
    for (const c of withTest) {
      const stageConcepts = new Set(c.stages.flatMap((s) => s.conceptIds));
      expect(c.finalTest!.length).toBeGreaterThanOrEqual(5);
      expect(c.finalTest!.length).toBeLessThanOrEqual(8);
      for (const q of c.finalTest!) {
        expect(stageConcepts.has(q.conceptId), `${c.id}/${q.id}: ${q.conceptId}`).toBe(true);
        expect([1, 2, 3]).toContain(q.bloom);
        if (q.kind === 'opcion_multiple') expect(q.options![q.correctIndex!]).toBeTruthy();
        if (q.kind === 'numerica') expect(typeof q.answer).toBe('number');
      }
    }
  });
  it('los ids de pregunta son únicos', () => {
    const ids = withTest.flatMap((c) => c.finalTest!.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
