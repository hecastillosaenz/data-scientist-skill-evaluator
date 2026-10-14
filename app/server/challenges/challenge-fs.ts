import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Challenge } from '../../shared/types';
import { runPython } from '../verify/notebook-runner';
import { validateChallenge } from './validate';

export interface LoadedChallenge {
  /** Ruta absoluta de `challenge-N/`. */
  dir: string;
  challenge: Challenge;
}

export interface InvalidChallenge {
  /** Nombre de la carpeta, p. ej. `challenge-002`. */
  folder: string;
  /** Errores en español (R29): faltan campos, no cumple el esquema, JSON ilegible… */
  errors: string[];
}

export interface ChallengeScan {
  loaded: LoadedChallenge[];
  invalid: InvalidChallenge[];
}

/**
 * Lee el `challenge.json` de cada carpeta `challenge-N` (fuente de verdad, SDD §6.2) y lo valida contra el contrato
 * (R29, modo estricto). Los inválidos no se cargan, pero se devuelven con sus errores para poder explicarlos.
 */
export async function scanChallenges(repoRoot: string, options: { strict?: boolean } = {}): Promise<ChallengeScan> {
  let entries: string[];
  try {
    entries = await readdir(repoRoot);
  } catch {
    return { loaded: [], invalid: [] };
  }
  const scan: ChallengeScan = { loaded: [], invalid: [] };
  for (const name of entries.filter((n) => /^challenge-\d+$/.test(n)).sort()) {
    const dir = path.join(repoRoot, name);
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path.join(dir, 'challenge.json'), 'utf8'));
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      scan.invalid.push({ folder: name, errors: [missing ? `La carpeta ${name}/ no tiene challenge.json.` : `${name}/challenge.json no es un JSON válido.`] });
      continue;
    }
    const result = validateChallenge(json, { strict: options.strict ?? true });
    if (result.ok && (json as Challenge).id === name) scan.loaded.push({ dir, challenge: json as Challenge });
    else scan.invalid.push({ folder: name, errors: result.ok ? [`El id del challenge («${(json as Challenge).id}») debe coincidir con el nombre de la carpeta («${name}»).`] : result.errors });
  }
  return scan;
}

export async function listChallenges(repoRoot: string): Promise<LoadedChallenge[]> {
  return (await scanChallenges(repoRoot)).loaded;
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
