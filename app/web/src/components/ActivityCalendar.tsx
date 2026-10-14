import { addDays, dayKey } from '../domain/stats';
import { formatLongDate, formatMonth } from '../charts/format';

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
import styles from './ActivityCalendar.module.css';

const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface Props {
  now: Date;
  activeDays: Set<string>;
  streakDays: Set<string>;
}

/** Calendario mensual; los días de la racha actual van rellenos, los demás con práctica llevan un punto. */
export function ActivityCalendar({ now, activeDays, streakDays }: Props) {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  const today = dayKey(now);

  return (
    <div>
      <p className={styles.month}>{cap(formatMonth(now))}</p>
      <div className={styles.grid} role="grid" aria-label={`Calendario de ${formatMonth(now)}`}>
        {HEAD.map((h) => (
          <span key={h} className={styles.head} role="columnheader">{h}</span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} role="gridcell" />;
          const key = dayKey(date);
          const inStreak = streakDays.has(key);
          const practiced = activeDays.has(key);
          const state = inStreak ? 'de la racha' : practiced ? 'con práctica' : 'sin práctica';
          return (
            <span
              key={key}
              role="gridcell"
              aria-label={`${formatLongDate(date)}, ${state}`}
              className={`${styles.day} mono ${inStreak ? styles.streak : ''} ${practiced && !inStreak ? styles.practiced : ''} ${key === today ? styles.today : ''}`}
            >
              {date.getDate()}
            </span>
          );
        })}
      </div>
      <p className={styles.legend}>
        <span><i className={styles.swStreak} /> Racha actual</span>
        <span><i className={styles.swPracticed} /> Con práctica</span>
      </p>
    </div>
  );
}
