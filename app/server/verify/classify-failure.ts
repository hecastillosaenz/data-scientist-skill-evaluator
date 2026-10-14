import type { Fallo } from '../../shared/intentos';
import type { AttemptResult } from '../../shared/types';
import type { Comparison } from './compare';
import type { RunResult } from './notebook-runner';

const clip = (text: string, max = 240) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const lastLine = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
const EXCEPTION = /^[A-Za-z_][\w.]*(Error|Exception|Interrupt|Exit|Warning)\b/;

/**
 * La línea de la excepción de un traceback de Python: `KeyError: 'precio'`. Los errores de DuckDB y otros imprimen contexto
 * después (`LINE 12: …`, `^`), así que se busca desde el final la última línea con forma de excepción y, si no hay, la última.
 */
export function exceptionLine(stderr: string): string {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  return [...lines].reverse().find((l) => EXCEPTION.test(l)) ?? lastLine(stderr);
}

/**
 * Clasifica por qué no pasó una etapa de código (SDD R52), con lo que ejecutó el orquestador: la excepción de Python, la
 * diferencia de tablas, el assert o el tiempo. Devuelve `undefined` si pasó.
 */
export function classifyCodeFailure(input: { passed: boolean; run: RunResult; comparison: Comparison | null }): Fallo | undefined {
  const { passed, run, comparison } = input;
  if (passed) return undefined;
  if (run.timedOut) return { tipo: 'tiempo_agotado', resumen: 'La celda superó el tiempo máximo (30 s) y se cortó.' };
  if (run.harnessError) return { tipo: 'sin_resultado', resumen: clip(run.harnessError) };
  if (run.exitCode !== 0) {
    const last = exceptionLine(run.stderr);
    if (/^AssertionError\b/.test(last)) return { tipo: 'assert_fallido', resumen: clip(last) };
    return { tipo: 'error_python', resumen: clip(last || `La celda terminó con código ${run.exitCode}.`) };
  }
  if (comparison && !comparison.match) {
    const extra = comparison.problems.length - 1;
    return { tipo: 'resultado_incorrecto', resumen: clip(`${comparison.problems[0]}${extra > 0 ? ` (y ${extra} diferencia${extra === 1 ? '' : 's'} más)` : ''}`) };
  }
  return { tipo: 'assert_fallido', resumen: 'La celda no pasó las comprobaciones de la etapa.' };
}

/** Fallo de una etapa conceptual: lo decide el veredicto del Evaluador (R52). */
export function classifyConceptualFailure(status: AttemptResult, summary: string): Fallo | undefined {
  if (status === 'aprobada') return undefined;
  return { tipo: status === 'parcial' ? 'respuesta_parcial' : 'respuesta_incorrecta', resumen: clip(summary) };
}
