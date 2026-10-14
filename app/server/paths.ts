import { resolve } from 'node:path';

/** Raíz del repo (dos niveles arriba de app/server). */
export const REPO_ROOT = resolve(import.meta.dirname, '../..');

export function configDir(repoRoot: string = REPO_ROOT): string {
  return resolve(repoRoot, 'configuracion-retos');
}

export const WEB_DIST = resolve(import.meta.dirname, '../web/dist');
