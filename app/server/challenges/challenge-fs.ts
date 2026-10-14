import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Challenge } from '../../shared/types';
import { runPython } from '../verify/notebook-runner';

export interface LoadedChallenge {
  /** Ruta absoluta de `challenge-N/`. */
  dir: string;
  challenge: Challenge;
}

const isChallenge = (value: unknown): value is Challenge =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Challenge).id === 'string' &&
  Array.isArray((value as Challenge).stages) &&
  (value as Challenge).stages.every((s) => typeof s?.number === 'number' && typeof s?.id === 'string');

/** Lee el `challenge.json` de cada carpeta `challenge-N` (fuente de verdad, SDD §6.2). Las carpetas inválidas se omiten. */
export async function listChallenges(repoRoot: string): Promise<LoadedChallenge[]> {
  let entries: string[];
  try {
    entries = await readdir(repoRoot);
  } catch {
    return [];
  }
  const loaded: LoadedChallenge[] = [];
  for (const name of entries.filter((n) => /^challenge-\d+$/.test(n)).sort()) {
    const dir = path.join(repoRoot, name);
    try {
      const json: unknown = JSON.parse(await readFile(path.join(dir, 'challenge.json'), 'utf8'));
      if (isChallenge(json)) loaded.push({ dir, challenge: json });
    } catch {
      /* carpeta sin challenge.json válido: se omite */
    }
  }
  return loaded;
}

/** Busca por id entre las carpetas escaneadas; nunca une un id del usuario a una ruta (sin path traversal). */
export async function findChallenge(repoRoot: string, id: string): Promise<LoadedChallenge | null> {
  return (await listChallenges(repoRoot)).find((c) => c.challenge.id === id) ?? null;
}

export class DatasetError extends Error {}

/**
 * Construye `datos/challenge.duckdb` desde `datos/seed.sql` de forma idempotente (R24): borra y recrea la base,
 * así que dos ejecuciones dan el mismo resultado. Si no hay seed no hace nada.
 */
export async function prepareDataset(opts: { dir: string; python: string; signal?: AbortSignal }): Promise<{ built: boolean }> {
  if (!existsSync(path.join(opts.dir, 'datos', 'seed.sql'))) return { built: false };
  const run = await runPython({
    python: opts.python,
    cwd: opts.dir,
    dataCells: [],
    deliverable: `import duckdb, pathlib
db = pathlib.Path("datos/challenge.duckdb")
db.parent.mkdir(exist_ok=True)
if db.exists():
    db.unlink()
con = duckdb.connect(str(db))
con.execute(pathlib.Path("datos/seed.sql").read_text(encoding="utf-8"))
con.close()`,
    timeoutMs: 30_000,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (run.exitCode !== 0) {
    const missing = /No module named 'duckdb'/.test(run.stderr);
    throw new DatasetError(
      missing
        ? 'Falta el paquete duckdb en .venv. Instálalo con: uv pip install --python .venv/bin/python -r requirements.txt'
        : `No pude construir la base de datos del challenge: ${run.stderr.split('\n').slice(-2).join(' ') || 'error desconocido'}`,
    );
  }
  return { built: true };
}
