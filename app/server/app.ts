import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { scanChallenges } from './challenges/challenge-fs';
import { hostGuard } from './guard';
import { OperationBusyError, OperationMutex } from './mutex';
import { streamNdjson } from './ndjson';
import { verifyStage, type VerifyDeps } from './verify/verify-service';
import type { Apoyo } from '../shared/types';
import { REPO_ROOT, WEB_DIST } from './paths';

export type BuildAppOptions = {
  mutex?: OperationMutex;
  repoRoot?: string;
  webDist?: string;
  /** Dependencias de la verificación (agente, intérprete): se sustituyen en los tests. */
  verifyDeps?: Partial<VerifyDeps>;
  /** Modo estricto del contrato de challenges (R29); por defecto true. */
  strictChallenges?: boolean;
};

export type App = FastifyInstance & { mutex: OperationMutex; repoRoot: string };

export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  const mutex = options.mutex ?? new OperationMutex();
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const webDist = options.webDist ?? WEB_DIST;
  const hasWeb = existsSync(webDist);

  const app = Fastify() as unknown as App;
  app.decorate('mutex', mutex);
  app.decorate('repoRoot', repoRoot);

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

  /** Challenges reales: `challenge-N/challenge.json`. La UI los combina con los de ejemplo. */
  app.get('/api/challenges', async () => {
    const { loaded, invalid } = await scanChallenges(repoRoot, { strict: options.strictChallenges ?? true });
    return { challenges: loaded.map((c) => c.challenge), invalid };
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
