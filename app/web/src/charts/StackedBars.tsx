import { useRef, useState } from 'react';
import { ChartTooltip } from '../components/ChartTooltip';
import { useElementWidth } from './useElementWidth';
import styles from './charts.module.css';

export interface Segment {
  key: string;
  label: string;
  value: number;
}

export interface BarDatum {
  label: string;
  tooltipTitle: string;
  segments: Segment[];
}

interface Props {
  bars: BarDatum[];
  /** Variable CSS de color por clave de segmento, p. ej. `--s1`. */
  colorVar: (key: string) => string;
  height?: number;
  ariaLabel: string;
}

const M = { t: 10, b: 24 };

/** Barras apiladas verticales con tooltip; accesibles por teclado (cada barra es enfocable). */
export function StackedBars({ bars, colorVar, height = 180, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref, 320);
  const [active, setActive] = useState<number | null>(null);
  const totals = bars.map((b) => b.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(3, ...totals);
  const innerH = height - M.t - M.b;
  const slot = width / bars.length;
  const barW = Math.min(36, slot * 0.6);
  const unit = innerH / max;

  return (
    <div ref={ref} className={styles.wrap}>
      <svg width={width} height={height} role="group" aria-label={ariaLabel}>
        <line x1={0} x2={width} y1={height - M.b} y2={height - M.b} className={styles.grid} />
        {bars.map((bar, i) => {
          const x = slot * i + (slot - barW) / 2;
          let y = height - M.b;
          return (
            <g
              key={i}
              tabIndex={0}
              role="img"
              aria-label={`${bar.tooltipTitle}: ${totals[i]} etapas${bar.segments.filter((s) => s.value).map((s) => `, ${s.label} ${s.value}`).join('')}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <rect x={slot * i} y={0} width={slot} height={height - M.b} fill="transparent" />
              {bar.segments.filter((s) => s.value > 0).map((s) => {
                const h = s.value * unit;
                y -= h;
                return <rect key={s.key} x={x} y={y + 1} width={barW} height={Math.max(1, h - 2)} rx={3} style={{ fill: `var(${colorVar(s.key)})` }} />;
              })}
              <text x={slot * i + slot / 2} y={height - 7} className={styles.axisX} textAnchor="middle">{bar.label}</text>
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <ChartTooltip x={Math.min(Math.max(slot * active + slot / 2, 70), width - 70)} y={height - M.b - totals[active]! * unit}>
          <div>{bars[active]!.tooltipTitle} · {totals[active]} etapas</div>
          {bars[active]!.segments.filter((s) => s.value > 0).map((s) => <div key={s.key}>{s.label}: {s.value}</div>)}
        </ChartTooltip>
      )}
    </div>
  );
}
