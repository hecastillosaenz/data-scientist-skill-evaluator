import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { scanChallenges } from './challenges/challenge-fs';
import { hostGuard } from './guard';
import { OperationBusyError, OperationMutex } from './mutex';
import { streamNdjson } from './ndjson';
import { verifyStage, type VerifyDeps } from './verify/verify-service';
import type { Apoyo } from '../shared/types';
import { registerAgentRoutes } from './agents/routes';
import { registerStateRoutes } from './persistence/routes';
import { MODELO_VALIDO } from './generator/objetivo';
import { ETAPAS_MAX, ETAPAS_MIN } from './generator/plan';
import { DESCRIPCION_MAX, proponerReto } from './planner/propuesta';
import type { PropuestaReto } from '../shared/generate';
import { converseFoco, planFoco, type PlannerDeps } from './planner/planner-service';
import { analyzeEvidence, AnalystQueue, type AnalysisOutcome, type AnalystDeps } from './analyst/analyst-service';
import { readState } from './persistence/state';
import { loadCalibration } from './generator/calibration';
import { generateChallenge, type GenerateDeps } from './generator/generator-service';
import { pendingGeneration } from './generator/workspace';
import { DOMAINS } from '../shared/domains';
import type { DomainId } from '../shared/types';
import { REPO_ROOT, WEB_DIST } from './paths';

export type BuildAppOptions = {
  mutex?: OperationMutex;
  repoRoot?: string;
  webDist?: string;
  /** Dependencias de la verificación (agente, intérprete): se sustituyen en los tests. */
  verifyDeps?: Partial<VerifyDeps>;
  /** Modo estricto del contrato de challenges (R29); por defecto true. */
  strictChallenges?: boolean;
  /** Reloj para las fechas que pone el servidor; se sustituye en los tests. */
  now?: () => Date;
  /** Dependencias de la generación (agente, intérprete): se sustituyen en los tests. */
  generateDeps?: Partial<GenerateDeps>;
  /** Analiza en segundo plano cada Evidence nueva (R12). Apagado por defecto; `index.ts` lo enciende. */
  autoAnalyze?: boolean;
  /** Dependencias del Analista (agente): se sustituyen en los tests. */
  analystDeps?: Partial<AnalystDeps>;
  plannerDeps?: Partial<PlannerDeps>;
  /** Se llama al terminar cada análisis (estado, costo…); `index.ts` lo registra en consola. */
  onAnalysisSettled?: (evidenceId: string, outcome: AnalysisOutcome) => void;
};

export type App = FastifyInstance & { mutex: OperationMutex; repoRoot: string; analyst: AnalystQueue };

