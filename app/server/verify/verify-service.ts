import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Apoyo, AttemptResult, Challenge, Stage } from '../../shared/types';
import type { VerifyEvent } from '../../shared/verify';
import { AgentError, hasClaude as defaultHasClaude, runAgent as defaultRunAgent, type AgentRunOptions } from '../agents/agent-runner';
import { DatasetError, findChallenge, prepareDataset } from '../challenges/challenge-fs';
import { compareTables, type Comparison } from './compare';
import { codeMessage, conceptualMessage, evaluatorSystem, parseVerdict } from './evaluator-prompts';
import { NotebookError, dataCells, findDeliverable, markdownAnswer, parseNotebook } from './notebook-parser';
import { runPython, type RunResult } from './notebook-runner';

export interface VerifyDeps {
  runAgent: typeof defaultRunAgent;
  hasClaude: () => boolean;
  /** Intérprete Python con el que se ejecutan las celdas (por defecto `.venv/bin/python` del repo). */
  python?: string;
}

export interface VerifyParams {
  repoRoot: string;
  challengeId: string;
  stageNumber: number;
  apoyo: Apoyo;
  signal?: AbortSignal;
  deps?: Partial<VerifyDeps>;
}

const defaults: VerifyDeps = { runAgent: defaultRunAgent, hasClaude: () => defaultHasClaude() };
const pythonOf = (repoRoot: string, deps?: Partial<VerifyDeps>) => deps?.python ?? path.join(repoRoot, '.venv', 'bin', 'python');

const step = (id: string, label: string, status: 'running' | 'ok' | 'error', detail?: string): VerifyEvent => ({
  type: 'step', id, label, status, ...(detail ? { detail } : {}),
});

/** Resumen de un fallo: la diferencia concreta, o la última línea del error de Python. */
function failureSummary(comparison: Comparison | null, run: RunResult): string {
  if (comparison && !comparison.match) return comparison.problems[0]!;
  if (run.timedOut) return 'Tu celda superó el tiempo máximo (30 s) y se cortó.';
  if (run.harnessError) return run.harnessError;
  const lastError = run.stderr.split('\n').map((l) => l.trim()).filter(Boolean).at(-1);
  return lastError ? `Tu celda terminó con un error: ${lastError}` : 'La celda no pasó las comprobaciones.';
}

/** Feedback determinista para cuando el agente no está disponible: el resultado no depende de él. */
function fallbackFeedback(passed: boolean, comparison: Comparison | null, run: RunResult): string {
  if (passed) return 'Tu celda pasó todas las comprobaciones.';
  const lines: string[] = [];
  if (run.timedOut) lines.push('La celda superó el tiempo máximo y se cortó.');
  else if (run.harnessError) lines.push(run.harnessError);
  else if (run.exitCode !== 0) lines.push('La celda terminó con un error. Revisa la salida de errores.');
  if (comparison && !comparison.match) lines.push(...comparison.problems);
  return lines.map((l) => `- ${l}`).join('\n') || 'Tu celda no pasó las comprobaciones.';
}

/**
 * Orquesta la verificación de una etapa y emite eventos en vivo (SDD R26):
 * cargar → datos → celda → ejecución → comparación → análisis del agente → resultado.
 * La ejecución del código la hace el orquestador (R27); el agente es de solo lectura y solo redacta el feedback (R9).
 */
