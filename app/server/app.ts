import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { OperationBusyError, OperationMutex } from './mutex';
import { REPO_ROOT, WEB_DIST } from './paths';

export type BuildAppOptions = {
  mutex?: OperationMutex;
  repoRoot?: string;
  webDist?: string;
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

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/status', async () => mutex.status());

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
