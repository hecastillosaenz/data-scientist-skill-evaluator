import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, CircleAlert, ExternalLink, Network, Sparkles } from 'lucide-react';
import { APOYO_LABEL, BLOCKER_LABEL, DOMAIN_BY_ID } from '../../../shared/domains';
import { Card, EmptyState, PageHeader, Skeleton } from '../components/cards';
import { StatusChip } from '../components/chips';
import { DomainTile } from '../components/DomainTile';
import { DifficultyChip, TimeChip } from '../components/chips';
import { Markdown } from '../components/Markdown';
import { formatShortDate, relativeTime } from '../charts/format';
import { useApp } from '../data/DataContext';
import { buildReinforcement, type Reinforcement } from '../domain/reinforcement';
import { PRIORITY_LABEL, reasonText } from '../domain/reviewQueue';
import { analyzeWeakness, type ActionStep, type EvidenceLine } from '../domain/weakness';
import styles from './Debilidad.module.css';

const RESULT_TEXT = { aprobada: 'Aprobada', parcial: 'Parcial', fallida: 'Fallida' } as const;

/**
 * Ventana de debilidad (SDD R31, HU22): explica en qué estás fallando, con qué evidencia, qué podría estar detrás
 * y cómo mejorar. El análisis es determinista: sale de tus intentos, tus notas y el grafo.
 */
export function Debilidad() {
  const { conceptId = '' } = useParams();
  const { loading, data, now } = useApp();
  const analysis = useMemo(() => (data ? analyzeWeakness(conceptId, data, now) : null), [data, conceptId, now]);

  if (loading || !data) return <div aria-busy="true"><Skeleton w={320} h={32} /><div style={{ height: 20 }} /><Skeleton h={300} r={16} /></div>;

  if (!analysis) {
    return (
      <>
        <BackLink />
        <EmptyState
          title="No hay análisis para este concepto"
          text="Aún no has practicado este concepto o no existe. Cuando tengas intentos, aquí verás en qué fallas y cómo mejorar."
          action={<Link to="/repaso" className="btn btn-primary">Volver a Repaso</Link>}
        />
      </>
    );
  }
  return <Analysis key={analysis.concept.id} analysis={analysis} />;
}

function BackLink() {
  return (
    <Link to="/repaso" className={styles.back}>
      <ArrowLeft size={15} aria-hidden="true" /> Repaso
    </Link>
  );
}

