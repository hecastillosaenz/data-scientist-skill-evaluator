import { describe, expect, it } from 'vitest';
import { initialHelp, toggleHint, toggleSolution } from '../../web/src/domain/stageHelp';

describe('ayudas de la etapa', () => {
  it('la pista se puede mostrar y ocultar', () => {
    const shown = toggleHint(initialHelp);
    expect(shown.hintVisible).toBe(true);
    expect(toggleHint(shown).hintVisible).toBe(false);
  });

  it('abrir la solución la marca como abierta y visible', () => {
    expect(toggleSolution(initialHelp)).toMatchObject({ solutionOpened: true, solutionVisible: true });
  });

  it('ocultar la solución NO borra «Con ayuda» (R7)', () => {
    const hidden = toggleSolution(toggleSolution(initialHelp));
    expect(hidden).toMatchObject({ solutionOpened: true, solutionVisible: false });
    expect(toggleSolution(hidden)).toMatchObject({ solutionOpened: true, solutionVisible: true });
  });

  it('ocultar la pista no afecta a la solución', () => {
    const s = toggleHint(toggleSolution(initialHelp));
    expect(s.solutionOpened).toBe(true);
    expect(toggleHint(s).solutionOpened).toBe(true);
  });
});
