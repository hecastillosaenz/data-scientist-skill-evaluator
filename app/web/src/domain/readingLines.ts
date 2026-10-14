import type { TimePoint } from './stats';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Plantilla de UI-UX §6: "Tu tiempo real bajó de ~{a} min a ~{b} min en {P} días;
 * {ya está cerca del estimado | sigue {d} min por encima}."
 * Compara la primera mitad de los puntos contra la segunda.
 */
export function timeReadingLine(points: TimePoint[], periodDays: number): string {
  if (points.length < 4) return 'Aún no hay suficientes etapas aprobadas para comparar tu tiempo real con el estimado.';
  const half = Math.floor(points.length / 2);
  const a = Math.round(mean(points.slice(0, half).map((p) => p.real)));
  const b = Math.round(mean(points.slice(-half).map((p) => p.real)));
  const estimated = mean(points.slice(-half).map((p) => p.estimated));
  const diff = Math.round(b - estimated);
  const verb = b < a ? 'bajó' : b > a ? 'subió' : 'se mantuvo';
  const trend = b === a ? `se mantuvo en ~${b} min` : `${verb} de ~${a} min a ~${b} min`;
  const tail =
    diff <= Math.max(3, estimated * 0.1)
      ? 'ya está cerca del estimado'
      : `sigue ${diff} min por encima del estimado`;
  return `Tu tiempo real ${trend} en ${periodDays} días; ${tail}.`;
}
