import type { Apoyo, AttemptResult, Blocker, Evidence } from '../../../../shared/types';

type Opts = { help?: boolean; apoyo?: Apoyo; blocker?: Blocker; notes?: string };

/** [challenge, stage, hace N días, resultado, minutos reales, opciones] */
type Row = [number, number, number, AttemptResult, number, Opts?];

const A = 'aprobada';
const F = 'fallida';
const P = 'parcial';

const ROWS: Row[] = [
  [1, 1, 41, A, 14, { apoyo: 'guiado' }],
  [1, 2, 40, A, 26, { apoyo: 'guiado' }],
  [1, 3, 38, A, 17, { apoyo: 'guiado' }],
  [2, 1, 36, A, 24, { apoyo: 'guiado' }],
  [2, 2, 35, F, 31, { apoyo: 'guiado', blocker: 'sintaxis', notes: 'Confundí drop_duplicates con subset.' }],
  [2, 2, 35, A, 18, { apoyo: 'pistas', help: true }],
  [2, 3, 33, A, 22, { apoyo: 'pistas' }],
  [3, 1, 30, F, 46, { apoyo: 'pistas', blocker: 'concepto', notes: 'No tenía claro cómo agrupar por mes de alta.' }],
  [3, 1, 29, A, 34, { apoyo: 'pistas' }],
  [3, 2, 27, A, 38, { apoyo: 'pistas' }],
  [3, 3, 27, P, 26, { apoyo: 'pistas', notes: 'Faltó contrastar canal pagado vs. orgánico.' }],
  [3, 3, 26, A, 21, { apoyo: 'pistas' }],
  [4, 1, 25, A, 33, { apoyo: 'pistas' }],
  [4, 2, 24, F, 52, { apoyo: 'pistas', blocker: 'concepto', notes: 'No entendí bien la regularización.' }],
  [4, 2, 22, A, 40, { apoyo: 'pistas', help: true }],
  [4, 3, 21, F, 44, { apoyo: 'autonomo', blocker: 'tiempo' }],
  [4, 3, 19, F, 38, { apoyo: 'autonomo', blocker: 'concepto', notes: 'Sigo mezclando precisión y recall.' }],
  [4, 4, 18, P, 27, { apoyo: 'pistas' }],
  [4, 4, 17, A, 24, { apoyo: 'pistas' }],
  [5, 1, 17, A, 36, { apoyo: 'pistas' }],
  [5, 2, 16, F, 41, { apoyo: 'autonomo', blocker: 'concepto', notes: 'Duda entre prueba t y prueba z.' }],
  [5, 2, 14, A, 35, { apoyo: 'pistas' }],
  [5, 3, 13, A, 22, { apoyo: 'pistas' }],
  [6, 1, 5, A, 31, { apoyo: 'pistas' }],
  [6, 2, 4, F, 48, { apoyo: 'pistas', blocker: 'sintaxis' }],
  [6, 2, 3, A, 36, { apoyo: 'pistas' }],
  [6, 3, 2, F, 41, { apoyo: 'autonomo', blocker: 'enfoque', notes: 'No supe por dónde empezar el perfil.' }],
  [6, 3, 1, F, 37, { apoyo: 'pistas', blocker: 'concepto' }],
  [6, 3, 0, P, 29, { apoyo: 'pistas', help: true }],
];

export function buildEvidence(now: Date): Evidence[] {
  return ROWS.map(([ch, st, daysAgo, result, minutes, opts], i) => {
    const at = new Date(now.getTime() - daysAgo * 86_400_000);
    at.setHours(9 + (i % 9), (i * 17) % 60, 0, 0);
    if (at > now) at.setTime(now.getTime() - 60_000 * (i + 1));
    const challengeId = `c${String(ch).padStart(3, '0')}`;
    return {
      id: `ev-${String(i + 1).padStart(3, '0')}`,
      challengeId,
      stageId: `${challengeId}-s${st}`,
      at: at.toISOString(),
      result,
      withHelp: opts?.help ?? false,
      apoyo: opts?.apoyo ?? 'pistas',
      actualMinutes: minutes,
      ...(opts?.blocker ? { blocker: opts.blocker } : {}),
      ...(opts?.notes ? { notes: opts.notes } : {}),
    };
  });
}
