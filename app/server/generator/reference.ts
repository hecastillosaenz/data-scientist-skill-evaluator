import type { Cell, Stage, TableDef } from '../../shared/types';
import { DatasetError, prepareDataset } from '../challenges/challenge-fs';
import { compareTables } from '../verify/compare';
import { runPython } from '../verify/notebook-runner';
import { DATA_CELL, referenceCell } from './assemble';

/**
 * Compuertas de ejecución del Generador (SDD R18, R19, R24). Las ejecuta el orquestador: ningún agente corre código (R9).
 * Devuelven errores en español, listos para devolvérselos al Generador en la reparación.
 */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CHECK_MARK = 'DSC_CHECK:';
const SAMPLE_LIMIT = 50;

/** Construye la base desde el seed (R24) y comprueba que lo declarado en `challenge.json` es lo que hay (R18). */
export async function checkDataset(opts: { dir: string; python: string; tables: TableDef[]; signal?: AbortSignal }): Promise<string[]> {
  try {
    await prepareDataset({ dir: opts.dir, python: opts.python, ...(opts.signal ? { signal: opts.signal } : {}) });
  } catch (err) {
    return [err instanceof DatasetError ? err.message : `No pude construir la base desde el seed: ${(err as Error).message}`];
  }
  const bad = opts.tables.flatMap((t) => [t.name, ...t.columns.map((c) => c.name), ...t.columns.flatMap((c) => (c.fk ? [c.fk.table, c.fk.column] : []))]).filter((n) => !IDENT.test(n));
  if (bad.length > 0) return [`Nombres de tabla o columna no válidos para SQL: ${[...new Set(bad)].join(', ')} (usa letras, números y _).`];

  const declared = JSON.stringify(opts.tables.map((t) => ({ name: t.name, fks: t.columns.filter((c) => c.fk).map((c) => ({ col: c.name, table: c.fk!.table, ref: c.fk!.column })) })));
  const run = await runPython({
    python: opts.python,
    cwd: opts.dir,
    dataCells: [DATA_CELL],
    deliverable: `
import json as __json
__declared = __json.loads(${JSON.stringify(declared)})
def __cell(v):
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    try:
        return float(v)
    except Exception:
        return str(v)
__out = {}
for __t in __declared:
    try:
        __n = con.sql('SELECT count(*) FROM "%s"' % __t["name"]).fetchone()[0]
        __rel = con.sql('SELECT * FROM "%s" LIMIT ${SAMPLE_LIMIT}' % __t["name"])
        __entry = {"count": __n, "columns": list(__rel.columns), "rows": [[__cell(c) for c in r] for r in __rel.fetchall()], "orphans": {}}
        for __fk in __t["fks"]:
            __entry["orphans"][__fk["col"]] = con.sql('SELECT count(*) FROM "%s" c WHERE c."%s" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "%s" p WHERE p."%s" = c."%s")' % (__t["name"], __fk["col"], __fk["table"], __fk["ref"], __fk["col"])).fetchone()[0]
        __out[__t["name"]] = __entry
    except Exception as __e:
        __out[__t["name"]] = {"error": str(__e).splitlines()[0]}
print("${CHECK_MARK}" + __json.dumps(__out))
`,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const line = run.stdout.split('\n').find((l) => l.startsWith(CHECK_MARK));
  if (run.exitCode !== 0 || !line) return [`No pude comprobar las tablas: ${run.stderr.split('\n').filter(Boolean).at(-1) ?? 'la comprobación no terminó'}.`];
  const actual = JSON.parse(line.slice(CHECK_MARK.length)) as Record<string, { error?: string; count?: number; columns?: string[]; rows?: unknown[][]; orphans?: Record<string, number> }>;

  const errors: string[] = [];
  for (const t of opts.tables) {
    const got = actual[t.name];
    if (!got || got.error) {
      errors.push(`Tabla «${t.name}»: no existe en el seed o no se puede leer (${got?.error ?? 'sin datos'}).`);
      continue;
    }
    if (got.count !== t.rowCount) errors.push(`Tabla «${t.name}»: declaras rowCount ${t.rowCount} pero el seed inserta ${got.count} filas.`);
    const cmp = compareTables({ columns: t.columns.map((c) => c.name), rows: t.sampleRows as Cell[][] }, { columns: got.columns ?? [], rows: (got.rows ?? []).slice(0, t.sampleRows.length) });
    if (!cmp.match) errors.push(`Tabla «${t.name}»: sampleRows no coincide con el seed (${cmp.problems[0]}).`);
    for (const [col, orphans] of Object.entries(got.orphans ?? {})) {
      if (orphans > 0) errors.push(`Tabla «${t.name}»: ${orphans} fila(s) de «${col}» no tienen su llave en la tabla referenciada (integridad referencial).`);
    }
  }
  return errors;
}

/**
 * R19: ejecuta la solución de referencia de una etapa de código sobre el dataset. Debe terminar sin error y, según la
 * etapa, reproducir exactamente `expected` o pasar los `asserts`. Si no, el challenge se rechaza.
 */
export async function checkReference(opts: { dir: string; python: string; stage: Stage; signal?: AbortSignal }): Promise<string[]> {
  const { stage } = opts;
  if (stage.mechanism !== 'codigo_assert') return [];
  const solution = stage.content.solution?.code;
  if (!solution?.trim()) return [`Etapa ${stage.number}: falta \`solution.code\` (la solución de referencia que el orquestador ejecuta).`];
  const expected = stage.content.expected;
  const run = await runPython({
    python: opts.python,
    cwd: opts.dir,
    dataCells: [DATA_CELL],
    deliverable: referenceCell(stage),
    ...(stage.content.asserts ? { asserts: stage.content.asserts } : {}),
    captureResult: !!expected,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const last = run.stderr.split('\n').map((l) => l.trim()).filter(Boolean).at(-1);
  if (run.timedOut) return [`Etapa ${stage.number}: la solución de referencia superó el tiempo máximo (30 s).`];
  if (run.harnessError) return [`Etapa ${stage.number}: ${run.harnessError}`];
  if (run.exitCode !== 0) return [`Etapa ${stage.number}: la solución de referencia falla al ejecutarse sobre el dataset (${last ?? 'error desconocido'}).`];
  if (expected && run.table) {
    const cmp = compareTables(expected, run.table);
    if (!cmp.match) {
      const real = `columnas [${run.table.columns.join(', ')}] y ${run.table.rows.length} fila(s): ${JSON.stringify(run.table.rows.slice(0, 5))}`;
      return [`Etapa ${stage.number}: la solución de referencia NO reproduce \`expected\` (${cmp.problems[0]}). Su salida real es ${real}. Corrige \`expected\` y los números que cites en el texto para que coincidan con la ejecución.`];
    }
  }
  return [];
}
