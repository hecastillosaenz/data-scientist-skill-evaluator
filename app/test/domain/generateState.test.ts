import { describe, expect, it } from 'vitest';
import { cancelledGenerate, interruptedGenerate, PHASE_LABEL, reduceGenerate, startedGenerate } from '../../web/src/domain/generateState';
import type { GenerateEvent } from '../../shared/generate';

const play = (events: GenerateEvent[]) => events.reduce(reduceGenerate, startedGenerate());

describe('estado del diálogo de generación (R39)', () => {
  it('una generación completa termina con resultado y costo', () => {
    const s = play([
      { type: 'step', id: 'plan', label: 'Plan', status: 'running' },
      { type: 'step', id: 'plan', label: 'Plan', status: 'ok', detail: '3 etapas' },
      { type: 'step', id: 'esqueleto', label: 'Diseño', status: 'running' },
      { type: 'tool', text: 'Read contrato-generador.md' },
      { type: 'step', id: 'esqueleto', label: 'Diseño', status: 'ok' },
      { type: 'result', challengeId: 'challenge-002', title: 'Ventas' },
      { type: 'done', cost: 1.25 },
    ]);
    expect(s.phase).toBe('done');
    expect(s.steps.map((x) => [x.id, x.status])).toEqual([['plan', 'ok'], ['esqueleto', 'ok']]);
    expect(s.steps[0]!.detail).toBe('3 etapas');
    expect(s.tools).toEqual(['Read contrato-generador.md']);
    expect(s).toMatchObject({ result: { challengeId: 'challenge-002' }, cost: 1.25 });
  });

  it('un error de presupuesto marca la fase en curso como fallida y permite reintentar', () => {
    const s = play([
      { type: 'step', id: 'etapa-2', label: 'Etapa 2', status: 'running' },
      { type: 'error', code: 'budget', phase: 'etapa-2', message: 'Se agotó', canResume: true },
    ]);
    expect(s.phase).toBe('error');
    expect(s.steps[0]!.status).toBe('error');
    expect(s.error).toEqual({ code: 'budget', phase: 'etapa-2', message: 'Se agotó', canResume: true });
  });

  it('abortar es «cancelada», no error', () => {
    expect(play([{ type: 'error', code: 'aborted', message: 'Cancelada' }]).phase).toBe('cancelled');
    const c = cancelledGenerate(startedGenerate());
    expect(c.phase).toBe('cancelled');
    expect(c.error!.canResume).toBe(false);
  });

  it('un corte de conexión sin done ni error se reporta y es reintentable', () => {
    const s = interruptedGenerate(play([{ type: 'step', id: 'plan', label: 'Plan', status: 'running' }]));
    expect(s.phase).toBe('error');
    expect(s.error).toMatchObject({ code: 'internal', canResume: true });
    expect(interruptedGenerate(play([{ type: 'done', cost: 0 }])).phase).toBe('done');
  });

  it('solo conserva las últimas lecturas del agente', () => {
    const s = play(Array.from({ length: 12 }, (_, i): GenerateEvent => ({ type: 'tool', text: `Read ${i}` })));
    expect(s.tools).toHaveLength(8);
    expect(s.tools.at(-1)).toBe('Read 11');
  });

  it('PHASE_LABEL nombra la fase en español', () => {
    expect(PHASE_LABEL('etapa-3')).toBe('la etapa 3');
    expect(PHASE_LABEL('esqueleto')).toBe('el diseño del caso');
    expect(PHASE_LABEL(undefined)).toBe('la generación');
  });
});
