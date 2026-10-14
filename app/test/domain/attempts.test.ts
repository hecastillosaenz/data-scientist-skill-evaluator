import { describe, expect, it } from 'vitest';
import type { AttemptSummary } from '../../shared/intentos';
import type { Challenge } from '../../shared/types';
import { attemptsOfStage, attemptsSince, attemptsToApprove, failureBreakdown, failuresByConcept } from '../../web/src/domain/attempts';

const at = (number: number, stageId: string, result: AttemptSummary['result'], tipo?: NonNullable<AttemptSummary['fallo']>['tipo'], day = 14): AttemptSummary => ({
  id: `c-i${number}`, number, challengeId: 'c', stageId, stageNumber: 1, at: `2026-10-${day}T10:00:00.000Z`, apoyo: 'pistas', result, mechanism: 'codigo_assert', kind: 'code', cost: 0, folder: `intentos/00${number}-etapa-1`,
  ...(tipo ? { fallo: { tipo, resumen: 'x' } } : {}),
});
const ATTEMPTS = [
  at(1, 's1', 'fallida', 'error_python'), at(2, 's1', 'fallida', 'resultado_incorrecto'), at(3, 's1', 'aprobada'),
  at(4, 's2', 'fallida', 'error_python'), at(5, 's2', 'parcial', 'respuesta_parcial'), at(6, 's3', 'aprobada'),
  at(7, 's3', 'fallida', 'error_python', 10),
];
const challenge = { id: 'c', stages: [{ id: 's1', conceptIds: ['sql:join'] }, { id: 's2', conceptIds: ['sql:join', 'sql:cte'] }, { id: 's3', conceptIds: ['py:x'] }] } as unknown as Challenge;

describe('intentos y patrón de fallos (R54)', () => {
  it('AC-R54: los intentos de una etapa salen en orden', () => {
    expect(attemptsOfStage([ATTEMPTS[2]!, ATTEMPTS[0]!, ATTEMPTS[3]!, ATTEMPTS[1]!], 's1').map((a) => a.number)).toEqual([1, 2, 3]);
  });

  it('agrupa los fallidos por tipo, de más a menos frecuentes, y no cuenta los aprobados', () => {
    expect(failureBreakdown(ATTEMPTS)).toEqual([
      { tipo: 'error_python', count: 3 },
      { tipo: 'resultado_incorrecto', count: 1 },
      { tipo: 'respuesta_parcial', count: 1 },
    ]);
    expect(failureBreakdown([])).toEqual([]);
  });

  it('agrupa por concepto: un intento cuenta en todos los conceptos de su etapa', () => {
    expect(failuresByConcept(ATTEMPTS, [challenge])).toEqual([
      { conceptId: 'sql:join', count: 4 }, // s1 ×2 + s2 ×2
      { conceptId: 'py:x', count: 1 },
      { conceptId: 'sql:cte', count: 2 },
    ].sort((a, b) => b.count - a.count || a.conceptId.localeCompare(b.conceptId)));
    expect(failuresByConcept(ATTEMPTS, [challenge], 1)).toHaveLength(1);
  });

  it('calcula los intentos hasta aprobar solo en las etapas aprobadas', () => {
    // s1 aprobó al 3.º intento; s3 al 1.º (el fallo posterior no cuenta); s2 nunca aprobó.
    expect(attemptsToApprove(ATTEMPTS)).toEqual({ stages: 2, average: 2, max: 3 });
    expect(attemptsToApprove([at(1, 's9', 'fallida', 'error_python')])).toEqual({ stages: 0, average: 0, max: 0 });
  });

  it('filtra por el periodo', () => {
    expect(attemptsSince(ATTEMPTS, new Date('2026-10-12T00:00:00.000Z')).map((a) => a.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
