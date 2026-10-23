import { describe, expect, it } from 'vitest';
import { SAMPLE_CONCEPTS } from '../../web/src/data/sample/concepts';

describe('datos de ejemplo del grafo', () => {
  const ids = new Set(SAMPLE_CONCEPTS.map((c) => c.id));

  it('tiene ~250 conceptos y los 8 dominios', () => {
    expect(SAMPLE_CONCEPTS.length).toBeGreaterThanOrEqual(240);
    expect(new Set(SAMPLE_CONCEPTS.map((c) => c.domain)).size).toBe(8);
  });

  it('los ids son únicos', () => {
    expect(ids.size).toBe(SAMPLE_CONCEPTS.length);
  });

  it('todos los prerrequisitos existen', () => {
    const missing = SAMPLE_CONCEPTS.flatMap((c) => c.prerequisites.filter((p) => !ids.has(p)).map((p) => `${c.id} -> ${p}`));
    expect(missing).toEqual([]);
  });

  it('no hay ciclos de prerrequisitos', () => {
    const byId = new Map(SAMPLE_CONCEPTS.map((c) => [c.id, c]));
    const state = new Map<string, 1 | 2>();
    const visit = (id: string, path: string[]) => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) throw new Error(`ciclo: ${[...path, id].join(' -> ')}`);
      state.set(id, 1);
      for (const p of byId.get(id)!.prerequisites) visit(p, [...path, id]);
      state.set(id, 2);
    };
    expect(() => SAMPLE_CONCEPTS.forEach((c) => visit(c.id, []))).not.toThrow();
  });
});

import { buildSampleData } from '../../web/src/data/sample';
import { challengeStatus, stageStatuses } from '../../web/src/domain/progress';

describe('datos de ejemplo de challenges y evidencia', () => {
  const data = buildSampleData('normal', new Date('2026-10-13T20:00:00Z'));
  const conceptIds = new Set(data.concepts.map((c) => c.id));
  const stageIds = new Set(data.challenges.flatMap((c) => c.stages.map((s) => s.id)));

  it('todos los conceptos de las etapas existen en el grafo', () => {
    const missing = data.challenges.flatMap((c) => c.stages.flatMap((s) => s.conceptIds.filter((k) => !conceptIds.has(k)).map((k) => `${s.id}: ${k}`)));
    expect(missing).toEqual([]);
  });

  it('toda la evidencia apunta a etapas existentes y no está en el futuro', () => {
    for (const e of data.evidence) {
      expect(stageIds.has(e.stageId)).toBe(true);
      expect(new Date(e.at).getTime()).toBeLessThanOrEqual(new Date(data.now).getTime());
    }
  });

  it('hay challenges en curso, completados y pendientes', () => {
    const statuses = data.challenges.map((c) => challengeStatus(c, data.evidence));
    expect(statuses.filter((s) => s === 'en_curso').length).toBeGreaterThanOrEqual(1);
    expect(statuses.filter((s) => s === 'completada').length).toBeGreaterThanOrEqual(4);
    expect(statuses.filter((s) => s === 'pendiente').length).toBeGreaterThanOrEqual(2);
  });

  it('la etapa 3 del challenge actual está en curso (último intento parcial)', () => {
    const c = data.challenges.find((x) => x.id === 'c006')!;
    expect(stageStatuses(c, data.evidence).get('c006-s3')).toBe('en_curso');
  });

  it('el escenario "nuevo" no tiene evidencia', () => {
    expect(buildSampleData('nuevo').evidence).toEqual([]);
  });
});
