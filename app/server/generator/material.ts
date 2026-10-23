import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Material de estudio en una carpeta del repo (SDD R49, R50). El orquestador solo **escanea** y arma un índice; el
 * Generador abre lo que necesite (Claude Code lee PDF por páginas). Nada de esto se ejecuta ni se envía a otros roles.
 */
export type MaterialKind = 'pdf' | 'md' | 'txt' | 'ipynb';

export interface MaterialFile {
  /** Ruta relativa a la carpeta del foco, con `/`. */
  path: string;
  kind: MaterialKind;
  bytes: number;
}

export interface MaterialSkipped {
  path: string;
  reason: string;
}

export interface MaterialScan {
  /** Ruta tal como la escribió el usuario (relativa al repo). */
  carpeta: string;
  /** Carpeta absoluta y real, o `null` si no se pudo usar. */
  dir: string | null;
  files: MaterialFile[];
  skipped: MaterialSkipped[];
  /** Por qué no se pudo usar la carpeta; vacío si todo bien. */
  problem?: string;
}

/** Carpeta estándar de la biblioteca de estudio (ignorada por git). El Generador la mira en cada reto. */
export const MATERIAL_DIR = 'material';

export const MATERIAL_LIMITS = { maxFiles: 60, maxDepth: 3, maxPdfBytes: 25 * 1024 * 1024, maxTextBytes: 1024 * 1024 } as const;
const KIND_BY_EXT: Record<string, MaterialKind> = { '.pdf': 'pdf', '.md': 'md', '.markdown': 'md', '.txt': 'txt', '.ipynb': 'ipynb' };
const BLOCKED_SEGMENTS = new Set(['.git', 'node_modules', '.venv', '.env']);

/** Comprobación de forma (sin tocar disco): lo que se puede rechazar al guardar el foco. Devuelve el motivo o `null`. */
export function carpetaError(carpeta: string): string | null {
  const c = carpeta.trim();
  if (c === '') return 'La carpeta está vacía.';
  if (c.length > 200) return 'La carpeta supera 200 caracteres.';
  if (c.includes('\0')) return 'La carpeta tiene caracteres no válidos.';
  if (path.isAbsolute(c) || /^[a-zA-Z]:[\\/]/.test(c) || c.startsWith('~')) return 'Usa una ruta relativa a la raíz del repo, p. ej. «material/mi-curso».';
  const parts = c.split(/[\\/]+/).filter((p) => p !== '' && p !== '.');
  if (parts.length === 0) return 'Indica una subcarpeta del repo, no la raíz.';
  if (parts.includes('..')) return 'La carpeta no puede salir del repo («..»).';
  const hidden = parts.find((p) => p.startsWith('.') || BLOCKED_SEGMENTS.has(p));
  if (hidden) return `No se admiten carpetas ocultas ni «${hidden}».`;
  return null;
}

const inside = (root: string, target: string) => target === root || target.startsWith(`${root}${path.sep}`);

/**
 * Escanea la carpeta de un foco. Nunca lanza por un problema del usuario (carpeta ausente, permisos): devuelve `problem`
 * para avisar y seguir sin ese material (R50). Los enlaces simbólicos que salen de la carpeta se omiten.
 */
export async function scanMaterial(repoRoot: string, carpeta: string): Promise<MaterialScan> {
  const empty = (problem: string): MaterialScan => ({ carpeta, dir: null, files: [], skipped: [], problem });
  const bad = carpetaError(carpeta);
  if (bad) return empty(bad);

  let root: string;
  let dir: string;
  try {
    root = await realpath(repoRoot);
    dir = await realpath(path.resolve(root, carpeta.trim()));
  } catch {
    return empty(`No encuentro la carpeta «${carpeta.trim()}» en el repo. Créala y pon ahí tu material.`);
  }
  if (!inside(root, dir)) return empty('La carpeta resuelve fuera del repo (enlace simbólico): no se usa.');
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) return empty(`«${carpeta.trim()}» no es una carpeta.`);

  const files: MaterialFile[] = [];
  const skipped: MaterialSkipped[] = [];
  const walk = async (current: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      skipped.push({ path: path.relative(dir, current) || '.', reason: 'No se pudo leer la carpeta' });
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      if (entry.name.startsWith('.') || BLOCKED_SEGMENTS.has(entry.name)) continue;
      let real: string;
      try {
        real = await realpath(full);
      } catch {
        skipped.push({ path: rel, reason: 'Enlace roto' });
        continue;
      }
      if (!inside(dir, real)) {
        skipped.push({ path: rel, reason: 'Enlace que sale de la carpeta' });
        continue;
      }
      const s = await stat(real).catch(() => null);
      if (!s) continue;
      if (s.isDirectory()) {
        if (depth >= MATERIAL_LIMITS.maxDepth) skipped.push({ path: rel, reason: `Más de ${MATERIAL_LIMITS.maxDepth} niveles de profundidad` });
        else await walk(full, depth + 1);
        continue;
      }
      if (!s.isFile()) continue;
      const kind = KIND_BY_EXT[path.extname(entry.name).toLowerCase()];
      if (!kind) {
        skipped.push({ path: rel, reason: 'Tipo no admitido (solo PDF, Markdown, texto y notebooks)' });
        continue;
      }
      const max = kind === 'pdf' ? MATERIAL_LIMITS.maxPdfBytes : MATERIAL_LIMITS.maxTextBytes;
      if (s.size > max) {
        skipped.push({ path: rel, reason: `Pesa más de ${Math.round(max / 1024 / 1024)} MB` });
        continue;
      }
      if (s.size === 0) {
        skipped.push({ path: rel, reason: 'Está vacío' });
        continue;
      }
      if (files.length >= MATERIAL_LIMITS.maxFiles) {
        skipped.push({ path: rel, reason: `Más de ${MATERIAL_LIMITS.maxFiles} archivos` });
        continue;
      }
      files.push({ path: rel, kind, bytes: s.size });
    }
  };
  await walk(dir, 1);
  return { carpeta: carpeta.trim(), dir, files, skipped };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
