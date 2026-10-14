import { describe, expect, it } from 'vitest';
import { analyzeWeakness, recommendApoyo } from '../../web/src/domain/weakness';
import { buildSampleData } from '../../web/src/data/sample';
import type { AppData, Evidence, TestResult } from '../../shared/types';

const now = new Date('2026-10-13T20:00:00Z');
const base = buildSampleData('normal', now);
const clone = (d: AppData): AppData => JSON.parse(JSON.stringify(d));

const attempt = (stageId: string, over: Partial<Evidence> = {}): Evidence => ({
  id: `e-${Math.random().toString(36).slice(2, 7)}`, challengeId: stageId.split('-s')[0]!, stageId, at: '2026-10-12T10:00:00Z',
  result: 'aprobada', withHelp: false, apoyo: 'pistas', actualMinutes: 20, ...over,
});

describe('recommendApoyo', () => {
  it('más ayuda si falló repetidamente, ninguna si solo se olvidó', () => {
    expect(recommendApoyo(3, 'fallos')).toBe('guiado');
    expect(recommendApoyo(2, 'fallos')).toBe('guiado');
    expect(recommendApoyo(1, 'fallos')).toBe('pistas');
    expect(recommendApoyo(0, 'parcial')).toBe('pistas');
    expect(recommendApoyo(0, 'ayuda')).toBe('pistas');
    expect(recommendApoyo(0, 'olvido')).toBe('autonomo');
  });
});

describe('analyzeWeakness · fallos (AC-R31)', () => {
  // En los datos de ejemplo, «Precisión, recall y F1» falla en la etapa 3 de churn.
  const a = analyzeWeakness('ml:metrics-clf', base, now)!;

  it('existe, está en la cola de Repaso por fallos y lo resume en una frase', () => {
    expect(a).not.toBeNull();
    expect(a.item?.reason).toBe('fallos');
    expect(a.headline).toBe('Estás fallando en «Precisión, recall y F1»');
  });

  it('cuenta intentos y fallos de las etapas que practican el concepto', () => {
    expect(a.stats.failures).toBeGreaterThanOrEqual(2);
    expect(a.stats.attempts).toBeGreaterThanOrEqual(a.stats.failures);
    expect(a.diagnosis[0]).toMatch(/Has fallado \d+ intentos? de \d+ intentos?/);
  });

  it('la evidencia va de la más reciente a la más antigua y trae etapa, resultado y contexto', () => {
    const dates = a.evidence.map((e) => e.at);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(a.evidence[0]).toMatchObject({ source: 'etapa', label: expect.stringContaining('Etapa 3'), detail: 'Predicción de churn en telecom' });
  });

  it('agrega los bloqueos que marcó el usuario y cita sus propias notas', () => {
    expect(a.blockers[0]).toMatchObject({ blocker: 'concepto' });
    expect(a.diagnosis.join(' ')).toContain('Tu bloqueo más repetido es «No entendí el concepto»');
    expect(a.diagnosis.join(' ')).toContain('Lo dijiste tú en tus notas');
  });

  it('propone reintentar con Guiado cuando falló más de una vez y enlaza a la etapa', () => {
    expect(a.recommendedApoyo).toBe('guiado');
    const step = a.steps.find((s) => s.kind === 'practicar')!;
    expect(step.title).toContain('Apoyo Guiado');
    expect(step.to).toBe(`/challenge-actual/${a.practice!.challenge.id}`);
  });

  it('siempre ofrece investigar con búsquedas en español e inglés y un reto de refuerzo', () => {
    const research = a.steps.find((s) => s.kind === 'investigar')!;
    expect(research.links!.map((l) => l.label.slice(0, 2))).toEqual(expect.arrayContaining(['ES', 'EN']));
    expect(research.links![0]!.href).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
    expect(a.steps.some((s) => s.kind === 'refuerzo')).toBe(true);
  });

  it('cada paso tiene id único y texto', () => {
    expect(new Set(a.steps.map((s) => s.id)).size).toBe(a.steps.length);
    for (const s of a.steps) {
      expect(s.title.length).toBeGreaterThan(5);
      expect(s.detail.length).toBeGreaterThan(5);
    }
  });
});

describe('analyzeWeakness · causas raíz', () => {
  it('señala los prerrequisitos que no están firmes, con fallos primero, y empieza el plan por ellos', () => {
    const d = clone(base);
    // «Curva ROC y AUC» (con fallos) y «Fuga de datos» (sin ver) como prerrequisitos de un concepto practicado.
    const target = d.concepts.find((c) => c.id === 'ml:threshold')!;
    target.prerequisites = ['ml:leakage', 'ml:roc'];
    const a = analyzeWeakness('ml:threshold', d, now)!;
    expect(a.rootCauses.map((r) => r.concept.id)).toEqual(['ml:roc', 'ml:leakage']);
    expect(a.rootCauses[0]).toMatchObject({ state: 'con_fallos' });
    expect(a.rootCauses[0]!.why).toContain('fallos vigentes');
    expect(a.rootCauses[1]!.why).toContain('Aún no has practicado');
    expect(a.steps[0]).toMatchObject({ kind: 'prerrequisito', title: 'Refuerza primero «Curva ROC y AUC»' });
    expect(a.diagnosis.join(' ')).toContain('Puede que la causa esté antes');
  });

  it('un prerrequisito sin práctica enlaza al grafo y uno practicado, a su análisis', () => {
    const d = clone(base);
    d.concepts.find((c) => c.id === 'ml:threshold')!.prerequisites = ['ml:leakage', 'ml:roc'];
    const a = analyzeWeakness('ml:threshold', d, now)!;
    expect(a.rootCauses.find((r) => r.concept.id === 'ml:roc')!.hasAnalysis).toBe(true);
    expect(a.rootCauses.find((r) => r.concept.id === 'ml:leakage')!.hasAnalysis).toBe(false);
  });

  it('si los prerrequisitos están firmes no hay causas raíz ni paso de prerrequisito', () => {
    const d = clone(base);
    d.concepts.find((c) => c.id === 'ml:metrics-clf')!.prerequisites = [];
    const a = analyzeWeakness('ml:metrics-clf', d, now)!;
    expect(a.rootCauses).toEqual([]);
    expect(a.steps.some((s) => s.kind === 'prerrequisito')).toBe(false);
  });
});

