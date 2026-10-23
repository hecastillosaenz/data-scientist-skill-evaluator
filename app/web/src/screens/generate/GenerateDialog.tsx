import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check, Loader2, OctagonX, Sparkles, Square, X } from 'lucide-react';
import { APOYO_LABEL, BLOOM_LABEL, DOMAINS, DOMAIN_BY_ID } from '../../../../shared/domains';
import type { TemaPedido } from '../../../../shared/objetivos';
import type { DomainId } from '../../../../shared/types';
import type { StageRole } from '../../../../server/generator/plan';
import { FilterChip } from '../../components/FilterChip';
import { useApp } from '../../data/DataContext';
import type { CasoPreview, EtapaPreview, PropuestaReto } from '../../../../shared/generate';
import { formatMinutes } from '../../charts/format';
import { PHASE_LABEL, type GenerateStep } from '../../domain/generateState';
import { loadObjetivos } from '../../data/objetivosApi';
import type { Foco } from '../../../../shared/objetivos';
import { MODELOS, rememberModelo, savedModelo } from './modelos';
import { TemaPicker } from './TemaPicker';
import { proponerReto, useGenerator, usePlanPreview } from './useGenerator';
import styles from './GenerateDialog.module.css';

const ROLE_LABEL: Record<StageRole, string> = { refuerzo: 'Refuerzo', consolidacion: 'Consolidación', avance: 'Avance', integracion: 'Integración' };

interface Ctl {
  /** Abre el diálogo para generar un challenge nuevo (R1: solo por acción manual). */
  open: () => void;
}
const Ctx = createContext<Ctl | null>(null);

export function useGeneratorDialog(): Ctl {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGeneratorDialog debe usarse dentro de <GeneratorProvider>');
  return ctx;
}

