import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check, Loader2, OctagonX, Sparkles, Square, X } from 'lucide-react';
import { APOYO_LABEL, DOMAINS, DOMAIN_BY_ID } from '../../../../shared/domains';
import type { TemaPedido } from '../../../../shared/objetivos';
import type { DomainId } from '../../../../shared/types';
import type { StageRole } from '../../../../server/generator/plan';
import { FilterChip } from '../../components/FilterChip';
import { useApp } from '../../data/DataContext';
import { PHASE_LABEL } from '../../domain/generateState';
import { TemaPicker } from './TemaPicker';
import { useGenerator, usePlanPreview } from './useGenerator';
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

function GenerateDialog({ onClose }: { onClose: () => void }) {
  const { data, actions, source } = useApp();
  const navigate = useNavigate();
  const [dominio, setDominio] = useState<DomainId | null>(null);
  const [tema, setTema] = useState<TemaPedido | null>(null);
  const { state, start, cancel, reset } = useGenerator(() => void actions.reload());
  const { plan, error: planError, pending } = usePlanPreview(state === null, dominio, tema);
  const ref = useRef<HTMLDivElement>(null);
  const running = state?.phase === 'running';
  const conceptName = useCallback((id: string) => data?.concepts.find((c) => c.id === id)?.name ?? id, [data]);

  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  const request = (extra: { resume?: boolean; budgetFactor?: 1 | 2 } = {}) => void start({ ...(dominio ? { dominio } : {}), ...(tema ? { tema } : {}), ...extra });
  const failedPhase = state?.error?.phase;

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

            <TemaPicker value={tema} onChange={setTema} onConceptCreated={() => void actions.reload()} />

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

            {pending && (
              <div className={styles.pending} role="status">
                <p><strong>Quedó un challenge sin terminar</strong> ({pending.challengeId}, {pending.completed.length} {pending.completed.length === 1 ? 'fase lista' : 'fases listas'}, hace {pending.ageHours} h). Retomarlo no vuelve a pagar lo ya validado.</p>
                <button type="button" className="btn btn-sm" onClick={() => request({ resume: true })}>Retomar</button>
              </div>
            )}

            <footer className={styles.foot}>
              <button type="button" className="btn" onClick={onClose}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={!plan} onClick={() => request()}>Generar challenge</button>
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
