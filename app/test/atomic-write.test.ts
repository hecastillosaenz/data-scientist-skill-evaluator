import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic } from '../server/atomic-write';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atomic-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('writeFileAtomic', () => {
  it('crea y reemplaza el archivo sin dejar temporales', async () => {
    const file = join(dir, 'graph.json');
    await writeFileAtomic(file, '{"v":1}');
    await writeFileAtomic(file, '{"v":2}');
    expect(await readFile(file, 'utf8')).toBe('{"v":2}');
    expect(await readdir(dir)).toEqual(['graph.json']);
  });

  it('si la escritura falla a medias, el original queda intacto y no queda .tmp', async () => {
    const file = join(dir, 'graph.json');
    await writeFile(file, 'original');
    await expect(
      writeFileAtomic(file, 'nuevo', {
        async writeFile(path) {
          await writeFile(path, 'parc');
          throw new Error('disco lleno');
        },
        rename: async () => {},
      }),
    ).rejects.toThrow('disco lleno');
    expect(await readFile(file, 'utf8')).toBe('original');
    expect(await readdir(dir)).toEqual(['graph.json']);
  });

  it('si el rename falla, el original queda intacto y no queda .tmp', async () => {
    const file = join(dir, 'graph.json');
    await writeFile(file, 'original');
    await expect(
      writeFileAtomic(file, 'nuevo', {
        writeFile: (path, data) => writeFile(path, data),
        rename: async () => { throw new Error('rename falló'); },
      }),
    ).rejects.toThrow('rename falló');
    expect(await readFile(file, 'utf8')).toBe('original');
    expect(await readdir(dir)).toEqual(['graph.json']);
  });
});
