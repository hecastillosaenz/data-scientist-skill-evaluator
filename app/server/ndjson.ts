import { Readable } from 'node:stream';
import type { FastifyReply } from 'fastify';

/** Envía cada objeto del iterable como una línea JSON (NDJSON). */
export function streamNdjson(reply: FastifyReply, items: AsyncIterable<object>): FastifyReply {
  async function* lines() {
    for await (const item of items) yield `${JSON.stringify(item)}\n`;
  }
  return reply.type('application/x-ndjson; charset=utf-8').send(Readable.from(lines()));
}
