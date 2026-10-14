/**
 * Estado de las ayudas de una etapa. Ocultar la pista o la solución solo cambia lo visible:
 * `solutionOpened` es permanente (R7: abrir la solución marca el intento «Con ayuda» pase lo que pase después).
 */
export interface HelpState {
  hintVisible: boolean;
  solutionOpened: boolean;
  solutionVisible: boolean;
}

export const initialHelp: HelpState = { hintVisible: false, solutionOpened: false, solutionVisible: false };

export const toggleHint = (s: HelpState): HelpState => ({ ...s, hintVisible: !s.hintVisible });

export const toggleSolution = (s: HelpState): HelpState =>
  s.solutionOpened
    ? { ...s, solutionVisible: !s.solutionVisible }
    : { ...s, solutionOpened: true, solutionVisible: true };
