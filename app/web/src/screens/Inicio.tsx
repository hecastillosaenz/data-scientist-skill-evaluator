import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Check, Minus, X } from 'lucide-react';
import { DOMAINS, DOMAIN_BY_ID, DIFFICULTY_LABEL } from '../../../shared/domains';
import type { Challenge, Evidence } from '../../../shared/types';
import { ActivityCalendar } from '../components/ActivityCalendar';
import { Card, EmptyState, KpiCard, PageHeader, ReadingLine, Skeleton } from '../components/cards';
import { DifficultyChip, StatusChip } from '../components/chips';
import { DomainTile } from '../components/DomainTile';
import { DOMAIN_COLOR_VAR } from '../components/domainColors';
import { StageBar } from '../components/StageBar';
import { LineChart } from '../charts/LineChart';
import { StackedBars } from '../charts/StackedBars';
import { globalLevel, levelByDomain } from '../domain/level';
import { addDays, activityDays, dailyActivity, averageActualMinutes, averageEstimatedMinutes, completedStageCount, currentStreakDays, isoWeek, longestStreak, stageIndex, stagesCompletedThisWeek, timePoints, weeklyByDomain, WEEKLY_GOAL } from '../domain/stats';
import { formatLongDate, formatMinutes, formatShortDate, formatWeekday, relativeTime } from '../charts/format';
import { computeFocoProgress } from '../domain/objetivoProgress';
import { loadObjetivos } from '../data/objetivosApi';
import type { Objetivos } from '../../../shared/objetivos';
import { timeReadingLine } from '../domain/readingLines';
import { buildReviewQueue, reasonText, topWeaknesses } from '../domain/reviewQueue';
import { useApp } from '../data/DataContext';
import { useGeneratorDialog } from './generate/GenerateDialog';
import styles from './Inicio.module.css';

const PERIOD_DAYS = 30;
const ACTIVITY_DAYS = 14;

