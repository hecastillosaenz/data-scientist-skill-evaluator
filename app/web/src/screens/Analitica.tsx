import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { APOYO_LABEL, BLOCKER_LABEL, DIFFICULTY_LABEL, DOMAINS, DOMAIN_BY_ID } from '../../../shared/domains';
import { FALLO_LABEL, type AttemptSummary } from '../../../shared/intentos';
import type { Apoyo, AppData, DomainId } from '../../../shared/types';
import { Card, EmptyState, PageHeader, ReadingLine, Skeleton } from '../components/cards';
import { DifficultyChip } from '../components/chips';
import { DomainTile } from '../components/DomainTile';
import { Heatmap } from '../components/Heatmap';
import { Segmented } from '../components/Segmented';
import { LineChart } from '../charts/LineChart';
import { StackedBars } from '../charts/StackedBars';
import { formatShortDate } from '../charts/format';
import { activityHeatmap, blockerTrend, domainGaps, performanceByDifficulty, periodActivity, stagesByDomainApoyo } from '../domain/analytics';
import { activityReadingLine, difficultyReadingLine, domainsReadingLine, gapsReadingLine, timeReadingLine, weaknessReadingLine } from '../domain/readingLines';
import { attemptsSince, attemptsToApprove, failureBreakdown, failuresByConcept } from '../domain/attempts';
import { globalLevel, levelByDomain } from '../domain/level';
import { addDays, timePoints } from '../domain/stats';
import { useApp } from '../data/DataContext';
import styles from './Analitica.module.css';

type Period = '7' | '30' | '90';
const APOYO_COLOR: Record<Apoyo, string> = { guiado: '--s3', pistas: '--s2', autonomo: '--s1' };
const APOYOS: Apoyo[] = ['guiado', 'pistas', 'autonomo'];

