import { AgentError, hasClaude as defaultHasClaude, runAgent as defaultRunAgent } from '../agents/agent-runner';
import { extractJson } from '../agents/json';
import { loadCalibration } from '../generator/calibration';
import { GraphError, readGraph, writeGraph } from '../persistence/graph-store';
import { readState } from '../persistence/state';
import { AnalysisInvalidError, applyAnalysis, markOmitted, shouldAnalyze, type AnalysisApplied, type Discarded } from './apply';
import { analystMessage, analystRepair, analystSystem } from './prompts';
import type { Observation } from '../../shared/types';

export interface AnalystDeps {
  runAgent: typeof defaultRunAgent;
  hasClaude: () => boolean;
  now?: () => Date;
}

export type AnalysisErrorCode = 'budget' | 'invalid_output' | 'no_claude' | 'not_found' | 'graph' | 'internal';

export type AnalysisOutcome =
  | { status: 'ya_analizada' }
  | { status: 'omitida' }
  | { status: 'ok' | 'sin_hallazgos'; observation: Observation; applied: AnalysisApplied; discarded: Discarded[]; cost: number }
  | { status: 'error'; code: AnalysisErrorCode; message: string };

const defaults: AnalystDeps = { runAgent: defaultRunAgent, hasClaude: () => defaultHasClaude() };

/** Cola por repositorio: leer-modificar-escribir el grafo una operación a la vez (S6) sin perder cambios. */
const locks = new Map<string, Promise<unknown>>();
function withGraphLock<T>(repoRoot: string, job: () => Promise<T>): Promise<T> {
  const run = (locks.get(repoRoot) ?? Promise.resolve()).then(job, job);
  locks.set(repoRoot, run.catch(() => {}));
  return run;
}

/**
 * Procesa una Evidence (SDD R12, R41, R42): sin notas ni bloqueo la registra como omitida sin llamar al agente; con ellos,
 * el Analista (solo lectura) propone y el orquestador aplica lo que cumple las reglas, de forma atómica y con copia `.prev`.
 * Si algo falla no se aplica nada: la Evidence ya está guardada y queda pendiente de análisis.
 */
