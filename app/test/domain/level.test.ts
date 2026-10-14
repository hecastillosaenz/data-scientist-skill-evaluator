import { describe, expect, it } from 'vitest';
import { globalLevel, levelByDomain, LEVELS } from '../../web/src/domain/level';
import { DOMAINS } from '../../shared/domains';
import type { Apoyo, Challenge, Difficulty, DomainId, Evidence, Stage } from '../../shared/types';

let n = 0;
const stage = (domain: DomainId, difficulty: Difficulty): Stage => {
  n += 1;
  return {
    id: `c1-s${n}`, challengeId: 'c1', number: n, title: `Etapa ${n}`, domain, difficulty, bloom: 3, estimatedMinutes: 20,
    mechanism: 'codigo_assert', description: 'x', conceptIds: [`${domain}:a`], apoyo: 'autonomo', content: {},
  };
};
const challengeOf = (stages: Stage[]): Challenge => ({
  id: 'c1', number: 1, title: 'T', dataset: 'D', difficulty: 1, recommended: false,
  objectives: { lookingFor: 'x', outcomes: [], skills: [] }, scenario: 's', task: '', businessQuestions: [], stages,
});
const ev = (s: Stage, over: Partial<Evidence> = {}): Evidence => ({
  id: `e${Math.random()}`, challengeId: 'c1', stageId: s.id, at: '2026-10-01T10:00:00.000Z',
  result: 'aprobada', withHelp: false, apoyo: 'autonomo' as Apoyo, actualMinutes: 20, ...over,
});

describe('Nivel por dominio (R40)', () => {
  it('AC-R40a: 2 etapas de SQL dificultad 1 aprobadas sin ayuda en Autónomo → SQL Básico, el resto Trainee', () => {
    const a = stage('sql', 1);
    const b = stage('sql', 1);
    const levels = levelByDomain([challengeOf([a, b])], [ev(a), ev(b)]);
    expect(levels.sql.level).toBe('Básico');
    for (const d of DOMAINS.filter((d) => d.id !== 'sql')) expect(levels[d.id].level).toBe('Trainee');
  });

  it('AC-R40b: una aprobada con Pistas, con Guiado o con ayuda no suma (R6)', () => {
    const a = stage('sql', 1);
    const b = stage('sql', 1);
    const c = stage('sql', 1);
    const levels = levelByDomain([challengeOf([a, b, c])], [ev(a, { apoyo: 'pistas' }), ev(b, { apoyo: 'guiado' }), ev(c, { withHelp: true })]);
    expect(levels.sql.level).toBe('Trainee');
    expect(levels.sql.counted).toBe(0);
  });

  it('AC-R40c: un fallo posterior, incluso en la misma etapa, no baja el Nivel', () => {
    const a = stage('python', 1);
    const b = stage('python', 1);
    const ch = challengeOf([a, b]);
    const base = [ev(a), ev(b)];
    expect(levelByDomain([ch], base).python.level).toBe('Básico');
    const later = [...base, ev(a, { result: 'fallida', at: '2026-10-05T10:00:00.000Z' })];
    expect(levelByDomain([ch], later).python.level).toBe('Básico');
  });

  it('los reintentos no inflan: cada etapa cuenta una vez', () => {
    const a = stage('sql', 1);
    const levels = levelByDomain([challengeOf([a])], [ev(a), ev(a), ev(a)]);
    expect(levels.sql.counted).toBe(1);
    expect(levels.sql.level).toBe('Trainee');
  });

  it('Intermedio pide 3 etapas de dificultad ≥ 2; Avanzado, 3 de dificultad 3', () => {
    const mid = [stage('ml', 2), stage('ml', 2), stage('ml', 3)];
    expect(levelByDomain([challengeOf(mid)], mid.map((s) => ev(s))).ml.level).toBe('Intermedio');
    const two = mid.slice(0, 2);
    expect(levelByDomain([challengeOf(two)], two.map((s) => ev(s))).ml.level).toBe('Básico');
    const top = [stage('math', 3), stage('math', 3), stage('math', 3)];
    expect(levelByDomain([challengeOf(top)], top.map((s) => ev(s))).math.level).toBe('Avanzado');
  });

  it('informa lo que falta para el siguiente nivel', () => {
    const a = stage('sql', 2);
    const l = levelByDomain([challengeOf([a])], [ev(a)]).sql;
    expect(l.next).toEqual({ level: 'Básico', have: 1, need: 2, minDifficulty: 1 });
    const top = [stage('sql', 3), stage('sql', 3), stage('sql', 3)];
    expect(levelByDomain([challengeOf(top)], top.map((s) => ev(s))).sql.next).toBeNull();
  });

  it('AC-R40d: el nivel global es la mediana de los seis dominios, redondeada hacia abajo', () => {
    const only = (...idx: number[]) =>
      Object.fromEntries(DOMAINS.map((d, i) => [d.id, { level: LEVELS[idx[i] ?? 0]!, index: idx[i] ?? 0, counted: 0, next: null }])) as Parameters<typeof globalLevel>[0];
    expect(globalLevel(only(3, 0, 0, 0, 0, 0))).toBe('Trainee'); // un dominio fuerte no basta
    expect(globalLevel(only(3, 3, 3, 0, 0, 0))).toBe('Básico'); // mediana 1,5 → 1
    expect(globalLevel(only(2, 2, 2, 2, 0, 0))).toBe('Intermedio');
    expect(globalLevel(only(3, 3, 3, 3, 3, 3))).toBe('Avanzado');
  });

  it('sin evidencia, todo es Trainee', () => {
    const levels = levelByDomain([], []);
    expect(Object.values(levels).every((l) => l.level === 'Trainee')).toBe(true);
    expect(globalLevel(levels)).toBe('Trainee');
  });
});