export function Analitica() {
  const { loading, data, now, attempts } = useApp();
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);

  const view = useMemo(() => {
    if (!data) return null;
    return {
      points: timePoints(data.evidence, data.challenges, now, days),
      blockers: blockerTrend(data.evidence, now, days),
      gaps: domainGaps(data.concepts, data.challenges, data.evidence, now, 30),
      byApoyo: stagesByDomainApoyo(data.evidence, data.challenges, now, days),
      difficulty: performanceByDifficulty(data.evidence, data.challenges),
      heat: activityHeatmap(data.evidence, now, days),
      activity: periodActivity(data.evidence, now, days),
      levels: levelByDomain(data.challenges, data.evidence),
      // Los intentos (R51) son las verificaciones, no los registros: aquí se ve dónde se falla (R54).
      inPeriod: attemptsSince(attempts, addDays(now, -days)),
    };
  }, [data, now, days, attempts]);

  if (loading || !data || !view) {
    return <div aria-busy="true"><Skeleton w={220} h={32} /><div style={{ height: 24 }} /><Skeleton h={320} r={16} /></div>;
  }

  const from = addDays(now, -days);
  const gapsMax = Math.max(1, ...view.gaps.map((g) => g.total));

  return (
    <>
      <PageHeader
        title="Analítica"
        subtitle={`${formatShortDate(from)} – ${formatShortDate(now)} · últimos ${days} días`}
        actions={
          <Segmented
            label="Periodo"
            options={[{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }]}
            value={period}
            onChange={setPeriod}
          />
        }
      />

      <div className={styles.grid}>
        <Card className={styles.wide}>
          <h2>Tiempo real vs. estimado</h2>
          <p className={styles.sub}>Por etapa aprobada</p>
          {view.points.length === 0 ? (
            <EmptyState title="Sin etapas aprobadas en este periodo" text="Amplía el periodo o practica una etapa para ver la comparación." />
          ) : (
            <LineChart
              points={view.points.map((p) => ({ at: p.at, label: p.stageTitle, real: p.real, estimated: p.estimated }))}
              from={from}
              to={now}
              ariaLabel={`Tiempo real frente al estimado por etapa aprobada en los últimos ${days} días`}
            />
          )}
          <ReadingLine>{timeReadingLine(view.points, days)}</ReadingLine>
        </Card>

        <Card>
          <h2>Tendencia de debilidades</h2>
          <p className={styles.sub}>Dónde te trabaste, frente al periodo anterior</p>
          {view.blockers.items.length === 0 ? (
            <p className={styles.muted}>No marcaste bloqueos en este periodo.</p>
          ) : (
            <ol className={styles.blockers}>
              {view.blockers.items.map((b) => (
                <li key={b.blocker}>
                  <span className={styles.blockerName}>{BLOCKER_LABEL[b.blocker]}</span>
                  <span className={`${styles.count} mono`}>{b.count}</span>
                  <span className={`${styles.delta} ${b.delta > 0 ? styles.up : b.delta < 0 ? styles.down : ''}`}>
                    {b.delta > 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : b.delta < 0 ? <ArrowDownRight size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
                    <span className="mono">{b.delta > 0 ? `+${b.delta}` : b.delta}</span>
                    <span className="visually-hidden"> frente al periodo anterior</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <ReadingLine>{weaknessReadingLine(view.blockers.items, view.blockers.total, days)}</ReadingLine>
        </Card>

        <Card>
          <div className={styles.head}>
            <h2>Brechas por dominio</h2>
            <Link to="/grafo" className={styles.link}>Ver en el grafo <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <p className={styles.sub}>Conceptos con evidencia en los últimos 30 días</p>
          <ul className={styles.gaps}>
            {view.gaps.map((g) => (
              <li key={g.domain}>
                <span className={styles.gapLabel}><DomainTile domain={g.domain as DomainId} size={22} />{DOMAIN_BY_ID[g.domain].short}</span>
                <span className={styles.gapBar} role="img" aria-label={`${g.withEvidence} de ${g.total} conceptos con evidencia reciente`} style={{ width: `${(g.total / gapsMax) * 100}%` }}>
                  <span className={styles.gapDone} style={{ width: `${(g.withEvidence / g.total) * 100}%` }} />
                </span>
                <span className={`${styles.gapCount} mono`}>{g.withEvidence}/{g.total}</span>
              </li>
            ))}
          </ul>
          <p className={styles.legendRow}><span><i className={styles.swDone} /> Evidencia reciente</span><span><i className={styles.swNone} /> Sin evidencia</span></p>
          <ReadingLine>{gapsReadingLine(view.gaps)}</ReadingLine>
        </Card>

        <Card>
          <h2>Nivel por dominio</h2>
          <p className={styles.sub}>Global: <strong>{globalLevel(view.levels)}</strong> · mediana de los seis dominios</p>
          <ul className={styles.levels}>
            {DOMAINS.map((d) => {
              const l = view.levels[d.id];
              return (
                <li key={d.id}>
                  <span className={styles.gapLabel}><DomainTile domain={d.id} size={22} />{d.short}</span>
                  <span className={styles.levelName}>{l.level}</span>
                  <span className={styles.levelNext}>
                    {l.next ? (
                      <>
                        <span className={styles.levelBar} role="img" aria-label={`${l.next.have} de ${l.next.need} etapas para ${l.next.level}`}>
                          <span style={{ width: `${(l.next.have / l.next.need) * 100}%` }} />
                        </span>
                        <span className="mono">{l.next.have}/{l.next.need}</span>
                      </>
                    ) : (
                      <span className={styles.muted}>Máximo</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <ReadingLine>
            Suben el nivel las etapas aprobadas sin ayuda y en Apoyo Autónomo; el nivel no baja. La barra muestra cuántas faltan para el siguiente nivel.
          </ReadingLine>
        </Card>

        <Card>
          <h2>Etapas por dominio</h2>
          <p className={styles.sub}>Intentos del periodo, por Apoyo usado</p>
          <StackedBars
            ariaLabel={`Intentos por dominio y Apoyo en los últimos ${days} días`}
            colorVar={(key) => APOYO_COLOR[key as Apoyo]}
            bars={view.byApoyo.map((r) => ({
              label: DOMAIN_BY_ID[r.domain].short,
              tooltipTitle: DOMAIN_BY_ID[r.domain].name,
              segments: APOYOS.map((a) => ({ key: a, label: APOYO_LABEL[a], value: r.byApoyo[a] })),
            }))}
          />
          <ul className={styles.legendList}>
            {APOYOS.map((a) => <li key={a}><i style={{ background: `var(${APOYO_COLOR[a]})` }} />{APOYO_LABEL[a]}</li>)}
          </ul>
          <ReadingLine>{domainsReadingLine(view.byApoyo)}</ReadingLine>
        </Card>

        <Card>
          <h2>Rendimiento por dificultad</h2>
          <p className={styles.sub}>Acumulado desde el inicio</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Dificultad</th>
                <th scope="col">Intentos</th>
                <th scope="col">Aprobados</th>
                <th scope="col">Real</th>
                <th scope="col">Estimado</th>
                <th scope="col">Desvío</th>
              </tr>
            </thead>
            <tbody>
              {view.difficulty.map((r) => (
                <tr key={r.difficulty}>
                  <th scope="row"><DifficultyChip difficulty={r.difficulty} /><span className="visually-hidden">{DIFFICULTY_LABEL[r.difficulty]}</span></th>
                  <td className="mono">{r.attempts}</td>
                  <td className="mono">{r.attempts ? `${Math.round((r.passed / r.attempts) * 100)} %` : '—'}</td>
                  <td className="mono">{r.avgReal === null ? '—' : `${Math.round(r.avgReal)} min`}</td>
                  <td className="mono">{r.avgEstimated === null ? '—' : `${Math.round(r.avgEstimated)} min`}</td>
                  <td className="mono">{r.deviation === null ? '—' : `${r.deviation >= 0 ? '+' : '−'}${Math.round(Math.abs(r.deviation))} min`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ReadingLine>{difficultyReadingLine(view.difficulty)}</ReadingLine>
        </Card>

        <WhereIFail attempts={view.inPeriod} allAttempts={attempts} data={data} />

        <Card className={styles.wide}>
          <h2>Actividad por día</h2>
          <p className={styles.sub}>Intentos registrados cada día</p>
          <Heatmap cells={view.heat} />
          <ReadingLine>{activityReadingLine(view.activity.practicedDays, days, view.activity.longest)}</ReadingLine>
        </Card>
      </div>
    </>
  );
}

/** «Dónde fallo» (SDD R54): el patrón de fallos de tus intentos, no solo de lo que registraste. */
function WhereIFail({ attempts, allAttempts, data }: { attempts: AttemptSummary[]; allAttempts: AttemptSummary[]; data: AppData }) {
  const byType = failureBreakdown(attempts);
  const byConcept = failuresByConcept(attempts, data.challenges);
  const toApprove = attemptsToApprove(allAttempts);
  const failedTotal = byType.reduce((sum, x) => sum + x.count, 0);
  const typeMax = Math.max(1, ...byType.map((x) => x.count));
  const conceptMax = Math.max(1, ...byConcept.map((x) => x.count));
  const nameOf = (id: string) => data.concepts.find((c) => c.id === id)?.name ?? id;

  return (
    <Card>
      <h2>Dónde fallo</h2>
      <p className={styles.sub}>Intentos de verificación sin aprobar en el periodo, no solo lo que registraste</p>
      {attempts.length === 0 ? (
        <p className={styles.muted}>Aún no hay intentos guardados en este periodo. Cada vez que verifiques una etapa quedará aquí.</p>
      ) : failedTotal === 0 ? (
        <p className={styles.muted}>{attempts.length} {attempts.length === 1 ? 'intento' : 'intentos'} y ninguno sin aprobar. Nada que corregir por ahora.</p>
      ) : (
        <>
          <ul className={styles.gaps} aria-label="Fallos por tipo">
            {byType.map((x) => (
              <li key={x.tipo}>
                <span>{FALLO_LABEL[x.tipo]}</span>
                <span className={styles.levelBar} role="img" aria-label={`${x.count} intentos`}><span style={{ width: `${(x.count / typeMax) * 100}%` }} /></span>
                <span className="mono">{x.count}</span>
              </li>
            ))}
          </ul>
          {byConcept.length > 0 && (
            <>
              <h3 className={styles.subhead}>Conceptos con más intentos sin aprobar</h3>
              <ul className={styles.gaps} aria-label="Fallos por concepto">
                {byConcept.map((x) => (
                  <li key={x.conceptId}>
                    <Link to={`/debilidad/${encodeURIComponent(x.conceptId)}`}>{nameOf(x.conceptId)}</Link>
                    <span className={styles.levelBar} role="img" aria-label={`${x.count} intentos`}><span style={{ width: `${(x.count / conceptMax) * 100}%` }} /></span>
                    <span className="mono">{x.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {toApprove.stages > 0 && (
        <ReadingLine>
          En las {toApprove.stages} {toApprove.stages === 1 ? 'etapa aprobada' : 'etapas aprobadas'} necesitaste {toApprove.average.toFixed(1).replace('.', ',')} intentos en promedio (máximo {toApprove.max}).
        </ReadingLine>
      )}
    </Card>
  );
}