describe('analyzeWeakness · otros motivos', () => {
  it('resolver con ayuda se explica y recomienda Pistas', () => {
    const d = clone(base);
    d.evidence = [attempt('c010-s1', { withHelp: true })];
    const a = analyzeWeakness('sql:cte', d, now)!;
    expect(a.item?.reason).toBe('ayuda');
    expect(a.headline).toBe('Necesitas ayuda para resolver «CTEs con WITH»');
    expect(a.diagnosis.join(' ')).toContain('Resolviste con ayuda (abriste la solución) 1 vez');
    expect(a.recommendedApoyo).toBe('pistas');
  });

  it('un concepto dominado hace tiempo es «olvido» y se reintenta en Autónomo', () => {
    const d = clone(base);
    d.evidence = [attempt('c010-s1', { at: '2026-08-01T10:00:00Z' })];
    const a = analyzeWeakness('sql:cte', d, now)!;
    expect(a.item?.reason).toBe('olvido');
    expect(a.headline).toBe('«CTEs con WITH» se te puede estar olvidando');
    expect(a.diagnosis.join(' ')).toMatch(/hace 73 días que no lo practicas/);
    expect(a.recommendedApoyo).toBe('autonomo');
    expect(a.steps.some((s) => s.kind === 'teoria')).toBe(false); // no hay que releer teoría de algo que se resolvió bien
  });

  it('un fallo en el test final entra al diagnóstico, a la evidencia y al plan', () => {
    const d = clone(base);
    d.evidence = [attempt('c010-s1')];
    const miss: TestResult = { id: 'tr1', challengeId: 'c010', questionId: 'c010-t5', conceptId: 'sql:cte', bloom: 2, at: '2026-10-13T10:00:00Z', correct: false };
    d.testResults = [miss];
    const a = analyzeWeakness('sql:cte', d, now)!;
    expect(a.item).toMatchObject({ reason: 'fallos', via: 'test' });
    expect(a.stats).toMatchObject({ testFailures: 1 });
    expect(a.diagnosis.join(' ')).toContain('En el test final fallaste 1 de 1 pregunta');
    expect(a.evidence[0]).toMatchObject({ source: 'test', label: 'Test final', result: 'fallida' });
    expect(a.steps.some((s) => s.kind === 'test')).toBe(true);
  });

  it('acertar después en el test borra el fallo del diagnóstico (el último resultado manda, R11)', () => {
    const d = clone(base);
    d.evidence = [attempt('c010-s1')];
    d.testResults = [
      { id: 'a', challengeId: 'c010', questionId: 'c010-t5', conceptId: 'sql:cte', bloom: 2, at: '2026-10-12T10:00:00Z', correct: false },
      { id: 'b', challengeId: 'c010', questionId: 'c010-t5', conceptId: 'sql:cte', bloom: 2, at: '2026-10-13T10:00:00Z', correct: true },
    ];
    const a = analyzeWeakness('sql:cte', d, now)!;
    expect(a.stats.testFailures).toBe(0);
    expect(a.evidence.filter((e) => e.source === 'test')).toHaveLength(2); // el historial se conserva
  });
});

describe('analyzeWeakness · límites', () => {
  it('un concepto inexistente devuelve null', () => {
    expect(analyzeWeakness('no:existe', base, now)).toBeNull();
  });

  it('un concepto sin ningún intento ni motivo devuelve null', () => {
    expect(analyzeWeakness('python:regex', base, now)).toBeNull();
  });

  it('el error común sale de la solución de la etapa y se identifica su origen', () => {
    const d = clone(base);
    d.evidence = [attempt('c010-s1', { result: 'fallida' })];
    const a = analyzeWeakness('sql:cte', d, now)!;
    expect(a.commonError?.text).toContain('Dos versiones del mismo error de grano');
    expect(a.commonError).toMatchObject({ challengeTitle: expect.stringContaining('Seguros'), stageTitle: 'Ratio de siniestralidad por tipo de póliza' });
  });

  it('usa la investigación de la etapa cuando la tiene (con sus búsquedas)', () => {
    const d = clone(base);
    d.evidence = [attempt('c010-s1', { result: 'fallida' })];
    const a = analyzeWeakness('sql:cte', d, now)!;
    expect(a.research[0]!.searchEn).toBe('SQL common table expression WITH');
    expect(a.steps.find((s) => s.kind === 'investigar')!.links![1]!.label).toContain('SQL common table expression WITH');
  });

  it('cuenta los conceptos que dependen de este', () => {
    const a = analyzeWeakness('ml:metrics-clf', base, now)!;
    expect(a.dependents).toBe(base.concepts.filter((c) => c.prerequisites.includes('ml:metrics-clf')).length);
    expect(a.dependents).toBeGreaterThan(0);
    expect(a.diagnosis.join(' ')).toContain('depende');
  });
});
