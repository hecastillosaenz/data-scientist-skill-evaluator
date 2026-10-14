import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EMPTY_OBJETIVOS, FOCO_ESTADOS, MAX_MATERIAL_ALMACENADO, type Foco, type Objetivos } from '../../shared/objetivos';
import { writeFileAtomic } from '../atomic-write';
import { carpetaError } from '../generator/material';
import { configDir } from '../paths';

/** `objetivos.json` existe pero no cumple el formato (R44): se informa y no se toca. */
export class ObjetivosError extends Error {
  constructor(readonly errors: string[]) {
    super(`objetivos.json no es válido: ${errors[0] ?? 'formato desconocido'}${errors.length > 1 ? ` (y ${errors.length - 1} errores más)` : ''}`);
    this.name = 'ObjetivosError';
  }
}

export const objetivosPath = (repoRoot: string): string => path.join(configDir(repoRoot), 'objetivos.json');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidateContext {
  /** Ids de los conceptos del grafo: un foco no puede apuntar a uno que no existe. */
  conceptIds: ReadonlySet<string>;
  focosActivosMax: number;
}

/** Valida y normaliza (recorta textos). Devuelve todos los errores a la vez, en español. */
export function validateObjetivos(value: unknown, ctx: ValidateContext): { ok: true; objetivos: Objetivos } | { ok: false; errors: string[] } {
  if (!isRecord(value)) return { ok: false, errors: ['La raíz debe ser un objeto con `rol` y `focos`.'] };
  const errors: string[] = [];
  if (value.version !== 1) errors.push('`version` debe ser 1.');
  const rol = typeof value.rol === 'string' ? value.rol.trim() : null;
  if (rol === null || rol.length > 120) errors.push('`rol` debe ser un texto de hasta 120 caracteres.');
  if (!Array.isArray(value.focos)) return { ok: false, errors: [...errors, '`focos` debe ser una lista.'] };

  const focos: Foco[] = [];
  const ids = new Set<string>();
  value.focos.forEach((f, i) => {
    const at = `focos[${i}]`;
    if (!isRecord(f)) return void errors.push(`${at}: debe ser un objeto.`);
    const id = typeof f.id === 'string' ? f.id.trim() : '';
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) errors.push(`${at}: \`id\` debe ser minúsculas, números y guiones (hasta 41 caracteres).`);
    else if (ids.has(id)) errors.push(`${at}: el id «${id}» está repetido.`);
    ids.add(id);
    const titulo = typeof f.titulo === 'string' ? f.titulo.trim() : '';
    if (titulo === '' || titulo.length > 120) errors.push(`${at} («${id}»): \`titulo\` debe tener entre 1 y 120 caracteres.`);
    if (typeof f.estado !== 'string' || !(FOCO_ESTADOS as readonly string[]).includes(f.estado)) errors.push(`${at} («${id}»): \`estado\` debe ser ${FOCO_ESTADOS.join(', ')}.`);
    const conceptIds = Array.isArray(f.conceptIds) && f.conceptIds.every((c) => typeof c === 'string') ? [...new Set(f.conceptIds as string[])] : null;
    if (!conceptIds) errors.push(`${at} («${id}»): \`conceptIds\` debe ser una lista de ids.`);
    else for (const c of conceptIds) if (!ctx.conceptIds.has(c)) errors.push(`${at} («${id}»): el concepto «${c}» no existe en el grafo.`);
    const material = typeof f.material === 'string' ? f.material : '';
    if (typeof f.material !== 'string' && f.material !== undefined) errors.push(`${at} («${id}»): \`material\` debe ser texto.`);
    if (material.length > MAX_MATERIAL_ALMACENADO) errors.push(`${at} («${id}»): \`material\` supera ${MAX_MATERIAL_ALMACENADO} caracteres.`);
    if (f.carpeta !== undefined && f.carpeta !== '') {
      const why = typeof f.carpeta === 'string' ? carpetaError(f.carpeta) : '`carpeta` debe ser texto.';
      if (why) errors.push(`${at} («${id}»): ${why}`);
    }
    for (const key of ['desde', 'hasta'] as const) {
      const d = f[key];
      if (d !== undefined && d !== '' && (typeof d !== 'string' || !DATE.test(d) || Number.isNaN(Date.parse(d)))) errors.push(`${at} («${id}»): \`${key}\` debe ser una fecha AAAA-MM-DD.`);
    }
    if (typeof f.desde === 'string' && typeof f.hasta === 'string' && f.desde && f.hasta && f.hasta < f.desde) errors.push(`${at} («${id}»): \`hasta\` es anterior a \`desde\`.`);
    if (errors.length === 0 || typeof f.estado === 'string') {
      focos.push({
        id,
        titulo,
        estado: f.estado as Foco['estado'],
        conceptIds: conceptIds ?? [],
        material,
        ...(typeof f.carpeta === 'string' && f.carpeta.trim() ? { carpeta: f.carpeta.trim().replace(/\\/g, '/').replace(/\/+$/, '') } : {}),
        ...(typeof f.desde === 'string' && f.desde ? { desde: f.desde } : {}),
        ...(typeof f.hasta === 'string' && f.hasta ? { hasta: f.hasta } : {}),
      });
    }
  });
  const active = focos.filter((f) => f.estado === 'activo').length;
  if (active > ctx.focosActivosMax) errors.push(`Hay ${active} focos activos y el máximo es ${ctx.focosActivosMax}: pausa alguno.`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, objetivos: { version: 1, rol: rol ?? '', focos } };
}