export function Inicio() {
  const { loading, data, now, currentChallenge, stageStatusesOf, challengeStatusOf, actions, source, insights } = useApp();
  const [objetivos, setObjetivos] = useState<Objetivos | null>(null);
  useEffect(() => {
    if (source === 'ejemplo') return;
    let cancelled = false;
    loadObjetivos().then((r) => !cancelled && setObjetivos(r.objetivos)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);
  const generator = useGeneratorDialog();
  const navigate = useNavigate();

  const view = useMemo(() => {
    if (!data) return null;
    const days = activityDays(data.evidence);
    const streak = currentStreakDays(days, now);
    const stages = stageIndex(data.challenges);
    return {
      days,
      streak,
      longest: longestStreak(days),
      completed: completedStageCount(data.challenges, data.evidence),
      weekDone: stagesCompletedThisWeek(data.evidence, now),
      avgReal: averageActualMinutes(data.evidence),
      avgEst: averageEstimatedMinutes(data.evidence, data.challenges),
      level: globalLevel(levelByDomain(data.challenges, data.evidence)),
      queue: buildReviewQueue(data.concepts, data.challenges, data.evidence, now, data.testResults),
      points: timePoints(data.evidence, data.challenges, now, PERIOD_DAYS),
      week: weeklyByDomain(data.evidence, data.challenges, now),
      daily: dailyActivity(data.evidence, data.challenges, now, ACTIVITY_DAYS),
      recent: [...data.evidence].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map((e) => ({ e, ref: stages.get(e.stageId) })),
    };
  }, [data, now]);

  const goals = useMemo(() => {
    if (!data || !objetivos) return [];
    return objetivos.focos.filter((f) => f.estado === 'activo').map((f) => ({ foco: f, progress: computeFocoProgress(f, data, insights) }));
  }, [data, objetivos, insights]);

  if (loading || !data || !view) return <InicioSkeleton />;

  const brandNew = data.evidence.length === 0;
  const pending = data.challenges.filter((c) => challengeStatusOf(c) === 'pendiente');
  // Usuario nuevo: se recomienda el más básico; si no, el sugerido por la cola de repaso.
  const recommended = brandNew
    ? [...pending].sort((a, b) => a.difficulty - b.difficulty)[0]
    : (pending.find((c) => c.recommended) ?? pending[0]);
  const streak = view.streak.length;

  return (
    <>
      <PageHeader
        title={`Hola, ${data.user.name}`}
        subtitle={
          <>
            {capitalize(formatLongDate(now))} · Semana <span className="mono">{isoWeek(now)}</span> · {view.weekDone} de {WEEKLY_GOAL} etapas completadas
          </>
        }
      />

      <div className={styles.top}>
        {currentChallenge ? (
          <CurrentChallengeCard challenge={currentChallenge} statuses={stageStatusesOf(currentChallenge)} />
        ) : (
          <NoChallengeCard
            brandNew={brandNew}
            recommended={recommended}
            canGenerate={source === 'real'}
            onGenerate={generator.open}
            onStart={() => {
              if (!recommended) return;
              actions.startChallenge(recommended.id);
              navigate('/challenge-actual');
            }}
          />
        )}
        <div className={styles.kpis}>
          <KpiCard
            label="Racha"
            value={`${streak} ${streak === 1 ? 'día' : 'días'}`}
            context={
              streak > 0
                ? `Récord: ${view.longest} ${view.longest === 1 ? 'día' : 'días'}`
                : view.longest > 0
                  ? `Racha rota. Tu récord es de ${view.longest} días: practica hoy para empezar otra.`
                  : 'Practica hoy para empezar tu racha.'
            }
          />
          <KpiCard
            label="Etapas completadas"
            value={view.completed.done}
            progress={view.completed.total ? view.completed.done / view.completed.total : 0}
            context={`de ${view.completed.total} disponibles`}
          />
          <KpiCard
            label="Tiempo medio por etapa"
            value={view.avgReal === null ? '—' : formatMinutes(view.avgReal)}
            context={view.avgEst === null ? 'Sin etapas aprobadas todavía' : `Estimado: ~${formatMinutes(view.avgEst)}`}
          />
          <KpiCard label="Nivel actual" value={view.level} context="Mediana de tus 8 dominios" />
        </div>
      </div>

      <div className={styles.goalsRow}>
        <Card>
          <div className={styles.cardHead}>
            <h2>Mis objetivos</h2>
            <Link to="/objetivos" className={styles.link}>Ver objetivos <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          {goals.length === 0 ? (
            <EmptyState title="Aún no tienes objetivos activos" text="Cuéntale al sistema qué estás estudiando y arma tu plan: aquí verás cuánto avanzas en cada uno." action={<Link className="btn" to="/objetivos">Crear un objetivo</Link>} />
          ) : (
            <ul className={styles.goals}>
              {goals.map(({ foco, progress }) => (
                <li key={foco.id}>
                  <Link to="/objetivos" className={styles.goalLink}>
                    <span className={styles.goalTop}>
                      <strong>{foco.titulo}</strong>
                      <span className="mono">{progress.pct}%</span>
                    </span>
                    <span className={styles.goalTrack} aria-hidden="true"><span style={{ width: `${progress.pct}%` }} /></span>
                    <span className={styles.goalSub}>
                      {progress.pasos.length === 0
                        ? 'Sin plan todavía'
                        : `${progress.done} de ${progress.pasos.length} conceptos · ${progress.retos.length} ${progress.retos.length === 1 ? 'reto' : 'retos'}${progress.next ? ` · sigue: ${progress.next.concept?.name ?? progress.next.paso.conceptId}` : ' · ¡plan cumplido!'}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2>Actividad por día</h2>
          <p className={styles.cardSub}>Intentos de los últimos {ACTIVITY_DAYS} días, por dominio</p>
          <StackedBars
            ariaLabel={`Intentos por día en los últimos ${ACTIVITY_DAYS} días, apilados por dominio`}
            colorVar={(key) => DOMAIN_COLOR_VAR[key as keyof typeof DOMAIN_COLOR_VAR]}
            bars={view.daily.map((d) => ({
              label: String(d.day.getDate()),
              tooltipTitle: `${formatShortDate(d.day)} · ${d.minutes} min`,
              segments: DOMAINS.map((dom) => ({ key: dom.id, label: dom.short, value: d.counts[dom.id] })),
            }))}
          />
          <ReadingLine>
            {view.daily.some((d) => d.total > 0)
              ? `${view.daily.reduce((a, d) => a + d.total, 0)} intentos y ${view.daily.reduce((a, d) => a + d.minutes, 0)} min en ${view.daily.filter((d) => d.total > 0).length} de ${ACTIVITY_DAYS} días; el más activo fue el ${formatShortDate([...view.daily].sort((a, b) => b.total - a.total)[0]!.day)}.`
              : 'Aún no practicas en estos días: cada intento que verifiques aparecerá aquí.'}
          </ReadingLine>
        </Card>
      </div>

      <div className={styles.middle}>
        <Card>
          <div className={styles.cardHead}>
            <h2>Tiempo real vs. estimado</h2>
            <Link to="/analitica" className={styles.link}>Ver en Analítica <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <p className={styles.cardSub}>Últimos {PERIOD_DAYS} días, por etapa aprobada</p>
          {view.points.length === 0 ? (
            <EmptyState title="Sin etapas aprobadas todavía" text="Cuando apruebes tu primera etapa verás aquí cuánto tardas frente a lo estimado." />
          ) : (
            <>
              <LineChart
                points={view.points.map((p) => ({ at: p.at, label: p.stageTitle, real: p.real, estimated: p.estimated }))}
                from={addDays(now, -PERIOD_DAYS)}
                to={now}
                ariaLabel="Tiempo real frente al estimado por etapa aprobada en los últimos 30 días"
              />
              <ReadingLine>{timeReadingLine(view.points, PERIOD_DAYS)}</ReadingLine>
            </>
          )}
        </Card>

        <Card>
          <div className={styles.cardHead}>
            <h2>Tus debilidades activas</h2>
            <Link to="/repaso" className={styles.link}>Ver cola <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          {view.queue.length === 0 ? (
            <EmptyState title="Todavía no hay debilidades" text="Cuando registres etapas, aquí verás qué conceptos conviene repasar primero." />
          ) : (
            <ul className={styles.weak}>
              {topWeaknesses(view.queue, 3).map((item) => (
                <li key={item.concept.id}>
                  <DomainTile domain={item.concept.domain} />
                  <div className={styles.weakText}>
                    <strong>{item.concept.name}</strong>
                    <span>Etapa {item.source.stage.number} · {item.source.stage.title} — {item.source.challenge.title}</span>
                    <em>{reasonText(item)}</em>
                  </div>
                  <Link className="btn btn-sm" to={`/debilidad/${encodeURIComponent(item.concept.id)}`}>Ver análisis</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className={styles.bottom}>
        <Card>
          <h2>Etapas por dominio esta semana</h2>
          <p className={styles.cardSub}>Intentos de lunes a domingo</p>
          <StackedBars
            ariaLabel="Etapas practicadas por día esta semana, apiladas por dominio"
            colorVar={(key) => DOMAIN_COLOR_VAR[key as keyof typeof DOMAIN_COLOR_VAR]}
            bars={view.week.map((d) => ({
              label: formatWeekday(d.day),
              tooltipTitle: formatWeekday(d.day),
              segments: DOMAINS.map((dom) => ({ key: dom.id, label: dom.short, value: d.counts[dom.id] })),
            }))}
          />
          <ul className={styles.legend}>
            {DOMAINS.map((d) => (
              <li key={d.id}><i style={{ background: `var(${DOMAIN_COLOR_VAR[d.id]})` }} />{d.short}</li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2>Tu racha este mes</h2>
          <div style={{ marginTop: 12 }}>
            <ActivityCalendar now={now} activeDays={view.days} streakDays={new Set(view.streak)} />
          </div>
        </Card>

        <Card>
          <h2>Actividad reciente</h2>
          {view.recent.length === 0 ? (
            <EmptyState title="Sin actividad todavía" text="Tus intentos aparecerán aquí." />
          ) : (
            <ul className={styles.recent}>
              {view.recent.map(({ e, ref }) => (
                <li key={e.id}>
                  <ResultIcon result={e.result} />
                  <div>
                    <strong>{resultVerb(e)} · Etapa {ref?.stage.number} {ref?.stage.title}</strong>
                    <span>{ref?.challenge.title} · {relativeTime(new Date(e.at), now)}{e.withHelp ? ' · Con ayuda' : ''}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function resultVerb(e: Evidence) {
  return e.result === 'aprobada' ? 'Aprobaste' : e.result === 'fallida' ? 'Falló' : 'Parcial';
}

function ResultIcon({ result }: { result: Evidence['result'] }) {
  const Icon = result === 'aprobada' ? Check : result === 'fallida' ? X : Minus;
  return (
    <span className={`${styles.resIcon} ${styles[result]}`} aria-hidden="true">
      <Icon size={14} strokeWidth={2} />
    </span>
  );
}

function CurrentChallengeCard({ challenge, statuses }: { challenge: Challenge; statuses: Map<string, import('../../../shared/types').StageStatus> }) {
  const list = challenge.stages.map((s) => ({ stage: s, status: statuses.get(s.id) ?? 'pendiente' }));
  const done = list.filter((l) => l.status === 'completada').length;
  const next = list.find((l) => l.status !== 'completada');
  return (
    <section className={styles.hero} aria-label="Challenge en curso">
      <p className={styles.heroLabel}>Challenge en curso</p>
      <h2 className={styles.heroTitle}>{challenge.title}</h2>
      <p className={styles.heroDots} aria-label={`${done} de ${list.length} etapas completas`}>
        <span aria-hidden="true">{list.map((l) => (l.status === 'completada' ? '●' : '○')).join('')}</span>
        <span className="mono">{done} de {list.length} etapas</span>
      </p>
      <ol className={styles.heroStages}>
        {list.map(({ stage, status }) => (
          <li key={stage.id}>
            <StageBar statuses={[status]} segment="flex" onDark hideText />
            <span className={styles.heroStageTitle}>{stage.title}</span>
          </li>
        ))}
      </ol>
      <div className={styles.heroFoot}>
        {next && <p>Siguiente: <strong>{next.stage.title}</strong> · <span className="mono">{formatMinutes(next.stage.estimatedMinutes)}</span></p>}
        <Link to="/challenge-actual" className={`btn ${styles.heroBtn}`}>Continuar challenge <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

function NoChallengeCard({ brandNew, recommended, onStart, canGenerate, onGenerate }: { brandNew: boolean; recommended?: Challenge; onStart: () => void; canGenerate: boolean; onGenerate: () => void }) {
  return (
    <section className={styles.hero} aria-label="Sin challenge en curso">
      <p className={styles.heroLabel}>{brandNew ? 'Bienvenido' : 'Sin challenge en curso'}</p>
      <h2 className={styles.heroTitle}>{brandNew ? 'Empieza tu primer challenge' : 'Elige tu siguiente challenge'}</h2>
      {recommended ? (
        <div className={styles.recommended}>
          <p className={styles.heroLabel}>Recomendado</p>
          <strong>{recommended.title}</strong>
          <div className={styles.recoMeta}>
            {[...new Set(recommended.stages.map((s) => s.domain))].map((d) => (
              <span key={d} className={styles.recoDomain}><DomainTile domain={d} variant="mono" size={24} />{DOMAIN_BY_ID[d].short}</span>
            ))}
            <DifficultyChip difficulty={recommended.difficulty} />
            <span className="mono">{recommended.stages.length} etapas</span>
          </div>
        </div>
      ) : (
        <p className={styles.heroLabel}>No quedan challenges pendientes. Genera uno nuevo cuando quieras.</p>
      )}
      <div className={styles.heroFoot}>
        <p>{DIFFICULTY_LABEL[recommended?.difficulty ?? 1]} · calibrado con tu grafo</p>
        <div className={styles.heroActions}>
          {canGenerate && (
            <button type="button" className={`btn ${recommended ? styles.heroGhost : styles.heroBtn}`} onClick={onGenerate}>Generar uno nuevo</button>
          )}
          {(recommended || !canGenerate) && (
            <button type="button" className={`btn ${styles.heroBtn}`} onClick={onStart} disabled={!recommended}>Iniciar nuevo challenge <ArrowRight size={16} aria-hidden="true" /></button>
          )}
        </div>
      </div>
    </section>
  );
}

function InicioSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <Skeleton w={260} h={32} />
      <div style={{ height: 8 }} />
      <Skeleton w={380} h={16} />
      <div className={styles.top} style={{ marginTop: 24 }}>
        <Skeleton h={240} r={16} />
        <div className={styles.kpis}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={116} r={16} />)}
        </div>
      </div>
      <div className={styles.middle}>
        <Skeleton h={320} r={16} />
        <Skeleton h={320} r={16} />
      </div>
    </div>
  );
}
