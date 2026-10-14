import { describe, expect, it } from 'vitest';
import { OperationBusyError, OperationMutex } from '../server/mutex';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('OperationMutex', () => {
  it('rechaza una segunda operación mientras hay una en vuelo', async () => {
    const mutex = new OperationMutex();
    const gate = deferred();
    const first = mutex.run('generar', () => gate.promise);

    const err = await mutex.run('evaluar', async () => {}).catch((e) => e);
    expect(err).toBeInstanceOf(OperationBusyError);
    expect(err.activeOperation).toBe('generar');

    gate.resolve();
    await first;
  });

  it('se libera tras éxito', async () => {
    const mutex = new OperationMutex();
    await mutex.run('a', async () => {});
    await expect(mutex.run('b', async () => 'ok')).resolves.toBe('ok');
  });

  it('se libera tras error y propaga el error original', async () => {
    const mutex = new OperationMutex();
    await expect(mutex.run('a', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(mutex.status()).toEqual({ busy: false, operation: null });
  });

  it('status refleja la operación activa', async () => {
    const mutex = new OperationMutex();
    const gate = deferred();
    const running = mutex.run('analizar', () => gate.promise);
    expect(mutex.status()).toEqual({ busy: true, operation: 'analizar' });
    gate.resolve();
    await running;
    expect(mutex.status()).toEqual({ busy: false, operation: null });
  });
});
