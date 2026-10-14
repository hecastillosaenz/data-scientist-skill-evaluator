import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../../shared/agentes';
import { challengesIn, filterRuns, formatDuration, formatUsd, handoffChain, handoffText, isFailure } from '../../web/src/domain/agentesView';

const run = (id: string, over: Partial<RunSummary> = {}): RunSummary => ({ id, rol: 'generador', startedAt: `2026-10-14T10:0${id}:00.000Z`, outcome: 'ok', cost: 0, eventCount: 0, ...over });
const RUNS: RunSummary[] = [
  run('5', { rol: 'analista', challengeId: 'challenge-004', evidenceId: 'e1' }),
  run('4', { rol: 'evaluador-codigo', challengeId: 'challenge-004', outcome: 'error' }),
  run('3', { rol: 'evaluador-codigo', challengeId: 'challenge-004' }),
  run('2', { rol: 'generador', challengeId: 'challenge-004', fase: 'etapa-1' }),
  run('1', { rol: 'generador', challengeId: 'challenge-003', outcome: 'presupuesto' }),
];

describe('vista de agentes (R47, R48)', () => {
  it('AC-R48b: filtra por rol, resultado y challenge; sin roles elegidos se ven todos', () => {
    const all = { roles: new Set<never>(), outcome: 'todas' as const, challengeId: null };
    expect(filterRuns(RUNS, all)).toHaveLength(5);
    expect(filterRuns(RUNS, { ...all, roles: new Set(['generador' as const]) }).map((r) => r.id)).toEqual(['2', '1']);
    expect(filterRuns(RUNS, { ...all, outcome: 'fallo' }).map((r) => r.id)).toEqual(['4', '1']);
    expect(filterRuns(RUNS, { ...all, outcome: 'ok', challengeId: 'challenge-004' }).map((r) => r.id)).toEqual(['5', '3', '2']);
  });

  it('una cancelación no cuenta como fallo; presupuesto e interrupción sí', () => {
    expect(isFailure({ outcome: 'cancelado' })).toBe(false);
    expect(isFailure({ outcome: 'presupuesto' })).toBe(true);
    expect(isFailure({ outcome: 'interrumpida' })).toBe(true);
    expect(isFailure({ outcome: 'en_curso' })).toBe(false);
  });

  it('AC-R47: la cadena de un challenge va en orden cronológico y marca los traspasos entre roles', () => {
    const chain = handoffChain(RUNS, 'challenge-004');
    expect(chain.map((h) => h.run.id)).toEqual(['2', '3', '4', '5']);
    expect(chain.map((h) => h.from)).toEqual([null, 'generador', null, 'evaluador-codigo']); // 3→4 es el mismo rol: no hay traspaso
    expect(handoffText('generador', 'evaluador-codigo')).toContain('publicó el Generador');
    expect(handoffText('evaluador-codigo', 'analista')).toContain('Evidence');
  });

  it('lista los challenges del registro sin repetir, de lo más reciente a lo más antiguo', () => {
    expect(challengesIn(RUNS)).toEqual(['challenge-004', 'challenge-003']);
  });

  it('da formato a duración y costo', () => {
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(42_000)).toBe('42 s');
    expect(formatDuration(125_000)).toBe('2 min 05 s');
    expect(formatUsd(0.7)).toBe('US$ 0,70');
  });
});
