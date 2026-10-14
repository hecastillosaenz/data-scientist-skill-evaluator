import type { FastifyInstance } from 'fastify';
import { AGENT_ROLES, type AgentesPayload, type AgentStatus } from '../../shared/agentes';
import { CalibrationError, loadCalibration } from '../generator/calibration';
import { GraphError, readGraph } from '../persistence/graph-store';
import { purgeRuns, readRun, readRuns, summarize, type RunRecord } from './registro';

const LIMIT = 200;
const FAILED = new Set(['error', 'presupuesto', 'interrumpida']);

export interface AgentRoutesOptions {
  repoRoot: string;
  now?: () => Date;
}

/** Cada cuánto se purga el registro como mucho (R46): al leerlo, sin tareas en segundo plano. */
let lastPurgeAt = 0;

/**
 * Lectura del registro de agentes (SDD R46–R48). Solo lectura: ninguna ruta lanza ni reintenta una ejecución.
 * `GET /api/agentes` trae estado, línea de tiempo, últimos análisis y errores; el detalle de una ejecución se pide aparte.
 */
export function registerAgentRoutes(app: FastifyInstance, opts: AgentRoutesOptions): void {
  const now = opts.now ?? (() => new Date());

  app.get('/api/agentes', async (_req, reply): Promise<AgentesPayload | undefined> => {
    let days = 30;
    try {
      days = (await loadCalibration(opts.repoRoot)).diasRegistroAgentes;
    } catch (err) {
      if (!(err instanceof CalibrationError)) throw err;
    }
    if (now().getTime() - lastPurgeAt > 3_600_000) {
      lastPurgeAt = now().getTime();
      await purgeRuns(opts.repoRoot, days, now()).catch(() => {});
    }

    const runs = await readRuns(opts.repoRoot);
    const midnight = new Date(now());
    midnight.setHours(0, 0, 0, 0);
    const agentes: AgentStatus[] = AGENT_ROLES.map((rol) => {
      const mine = runs.filter((r) => r.rol === rol);
      return {
        rol,
        enCurso: mine.some((r) => r.outcome === 'en_curso'),
        ultima: mine[0] ? summarize(mine[0]) : null,
        costoHoy: round(mine.filter((r) => Date.parse(r.startedAt) >= midnight.getTime()).reduce((sum, r) => sum + r.cost, 0)),
        costoTotal: round(mine.reduce((sum, r) => sum + r.cost, 0)),
        ejecuciones: mine.length,
        errores: mine.filter((r) => FAILED.has(r.outcome)).length,
      };
    });

    let analisis: AgentesPayload['analisis'] = [];
    let conceptosCreados: AgentesPayload['conceptosCreados'] = [];
    try {
      const graph = await readGraph(opts.repoRoot);
      const analystRuns = runs.filter((r) => r.rol === 'analista');
      analisis = (graph.observations ?? [])
        .filter((o) => o.status !== 'omitida')
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 10)
        .map((observation) => {
          const run = analystRuns.find((r) => r.evidenceId === observation.evidenceId);
          return { observation, challengeId: run?.challengeId ?? null, runId: run?.id ?? null };
        });
      conceptosCreados = graph.concepts
        .filter((c) => c.origin === 'analista' && c.since)
        .sort((a, b) => b.since!.localeCompare(a.since!))
        .slice(0, 5)
        .map((c) => ({ id: c.id, name: c.name, since: c.since! }));
    } catch (err) {
      // Un grafo ilegible no debe esconder el monitoreo: la sección de análisis queda vacía.
      if (!(err instanceof GraphError)) throw err;
    }

    return {
      agentes,
      ejecuciones: runs.slice(0, LIMIT).map(summarize),
      analisis,
      conceptosCreados,
      errores: runs.filter((r) => FAILED.has(r.outcome)).slice(0, 10).map(summarize),
      retencionDias: days,
      total: runs.length,
    };
  });

  app.get<{ Params: { id: string } }>('/api/agentes/ejecuciones/:id', async (req, reply): Promise<RunRecord | undefined> => {
    const run = await readRun(opts.repoRoot, req.params.id);
    if (!run) {
      reply.code(404).send({ error: 'not_found', message: 'No encontré esa ejecución (o ya se purgó).' });
      return undefined;
    }
    return run;
  });
}

const round = (n: number): number => Math.round(n * 10_000) / 10_000;
