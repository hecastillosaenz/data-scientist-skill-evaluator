import { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { AGENT_ROLES, type AgentRole, type AgentStatus, type RunRecord, type RunSummary } from '../../../shared/agentes';
import { Card, EmptyState, PageHeader, Skeleton } from '../components/cards';
import { FilterChip } from '../components/FilterChip';
import { Segmented } from '../components/Segmented';
import { loadRun, useAgentes } from '../data/agentesApi';
import {
  OUTCOME_LABEL, ROL_LABEL, ROL_ROLE, challengesIn, filterRuns, formatDuration, formatUsd, handoffChain, handoffText, isFailure, type OutcomeFilter,
} from '../domain/agentesView';
import styles from './Agentes.module.css';

const when = (iso: string) => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Monitoreo de los cuatro agentes (SDD R46–R48): estado, línea de tiempo de ejecuciones, traspasos por challenge, últimos
 * análisis y errores. Es de solo lectura: ningún botón lanza ni reintenta ejecuciones.
 */
export function Agentes() {
  const { data, error } = useAgentes();
  const [roles, setRoles] = useState<Set<AgentRole>>(new Set());
  const [outcome, setOutcome] = useState<OutcomeFilter>('todas');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const runs = data?.ejecuciones ?? [];
  const visible = useMemo(() => filterRuns(runs, { roles, outcome, challengeId }), [runs, roles, outcome, challengeId]);
  const challenges = useMemo(() => challengesIn(runs), [runs]);
  const selected = runs.find((r) => r.id === selectedId) ?? null;

  if (error && !data) {
    return (
      <>
        <PageHeader title="Agentes" />
        <EmptyState title="No pude cargar el registro" text={error} action={<button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>} />
      </>
    );
  }
  if (!data) return <div aria-busy="true"><Skeleton w={320} h={32} /><div style={{ height: 20 }} /><Skeleton h={120} r={16} /></div>;

  const toggle = (rol: AgentRole) => setRoles((prev) => {
    const next = new Set(prev);
    if (next.has(rol)) next.delete(rol);
    else next.add(rol);
    return next;
  });
  const running = data.agentes.filter((a) => a.enCurso).length;

  return (
    <>
      <PageHeader
        title="Agentes"
        subtitle={running > 0 ? `${running} en ejecución ahora` : `${data.total} ejecuciones registradas en los últimos ${data.retencionDias} días`}
      />

      <ul className={styles.cards} aria-label="Estado de los agentes">
        {data.agentes.map((a) => <AgentCard key={a.rol} agent={a} onOpen={(id) => setSelectedId(id)} />)}
      </ul>

      {data.total === 0 ? (
        <EmptyState
          icon={<Bot size={22} aria-hidden="true" />}
          title="Aún no hay ejecuciones"
          text="Cada vez que el Generador, un Evaluador o el Analista trabajen, aparecerán aquí con su mensaje, sus pasos y su resultado. El registro es local y no se sube a git."
        />
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.chips} role="group" aria-label="Filtrar por agente">
              {AGENT_ROLES.map((rol) => <FilterChip key={rol} active={roles.has(rol)} onClick={() => toggle(rol)}>{ROL_LABEL[rol]}</FilterChip>)}
            </div>
            <Segmented<OutcomeFilter>
              label="Resultado"
              options={[{ value: 'todas', label: 'Todas' }, { value: 'ok', label: 'Correctas' }, { value: 'fallo', label: 'Con fallo' }]}
              value={outcome}
              onChange={setOutcome}
            />
            {challenges.length > 0 && (
              <label className={styles.select}>
                <span className="visually-hidden">Challenge</span>
                <select value={challengeId ?? ''} onChange={(e) => setChallengeId(e.target.value || null)}>
                  <option value="">Todos los challenges</option>
                  {challenges.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className={styles.layout}>
            <Card className={styles.timeline}>
              <h2>Línea de tiempo</h2>
              {visible.length === 0 ? (
                <p className={styles.muted}>Ninguna ejecución coincide con los filtros.</p>
              ) : (
                <ol className={styles.runs}>
                  {visible.map((r) => (
                    <li key={r.id}>
                      <button type="button" className={`${styles.run} ${r.id === selectedId ? styles.on : ''}`} aria-pressed={r.id === selectedId} onClick={() => setSelectedId(r.id)}>
                        <span className={`${styles.dot} ${styles[`o_${r.outcome}`]}`} aria-hidden="true">{r.outcome === 'en_curso' && <Loader2 size={12} className={styles.spin} />}</span>
                        <span className={styles.runText}>
                          <strong>{ROL_LABEL[r.rol]}</strong>
                          <span className={styles.muted}>{runTarget(r)}</span>
                        </span>
                        <span className={styles.runMeta}>
                          <span className={isFailure(r) ? styles.bad : styles.muted}>{OUTCOME_LABEL[r.outcome]}</span>
                          <span className={`${styles.muted} mono`}>{when(r.startedAt)} · {formatUsd(r.cost)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {data.total > runs.length && <p className={styles.muted}>Se muestran las {runs.length} más recientes de {data.total}.</p>}
            </Card>

            <RunDetail run={selected} runs={runs} onSelect={setSelectedId} />
          </div>
        </>
      )}

      <div className={styles.twoCol}>
        <Card>
          <h2>Últimos análisis</h2>
          {data.analisis.length === 0 ? (
            <p className={styles.muted}>El Analista aún no ha dejado observaciones con hallazgos.</p>
          ) : (
            <ul className={styles.plain}>
              {data.analisis.map((a) => (
                <li key={a.observation.evidenceId}>
                  <span className={styles.muted}>{when(a.observation.at)}{a.challengeId ? ` · ${a.challengeId}` : ''}</span>
                  <p>{a.observation.diagnosis || 'Se analizó sin llegar a un hallazgo.'}</p>
                  {a.observation.conceptIds.length > 0 && <span className={styles.muted}>Conceptos: {a.observation.conceptIds.join(', ')}</span>}
                  {a.runId && <button type="button" className={styles.link} onClick={() => setSelectedId(a.runId)}>Ver la ejecución</button>}
                </li>
              ))}
            </ul>
          )}
          {data.conceptosCreados.length > 0 && (
            <>
              <h3>Conceptos que creó</h3>
              <ul className={styles.plain}>
                {data.conceptosCreados.map((c) => <li key={c.id}><strong>{c.name}</strong> <span className={styles.muted}>{c.id} · {when(c.since)}</span></li>)}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <h2>Errores recientes</h2>
          {data.errores.length === 0 ? (
            <p className={styles.muted}>Sin errores en el registro.</p>
          ) : (
            <ul className={styles.plain}>
              {data.errores.map((r) => (
                <li key={r.id}>
                  <span className={styles.muted}>{when(r.startedAt)} · {ROL_LABEL[r.rol]} · {OUTCOME_LABEL[r.outcome]}</span>
                  <p>{r.errorMessage ?? 'La ejecución quedó interrumpida antes de terminar.'}</p>
                  <button type="button" className={styles.link} onClick={() => setSelectedId(r.id)}>Ver la ejecución</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

const runTarget = (r: RunSummary): string => [r.challengeId, r.fase ?? (r.stageId ? 'etapa' : null), r.evidenceId ? 'evidencia' : null].filter(Boolean).join(' · ') || 'Sin challenge asociado';

function AgentCard({ agent: a, onOpen }: { agent: AgentStatus; onOpen: (id: string) => void }) {
  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <strong>{ROL_LABEL[a.rol]}</strong>
        <span className={`${styles.state} ${a.enCurso ? styles.live : ''}`}>
          {a.enCurso && <span className={styles.pulse} aria-hidden="true" />}
          {a.enCurso ? 'En ejecución' : 'Inactivo'}
        </span>
      </div>
      <p className={styles.muted}>{ROL_ROLE[a.rol]}</p>
      <dl className={styles.facts}>
        <div><dt>Hoy</dt><dd className="mono">{formatUsd(a.costoHoy)}</dd></div>
        <div><dt>Acumulado</dt><dd className="mono">{formatUsd(a.costoTotal)}</dd></div>
        <div><dt>Ejecuciones</dt><dd className="mono">{a.ejecuciones}{a.errores > 0 && <span className={styles.bad}> · {a.errores} con fallo</span>}</dd></div>
      </dl>
      {a.ultima ? (
        <button type="button" className={styles.link} onClick={() => onOpen(a.ultima!.id)}>Última: {when(a.ultima.startedAt)} · {OUTCOME_LABEL[a.ultima.outcome]}</button>
      ) : (
        <span className={styles.muted}>Sin ejecuciones todavía</span>
      )}
    </li>
  );
}

function RunDetail({ run, runs, onSelect }: { run: RunSummary | null; runs: RunSummary[]; onSelect: (id: string) => void }) {
  const [full, setFull] = useState<RunRecord | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const id = run?.id ?? null;
  const live = run?.outcome === 'en_curso';
  const events = run?.eventCount ?? 0;

  useEffect(() => {
    setFull(null);
    setFailed(null);
    if (!id) return;
    let cancelled = false;
    loadRun(id).then((r) => !cancelled && setFull(r)).catch((err: Error) => !cancelled && setFailed(err.message));
    return () => {
      cancelled = true;
    };
    // Una ejecución en curso se vuelve a pedir cuando llegan eventos nuevos o termina.
  }, [id, live, events, run?.outcome]);

  if (!run) {
    return <Card className={styles.detail}><h2>Detalle</h2><p className={styles.muted}>Elige una ejecución para ver lo que recibió el agente, sus pasos y su respuesta.</p></Card>;
  }
  const chain = run.challengeId ? handoffChain(runs, run.challengeId) : [];

  return (
    <Card className={styles.detail}>
      <h2>{ROL_LABEL[run.rol]}</h2>
      <p className={styles.muted}>{runTarget(run)} · {when(run.startedAt)}</p>
      <dl className={styles.facts}>
        <div><dt>Resultado</dt><dd className={isFailure(run) ? styles.bad : ''}>{OUTCOME_LABEL[run.outcome]}</dd></div>
        <div><dt>Duración</dt><dd className="mono">{formatDuration(run.durationMs)}</dd></div>
        <div><dt>Costo</dt><dd className="mono">{formatUsd(run.cost)}{run.maxUsd !== undefined && <span className={styles.muted}> de {formatUsd(run.maxUsd)}</span>}</dd></div>
      </dl>
      {run.errorMessage && <p className={styles.errorBox} role="alert">{run.errorMessage}</p>}

      {failed && <p className={styles.muted}>No pude abrir esta ejecución: {failed}</p>}
      {!full && !failed && <Skeleton h={80} r={12} />}
      {full && (
        <>
          <details className={styles.block}>
            <summary>Mensaje que recibió{full.inputTruncated ? ' (recortado)' : ''}</summary>
            <pre className={`${styles.pre} mono`}>{full.input}</pre>
          </details>
          <details className={styles.block} open={full.events.length > 0 && full.events.length <= 12}>
            <summary>Pasos ({full.events.length}{full.eventsTruncated ? '+' : ''})</summary>
            <ol className={styles.events}>
              {full.events.map((e, i) => <li key={i} className={e.type === 'tool' ? `${styles.tool} mono` : ''}>{e.type === 'tool' ? `→ ${e.text}` : e.text}</li>)}
              {full.events.length === 0 && <li className={styles.muted}>Sin pasos registrados.</li>}
            </ol>
          </details>
          {full.output !== undefined && (
            <details className={styles.block}>
              <summary>Respuesta final{full.outputTruncated ? ' (recortada)' : ''}</summary>
              <pre className={`${styles.pre} mono`}>{full.output}</pre>
            </details>
          )}
        </>
      )}

      {chain.length > 1 && (
        <section className={styles.chain} aria-label={`Traspasos de ${run.challengeId}`}>
          <h3>Traspasos de {run.challengeId}</h3>
          <p className={styles.muted}>Los agentes no conversan: se pasan el trabajo por archivos.</p>
          <ol>
            {chain.map(({ run: r, from }) => (
              <li key={r.id}>
                {from && <p className={styles.handoff}>{handoffText(from, r.rol)}</p>}
                <button type="button" className={`${styles.link} ${r.id === run.id ? styles.current : ''}`} aria-current={r.id === run.id} onClick={() => onSelect(r.id)}>
                  {ROL_LABEL[r.rol]}{r.fase ? ` · ${r.fase}` : ''} · {OUTCOME_LABEL[r.outcome]}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Card>
  );
}
