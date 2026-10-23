const short = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('es', { weekday: 'short' });
const long = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const month = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' });

export const formatShortDate = (d: Date) => short.format(d).replace('.', '');
export const formatWeekday = (d: Date) => weekday.format(d).replace('.', '');
export const formatLongDate = (d: Date) => long.format(d);
export const formatMonth = (d: Date) => month.format(d);

export function niceMax(value: number): number {
  if (value <= 0) return 10;
  const step = value <= 20 ? 5 : value <= 60 ? 10 : 20;
  return Math.ceil(value / step) * step;
}

export function relativeTime(date: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

/** Duración legible: «45 min», «1 h 30 min», «2 h»; desde 8 h se muestra también en días de trabajo no, solo en horas. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