/** Provee `open()` y monta el diálogo una sola vez, para abrirlo desde Inicio o Challenges. */
export function GeneratorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const ctl = useMemo<Ctl>(() => ({ open: () => setOpen(true) }), []);
  return (
    <Ctx.Provider value={ctl}>
      {children}
      {isOpen && <GenerateDialog onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

/** La propuesta del Planificador: qué entendió, cuántas etapas y qué trabaja cada una. Se revisa antes de generar (R61). */
function PropuestaPanel({ propuesta, proponiendo, error, conceptName, onCancel, onChange }: { propuesta: PropuestaReto | null; proponiendo: boolean; error: string | null; conceptName: (id: string) => string; onCancel: () => void; onChange: () => void }) {
  if (proponiendo) {
    return (
      <section className={styles.plan} aria-busy="true" aria-label="Propuesta del Planificador">
        <h3>Propuesta del Planificador</h3>
        <p className={styles.muted} role="status"><Loader2 size={14} className={styles.spin} aria-hidden="true" /> Leyendo lo que quieres lograr y tu grafo… unos segundos.</p>
        <div><button type="button" className="btn btn-sm" onClick={onCancel}>Cancelar</button></div>
      </section>
    );
  }
  if (!propuesta) {
    return (
      <section className={styles.plan} aria-label="Propuesta del Planificador">
        <h3>Propuesta del Planificador</h3>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.muted}>Pulsa «Proponer plan»: el Planificador convertirá lo que quieres lograr en conceptos y etapas, y tú lo revisas antes de generar. Usa tu suscripción, con un tope de gasto pequeño.</p>
      </section>
    );
  }
  return (
    <section className={styles.plan} aria-label="Propuesta del Planificador">
      <div className={styles.propHead}>
        <h3>Lo que entendí</h3>
        <button type="button" className="btn btn-sm" onClick={onChange}>Cambiar</button>
      </div>
      <p className={styles.escenario}>{propuesta.meta}</p>
      <p className={styles.muted}><strong>{propuesta.etapas} etapas{propuesta.proyecto ? ' · proyecto de punta a punta' : ''}.</strong> {propuesta.razonEtapas}</p>
      <ol className={styles.stages}>
        {propuesta.pasos.map((p, i) => (
          <li key={p.conceptId}>
            <span className={styles.role}>Etapa {i + 1}</span>
            <span className={styles.stageText}>
              <strong>{conceptName(p.conceptId)}</strong>
              <span className={styles.muted}>Bloom {p.bloom} · {BLOOM_LABEL[p.bloom]} — {p.porque}</span>
            </span>
          </li>
        ))}
        <li>
          <span className={styles.role}>Etapa {propuesta.etapas}</span>
          <span className={styles.stageText}>
            <strong>{propuesta.integracion ? conceptName(propuesta.integracion.conceptId) : 'Interpretación para negocio'}</strong>
            <span className={styles.muted}>{propuesta.integracion?.porque || 'Integración: interpretar el resultado para una decisión.'}</span>
          </span>
        </li>
      </ol>
    </section>
  );
}

/** Lo que el Generador va planteando: el caso, los datos y cada etapa a medida que se escribe y se comprueba. */
function CasoPanel({ caso, etapas, steps }: { caso: CasoPreview; etapas: EtapaPreview[]; steps: GenerateStep[] }) {
  const total = caso.stages.reduce((a, s) => a + s.minutes, 0);
  return (
    <section className={styles.caso} aria-label="Así va el caso">
      <h3>{caso.title}</h3>
      <p className={styles.muted}><strong>Qué busca:</strong> {caso.lookingFor}</p>
      <p className={styles.escenario}>{caso.scenario}</p>
      <ul className={styles.tablas} aria-label="Tablas del caso">
        {caso.tables.map((t) => <li key={t.name} className="mono">{t.name} · {t.rows} filas · {t.columns} columnas</li>)}
      </ul>
      <p className={styles.muted}>Trabajo estimado de quien aprende: <strong>{formatMinutes(total)}</strong> en {caso.stages.length} etapas.</p>
      <ol className={styles.casoEtapas}>
        {caso.stages.map((s) => {
          const done = etapas.find((e) => e.number === s.number);
          const status = steps.find((x) => x.id === `etapa-${s.number}`)?.status;
          return (
            <li key={s.number} className={`${styles.casoEtapa} ${done ? styles.listo : ''}`}>
              <span className={styles.icon} aria-hidden="true">{done ? <Check size={14} strokeWidth={2.25} /> : status === 'running' ? <Loader2 size={14} className={styles.spin} /> : <span className={styles.pendiente}>{s.number}</span>}</span>
              <span className={styles.stepText}>
                <strong>Etapa {s.number} · {s.title}</strong>
                <span className={styles.muted}>{formatMinutes(s.minutes)} · {s.description}</span>
                {done && (
                  <>
                    {done.deliverables.length > 0 && <ul className={styles.entregables}>{done.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>}
                    <span className={styles.ok}>{done.checked}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function GenerateDialog({ onClose }: { onClose: () => void }) {
  const { data, actions, source } = useApp();
  const navigate = useNavigate();
  const [dominio, setDominio] = useState<DomainId | null>(null);
  const [tema, setTema] = useState<TemaPedido | null>(null);
  const [modelo, setModelo] = useState<string>(savedModelo);
  const [focoId, setFocoId] = useState<string | null>(null);
  const [focos, setFocos] = useState<Foco[]>([]);
  const [etapas, setEtapas] = useState<number | 'auto' | null>(null);
  const [proyecto, setProyecto] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [propuesta, setPropuesta] = useState<PropuestaReto | null>(null);
  const [proponiendo, setProponiendo] = useState(false);
  const [propError, setPropError] = useState<string | null>(null);
  const propAbort = useRef<AbortController | null>(null);
  // Con una descripción o con «que el modelo proponga», primero se pide una propuesta y se revisa (R61).
  const needsProposal = descripcion.trim() !== '' || etapas === 'auto';
  const etapasFijas = typeof etapas === 'number' ? etapas : null;
  const forma = useMemo(() => ({ etapas: etapasFijas, proyecto }), [etapasFijas, proyecto]);
  const { state, start, cancel, reset } = useGenerator(() => void actions.reload());
  const { plan, error: planError, pending } = usePlanPreview(state === null, dominio, tema, focoId, forma);
  const ref = useRef<HTMLDivElement>(null);
  const running = state?.phase === 'running';
  const conceptName = useCallback((id: string) => data?.concepts.find((c) => c.id === id)?.name ?? id, [data]);

  useEffect(() => ref.current?.focus(), []);
  // Cualquier cambio en lo que se pidió invalida la propuesta anterior.
  useEffect(() => {
    setPropuesta(null);
    setPropError(null);
  }, [descripcion, etapas, proyecto, dominio, tema, focoId]);
  useEffect(() => () => propAbort.current?.abort(), []);
  useEffect(() => {
    if (source === 'ejemplo') return;
    let cancelled = false;
    loadObjetivos().then((r) => !cancelled && setFocos(r.objetivos.focos.filter((f) => f.estado !== 'logrado'))).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  const request = (extra: { resume?: boolean; budgetFactor?: 1 | 2 } = {}) => void start({ ...(dominio ? { dominio } : {}), ...(tema ? { tema } : {}), ...(focoId ? { focoId } : {}), ...(modelo ? { modelo } : {}), ...(etapasFijas && !propuesta ? { etapas: etapasFijas } : {}), ...(proyecto && !propuesta ? { proyecto } : {}), ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}), ...(propuesta ? { propuesta } : {}), ...extra });
  const failedPhase = state?.error?.phase;
  const propose = async () => {
    setPropError(null);
    setProponiendo(true);
    const abort = new AbortController();
    propAbort.current = abort;
    try {
      const out = await proponerReto({ ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}), ...(tema ? { tema } : {}), ...(focoId ? { focoId } : {}), ...(dominio ? { dominio } : {}), etapas: etapasFijas, proyecto: proyecto ? true : null }, abort.signal);
      setPropuesta(out.propuesta);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setPropError((err as Error).message);
    } finally {
      propAbort.current = null;
      setProponiendo(false);
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div ref={ref} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="gen-title" tabIndex={-1}>
        <header className={styles.head}>
          <Sparkles size={20} strokeWidth={1.5} aria-hidden="true" />
          <h2 id="gen-title">Generar nuevo challenge</h2>
          <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose} disabled={running}><X size={18} aria-hidden="true" /></button>
        </header>

        {source === 'ejemplo' ? (
          <p className={styles.note}>Estás viendo datos de ejemplo: la generación real solo funciona con tus datos. Quita <code>?datos=ejemplo</code> de la dirección.</p>
        ) : state === null ? (
          <>
            <p className={styles.lead}>El orquestador calcula qué practicar según tu grafo y tu evidencia; el Generador (Claude, de solo lectura) escribe el caso por fases y todo se valida antes de publicarse.</p>

            <div className={styles.group} role="group" aria-label="Dominio">
              <span className="field-label">Dominio</span>
              <div className={styles.chips}>
                <FilterChip active={dominio === null} onClick={() => setDominio(null)}>Recomendado por mi grafo</FilterChip>
                {DOMAINS.filter((d) => d.id !== 'business').map((d) => (
                  <FilterChip key={d.id} active={dominio === d.id} onClick={() => setDominio(d.id)}>{d.short}</FilterChip>
                ))}
              </div>
            </div>

            {focos.length > 0 && (
              <div className={styles.group}>
                <label className="field-label" htmlFor="gen-objetivo">Objetivo <span className={styles.muted}>(opcional)</span></label>
                <select id="gen-objetivo" className={styles.select} value={focoId ?? ''} onChange={(e) => setFocoId(e.target.value || null)}>
                  <option value="">Ninguno</option>
                  {focos.map((f) => <option key={f.id} value={f.id}>{f.titulo}{f.estado === 'pausado' ? ' (en pausa)' : ''}</option>)}
                </select>
                {focoId && <p className={styles.muted}>{tema ? 'Usará tu tema, y el contexto de este objetivo.' : 'El tema será el siguiente concepto pendiente de su plan; si no tiene plan, solo orienta el caso.'}</p>}
              </div>
            )}

            <TemaPicker value={tema} onChange={setTema} onConceptCreated={() => void actions.reload()} />

            <div className={styles.group} role="group" aria-label="Tamaño del reto">
              <span className="field-label">Etapas</span>
              <div className={styles.chips}>
                <FilterChip active={etapas === 'auto'} onClick={() => setEtapas('auto')}>Que el modelo proponga</FilterChip>
                <FilterChip active={etapas === null} onClick={() => setEtapas(null)}>Estándar (3)</FilterChip>
                {[2, 4, 5, 6].map((n) => <FilterChip key={n} active={etapas === n} onClick={() => setEtapas(n)}>{n}</FilterChip>)}
                <FilterChip active={proyecto} onClick={() => { setProyecto(!proyecto); if (!proyecto && (etapas === null || (typeof etapas === 'number' && etapas < 4))) setEtapas(5); }}>Proyecto de punta a punta</FilterChip>
              </div>
              <p className={styles.muted}>
                {etapas === 'auto'
                  ? 'El Planificador decide cuántas etapas (2 a 6) según lo que quieras lograr, y te lo propone antes de generar.'
                  : proyecto
                  ? 'Una sola historia y un solo dataset, en pasos alcanzables: Feature Engineering → Model Training → reporte para negocio. Ignora el tema y el refuerzo.'
                  : 'Cada etapa es un entregable verificable. Más etapas = un caso más largo (y más costo de generación).'}
              </p>
            </div>

            <div className={styles.group} role="group" aria-label="Modelo">
              <span className="field-label">Modelo del Generador</span>
              <div className={styles.chips}>
                {MODELOS.map((m) => <FilterChip key={m.value || 'default'} active={modelo === m.value} onClick={() => { setModelo(m.value); rememberModelo(m.value); }}>{m.label}</FilterChip>)}
              </div>
              <p className={styles.muted}>{MODELOS.find((m) => m.value === modelo)!.hint} Usa tu suscripción de Claude Code.</p>
            </div>

            <div className={styles.group}>
              <label className="field-label" htmlFor="gen-descripcion">¿Qué quieres lograr? <span className={styles.muted}>(opcional)</span></label>
              <textarea
                id="gen-descripcion"
                className={styles.textarea}
                rows={3}
                maxLength={800}
                placeholder="Ej.: Quiero aprender el concepto de derivada en el contexto de analizar cómo cambia un modelo si ajusto su entrada."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
              <p className={styles.muted}>El Planificador extrae los conceptos y las metas de tu descripción y te propone el reto antes de generarlo. Sirve también para dar contexto: el caso se escribirá para esa meta.</p>
            </div>

            {!needsProposal && (
              <section className={styles.plan} aria-label="Plan de calibración" aria-busy={!plan && !planError}>
                <h3>Plan de este challenge</h3>
                {planError && <p className={styles.error}>{planError}</p>}
                {!plan && !planError && <p className={styles.muted}>Calculando…</p>}
                {plan && (
                  <>
                    <p className={styles.muted}>{plan.rationale[0]}</p>
                    {plan.focos.length > 0 && <p className={styles.muted}>Influyen tus objetivos: {plan.focos.map((f) => `«${f}»`).join(', ')}.</p>}
                    <ol className={styles.stages}>
                      {plan.stages.map((s) => (
                        <li key={s.number}>
                          <span className={styles.role}>{ROLE_LABEL[s.role]}</span>
                          <span className={styles.stageText}>
                            <strong>{s.conceptIds.map(conceptName).join(', ')}</strong>
                            <span className={styles.muted}>{DOMAIN_BY_ID[s.domain].short} · Bloom {s.bloom} · dificultad {s.difficulty} · Apoyo {APOYO_LABEL[s.apoyo]}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>
            )}

            {needsProposal && (
              <PropuestaPanel
                propuesta={propuesta}
                proponiendo={proponiendo}
                error={propError}
                conceptName={conceptName}
                onCancel={() => propAbort.current?.abort()}
                onChange={() => setPropuesta(null)}
              />
            )}

            {pending && (
              <div className={styles.pending} role="status">
                <p><strong>Quedó un challenge sin terminar</strong> ({pending.challengeId}, {pending.completed.length} {pending.completed.length === 1 ? 'fase lista' : 'fases listas'}, hace {pending.ageHours} h). Retomarlo no vuelve a pagar lo ya validado.</p>
                <button type="button" className="btn btn-sm" onClick={() => request({ resume: true })}>Retomar</button>
              </div>
            )}

            <footer className={styles.foot}>
              <button type="button" className="btn" onClick={onClose}>Cancelar</button>
              {needsProposal && !propuesta ? (
                <button type="button" className="btn btn-primary" disabled={proponiendo || (descripcion.trim() === '' && !tema && !focoId && etapas !== 'auto')} onClick={() => void propose()}>
                  {proponiendo ? 'Proponiendo…' : 'Proponer plan'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" disabled={needsProposal ? false : !plan} onClick={() => request()}>Generar challenge</button>
              )}
            </footer>
          </>
        ) : (
          <>
            <ol className={styles.steps} aria-live="polite" aria-busy={running}>
              {state.steps.map((s) => (
                <li key={s.id} className={`${styles.step} ${styles[`s_${s.status}`]}`}>
                  <span className={styles.icon} aria-hidden="true">
                    {s.status === 'running' ? <Loader2 size={14} className={styles.spin} /> : s.status === 'ok' ? <Check size={14} strokeWidth={2.25} /> : <X size={14} strokeWidth={2.25} />}
                  </span>
                  <span className={styles.stepText}>
                    <span>{s.label}</span>
                    {s.detail && <span className={styles.muted}>{s.detail}</span>}
                    {s.cost !== undefined && s.status === 'ok' && s.id !== 'plan' && <span className={styles.muted}>US$ {s.cost.toFixed(2).replace('.', ',')}</span>}
                  </span>
                </li>
              ))}
              {running && state.steps.length === 0 && <li className={styles.step}><span className={styles.icon}><Loader2 size={14} className={styles.spin} aria-hidden="true" /></span><span>Iniciando…</span></li>}
            </ol>

            {state.caso && <CasoPanel caso={state.caso} etapas={state.etapas} steps={state.steps} />}

            {state.tools.length > 0 && running && (
              <ul className={`${styles.tools} mono`} aria-label="Archivos que lee el Generador">
                {state.tools.map((t, i) => <li key={`${t}-${i}`}>→ {t}</li>)}
              </ul>
            )}

            {state.error && state.phase === 'error' && (
              <div className={styles.errorBox} role="alert">
                <OctagonX size={16} aria-hidden="true" />
                <p>{state.error.message}</p>
              </div>
            )}
            {state.phase === 'cancelled' && <p className={styles.muted}>Generación cancelada. No se creó ningún challenge.</p>}

            {state.result && (
              <div className={styles.success} role="status">
                <strong>Challenge creado</strong>
                <p>{state.result.title} ({state.result.challengeId}). Costo estimado: US$ {state.cost.toFixed(2).replace('.', ',')}.</p>
              </div>
            )}

            <footer className={styles.foot}>
              {running ? (
                <button type="button" className="btn" onClick={cancel}><Square size={12} aria-hidden="true" /> Detener</button>
              ) : state.phase === 'done' && state.result ? (
                <>
                  <button type="button" className="btn" onClick={onClose}>Cerrar</button>
                  <button type="button" className="btn btn-primary" onClick={() => { navigate(`/challenge-actual/${state.result!.challengeId}`); onClose(); }}>Abrir challenge</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn" onClick={onClose}>Cerrar</button>
                  <button type="button" className="btn" onClick={reset}>Empezar de cero</button>
                  {state.error?.canResume && (
                    <button type="button" className="btn btn-primary" onClick={() => request({ resume: true })}>Reintentar desde {PHASE_LABEL(failedPhase)}</button>
                  )}
                  {state.error?.code === 'budget' && (
                    <button type="button" className="btn btn-primary" onClick={() => request({ resume: true, budgetFactor: 2 })}>Reintentar con el doble de presupuesto</button>
                  )}
                </>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
