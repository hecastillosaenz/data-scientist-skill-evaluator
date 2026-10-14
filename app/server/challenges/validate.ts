import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { Challenge, Stage } from '../../shared/types';
import { REPO_ROOT } from '../paths';

/** Esquema de `challenge.json` (SDD R29): el mismo archivo que lee el Generador. */
export const SCHEMA_PATH = path.join(REPO_ROOT, 'configuracion-retos', 'plantillas', 'challenge.schema.json');

let validator: ReturnType<Ajv2020['compile']> | null = null;
const compiled = () => {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    validator = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
  }
  return validator;
};

export interface ValidationOptions {
  /**
   * Modo estricto (challenges reales): exige el contenido completo que el Generador debe producir. En modo laxo
   * (challenges de ejemplo compactos) solo se exige estructura coherente.
   */
  strict?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  /** Mensajes en español, de más a menos importante, listos para mostrar. */
  errors: string[];
}

const pretty = (instancePath: string) =>
  instancePath
    .replace(/^\//, '')
    .replace(/\/(\d+)/g, (_m, n: string) => `[${Number(n) + 1}]`)
    .replace(/\//g, '.') || '(raíz)';

function schemaErrors(value: unknown): string[] {
  const validate = compiled();
  if (validate(value)) return [];
  return (validate.errors ?? []).map((e) => {
    const where = pretty(e.instancePath);
    if (e.keyword === 'required') return `Falta el campo «${(e.params as { missingProperty: string }).missingProperty}» en ${where}.`;
    if (e.keyword === 'additionalProperties') return `Campo no permitido «${(e.params as { additionalProperty: string }).additionalProperty}» en ${where}.`;
    if (e.keyword === 'minItems') return `${where} necesita al menos ${(e.params as { limit: number }).limit} elementos.`;
    if (e.keyword === 'maxItems') return `${where} admite como máximo ${(e.params as { limit: number }).limit} elementos.`;
    if (e.keyword === 'minLength') return `${where} es demasiado corto (mínimo ${(e.params as { limit: number }).limit} caracteres).`;
    if (e.keyword === 'enum') return `${where} debe ser uno de: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')}.`;
    return `${where}: ${e.message ?? 'no cumple el esquema'}.`;
  });
}

/** Contenido completo que exige el modo estricto a una etapa (todas las capas de ayuda y su verificación). */
export function strictStageErrors(s: Stage): string[] {
  const errors: string[] = [];
  if (s.mechanism === 'codigo_assert' && !s.content.expected && !s.content.asserts) {
    errors.push(`La etapa ${s.number} es de código y necesita \`expected\` (tabla esperada) o \`asserts\` para poder verificarse.`);
  }
  const k = s.content;
  const missing = [
    ['teoría', k.theory?.length],
    ['ejemplo resuelto', k.workedExample],
    ['paso a paso', k.steps?.length],
    ['pistas', k.hints?.length],
    ['conceptos para investigar', k.research?.length],
    ['solución', k.solution],
  ].filter(([, v]) => !v).map(([n]) => n);
  if (missing.length) errors.push(`Etapa ${s.number}: falta contenido de estudio (${missing.join(', ')}); el Generador produce todas las capas de ayuda.`);
  for (const r of k.research ?? []) if (!s.conceptIds.includes(r.conceptId)) errors.push(`Etapa ${s.number}: investiga «${r.conceptId}», que no figura en sus \`conceptIds\`.`);
  return errors;
}

/** Reglas que un JSON Schema no expresa: ids coherentes, llaves foráneas reales, filas con el ancho correcto, etc. */
function semanticErrors(c: Challenge, strict: boolean): string[] {
  const errors: string[] = [];
  const numbers = c.stages.map((s) => s.number);
  if (numbers.some((n, i) => n !== i + 1)) errors.push('Las etapas deben numerarse 1, 2, 3… sin saltos y en orden.');
  for (const s of c.stages) {
    if (s.id !== `${c.id}-s${s.number}`) errors.push(`La etapa ${s.number} debe llamarse «${c.id}-s${s.number}» y se llama «${s.id}».`);
    if (s.challengeId !== c.id) errors.push(`La etapa ${s.number} apunta a otro challenge («${s.challengeId}»).`);
    if (s.content.expected) {
      const width = s.content.expected.columns.length;
      s.content.expected.rows.forEach((row, i) => row.length !== width && errors.push(`Etapa ${s.number}: la fila ${i + 1} esperada tiene ${row.length} valores y hay ${width} columnas.`));
    }
  }

  const tables = new Map((c.data?.tables ?? []).map((t) => [t.name, t]));
  for (const t of tables.values()) {
    t.sampleRows.forEach((row, i) => row.length !== t.columns.length && errors.push(`Tabla «${t.name}»: la fila de muestra ${i + 1} tiene ${row.length} valores y hay ${t.columns.length} columnas.`));
    for (const col of t.columns) {
      if (!col.fk) continue;
      const target = tables.get(col.fk.table);
      if (!target) errors.push(`Tabla «${t.name}»: la columna «${col.name}» referencia a una tabla inexistente («${col.fk.table}»).`);
      else if (!target.columns.some((x) => x.name === col.fk!.column)) errors.push(`Tabla «${t.name}»: «${col.name}» referencia a una columna inexistente («${col.fk.table}.${col.fk.column}»).`);
    }
  }

  const stageConcepts = new Set(c.stages.flatMap((s) => s.conceptIds));
  const ids = [...c.businessQuestions.map((q) => q.id), ...(c.finalTest ?? []).map((q) => q.id)];
  if (new Set(ids).size !== ids.length) errors.push('Los ids de las preguntas (de negocio y del test) deben ser únicos.');
  for (const q of c.finalTest ?? []) {
    if (!stageConcepts.has(q.conceptId)) errors.push(`Test «${q.id}»: el concepto «${q.conceptId}» no lo practica ninguna etapa del challenge.`);
    if (q.kind === 'opcion_multiple' && q.options && (q.correctIndex ?? -1) >= q.options.length) errors.push(`Test «${q.id}»: \`correctIndex\` apunta fuera de las opciones.`);
  }

  if (strict) {
    if (c.businessQuestions.length < 3) errors.push('Un challenge real necesita al menos 3 preguntas de negocio (Básico 3, Intermedio 4, Avanzado 5).');
    if (!c.finalTest) errors.push('Un challenge real necesita el test final de retención (5–8 preguntas).');
    if (!c.data && c.stages.some((s) => s.domain === 'sql')) errors.push('Hay etapas de SQL pero el challenge no declara `data` (tablas y seed).');
    if (c.data?.engine === 'duckdb' && !c.data.seedSql) errors.push('Los datos de DuckDB necesitan `seedSql`.');
    for (const s of c.stages) errors.push(...strictStageErrors(s));
  }
  return errors;
}

/** Valida un `challenge.json` contra el contrato (R29). Nunca lanza: devuelve los errores para mostrarlos. */
export function validateChallenge(value: unknown, { strict = false }: ValidationOptions = {}): ValidationResult {
  const structural = schemaErrors(value);
  // Si la estructura está rota no tiene sentido comprobar las reglas semánticas (podrían fallar por datos ausentes).
  if (structural.length > 0) return { ok: false, errors: structural };
  const errors = semanticErrors(value as Challenge, strict);
  return { ok: errors.length === 0, errors };
}
