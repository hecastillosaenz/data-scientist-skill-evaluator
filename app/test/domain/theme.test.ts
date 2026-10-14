import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCE, readPreference, resolveTheme, writePreference } from '../../web/src/theme/theme';

describe('tema', () => {
  it('claro y oscuro son explícitos y sistema sigue al navegador', () => {
    expect(resolveTheme('claro', true)).toBe('light');
    expect(resolveTheme('oscuro', false)).toBe('dark');
    expect(resolveTheme('sistema', true)).toBe('dark');
    expect(resolveTheme('sistema', false)).toBe('light');
  });

  it('por defecto es claro', () => {
    expect(DEFAULT_PREFERENCE).toBe('claro');
    expect(readPreference({ getItem: () => null })).toBe('claro');
  });

  it('lee una preferencia válida y descarta una inválida', () => {
    expect(readPreference({ getItem: () => 'oscuro' })).toBe('oscuro');
    expect(readPreference({ getItem: () => 'rojo' })).toBe('claro');
  });

  it('no falla si el almacenamiento lanza o no existe', () => {
    expect(readPreference({ getItem: () => { throw new Error('bloqueado'); } })).toBe('claro');
    expect(readPreference(null)).toBe('claro');
    expect(() => writePreference({ setItem: () => { throw new Error('bloqueado'); } }, 'oscuro')).not.toThrow();
    expect(() => writePreference(null, 'oscuro')).not.toThrow();
  });

  it('guarda la preferencia', () => {
    const saved: Record<string, string> = {};
    writePreference({ setItem: (k, v) => { saved[k] = v; } }, 'sistema');
    expect(saved['dsc-theme']).toBe('sistema');
  });
});
