import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../server/app';
import { streamNdjson } from '../server/ndjson';

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('streamNdjson', () => {
  it('emite una línea JSON por objeto con el content-type correcto', async () => {
    app = await buildApp({ webDist: '/no/existe' });
    app.get('/test/stream', (_req, reply) =>
      streamNdjson(
        reply,
        (async function* () {
          yield { type: 'progress', step: 1 };
          yield { type: 'done' };
        })(),
      ),
    );
    const res = await app.inject('/test/stream');
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    const lines = res.body.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([{ type: 'progress', step: 1 }, { type: 'done' }]);
  });
});
