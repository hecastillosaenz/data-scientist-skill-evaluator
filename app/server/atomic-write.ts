import { open, rename, unlink } from 'node:fs/promises';

type AtomicOps = {
  /** Escribe y sincroniza el contenido completo en `path`. */
  writeFile: (path: string, data: string | Uint8Array) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
};

const defaultOps: AtomicOps = {
  async writeFile(path, data) {
    const handle = await open(path, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  rename,
};

/**
 * Escritura atómica (S6): archivo temporal en el mismo directorio + rename.
 * Si algo falla, el archivo destino queda intacto y el temporal se elimina.
 */
export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  ops: AtomicOps = defaultOps,
): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    await ops.writeFile(tmp, data);
    await ops.rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
