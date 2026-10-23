import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Loader, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { BLOOM_LABEL } from '../../../../shared/domains';
import { PLAN_MAX_PASOS, type Foco, type PlanFoco, type PlanPaso } from '../../../../shared/objetivos';
import type { Bloom, Concept } from '../../../../shared/types';
import { DomainTile } from '../../components/DomainTile';
import { searchConcepts } from '../../domain/graphQueries';
import styles from '../Objetivos.module.css';

interface Props {
  foco: Foco;
  concepts: Concept[];
  /** Este foco está esperando al Planificador. */
  planning: boolean;
  /** Otro foco está esperando al Planificador: solo uno a la vez. */
  busy: boolean;
  error: string | null;
  onCreate: () => void;
  onCancel: () => void;
  /** `saveNow`: guarda en el momento (aceptar y eliminar); si no, queda como borrador hasta «Guardar». */
  onPlan: (plan: PlanFoco | undefined, saveNow: boolean) => void;
}

/**
 * Plan de estudio de un foco (R56): ruta de conceptos por nivel de Bloom que arma el Planificador a partir de tus
 * objetivos de estudio. Se puede aceptar, modificar o eliminar; solo un plan aceptado sesga los challenges.
 */
export function PlanPanel({ foco, concepts, planning, busy, error, onCreate, onCancel, onPlan }: Props) {
  const [editing, setEditing] = useState(false);
  // Un plan ya aceptado se muestra plegado: es una ruta que consultas, no algo que haya que leer cada vez.
  const [open, setOpen] = useState(() => foco.plan?.estado !== 'aceptado');
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const plan = foco.plan;
  const hasGoal = foco.material.trim().length > 0;

  if (planning) {
    return (
      <div className={styles.plan} aria-busy="true">
        <p className="field-label">Plan de estudio</p>
        <p className={styles.working} role="status"><Loader size={16} className={styles.spin} aria-hidden="true" /> El Planificador está leyendo tus objetivos y el grafo. Puede tardar un minuto.</p>
        <div><button type="button" className="btn btn-sm" onClick={onCancel}>Cancelar</button></div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className={styles.plan}>
        <p className="field-label">Plan de estudio</p>
        <p className={styles.hint}>A partir de tus objetivos de estudio, el Planificador elige los conceptos del grafo que necesitas y el nivel de Bloom al que llegar en cada uno, en orden de prerrequisitos.</p>
        {error && <p className={`${styles.hint} ${styles.warn}`} role="alert">{error}</p>}
        <div>
          <button type="button" className="btn" disabled={!hasGoal || busy} onClick={onCreate}><Sparkles size={14} aria-hidden="true" /> Crear plan de estudio</button>
        </div>
        {!hasGoal && <p className={styles.hint}>Escribe primero tus objetivos de estudio.</p>}
      </div>
    );
  }

  const setPasos = (pasos: PlanPaso[]) => onPlan({ ...plan, estado: 'propuesto', pasos }, false);
  const patchPaso = (i: number, patch: Partial<PlanPaso>) => setPasos(plan.pasos.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...plan.pasos];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setPasos(next);
  };
  const results = query.trim() ? searchConcepts(query, concepts).filter((c) => !plan.pasos.some((p) => p.conceptId === c.id)).slice(0, 8) : [];

  return (
    <div className={styles.plan}>
      <div className={styles.planHead}>
        <p className="field-label">Plan de estudio</p>
        <span className={`${styles.badge} ${plan.estado === 'aceptado' ? styles.badgeOk : ''}`}>{plan.estado === 'aceptado' ? 'Aceptado' : 'Propuesto'}</span>
      </div>
      {plan.resumen && <p className={styles.resumen}>{plan.resumen}</p>}

      <button type="button" className={styles.fold} aria-expanded={open || editing} onClick={() => setOpen(!open)} disabled={editing}>
        {open || editing ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        {open || editing ? 'Ocultar la ruta' : `Ver la ruta · ${plan.pasos.length} ${plan.pasos.length === 1 ? 'concepto' : 'conceptos'}`}
      </button>

      {(open || editing) && <ol className={styles.steps}>
        {plan.pasos.map((p, i) => {
          const c = byId.get(p.conceptId);
          return (
            <li key={p.conceptId} className={styles.step}>
              <span className={styles.stepN}>{i + 1}</span>
              <div className={styles.stepBody}>
                <div className={styles.stepTop}>
                  {c && <DomainTile domain={c.domain} size={20} />}
                  <strong>{c?.name ?? p.conceptId}</strong>
                  {editing ? (
                    <select aria-label={`Nivel de Bloom de ${c?.name ?? p.conceptId}`} className={styles.select} value={p.bloom} onChange={(e) => patchPaso(i, { bloom: Number(e.target.value) as Bloom })}>
                      {([1, 2, 3, 4, 5, 6] as Bloom[]).map((b) => <option key={b} value={b}>{b} · {BLOOM_LABEL[b]}</option>)}
                    </select>
                  ) : (
                    <span className={styles.bloom}>Bloom {p.bloom} · {BLOOM_LABEL[p.bloom]}</span>
                  )}
                </div>
                {editing ? (
                  <input aria-label={`Por qué ${c?.name ?? p.conceptId}`} className={styles.input} type="text" maxLength={500} value={p.porque} onChange={(e) => patchPaso(i, { porque: e.target.value })} />
                ) : (
                  <p className={styles.porque}>{p.porque}</p>
                )}
              </div>
              {editing && (
                <div className={styles.stepActions}>
                  <button type="button" className="btn btn-sm" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                  <button type="button" className="btn btn-sm" aria-label="Bajar" disabled={i === plan.pasos.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                  <button type="button" className="btn btn-sm" aria-label={`Quitar ${c?.name ?? p.conceptId}`} onClick={() => setPasos(plan.pasos.filter((_, j) => j !== i))}><X size={14} aria-hidden="true" /></button>
                </div>
              )}
            </li>
          );
        })}
      </ol>}

      {editing && plan.pasos.length < PLAN_MAX_PASOS && (
        <div className={styles.searchWrap}>
          <input aria-label="Añadir un concepto al plan" className={styles.input} type="search" placeholder="Añadir un concepto del grafo…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <ul className={styles.results}>
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setPasos([...plan.pasos, { conceptId: c.id, bloom: 3, porque: 'Añadido por ti.' }]); setQuery(''); }}>
                    <DomainTile domain={c.domain} size={20} />
                    <span>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className={`${styles.hint} ${styles.warn}`} role="alert">{error}</p>}
      <p className={styles.hint}>
        {plan.estado === 'aceptado' ? 'Este plan hace que tus challenges prefieran estos conceptos.' : 'Todavía no influye en tus challenges: acéptalo cuando te convenza.'}
        {' '}Es una guía, no un examen: puedes ajustarla cuando quieras.
      </p>

      <div className={styles.planActions}>
        {confirming ? (
          <span className={styles.confirm}>
            ¿Eliminar el plan?
            <button type="button" className="btn btn-sm btn-primary" onClick={() => { setConfirming(false); setEditing(false); onPlan(undefined, true); }}>Sí, eliminar</button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>Cancelar</button>
          </span>
        ) : editing ? (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(false)}><Check size={14} aria-hidden="true" /> Listo</button>
            <button type="button" className="btn btn-sm" disabled={busy || !hasGoal} onClick={() => { setEditing(false); onCreate(); }}><Sparkles size={14} aria-hidden="true" /> Rehacer con el Planificador</button>
          </>
        ) : (
          <>
            {plan.estado !== 'aceptado' && <button type="button" className="btn btn-sm btn-primary" disabled={plan.pasos.length === 0} onClick={() => { setOpen(false); onPlan({ ...plan, estado: 'aceptado' }, true); }}><Check size={14} aria-hidden="true" /> Aceptar</button>}
            <button type="button" className="btn btn-sm" onClick={() => { setOpen(true); setEditing(true); }}><Pencil size={14} aria-hidden="true" /> Modificar</button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}><Trash2 size={14} aria-hidden="true" /> Eliminar plan</button>
          </>
        )}
      </div>
    </div>
  );
}
