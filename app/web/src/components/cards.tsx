import type { CSSProperties, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import styles from './cards.module.css';

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`${styles.card} ${className}`} style={style}>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

interface KpiProps {
  label: string;
  value: ReactNode;
  /** 0..1, opcional */
  progress?: number;
  context?: ReactNode;
}

export function KpiCard({ label, value, progress, context }: KpiProps) {
  return (
    <Card className={styles.kpi}>
      <h3>{label}</h3>
      <div className={`${styles.kpiValue} mono`}>{value}</div>
      {progress !== undefined && (
        <div className={styles.kpiTrack} aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
        </div>
      )}
      {context && <p className={styles.kpiContext}>{context}</p>}
    </Card>
  );
}

/** Frase que interpreta el gráfico; obligatoria en toda tarjeta de Analítica. */
export function ReadingLine({ children }: { children: ReactNode }) {
  return <p className={styles.reading}>{children}</p>;
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>{icon ?? <Inbox size={22} strokeWidth={1.5} />}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Panel lateral fijo (sticky) para preview de challenge, refuerzo o nodo del grafo. */
export function StickyPanel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside className={styles.sticky} aria-label={label}>
      {children}
    </aside>
  );
}

export function SampleDataTag() {
  return <span className={styles.sample}>Datos de ejemplo</span>;
}

export function Skeleton({ w = '100%', h = 16, r = 8 }: { w?: number | string; h?: number | string; r?: number }) {
  return <span className={styles.skeleton} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}
