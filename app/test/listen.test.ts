import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../server/app';
import { HOST, startServer } from '../server/start';

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('startServer', () => {
  it('escucha solo en 127.0.0.1 (S7)', async () => {
    app = await buildApp({ webDist: '/no/existe' });
    const url = await startServer(app, 0);
    expect(HOST).toBe('127.0.0.1');
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(app.server.address()).toMatchObject({ address: '127.0.0.1' });
    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
  });
});
