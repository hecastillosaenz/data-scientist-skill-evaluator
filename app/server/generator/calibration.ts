import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configDir } from '../paths';

/** Parámetros del Generador y del Analista (SDD R38, R39, R42), ajustables en `configuracion-retos/calibracion.json` sin tocar código. */
export interface CalibrationConfig {
  /** Evidence registradas a partir de las cuales deja de ser el modo *arranque* (R4). */
  evidenciaSuficiente: number;
  etapasPorChallenge: number;
  /** Días sin practicar para que un concepto dominado entre como *consolidación*. */
  diasOlvido: number;
  /** Cuántos challenges recientes no pueden repetir dataset ni sector. */
  ventanaTemas: number;
  /** Tope de `--max-budget-usd` por fase de generación: medido en una generación real (ver SDD §8.4). */
  presupuestoUsdPorFase: number;
  reparacionesPorFase: number;
  horasConservacion: number;
  /** Tope de `--max-budget-usd` por análisis del Analista (R42). */
  presupuestoUsdAnalisis: number;
}

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  evidenciaSuficiente: 8,
  etapasPorChallenge: 3,
  diasOlvido: 21,
  ventanaTemas: 3,
  presupuestoUsdPorFase: 0.75,
  reparacionesPorFase: 2,
  horasConservacion: 24,
  presupuestoUsdAnalisis: 0.3,
};

export class CalibrationError extends Error {
  constructor(readonly errors: string[]) {
    super(`calibracion.json no es válido: ${errors.join(' ')}`);
    this.name = 'CalibrationError';
  }
}

const RULES: Record<keyof CalibrationConfig, { min: number; max: number; integer: boolean }> = {
  evidenciaSuficiente: { min: 0, max: 1000, integer: true },
  etapasPorChallenge: { min: 2, max: 6, integer: true },
  diasOlvido: { min: 1, max: 365, integer: true },
  ventanaTemas: { min: 0, max: 20, integer: true },
  presupuestoUsdPorFase: { min: 0.05, max: 50, integer: false },
  reparacionesPorFase: { min: 0, max: 5, integer: true },
  horasConservacion: { min: 1, max: 720, integer: true },
  presupuestoUsdAnalisis: { min: 0.02, max: 20, integer: false },
};

/** Valida un objeto y completa con los valores por defecto lo que falte. Lo desconocido (salvo `$comentario`) es un error. */
export function parseCalibration(value: unknown): CalibrationConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CalibrationError(['La raíz debe ser un objeto.']);
  const input = value as Record<string, unknown>;
  const errors: string[] = [];
  const out: CalibrationConfig = { ...DEFAULT_CALIBRATION };
  for (const key of Object.keys(input)) {
    if (key === '$comentario') continue;
    const rule = RULES[key as keyof CalibrationConfig];
    if (!rule) {
      errors.push(`Parámetro desconocido: «${key}».`);
      continue;
    }
    const v = input[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < rule.min || v > rule.max || (rule.integer && !Number.isInteger(v))) {
      errors.push(`«${key}» debe ser un número${rule.integer ? ' entero' : ''} entre ${rule.min} y ${rule.max}.`);
      continue;
    }
    out[key as keyof CalibrationConfig] = v;
  }
  if (errors.length > 0) throw new CalibrationError(errors);
  return out;
}

/** Lee `calibracion.json`; si no existe usa los valores por defecto, y si existe pero es inválido lo dice (no adivina). */
export async function loadCalibration(repoRoot: string): Promise<CalibrationConfig> {
  let text: string;
  try {
    text = await readFile(path.join(configDir(repoRoot), 'calibracion.json'), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CALIBRATION };
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new CalibrationError(['No es un JSON válido.']);
  }
  return parseCalibration(json);
}
