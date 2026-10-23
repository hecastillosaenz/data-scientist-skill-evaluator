/** Modelos que se pueden pedir para el Generador (alias de Claude Code: apuntan siempre al más reciente de cada familia). */
export const MODELOS: { value: string; label: string; hint: string }[] = [
  { value: '', label: 'Predeterminado', hint: 'El modelo que tengas configurado en Claude Code (/model o CLAUDE_MODEL).' },
  { value: 'opus', label: 'Opus', hint: 'El más capaz: mejores casos y menos reparaciones, pero el más lento y el que más cuota consume.' },
  { value: 'sonnet', label: 'Sonnet', hint: 'Equilibrado: buena calidad a velocidad y costo razonables.' },
  { value: 'haiku', label: 'Haiku', hint: 'El más rápido y barato; puede fallar más validaciones y gastar reparaciones.' },
];

const KEY = 'dsc.modelo';

/** Último modelo elegido (comodidad por navegador; si el almacenamiento falla, se usa el predeterminado). */
export function savedModelo(): string {
  try {
    const v = window.localStorage.getItem(KEY) ?? '';
    return MODELOS.some((m) => m.value === v) ? v : '';
  } catch {
    return '';
  }
}

export function rememberModelo(value: string): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // sin almacenamiento: no pasa nada
  }
}
