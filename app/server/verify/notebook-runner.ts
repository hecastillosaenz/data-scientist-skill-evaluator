import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ActualTable } from './compare';

export const RESULT_MARK = '__DSC_RESULT__';
export const ERROR_MARK = '__DSC_ERROR__';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 64 * 1024;

export interface ScriptParts {
  /** Celdas `# Datos`, en orden (R27). */
  dataCells: string[];
  /** Celda entregable del usuario. */
  deliverable: string;
  /** Asserts de la etapa (etapas de código con `asserts`). */
  asserts?: string;
  /** Si es true, captura la variable `resultado` para compararla con la tabla esperada. */
  captureResult?: boolean;
}

export interface ScriptRange {
  name: 'datos' | 'entregable' | 'asserts' | 'arnés';
  /** Línea del script (1-based) donde empieza la parte y cuántas líneas ocupa. */
  start: number;
  lines: number;
}

/** Arma el script que ejecuta el runner: datos, entregable, asserts y, si hace falta, la captura de `resultado`. */
export function buildScript(parts: ScriptParts): string {
  return buildScriptWithMap(parts).script;
}

/** Igual que `buildScript`, pero devuelve también en qué líneas está cada parte (para traducir los tracebacks). */
export function buildScriptWithMap({ dataCells, deliverable, asserts, captureResult }: ScriptParts): { script: string; ranges: ScriptRange[] } {
  const named: { name: ScriptRange['name']; text: string }[] = [
    ...dataCells.map((text) => ({ name: 'datos' as const, text })),
    { name: 'entregable', text: deliverable },
  ];
  if (asserts) named.push({ name: 'asserts', text: asserts });
  const parts = named.map((n) => n.text);
  if (captureResult) {
    parts.push(`
import json as __json, sys as __sys
try:
    __r = resultado
except NameError:
    print("${ERROR_MARK} Tu celda no define la variable \`resultado\` con el resultado de la consulta.")
    __sys.exit(3)

def __cell(v):
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    try:
        return float(v)
    except Exception:
        return str(v)

if hasattr(__r, "fetchall") and hasattr(__r, "columns"):
    __cols, __rows = list(__r.columns), [list(x) for x in __r.fetchall()]
elif hasattr(__r, "columns") and hasattr(__r, "values"):
    __cols, __rows = [str(c) for c in __r.columns], __r.values.tolist()
elif isinstance(__r, (list, tuple)) and __r and isinstance(__r[0], dict):
    __cols, __rows = list(__r[0].keys()), [list(x.values()) for x in __r]
else:
    print("${ERROR_MARK} \`resultado\` debe ser una relación de DuckDB (con.sql(...)), un DataFrame o una lista de diccionarios.")
    __sys.exit(3)
print("${RESULT_MARK}" + __json.dumps({"columns": __cols, "rows": [[__cell(c) for c in r] for r in __rows]}))
`);
  }
  if (captureResult) named.push({ name: 'arnés', text: parts[parts.length - 1]! });
  const ranges: ScriptRange[] = [];
  let line = 1;
  for (const n of named) {
    const count = n.text.split('\n').length;
    ranges.push({ name: n.name, start: line, lines: count });
    line += count + 1; // las partes se separan con una línea en blanco
  }
  return { script: parts.join('\n\n'), ranges };
}

/**
 * Traduce un traceback de Python: oculta la ruta temporal del script y dice en qué celda y línea falló,
 * para que el usuario encuentre el error en su notebook y no en un archivo que no conoce.
 */
export function mapTraceback(stderr: string, ranges: ScriptRange[]): string {
  return stderr.replace(/File "[^"]*main\.py", line (\d+)(?:, in [^\n]+)?/g, (_m, n: string) => {
    const line = Number(n);
    const hit = ranges.find((r) => line >= r.start && line < r.start + r.lines);
    if (!hit) return 'Comprobación automática';
    const local = line - hit.start + 1;
    const where = hit.name === 'entregable' ? 'Celda entregable' : hit.name === 'datos' ? 'Celda # Datos' : hit.name === 'asserts' ? 'Asserts de la etapa' : 'Comprobación automática';
    return `${where}, línea ${local}`;
  });
}

export interface RunOptions extends ScriptParts {
  python: string;
  /** Directorio de trabajo: `challenge-N/` (así `datos/challenge.duckdb` se resuelve en relativo). */
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}

export interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
  /** Resultado capturado de `resultado`, si se pidió y la celda terminó bien. */
  table?: ActualTable;
  /** Error explícito del arnés (p. ej. falta la variable `resultado`). */
  harnessError?: string;
}

/**
 * Ejecuta el código del usuario en un proceso Python propio del orquestador, con timeout y tope de salida (R27).
 * Ningún agente ejecuta código (R9 revisado).
 */
export async function runPython(opts: RunOptions): Promise<RunResult> {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsc-run-'));
  const script = path.join(dir, 'main.py');
  const built = buildScriptWithMap(opts);
  writeFileSync(script, built.script);
  const started = Date.now();
  const limit = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;

  try {
    const child = spawn(opts.python, ['-u', script], {
      cwd: opts.cwd,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' },
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    const take = (current: string, chunk: Buffer) => {
      if (current.length >= limit) {
        truncated = true;
        return current;
      }
      return current + chunk.toString('utf8');
    };
    child.stdout.on('data', (c: Buffer) => (stdout = take(stdout, c)));
    child.stderr.on('data', (c: Buffer) => (stderr = take(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    }).finally(() => clearTimeout(timer));

    let table: ActualTable | undefined;
    let harnessError: string | undefined;
    const visible: string[] = [];
    for (const l of stdout.split('\n')) {
      if (l.startsWith(RESULT_MARK)) {
        try {
          table = JSON.parse(l.slice(RESULT_MARK.length));
        } catch {
          harnessError = 'No pude leer el resultado de tu celda.';
        }
      } else if (l.startsWith(ERROR_MARK)) {
        harnessError = l.slice(ERROR_MARK.length).trim();
      } else visible.push(l);
    }
    return {
      exitCode,
      timedOut,
      stdout: visible.join('\n').replace(/\n+$/, ''),
      stderr: mapTraceback(stderr.replace(/\n+$/, ''), built.ranges),
      truncated,
      durationMs: Date.now() - started,
      ...(table ? { table } : {}),
      ...(harnessError ? { harnessError } : {}),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
