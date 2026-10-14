import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../server/app';

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('buildApp', () => {
  it('GET /api/health responde 200', async () => {
    app = await buildApp({ webDist: '/no/existe' });
    const res = await app.inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('una segunda operación en vuelo recibe 409 con mensaje explícito', async () => {
    app = await buildApp({ webDist: '/no/existe' });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const mutex = app.mutex;
    app.post('/test/slow', async () => mutex.run('lenta', async () => { await gate; return { ok: true }; }));

    const first = app.inject({ method: 'POST', url: '/test/slow' });
    await new Promise((r) => setImmediate(r));

    const status = await app.inject('/api/status');
    expect(status.json()).toEqual({ busy: true, operation: 'lenta' });

    const second = await app.inject({ method: 'POST', url: '/test/slow' });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: 'operation_busy', operation: 'lenta' });
    expect(second.json().message).toContain('operación en curso');

    release();
    expect((await first).statusCode).toBe(200);
    expect((await app.inject('/api/status')).json()).toEqual({ busy: false, operation: null });
  });

  it('rutas /api desconocidas devuelven 404 JSON', async () => {
    app = await buildApp({ webDist: '/no/existe' });
    const res = await app.inject('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });
});