/** Lee `objetivos.json`; ausente = sin objetivos. Uno corrupto lanza `ObjetivosError` y no se modifica. */
export async function readObjetivos(repoRoot: string, ctx: ValidateContext): Promise<Objetivos> {
  let text: string;
  try {
    text = await readFile(objetivosPath(repoRoot), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_OBJETIVOS, focos: [] };
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ObjetivosError(['no es un JSON válido.']);
  }
  // Un concepto que ya no existe no debe romper la lectura: se quita al leer y se corrige en el siguiente guardado.
  if (isRecord(json) && Array.isArray(json.focos)) {
    for (const f of json.focos) if (isRecord(f) && Array.isArray(f.conceptIds)) f.conceptIds = f.conceptIds.filter((c) => typeof c === 'string' && ctx.conceptIds.has(c));
  }
  const result = validateObjetivos(json, { ...ctx, focosActivosMax: Number.MAX_SAFE_INTEGER });
  if (!result.ok) throw new ObjetivosError(result.errors);
  return result.objetivos;
}

/** Escritura atómica (S6). Valida antes de escribir para no dejar nunca un archivo inválido. */
export async function writeObjetivos(repoRoot: string, value: unknown, ctx: ValidateContext): Promise<Objetivos> {
  const result = validateObjetivos(value, ctx);
  if (!result.ok) throw new ObjetivosError(result.errors);
  await writeFileAtomic(objetivosPath(repoRoot), `${JSON.stringify(result.objetivos, null, 2)}\n`);
  return result.objetivos;
}

/** Focos activos y vigentes (no vencidos): los que influyen en el plan (R45). */
export function focosVigentes(objetivos: Objetivos, today: Date): Foco[] {
  const day = today.toISOString().slice(0, 10);
  return objetivos.focos.filter((f) => f.estado === 'activo' && (!f.hasta || f.hasta >= day) && (!f.desde || f.desde <= day));
}

/** Contexto para el Generador: título y material recortado de los focos vigentes (R45). */
export function contextoGenerador(focos: Foco[], maxChars: number): { rol?: string; focos: { titulo: string; material: string }[] } {
  const per = focos.length > 0 ? Math.floor(maxChars / focos.length) : 0;
  return { focos: focos.map((f) => ({ titulo: f.titulo, material: f.material.length > per ? `${f.material.slice(0, per).trimEnd()}…` : f.material })) };
}
