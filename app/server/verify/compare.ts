import type { Cell, ExpectedTable } from '../../shared/types';

export interface ActualTable {
  columns: string[];
  rows: unknown[][];
}

export interface Comparison {
  match: boolean;
  problems: string[];
}

const show = (row: unknown[]) => `(${row.map((v) => (v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : String(v))).join(', ')})`;

const sameValue = (expected: Cell, actual: unknown): boolean => {
  if (expected === null || actual === null || actual === undefined) return expected === null && (actual === null || actual === undefined);
  if (typeof expected === 'number') {
    const n = typeof actual === 'number' ? actual : Number(actual);
    return Number.isFinite(n) && Math.abs(n - expected) <= 1e-9;
  }
  return String(expected) === String(actual);
};

/**
 * Compara el resultado de la celda con la tabla esperada: mismas columnas (sin distinguir mayúsculas), mismo número
 * de filas y mismas filas en el mismo orden. Los mensajes dicen qué difiere, sin revelar la solución.
 */
export function compareTables(expected: ExpectedTable, actual: ActualTable): Comparison {
  const problems: string[] = [];
  const want = expected.columns.map((c) => c.toLowerCase());
  const got = actual.columns.map((c) => String(c).toLowerCase());
  if (want.length !== got.length || want.some((c, i) => c !== got[i])) {
    problems.push(`Esperaba las columnas [${expected.columns.join(', ')}] en ese orden y devolviste [${actual.columns.join(', ')}].`);
    return { match: false, problems };
  }
  if (expected.rows.length !== actual.rows.length) {
    problems.push(`Esperaba ${expected.rows.length} ${expected.rows.length === 1 ? 'fila' : 'filas'} y devolviste ${actual.rows.length}.`);
  }
  const common = Math.min(expected.rows.length, actual.rows.length);
  let wrong = 0;
  for (let i = 0; i < common; i++) {
    const exp = expected.rows[i]!;
    const act = actual.rows[i]!;
    if (exp.every((v, j) => sameValue(v, act[j]))) continue;
    wrong++;
    if (wrong <= 3) problems.push(`Fila ${i + 1}: esperaba ${show(exp)} y obtuve ${show(act)}.`);
  }
  if (wrong > 3) problems.push(`…y ${wrong - 3} fila(s) más con diferencias.`);
  return { match: problems.length === 0, problems };
}
