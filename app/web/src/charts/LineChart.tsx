import { useRef, useState } from 'react';
import { ChartTooltip } from '../components/ChartTooltip';
import { useElementWidth } from './useElementWidth';
import { formatShortDate, niceMax } from './format';
import styles from './charts.module.css';

export interface LinePoint {
  at: Date;
  label: string;
  real: number;
  estimated: number;
}

interface Props {
  points: LinePoint[];
  from: Date;
  to: Date;
  height?: number;
  ariaLabel: string;
}

const M = { t: 12, r: 16, b: 28, l: 38 };

/** Línea real (sólida, acento) vs. estimado (discontinua); tooltip con fecha, etapa, real y estimado. */
export function LineChart({ points, from, to, height = 220, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState<number | null>(null);

  const innerW = Math.max(0, width - M.l - M.r);
  const innerH = height - M.t - M.b;
  const t0 = from.getTime();
  const span = Math.max(1, to.getTime() - t0);
  const yMax = niceMax(Math.max(10, ...points.flatMap((p) => [p.real, p.estimated])));
  const sx = (d: Date) => M.l + ((d.getTime() - t0) / span) * innerW;
  const sy = (v: number) => M.t + innerH - (v / yMax) * innerH;
  const path = (get: (p: LinePoint) => number) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.at).toFixed(1)},${sy(get(p)).toFixed(1)}`).join(' ');

  const yTicks = [0, 1, 2, 3, 4].map((i) => (yMax / 4) * i);
  const xTicks = [0, 1, 2, 3, 4].map((i) => new Date(t0 + (span / 4) * i));
  const activePoint = active !== null ? points[active] : undefined;

  const nearest = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(sx(p.at) - x) < Math.abs(sx(points[best]!.at) - x)) best = i;
    });
    setActive(best);
  };

  return (
    <div ref={ref} className={styles.wrap}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} className={styles.grid} />
            <text x={M.l - 8} y={sy(v)} className={styles.axisY}>{v}</text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text key={i} x={sx(d)} y={height - 8} className={styles.axisX} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>
            {formatShortDate(d)}
          </text>
        ))}
        {points.length > 1 && <path d={path((p) => p.estimated)} className={styles.lineEst} />}
        {points.length > 1 && <path d={path((p) => p.real)} className={styles.lineReal} />}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.at)}
            cy={sy(p.real)}
            r={active === i ? 5 : 3.5}
            className={styles.dot}
            tabIndex={0}
            role="img"
            aria-label={`${formatShortDate(p.at)}, ${p.label}: real ${p.real} min, estimado ${p.estimated} min`}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      {activePoint && (
        <ChartTooltip x={Math.min(Math.max(sx(activePoint.at), 90), width - 90)} y={sy(activePoint.real)}>
          <div>{formatShortDate(activePoint.at)} · {activePoint.label}</div>
          <div>Real {activePoint.real} min · Estimado {activePoint.estimated} min</div>
        </ChartTooltip>
      )}
      <div className={styles.legend}>
        <span><i className={styles.swatchReal} /> Real</span>
        <span><i className={styles.swatchEst} /> Estimado</span>
      </div>
    </div>
  );
}