export async function* verifyStage(params: VerifyParams): AsyncGenerator<VerifyEvent> {
  const { repoRoot, challengeId, stageNumber, apoyo, signal } = params;
  const deps = { ...defaults, ...params.deps };
  const aborted = () => signal?.aborted === true;
  const cancelled = (): VerifyEvent => ({ type: 'error', message: 'Verificación cancelada.', code: 'aborted' });

  yield step('load', 'Cargando el challenge', 'running');
  const found = await findChallenge(repoRoot, challengeId);
  const stage = found?.challenge.stages.find((s) => s.number === stageNumber);
  if (!found || !stage) {
    yield step('load', 'Cargando el challenge', 'error', 'No existe');
    yield { type: 'error', code: 'not_found', message: `No encontré la etapa ${stageNumber} del challenge «${challengeId}» en el repositorio.` };
    return;
  }
  const { dir, challenge } = found;
  yield step('load', 'Cargando el challenge', 'ok', `${challenge.title} · Etapa ${stage.number}`);

  const isCode = stage.mechanism === 'codigo_assert';

  // Datos (R24): la base se reconstruye desde el seed en cada verificación.
  if (isCode && challenge.data?.seedSql) {
    yield step('data', 'Preparando los datos del challenge', 'running');
    try {
      await prepareDataset({ dir, python: pythonOf(repoRoot, params.deps), ...(signal ? { signal } : {}) });
      yield step('data', 'Preparando los datos del challenge', 'ok', 'datos/challenge.duckdb reconstruida desde el seed');
    } catch (err) {
      if (aborted()) return void (yield cancelled());
      const message = err instanceof DatasetError ? err.message : (err as Error).message;
      yield step('data', 'Preparando los datos del challenge', 'error', message);
      yield { type: 'error', code: 'dataset', message };
      return;
    }
  }

  // Celda entregable (R8, R16).
  const marker = `# Entregable - Etapa ${stage.number}:`;
  yield step('cell', `Buscando la celda «${marker}» en tu notebook`, 'running');
  let source: ReturnType<typeof findDeliverable>;
  let cells: ReturnType<typeof parseNotebook>;
  try {
    cells = parseNotebook(await readFile(path.join(dir, 'notebook.ipynb'), 'utf8'));
    source = findDeliverable(cells, stage.number);
  } catch (err) {
    const message = err instanceof NotebookError ? err.message : `No pude leer notebook.ipynb en ${path.basename(dir)}/.`;
    yield step('cell', `Buscando la celda «${marker}» en tu notebook`, 'error', message);
    yield { type: 'error', code: err instanceof NotebookError ? err.code : 'notebook', message };
    return;
  }
  yield step('cell', `Buscando la celda «${marker}» en tu notebook`, 'ok', `Celda ${source.kind === 'code' ? 'de código' : 'de texto'} de ${source.source.split('\n').length} líneas`);

  if (!isCode) {
    yield* evaluateConceptual({ challenge, stage, apoyo, answer: markdownAnswer(source.source), dir, deps, signal });
    return;
  }

  // Ejecución de la celda (R27).
  yield step('run', 'Ejecutando tu celda en Python', 'running');
  const expected = stage.content.expected;
  const run = await runPython({
    python: pythonOf(repoRoot, params.deps),
    cwd: dir,
    dataCells: dataCells(cells),
    deliverable: source.source,
    ...(stage.content.asserts ? { asserts: stage.content.asserts } : {}),
    captureResult: !!expected,
    ...(signal ? { signal } : {}),
  }).catch((err: Error) => {
    if (aborted()) return null;
    throw err;
  });
  if (!run) return void (yield cancelled());
  if (run.stdout) yield { type: 'output', stream: 'stdout', text: run.stdout };
  if (run.stderr) yield { type: 'output', stream: 'stderr', text: run.stderr };
  if (run.truncated) yield { type: 'output', stream: 'stderr', text: '… salida recortada por tamaño.' };
  const ranOk = run.exitCode === 0 && !run.timedOut && !run.harnessError;
  yield step(
    'run',
    'Ejecutando tu celda en Python',
    ranOk ? 'ok' : 'error',
    run.timedOut ? 'Superó el tiempo máximo (30 s) y se cortó' : run.harnessError ?? (ranOk ? `Terminó en ${(run.durationMs / 1000).toFixed(1)} s` : `Terminó con error (código ${run.exitCode})`),
  );

  // Comparación con lo esperado.
  yield step('compare', expected ? 'Comparando con el resultado esperado' : 'Comprobando los asserts de la etapa', 'running');
  let comparison: Comparison | null = null;
  if (ranOk && expected && run.table) comparison = compareTables(expected, run.table);
  const passed = ranOk && (expected ? comparison?.match === true : true);
  yield step(
    'compare',
    expected ? 'Comparando con el resultado esperado' : 'Comprobando los asserts de la etapa',
    passed ? 'ok' : 'error',
    passed ? (expected ? 'Las filas coinciden con la tabla esperada' : 'Todos los asserts pasaron') : comparison && !comparison.match ? comparison.problems[0] : 'Omitido: tu celda no terminó correctamente, así que no hay resultado que comparar',
  );

  // Análisis del agente (solo lectura): redacta feedback, no decide el veredicto.
  let feedback = '';
  let cost = 0;
  yield step('agent', 'Analizando tu resultado con el Evaluador', 'running');
  if (!deps.hasClaude()) {
    feedback = fallbackFeedback(passed, comparison, run);
    yield step('agent', 'Analizando tu resultado con el Evaluador', 'error', 'Claude Code no está disponible: te muestro solo la comprobación automática');
    yield { type: 'feedback', text: feedback };
  } else {
    try {
      const events: VerifyEvent[] = [];
      const result = await deps.runAgent({
        message: codeMessage({ challenge, stage, apoyo, code: source.source, run, comparison, passed }),
        system: evaluatorSystem(),
        addDirs: [dir],
        ...(signal ? { signal } : {}),
        onEvent: (e) => events.push(e.type === 'tool' ? { type: 'tool', text: e.text } : { type: 'feedback', text: e.text }),
      } satisfies AgentRunOptions);
      for (const e of events) yield e;
      feedback = result.text;
      cost = result.cost;
      yield step('agent', 'Analizando tu resultado con el Evaluador', 'ok');
    } catch (err) {
      if (err instanceof AgentError && err.code === 'aborted') return void (yield cancelled());
      feedback = fallbackFeedback(passed, comparison, run);
      yield step('agent', 'Analizando tu resultado con el Evaluador', 'error', (err as Error).message);
      yield { type: 'feedback', text: feedback };
    }
  }

  const status: AttemptResult = passed ? 'aprobada' : 'fallida';
  yield { type: 'result', status, summary: passed ? `Etapa ${stage.number} verificada: pasó todas las comprobaciones.` : failureSummary(comparison, run) };
  yield { type: 'done', cost };
}

