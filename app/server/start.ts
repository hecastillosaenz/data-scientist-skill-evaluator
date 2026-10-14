import type { FastifyInstance } from 'fastify';

/** S7: el orquestador solo escucha en loopback, nunca en 0.0.0.0. */
export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 4317;

export async function startServer(app: FastifyInstance, port: number): Promise<string> {
  await app.listen({ host: HOST, port });
  const address = app.server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return `http://${HOST}:${actualPort}`;
}