function Analysis({ analysis }: { analysis: NonNullable<ReturnType<typeof analyzeWeakness>> }) {
  const { now } = useApp();
  const navigate = useNavigate();
  const { concept, item, insight } = analysis;
  const [done, setDone] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [reinforcement, setReinforcement] = useState<Reinforcement | null>(null);

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const generate = () => {
    if (!item) return;
    setGenerating(true);
    window.setTimeout(() => {
      setReinforcement(buildReinforcement(item));
      setGenerating(false);
    }, 900);
  };

  return (
    <>
      <BackLink />
      <PageHeader
        title={analysis.headline}
        subtitle={
          <span className={styles.sub}>
            <DomainTile domain={concept.domain} size={24} />
            {DOMAIN_BY_ID[concept.domain].name}
            <StatusChip state={insight?.state ?? 'no_visto'} kind="concept" />
            {item && <span className={styles.pill}>Prioridad {PRIORITY_LABEL[item.priority].toLowerCase()}</span>}
            {item && <span className={styles.pill}>{reasonText(item)}</span>}
          </span>
        }
        actions={
          <button type="button" className="btn" onClick={() => navigate(`/grafo?concepto=${encodeURIComponent(concept.id)}`)}>
            <Network size={16} aria-hidden="true" /> Ver en el grafo
          </button>
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <Card className={styles.card}>
            <h2>En qué estás fallando</h2>
            <dl className={styles.kpis}>
              <Kpi label="Intentos de etapa" value={analysis.stats.attempts} />
              <Kpi label="Fallos" value={analysis.stats.failures} bad={analysis.stats.failures > 0} />
              <Kpi label="Con ayuda" value={analysis.stats.withHelp} />
              <Kpi
                label="Test final"
                value={analysis.stats.testTotal ? `${analysis.stats.testTotal - analysis.stats.testFailures}/${analysis.stats.testTotal}` : '—'}
                bad={analysis.stats.testFailures > 0}
              />
              <Kpi label="Última práctica" value={analysis.stats.daysSincePractice === null ? '—' : analysis.stats.daysSincePractice === 0 ? 'hoy' : `${analysis.stats.daysSincePractice} d`} />
            </dl>
            <ul className={styles.diagnosis}>
              {analysis.diagnosis.map((line) => (
                <li key={line}>
                  <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {analysis.blockers.length > 0 && (
              <div>
                <h3>Dónde te trabaste</h3>
                <ul className={styles.blockers}>
                  {analysis.blockers.map((b) => (
                    <li key={b.blocker}>{BLOCKER_LABEL[b.blocker]} <span className="mono">× {b.count}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {analysis.rootCauses.length > 0 && (
            <Card className={styles.card}>
              <h2>Posibles causas raíz</h2>
              <p className={styles.lead}>A veces el problema no está en el concepto sino en lo que da por sabido. Estos prerrequisitos no están firmes:</p>
              <ul className={styles.roots}>
                {analysis.rootCauses.map((r) => (
                  <li key={r.concept.id}>
                    <DomainTile domain={r.concept.domain} size={28} />
                    <div>
                      <strong>{r.concept.name}</strong>
                      <p>{r.why}</p>
                    </div>
                    <StatusChip state={r.state} kind="concept" />
                    <Link
                      className="btn btn-sm"
                      to={r.hasAnalysis ? `/debilidad/${encodeURIComponent(r.concept.id)}` : `/grafo?concepto=${encodeURIComponent(r.concept.id)}`}
                    >
                      {r.hasAnalysis ? 'Ver análisis' : 'Ver en el grafo'}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className={styles.card}>
            <h2>Evidencia</h2>
            <p className={styles.lead}>Cada intento y cada pregunta del test donde apareció este concepto, del más reciente al más antiguo. Nada se borra: cuenta el último resultado.</p>
            <ol className={styles.timeline}>
              {analysis.evidence.map((e) => <EvidenceRow key={e.id} line={e} now={now} />)}
              {analysis.evidence.length === 0 && <li className={styles.none}>Sin intentos todavía.</li>}
            </ol>
          </Card>

          {analysis.commonError && (
            <Card className={styles.card}>
              <h2>El error común de este caso</h2>
              <p className={styles.lead}>
                Sale de la solución de «{analysis.commonError.stageTitle}» ({analysis.commonError.challengeTitle}). Leerlo aquí no marca tus intentos como «Con ayuda».
              </p>
              <Markdown>{analysis.commonError.text}</Markdown>
            </Card>
          )}
        </div>

        <aside className={styles.side} aria-label="Plan de mejora">
          <Card className={styles.card}>
            <h2>Cómo mejorar</h2>
            <p className={styles.lead}>
              Plan en {analysis.steps.length} pasos. Reintenta con <strong>Apoyo {APOYO_LABEL[analysis.recommendedApoyo]}</strong>.
            </p>
            <ol className={styles.steps}>
              {analysis.steps.map((s, i) => (
                <StepRow key={s.id} step={s} index={i + 1} checked={done.has(s.id)} onToggle={() => toggle(s.id)} onGenerate={generate} generating={generating} hasReinforcement={!!reinforcement} />
              ))}
            </ol>
            {reinforcement && (
              <div className={styles.reinforcement} aria-live="polite">
                <strong>{reinforcement.title}</strong>
                <div className={styles.rMeta}>
                  <DifficultyChip difficulty={reinforcement.difficulty} />
                  <TimeChip minutes={reinforcement.minutes} />
                </div>
                <p>Apoyo sugerido: <strong>Pistas</strong>. Generado de ejemplo: el Generador real llega con P3.</p>
              </div>
            )}
            <p className={styles.success}>
              <strong>Sabrás que lo dominaste</strong> cuando apruebes la etapa sin abrir la solución y aciertes sus preguntas del test final.
            </p>
            {analysis.practice && (
              <Link className="btn btn-primary" to={`/challenge-actual/${analysis.practice.challenge.id}`}>
                Practicar la Etapa {analysis.practice.stage.number} <ArrowRight size={15} aria-hidden="true" />
              </Link>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Kpi({ label, value, bad = false }: { label: string; value: string | number; bad?: boolean }) {
  return (
    <div className={`${styles.kpi} ${bad ? styles.bad : ''}`}>
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

function EvidenceRow({ line, now }: { line: EvidenceLine; now: Date }) {
  const date = new Date(line.at);
  return (
    <li className={`${styles.ev} ${styles[`ev_${line.result}`]}`}>
      <span className={styles.dot} aria-hidden="true" />
      <div className={styles.evBody}>
        <p className={styles.evHead}>
          <strong>{line.label}</strong>
          <span className={styles.resultTag}>{RESULT_TEXT[line.result]}</span>
          {line.withHelp && <span className={styles.helpTag}>Con ayuda</span>}
          {line.source === 'test' && <span className={styles.tag}>Test</span>}
        </p>
        <p className={styles.evSub}>
          <span className="mono">{formatShortDate(date)}</span> · {relativeTime(date, now)} · {line.detail}
          {line.minutes ? <> · <span className="mono">{line.minutes} min</span></> : null}
        </p>
        {line.blocker && <p className={styles.evMeta}>Te trabaste en: {BLOCKER_LABEL[line.blocker]}</p>}
        {line.notes && <blockquote className={styles.note}>«{line.notes}»</blockquote>}
      </div>
    </li>
  );
}

function StepRow({ step, index, checked, onToggle, onGenerate, generating, hasReinforcement }: {
  step: ActionStep;
  index: number;
  checked: boolean;
  onToggle: () => void;
  onGenerate: () => void;
  generating: boolean;
  hasReinforcement: boolean;
}) {
  return (
    <li className={`${styles.step} ${checked ? styles.checked : ''}`}>
      <label className={styles.stepHead}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className={styles.stepNum} aria-hidden="true">{index}</span>
        <span className={styles.stepTitle}>{step.title}</span>
      </label>
      <p>{step.detail}</p>
      <div className={styles.stepActions}>
        {step.to && <Link className={styles.stepLink} to={step.to}>Abrir <ArrowRight size={13} aria-hidden="true" /></Link>}
        {step.links?.map((l) => (
          <a key={l.href} className={styles.stepLink} href={l.href} target="_blank" rel="noreferrer noopener"><ExternalLink size={12} aria-hidden="true" /> {l.label}</a>
        ))}
        {step.kind === 'refuerzo' && !hasReinforcement && (
          <button type="button" className="btn btn-sm" onClick={onGenerate} disabled={generating}>
            <Sparkles size={14} aria-hidden="true" /> {generating ? 'Generando…' : 'Generar reto de refuerzo'}
          </button>
        )}
      </div>
    </li>
  );
}
