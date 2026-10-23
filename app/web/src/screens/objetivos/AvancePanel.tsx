import { useMemo } from 'react';
import { Link } from 'react-router';
import { BLOOM_LABEL, CONCEPT_STATE_LABEL } from '../../../../shared/domains';
import type { Evidence } from '../../../../shared/types';
import { formatShortDate, relativeTime } from '../../charts/format';
import { DomainTile } from '../../components/DomainTile';
import { useApp } from '../../data/DataContext';
import { latestAttemptByStage } from '../../domain/conceptState';
import type { FocoProgreso } from '../../domain/objetivoProgress';
import styles from './Avance.module.css';

type Cell = 'aprobada' | 'ayuda' | 'parcial' | 'fallida' | 'sin';
const CELL_LABEL: Record<Cell, string> = { aprobada: 'Aprobada', ayuda: 'Aprobada con ayuda', parcial: 'Parcial', fallida: 'Fallida', sin: 'Sin intentos' };

const cellOf = (e: Evidence | undefined): Cell => (!e ? 'sin' : e.result === 'aprobada' ? (e.withHelp ? 'ayuda' : 'aprobada') : e.result === 'parcial' ? 'parcial' : 'fallida');

/** Evolución del avance por día (0–100): línea con área; cada punto lleva su fecha y valor. */
function Evolucion({ series }: { series: FocoProgreso['series'] }) {
  const W = 600;
  const H = 150;
  const m = { t: 12, r: 14, b: 24, l: 34 };
  const t0 = Date.parse(series[0]!.at);
  const t1 = Date.parse(series[series.length - 1]!.at);
  const span = Math.max(1, t1 - t0);
  const sx = (at: string) => (series.length === 1 ? (m.l + W - m.r) / 2 : m.l + ((Date.parse(at) - t0) / span) * (W - m.l - m.r));
  const sy = (v: number) => m.t + (H - m.t - m.b) * (1 - v / 100);
  const pts = series.map((p) => `${sx(p.at).toFixed(1)},${sy(p.pct).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${sx(series[series.length - 1]!.at).toFixed(1)},${sy(0)} L${sx(series[0]!.at).toFixed(1)},${sy(0)} Z`;
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución del avance: de ${series[0]!.pct} % a ${series[series.length - 1]!.pct} %`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} className={styles.grid} />
          <text x={m.l - 6} y={sy(v) + 4} textAnchor="end" className={styles.tick}>{v}%</text>
        </g>
      ))}
      {series.length > 1 && <path d={area} className={styles.area} />}
      {series.length > 1 && <path d={line} className={styles.line} />}
      {series.map((p) => (
        <circle key={p.at} cx={sx(p.at)} cy={sy(p.pct)} r={4} className={styles.dot}><title>{`${formatShortDate(new Date(p.at))}: ${p.pct} %`}</title></circle>
      ))}
      <text x={sx(series[0]!.at)} y={H - 6} textAnchor={series.length === 1 ? 'middle' : 'start'} className={styles.tick}>{formatShortDate(new Date(series[0]!.at))}</text>
      {series.length > 1 && <text x={sx(series[series.length - 1]!.at)} y={H - 6} textAnchor="end" className={styles.tick}>{formatShortDate(new Date(series[series.length - 1]!.at))}</text>}
    </svg>
  );
}

/**
 * Avance de un objetivo (R56): cuánto del plan demostraste, cómo evolucionó y qué retos lo practican. Todo sale de la
 * Evidence y del test final; nada de esto se guarda.
 */
export function AvancePanel({ progress, hasPlan, accepted, now }: { progress: FocoProgreso; hasPlan: boolean; accepted: boolean; now: Date }) {
  const { data } = useApp();
  const latest = useMemo(() => latestAttemptByStage(data?.evidence ?? []), [data?.evidence]);
  const { pasos, retos } = progress;

  if (pasos.length === 0) {
    return <p className={styles.empty}>Este objetivo todavía no tiene conceptos. Crea su plan en la pestaña «Plan» y aquí verás tu avance.</p>;
  }

  return (
    <div className={styles.wrap}>
      {!hasPlan && <p className={styles.note}>Este objetivo usa conceptos sueltos (sin plan): se mide contra Bloom 3.</p>}
      {hasPlan && !accepted && <p className={styles.note}>El plan aún es una propuesta: ya se mide, pero no influye en tus retos hasta que lo aceptes.</p>}

      <div className={styles.tiles}>
        <div className={styles.tile}><span className={styles.tileLabel}>Avance</span><strong className="mono">{progress.pct}%</strong><span className={styles.bar} aria-hidden="true"><span style={{ width: `${progress.pct}%` }} /></span></div>
        <div className={styles.tile}><span className={styles.tileLabel}>Conceptos cumplidos</span><strong className="mono">{progress.done} de {pasos.length}</strong><span className={styles.tileSub}>{progress.started} ya practicados</span></div>
        <div className={styles.tile}><span className={styles.tileLabel}>Retos conectados</span><strong className="mono">{retos.length}</strong><span className={styles.tileSub}>{retos.length === 0 ? 'ninguno aún' : 'tocan este objetivo'}</span></div>
        <div className={styles.tile}><span className={styles.tileLabel}>Última práctica</span><strong>{progress.lastActivity ? relativeTime(new Date(progress.lastActivity), now) : '—'}</strong><span className={styles.tileSub}>{progress.lastActivity ? formatShortDate(new Date(progress.lastActivity)) : 'sin práctica'}</span></div>
      </div>

      {progress.next ? (
        <p className={styles.next}>
          <strong>Siguiente paso:</strong> {progress.next.concept?.name ?? progress.next.paso.conceptId}, hasta Bloom {progress.next.paso.bloom} · {BLOOM_LABEL[progress.next.paso.bloom]}.{' '}
          <Link to="/challenges">Genera un reto de este tema</Link>
        </p>
      ) : (
        <p className={styles.next}><strong>Cumpliste todos los conceptos del plan.</strong> Puedes marcar el objetivo como «Logrado» en Ajustes.</p>
      )}

      <section>
        <h3 className={styles.h}>Evolución</h3>
        {progress.series.length === 0 ? <p className={styles.empty}>Aún no hay práctica sobre estos conceptos: la curva aparece con tu primer reto.</p> : <Evolucion series={progress.series} />}
        {progress.series.length === 1 && <p className={styles.hint}>Con una sola fecha de práctica todavía no hay tendencia.</p>}
      </section>

      <section>
        <h3 className={styles.h}>Conceptos del plan y retos que los practican</h3>
        <div className={styles.scroll}>
          <table className={styles.matrix}>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col">Bloom</th>
                {retos.map((r) => <th key={r.challenge.id} scope="col" title={r.challenge.title}><Link to={`/challenge-actual/${r.challenge.id}`}>{r.challenge.id.replace('challenge-', 'Reto ')}</Link></th>)}
              </tr>
            </thead>
            <tbody>
              {pasos.map((p, i) => (
                <tr key={p.paso.conceptId}>
                  <th scope="row">
                    <span className={styles.concept}>
                      <span className={styles.n}>{i + 1}</span>
                      {p.concept && <DomainTile domain={p.concept.domain} size={18} />}
                      <span>{p.concept?.name ?? p.paso.conceptId}</span>
                    </span>
                    <span className={`${styles.state} ${styles[`s_${p.state}`]}`}>{CONCEPT_STATE_LABEL[p.state]}</span>
                  </th>
                  <td>
                    <span className={styles.bloomCell} title={`Demostrado ${p.maxBloom ?? 0} de ${p.paso.bloom}`}>
                      <span className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.round(p.score * 100)}%` }} /></span>
                      <span className="mono">{p.maxBloom ?? 0}/{p.paso.bloom}</span>
                    </span>
                  </td>
                  {retos.map((r) => {
                    const cell = r.cells.find((c) => c.conceptId === p.paso.conceptId);
                    if (!cell) return <td key={r.challenge.id} className={styles.none}>·</td>;
                    const results = cell.stageNumbers.map((n) => cellOf(latest.get(`${r.challenge.id}-s${n}`)));
                    const worst = (['fallida', 'parcial', 'ayuda', 'sin', 'aprobada'] as Cell[]).find((c) => results.includes(c)) ?? 'sin';
                    return (
                      <td key={r.challenge.id}>
                        <span className={`${styles.cell} ${styles[`c_${worst}`]}`} title={`${CELL_LABEL[worst]} · etapa${cell.stageNumbers.length > 1 ? 's' : ''} ${cell.stageNumbers.join(', ')}`}>E{cell.stageNumbers.join(',')}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {retos.length === 0 ? (
          <p className={styles.hint}>Ningún reto toca este objetivo todavía. {accepted ? 'Tu plan ya está aceptado: el próximo reto que generes preferirá estos conceptos.' : 'Acepta el plan para que tus retos prefieran estos conceptos.'}</p>
        ) : (
          <p className={styles.legend}>
            {(['aprobada', 'ayuda', 'parcial', 'fallida', 'sin'] as Cell[]).map((c) => <span key={c}><i className={`${styles.cell} ${styles[`c_${c}`]}`} aria-hidden="true" /> {CELL_LABEL[c]}</span>)}
          </p>
        )}
      </section>

      {retos.length > 0 && (
        <section>
          <h3 className={styles.h}>Retos de este objetivo</h3>
          <ul className={styles.retos}>
            {retos.map((r) => (
              <li key={r.challenge.id}>
                <Link to={`/challenge-actual/${r.challenge.id}`}>{r.challenge.title}</Link>
                <span className={styles.hint}>toca {r.cells.length} de {pasos.length} conceptos · {r.last ? `última práctica ${relativeTime(new Date(r.last), now)}` : 'sin intentos'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