export async function analyzeEvidence(params: { repoRoot: string; evidenceId: string; signal?: AbortSignal; deps?: Partial<AnalystDeps> }): Promise<AnalysisOutcome> {
  const { repoRoot, evidenceId, signal } = params;
  const deps = { ...defaults, ...params.deps };
  const now = () => (deps.now ?? (() => new Date()))().toISOString();

  try {
    const state = await readState({ repoRoot, strict: true });
    const evidence = state.data.evidence.find((e) => e.id === evidenceId);
    const challenge = evidence && state.data.challenges.find((c) => c.id === evidence.challengeId);
    const stage = evidence && challenge?.stages.find((s) => s.id === evidence.stageId);
    if (!evidence || !challenge || !stage) return { status: 'error', code: 'not_found', message: `No encontré la Evidence «${evidenceId}» ni su etapa.` };

    // Sin nada que analizar (o ya analizada): se resuelve sin agente.
    const quick = await withGraphLock(repoRoot, async (): Promise<AnalysisOutcome | null> => {
      const graph = await readGraph(repoRoot);
      if (graph.observations?.some((o) => o.evidenceId === evidenceId)) return { status: 'ya_analizada' };
      if (shouldAnalyze(evidence)) return null;
      await writeGraph(repoRoot, markOmitted(graph, evidenceId, now()), { backup: true });
      return { status: 'omitida' };
    });
    if (quick) return quick;

    if (!deps.hasClaude()) return { status: 'error', code: 'no_claude', message: 'No encuentro Claude Code: el registro queda pendiente de análisis.' };
    const config = await loadCalibration(repoRoot);
    const graph = await readGraph(repoRoot);
    const message = analystMessage({ challenge, stage, evidence, concepts: graph.concepts, observations: graph.observations ?? [], candidates: graph.candidates ?? [] });

    let spent = 0;
    let previous = '';
    let problem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = config.presupuestoUsdAnalisis - spent;
      if (remaining < 0.02) return { status: 'error', code: 'budget', message: `Se agotó el presupuesto del análisis (US$ ${config.presupuestoUsdAnalisis}). El registro queda pendiente.` };
      let text: string;
      try {
        const result = await deps.runAgent({
          message: attempt === 0 ? message : analystRepair(message, previous, problem),
          system: analystSystem(),
          maxUsd: Math.round(remaining * 100) / 100,
          ...(signal ? { signal } : {}),
        });
        spent += result.cost;
        text = result.text;
      } catch (err) {
        if (err instanceof AgentError && err.code === 'budget') return { status: 'error', code: 'budget', message: `Se agotó el presupuesto del análisis (US$ ${config.presupuestoUsdAnalisis}). El registro queda pendiente.` };
        if (err instanceof AgentError && err.code === 'no_claude') return { status: 'error', code: 'no_claude', message: err.message };
        return { status: 'error', code: 'internal', message: (err as Error).message };
      }
      previous = text;
      const json = extractJson(text);
      if (!json.ok) {
        problem = json.error;
        continue;
      }

      // Se aplica sobre el grafo más reciente, dentro del candado (otro análisis pudo escribir mientras el agente pensaba).
      const outcome = await withGraphLock(repoRoot, async (): Promise<AnalysisOutcome | { retry: string }> => {
        const fresh = await readGraph(repoRoot);
        let result;
        try {
          result = applyAnalysis(fresh, { evidence, proposal: json.value, now: now() });
        } catch (err) {
          if (err instanceof AnalysisInvalidError) return { retry: err.message };
          throw err;
        }
        if (result.duplicate) return { status: 'ya_analizada' };
        await writeGraph(repoRoot, result.graph, { backup: true });
        return { status: result.observation.status === 'ok' ? 'ok' : 'sin_hallazgos', observation: result.observation, applied: result.applied, discarded: result.discarded, cost: spent };
      });
      if ('retry' in outcome) {
        problem = outcome.retry;
        continue;
      }
      return outcome;
    }
    return { status: 'error', code: 'invalid_output', message: `El Analista no produjo una propuesta válida: ${problem}. El registro queda pendiente.` };
  } catch (err) {
    if (err instanceof GraphError) return { status: 'error', code: 'graph', message: err.message };
    return { status: 'error', code: 'internal', message: (err as Error).message };
  }
}

/**
 * Cola serial en segundo plano (R12): analiza una Evidence a la vez, sin bloquear nada más. Lo que falla se recuerda
 * (con su motivo) pero no se reintenta solo; «Analizar ahora» lo vuelve a encolar.
 */
export class AnalystQueue {
  private queue: string[] = [];
  private current: string | null = null;
  private pump: Promise<void> | null = null;
  readonly failed = new Map<string, string>();

  constructor(
    private readonly run: (evidenceId: string) => Promise<AnalysisOutcome>,
    private readonly onSettled?: (evidenceId: string, outcome: AnalysisOutcome) => void,
  ) {}

  enqueue(evidenceId: string): void {
    if (this.current === evidenceId || this.queue.includes(evidenceId)) return;
    this.queue.push(evidenceId);
    this.failed.delete(evidenceId);
    this.pump ??= this.drain();
  }

  status(): { running: string | null; queued: string[]; failed: Record<string, string> } {
    return { running: this.current, queued: [...this.queue], failed: Object.fromEntries(this.failed) };
  }

  /** Espera a que la cola quede vacía (para tests y cierres ordenados). */
  async idle(): Promise<void> {
    while (this.pump) await this.pump;
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift()!;
        this.current = id;
        let outcome: AnalysisOutcome;
        try {
          outcome = await this.run(id);
        } catch (err) {
          outcome = { status: 'error', code: 'internal', message: (err as Error).message };
        }
        if (outcome.status === 'error') this.failed.set(id, outcome.message);
        this.current = null;
        this.onSettled?.(id, outcome);
      }
    } finally {
      this.current = null;
      this.pump = null;
    }
  }
}
