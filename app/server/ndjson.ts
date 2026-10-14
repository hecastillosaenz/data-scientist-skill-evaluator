import { Readable } from 'node:stream';
import type { FastifyReply } from 'fastify';

export interface NdjsonOptions {
  /** Se llama una sola vez cuando el stream termina, falla o el cliente se desconecta (incluso si nunca empezó). */
  onClose?: () => void;
}

/** Envía cada objeto del iterable como una línea JSON (NDJSON). */
export function streamNdjson(reply: FastifyReply, items: AsyncIterable<object>, options: NdjsonOptions = {}): FastifyReply {
  async function* lines() {
    for await (const item of items) yield `${JSON.stringify(item)}\n`;
  }
  const stream = Readable.from(lines());
  if (options.onClose) stream.once('close', options.onClose);
  return reply
    .header('cache-control', 'no-store')
    .type('application/x-ndjson; charset=utf-8')
    .send(stream);
}