async function* evaluateConceptual(input: {
  challenge: Challenge;
  stage: Stage;
  apoyo: Apoyo;
  answer: string;
  dir: string;
  deps: VerifyDeps;
  signal: AbortSignal | undefined;
}): AsyncGenerator<VerifyEvent> {
  const { challenge, stage, apoyo, answer, dir, deps, signal } = input;
  if (!answer) {
    yield { type: 'error', code: 'respuesta_vacia', message: `La celda «# Entregable - Etapa ${stage.number}:» está vacía. Escribe tu respuesta debajo del encabezado y vuelve a verificar.` };
    return;
  }
  if (!deps.hasClaude()) {
    yield step('agent', 'Evaluando tu respuesta con la rúbrica', 'error', 'Claude Code no está instalado');
    yield { type: 'error', code: 'no_claude', message: 'No encuentro Claude Code. Instálalo y ejecuta «claude» una vez en una terminal para iniciar sesión; las etapas conceptuales necesitan al Evaluador.' };
    return;
  }
  yield step('agent', 'Evaluando tu respuesta con la rúbrica', 'running');
  try {
    const events: VerifyEvent[] = [];
    const result = await deps.runAgent({
      message: conceptualMessage({ challenge, stage, apoyo, answer }),
      system: evaluatorSystem(),
      addDirs: [dir],
      ...(signal ? { signal } : {}),
      onEvent: (e) => events.push(e.type === 'tool' ? { type: 'tool', text: e.text } : { type: 'feedback', text: e.text }),
    });
    const verdict = parseVerdict(result.text);
    for (const e of events) {
      if (e.type === 'feedback') {
        const cleaned = parseVerdict(e.text).feedback;
        if (cleaned) yield { type: 'feedback', text: cleaned };
      } else yield e;
    }
    yield step('agent', 'Evaluando tu respuesta con la rúbrica', 'ok', verdict.found ? undefined : 'El Evaluador no indicó veredicto: se marcó como parcial');
    yield { type: 'result', status: verdict.status, summary: verdict.status === 'aprobada' ? 'Respuesta correcta.' : verdict.status === 'parcial' ? 'Respuesta parcial: revisa el feedback.' : 'La respuesta no cumple los criterios.' };
    yield { type: 'done', cost: result.cost };
  } catch (err) {
    if (err instanceof AgentError && err.code === 'aborted') return void (yield { type: 'error', message: 'Verificación cancelada.', code: 'aborted' });
    yield step('agent', 'Evaluando tu respuesta con la rúbrica', 'error', (err as Error).message);
    yield { type: 'error', code: 'agent', message: (err as Error).message };
  }
}
