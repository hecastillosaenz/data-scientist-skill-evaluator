import type { ReactNode } from 'react';
import styles from './ChartTooltip.module.css';

/** Tooltip de gráfico: fondo #15171C, texto blanco (UI-UX §2). Se posiciona en coordenadas relativas al contenedor del gráfico. */
export function ChartTooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className={`${styles.tip} mono`} style={{ left: x, top: y }} role="status">
      {children}
    </div>
  );
}
