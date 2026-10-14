export type ThemePreference = 'claro' | 'oscuro' | 'sistema';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'dsc-theme';
export const DEFAULT_PREFERENCE: ThemePreference = 'claro';

export const isPreference = (value: unknown): value is ThemePreference =>
  value === 'claro' || value === 'oscuro' || value === 'sistema';

/** 'sistema' sigue prefers-color-scheme; las otras dos son explícitas. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'oscuro') return 'dark';
  if (preference === 'claro') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}

/** Lee la preferencia guardada; cualquier fallo (storage bloqueado, valor inválido) devuelve el valor por defecto. */
export function readPreference(storage: Pick<Storage, 'getItem'> | null): ThemePreference {
  try {
    const value = storage?.getItem(THEME_KEY);
    return isPreference(value) ? value : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function writePreference(storage: Pick<Storage, 'setItem'> | null, preference: ThemePreference): void {
  try {
    storage?.setItem(THEME_KEY, preference);
  } catch {
    /* sin almacenamiento: la preferencia vale solo para esta sesión */
  }
}
