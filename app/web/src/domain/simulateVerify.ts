import type { Apoyo, Stage } from '../../../shared/types';
import type { VerifyEvent } from '../../../shared/verify';
import { simulateCodeVerification, simulateConceptEvaluation } from './simulate';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('cancelada', 'AbortError'));
    }, { once: true });
  });

/**
 * Verificación SIMULADA para los challenges de ejemplo (no hay notebook ni agente detrás): emite los mismos eventos que
 * el orquestador real para que la ventana se vea y se comporte igual. Los challenges reales usan el endpoint de verdad.
 */
export async function* simulateVerification(opts: {
  stage: Stage;
  apoyo: Apoyo;
  priorAttempts: number;
  answer: string;
  delayMs?: number;
  signal?: AbortSignal;
}): AsyncGenerator<VerifyEvent> {
  const { stage, priorAttempts, answer, signal } = opts;
  const d = opts.delayMs ?? 450;
  const isCode = stage.mechanism === 'codigo_assert';
  const marker = `# Entregable - Etapa ${stage.number}:`;

  try {
    yield { type: 'step', id: 'load', label: 'Cargando el challenge', status: 'running' };
    await wait(d, signal);
    yield { type: 'step', id: 'load', label: 'Cargando el challenge', status: 'ok', detail: 'Datos de ejemplo' };
    yield { type: 'step', id: 'cell', label: `Buscando la celda «${marker}» en tu notebook`, status: 'running' };
    await wait(d, signal);
    yield { type: 'step', id: 'cell', label: `Buscando la celda «${marker}» en tu notebook`, status: 'ok', detail: 'Simulado: este challenge no tiene notebook' };

    if (isCode) {
      const sim = simulateCodeVerification(stage.number, priorAttempts);
      yield { type: 'step', id: 'run', label: 'Ejecutando tu celda en Python', status: 'running' };
      await wait(d, signal);
      yield { type: 'step', id: 'run', label: 'Ejecutando tu celda en Python', status: 'ok', detail: 'Terminó en 0.4 s' };
      yield { type: 'step', id: 'compare', label: 'Comparando con el resultado esperado', status: 'running' };
      await wait(d, signal);
      const passed = sim.status === 'aprobada';
      yield { type: 'step', id: 'compare', label: 'Comparando con el resultado esperado', status: passed ? 'ok' : 'error', detail: passed ? 'Las filas coinciden con la tabla esperada' : sim.detail };
      yield { type: 'step', id: 'agent', label: 'Analizando tu resultado con el Evaluador', status: 'running' };
      yield { type: 'tool', text: 'Read notebook.ipynb' };
      await wait(d, signal);
      yield { type: 'feedback', text: passed ? '¡Bien! Tu celda pasó todas las comprobaciones.' : `${sim.detail}\n\nRevisa el paso que produce esas filas y vuelve a verificar.` };
      yield { type: 'step', id: 'agent', label: 'Analizando tu resultado con el Evaluador', status: 'ok' };
      yield { type: 'result', status: sim.status, summary: sim.detail };
    } else {
      const sim = simulateConceptEvaluation(answer);
      yield { type: 'step', id: 'agent', label: 'Evaluando tu respuesta con la rúbrica', status: 'running' };
      await wait(d, signal);
      if (!sim) {
        yield { type: 'error', code: 'respuesta_vacia', message: 'Escribe tu respuesta antes de evaluarla.' };
        return;
      }
      yield { type: 'feedback', text: sim.detail };
      yield { type: 'step', id: 'agent', label: 'Evaluando tu respuesta con la rúbrica', status: 'ok' };
      yield { type: 'result', status: sim.status, summary: sim.status === 'aprobada' ? 'Respuesta correcta.' : 'Respuesta parcial: revisa el feedback.' };
    }
    yield { type: 'done', cost: 0 };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      yield { type: 'error', code: 'aborted', message: 'Verificación cancelada.' };
      return;
    }
    throw err;
  }
}