export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  const mutex = options.mutex ?? new OperationMutex();
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const webDist = options.webDist ?? WEB_DIST;
  const hasWeb = existsSync(webDist);

  const app = Fastify() as unknown as App;
  app.decorate('mutex', mutex);
  app.decorate('repoRoot', repoRoot);

  // Analista (R12): cola serial en segundo plano con su propio candado; no usa el mutex de verificación ni de generación.
  const shutdown = new AbortController();
  const analyst = new AnalystQueue((evidenceId) =>
    analyzeEvidence({ repoRoot, evidenceId, signal: shutdown.signal, ...(options.analystDeps ? { deps: { ...options.analystDeps, ...(options.now ? { now: options.now } : {}) } } : options.now ? { deps: { now: options.now } } : {}) }),
    options.onAnalysisSettled,
  );
  app.decorate('analyst', analyst);
  app.addHook('onClose', async () => {
    shutdown.abort();
    await analyst.idle();
  });

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof OperationBusyError) {
      return reply.code(409).send({ error: 'operation_busy', message: err.message, operation: err.activeOperation });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'internal_error', message: 'Error interno del orquestador.' });
  });

  // R25: toda la API exige Host/Origin locales (los endpoints lanzan procesos).
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/')) await hostGuard(request, reply);
  });

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/status', async () => mutex.status());

  /** Challenges reales: `challenge/challenge-NNN/challenge.json`. La UI los combina con los de ejemplo. */
  app.get('/api/challenges', async () => {
    const { loaded, invalid } = await scanChallenges(repoRoot, { strict: options.strictChallenges ?? true });
    return { challenges: loaded.map((c) => c.challenge), invalid };
  });

  registerAgentRoutes(app, { repoRoot, ...(options.now ? { now: options.now } : {}) });

  registerStateRoutes(app, {
    repoRoot,
    strict: options.strictChallenges ?? true,
    ...(options.now ? { now: options.now } : {}),
    onEvidenceSaved: (id) => options.autoAnalyze && analyst.enqueue(id),
    analystStatus: () => {
      const s = analyst.status();
      return { running: s.running !== null || s.queued.length > 0, failed: s.failed };
    },
  });

  /** Estado del Analista: lo pendiente (Evidence sin observación), lo que corre y lo que falló. */
  app.get('/api/analysis', async () => {
    const state = await readState({ repoRoot, strict: options.strictChallenges ?? true });
    const s = analyst.status();
    return { running: s.running, queued: s.queued.length, pending: state.analysis.pending, failed: s.failed };
  });

  /** «Analizar ahora» (R12): encola lo pendiente. No arranca solo al iniciar el servidor, para evitar gasto sorpresa. */
  app.post('/api/analysis/pending', async () => {
    const state = await readState({ repoRoot, strict: options.strictChallenges ?? true });
    for (const id of state.analysis.pending) analyst.enqueue(id);
    return { queued: state.analysis.pending.length };
  });

  /**
   * Verificación en vivo (R26): NDJSON `step | output | tool | feedback | result | done | error`.
   * Una sola operación a la vez (409 si hay otra) y cancelable al cerrar la petición.
   */
  app.post<{ Params: { id: string; n: string }; Body: { apoyo?: Apoyo } | undefined }>(
    '/api/challenges/:id/stages/:n/verify',
    async (request, reply) => {
      const stageNumber = Number(request.params.n);
      if (!Number.isInteger(stageNumber) || stageNumber < 1) return reply.code(400).send({ error: 'bad_request', message: 'Número de etapa inválido.' });
      const apoyo: Apoyo = ['guiado', 'pistas', 'autonomo'].includes(request.body?.apoyo ?? '') ? (request.body!.apoyo as Apoyo) : 'pistas';
      const release = mutex.acquire('verificar');
      const abort = new AbortController();
      reply.raw.on('close', () => {
        if (!reply.raw.writableFinished) abort.abort();
      });
      return streamNdjson(
        reply,
        verifyStage({ repoRoot, challengeId: request.params.id, stageNumber, apoyo, signal: abort.signal, ...(options.verifyDeps ? { deps: options.verifyDeps } : {}) }),
        { onClose: release },
      );
    },
  );


  /** Trabajo de generación conservado que «Reintentar» puede retomar (R39); `null` si no hay. */
  app.get('/api/generate/pending', async () => {
    const config = await loadCalibration(repoRoot).catch(() => null);
    return { pending: config ? await pendingGeneration(repoRoot, config.horasConservacion, (options.now ?? (() => new Date()))()) : null };
  });

  /**
   * Genera un challenge (R38, R39): NDJSON `plan | step | tool | result | error | done`. Una sola operación a la vez
   * (409 si hay otra); cancelar la petición borra el área de trabajo y no deja nada a medias.
   */
  app.post<{ Body: { dominio?: string; resume?: boolean; budgetFactor?: number; tema?: { conceptId?: unknown; texto?: unknown }; focoId?: unknown; modelo?: unknown; etapas?: unknown; proyecto?: unknown; descripcion?: unknown; propuesta?: unknown } | undefined }>('/api/generate', async (request, reply) => {
    const dominio = request.body?.dominio;
    if (dominio !== undefined && !DOMAINS.some((d) => d.id === dominio)) {
      return reply.code(400).send({ error: 'bad_request', message: `«dominio» debe ser uno de ${DOMAINS.map((d) => d.id).join(', ')}.` });
    }
    const rawTema = request.body?.tema;
    if (rawTema !== undefined && (typeof rawTema.conceptId !== 'string' || rawTema.conceptId === '' || (rawTema.texto !== undefined && typeof rawTema.texto !== 'string'))) {
      return reply.code(400).send({ error: 'bad_request', message: '«tema» debe traer «conceptId» (texto) y, opcionalmente, «texto».' });
    }
    const tema = rawTema ? { conceptId: rawTema.conceptId as string, texto: (typeof rawTema.texto === 'string' && rawTema.texto ? rawTema.texto : (rawTema.conceptId as string)).slice(0, 120) } : undefined;
    const rawFoco = request.body?.focoId;
    if (rawFoco !== undefined && (typeof rawFoco !== 'string' || rawFoco === '' || rawFoco.length > 60)) {
      return reply.code(400).send({ error: 'bad_request', message: '«focoId» debe ser el id de un objetivo.' });
    }
    const rawModelo = request.body?.modelo;
    if (rawModelo !== undefined && rawModelo !== '' && (typeof rawModelo !== 'string' || !MODELO_VALIDO.test(rawModelo))) {
      return reply.code(400).send({ error: 'bad_request', message: '«modelo» debe ser un alias (opus, sonnet, haiku) o un id de modelo.' });
    }
    const rawEtapas = request.body?.etapas;
    if (rawEtapas !== undefined && (typeof rawEtapas !== 'number' || !Number.isInteger(rawEtapas) || rawEtapas < ETAPAS_MIN || rawEtapas > ETAPAS_MAX)) {
      return reply.code(400).send({ error: 'bad_request', message: `«etapas» debe ser un entero de ${ETAPAS_MIN} a ${ETAPAS_MAX}.` });
    }
    const rawDescripcion = request.body?.descripcion;
    if (rawDescripcion !== undefined && (typeof rawDescripcion !== 'string' || rawDescripcion.length > DESCRIPCION_MAX)) {
      return reply.code(400).send({ error: 'bad_request', message: `«descripcion» debe ser texto de hasta ${DESCRIPCION_MAX} caracteres.` });
    }
    const rawPropuesta = request.body?.propuesta;
    if (rawPropuesta !== undefined && (typeof rawPropuesta !== 'object' || rawPropuesta === null || Array.isArray(rawPropuesta))) {
      return reply.code(400).send({ error: 'bad_request', message: '«propuesta» debe ser la que devolvió /api/generate/propuesta.' });
    }
    const factor = request.body?.budgetFactor === 2 ? 2 : 1;
    const release = mutex.acquire('generar');
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort();
    });
    return streamNdjson(
      reply,
      generateChallenge({
        repoRoot,
        ...(dominio ? { domain: dominio as DomainId } : {}),
        ...(tema ? { tema } : {}),
        ...(typeof rawFoco === 'string' ? { focoId: rawFoco } : {}),
        ...(typeof rawEtapas === 'number' ? { etapas: rawEtapas } : {}),
        ...(request.body?.proyecto === true ? { proyecto: true } : {}),
        ...(typeof rawDescripcion === 'string' && rawDescripcion.trim() ? { descripcion: rawDescripcion } : {}),
        ...(rawPropuesta ? { propuesta: rawPropuesta as PropuestaReto } : {}),
        ...(typeof rawModelo === 'string' && rawModelo !== '' ? { modelo: rawModelo } : {}),
        resume: request.body?.resume === true,
        budgetFactor: factor,
        signal: abort.signal,
        ...(options.generateDeps || options.now ? { deps: { ...options.generateDeps, ...(options.now ? { now: options.now } : {}) } } : {}),
      }),
      { onClose: release },
    );
  });

  /**
   * Plan de estudio de un foco (R56): lo arma el Planificador y queda como «propuesto» en objetivos.json. Una sola
   * operación a la vez (comparte el mutex con generar y verificar); si el navegador se va, se cancela el agente.
   */
  app.post<{ Params: { id: string } }>('/api/objetivos/:id/plan', async (request, reply) => {
    const release = mutex.acquire('planificar');
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort();
    });
    try {
      const outcome = await planFoco({
        repoRoot,
        focoId: request.params.id,
        signal: abort.signal,
        ...(options.plannerDeps || options.now ? { deps: { ...options.plannerDeps, ...(options.now ? { now: options.now } : {}) } } : {}),
      });
      if (outcome.status === 'ok') return { plan: outcome.plan, cost: outcome.cost };
      const code = outcome.code === 'not_found' ? 404 : outcome.code === 'no_claude' ? 503 : outcome.code === 'objetivos' || outcome.code === 'graph' ? 422 : 502;
      return reply.code(code).send({ error: outcome.code, message: outcome.message });
    } finally {
      release();
    }
  });

  /**
   * Propone cómo aterrizar lo que el usuario quiere lograr (R61): conceptos, Bloom y número de etapas, antes de generar.
   * No guarda nada. Comparte el mutex con las demás operaciones de agente; cerrar la petición cancela al agente.
   */
  app.post<{ Body: { descripcion?: unknown; tema?: { conceptId?: unknown; texto?: unknown }; focoId?: unknown; dominio?: unknown; etapas?: unknown; proyecto?: unknown } | undefined }>('/api/generate/propuesta', async (request, reply) => {
    const b = request.body ?? {};
    const bad = (message: string) => reply.code(400).send({ error: 'bad_request', message });
    if (b.descripcion !== undefined && typeof b.descripcion !== 'string') return bad('«descripcion» debe ser texto.');
    if (b.focoId !== undefined && (typeof b.focoId !== 'string' || b.focoId === '' || b.focoId.length > 60)) return bad('«focoId» debe ser el id de un objetivo.');
    if (b.dominio !== undefined && (typeof b.dominio !== 'string' || !DOMAINS.some((d) => d.id === b.dominio))) return bad(`«dominio» debe ser uno de ${DOMAINS.map((d) => d.id).join(', ')}.`);
    if (b.etapas !== undefined && b.etapas !== null && typeof b.etapas !== 'number') return bad('«etapas» debe ser un número o nulo (el modelo decide).');
    if (b.tema !== undefined && (typeof b.tema.conceptId !== 'string' || b.tema.conceptId === '')) return bad('«tema» debe traer «conceptId».');
    const release = mutex.acquire('planificar');
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort();
    });
    try {
      const outcome = await proponerReto({
        repoRoot,
        descripcion: typeof b.descripcion === 'string' ? b.descripcion : '',
        tema: b.tema ? { conceptId: b.tema.conceptId as string, texto: typeof b.tema.texto === 'string' && b.tema.texto ? b.tema.texto.slice(0, 120) : (b.tema.conceptId as string) } : undefined,
        focoId: b.focoId as string | undefined,
        dominio: b.dominio as DomainId | undefined,
        etapas: typeof b.etapas === 'number' ? b.etapas : null,
        proyecto: typeof b.proyecto === 'boolean' ? b.proyecto : null,
        signal: abort.signal,
        ...(options.plannerDeps || options.now ? { deps: { ...options.plannerDeps, ...(options.now ? { now: options.now } : {}) } } : {}),
      });
      if (outcome.status === 'ok') return { propuesta: outcome.propuesta, cost: outcome.cost };
      const code = outcome.code === 'bad_request' ? 400 : outcome.code === 'no_claude' ? 503 : outcome.code === 'objetivo' || outcome.code === 'graph' ? 422 : 502;
      return reply.code(code).send({ error: outcome.code, message: outcome.message });
    } finally {
      release();
    }
  });

  /**
   * Conversación con el Planificador sobre un objetivo (R57): feedback del usuario o revisión de su avance. Puede
   * devolver un plan nuevo (propuesto). Comparte el mutex con las demás operaciones de agente.
   */
  app.post<{ Params: { id: string }; Body: { accion?: unknown; texto?: unknown } }>('/api/objetivos/:id/conversacion', async (request, reply) => {
    const accion = request.body?.accion;
    if (accion !== 'feedback' && accion !== 'revision') return reply.code(400).send({ error: 'bad_request', message: '«accion» debe ser «feedback» o «revision».' });
    const release = mutex.acquire('planificar');
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) abort.abort();
    });
    try {
      const outcome = await converseFoco({
        repoRoot,
        focoId: request.params.id,
        accion,
        ...(typeof request.body?.texto === 'string' ? { texto: request.body.texto } : {}),
        signal: abort.signal,
        ...(options.plannerDeps || options.now ? { deps: { ...options.plannerDeps, ...(options.now ? { now: options.now } : {}) } } : {}),
      });
      if (outcome.status === 'ok') return { mensajes: outcome.mensajes, plan: outcome.plan ?? null, planCambiado: outcome.planCambiado, cost: outcome.cost };
      const code = outcome.code === 'bad_request' ? 400 : outcome.code === 'not_found' ? 404 : outcome.code === 'no_claude' ? 503 : outcome.code === 'objetivos' || outcome.code === 'graph' ? 422 : 502;
      return reply.code(code).send({ error: outcome.code, message: outcome.message });
    } finally {
      release();
    }
  });

  if (hasWeb) await app.register(fastifyStatic, { root: webDist });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
    if (hasWeb) return reply.sendFile('index.html');
    return reply
      .code(503)
      .type('text/plain; charset=utf-8')
      .send('Frontend no construido. Ejecuta `npm run app` para compilarlo y servirlo.');
  });

  return app;
}
