import { BLOCKER_LABEL, DIFFICULTY_LABEL, DOMAIN_BY_ID } from '../../../shared/domains';
import type { BlockerTrend, DifficultyPerformance, DomainApoyo, DomainGap } from './analytics';
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

export function weaknessReadingLine(items: BlockerTrend[], total: number, days: number): string {
  const top = items[0];
  if (!top) return `Sin bloqueos registrados en ${days} días: cuando marques dónde te trabaste, aquí verás el patrón.`;
  return `«${BLOCKER_LABEL[top.blocker]}» es el bloqueo más frecuente: ${top.count} de ${total} en ${days} días.`;
}

export function gapsReadingLine(gaps: DomainGap[]): string {
  const worst = [...gaps].sort((a, b) => b.missing / b.total - a.missing / a.total || b.missing - a.missing)[0];
  if (!worst) return '';
  return `${DOMAIN_BY_ID[worst.domain].name} tiene la mayor brecha: ${worst.missing} de ${worst.total} conceptos sin evidencia en 30 días.`;
}

export function domainsReadingLine(rows: DomainApoyo[]): string {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const top = [...rows].sort((a, b) => b.total - a.total)[0];
  if (!top || total === 0) return 'Aún no hay etapas practicadas en este periodo.';
  return `${DOMAIN_BY_ID[top.domain].name} es el dominio que más practicaste (${top.total} de ${total}).`;
}

export function difficultyReadingLine(rows: DifficultyPerformance[]): string {
  const withDev = rows.filter((r) => r.deviation !== null);
  const worst = [...withDev].sort((a, b) => Math.abs(b.deviation!) - Math.abs(a.deviation!))[0];
  if (!worst) return 'Aún no hay etapas aprobadas para medir tu desvío frente a lo estimado.';
  const n = Math.round(Math.abs(worst.deviation!));
  const tail = worst.deviation! >= 0 ? `+${n} min sobre lo estimado` : `${n} min por debajo de lo estimado`;
  return `${DIFFICULTY_LABEL[worst.difficulty]} es donde más te desvías: ${tail}.`;
}

export function activityReadingLine(practicedDays: number, periodDays: number, longest: number): string {
  return `Practicaste ${practicedDays} de ${periodDays} días. Racha más larga del periodo: ${longest} ${longest === 1 ? 'día' : 'días'}.`;
}
