import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Target, Trash2, X } from 'lucide-react';
import { CONVERSACION_MAX, EMPTY_OBJETIVOS, type Foco, type FocoEstado, type Objetivos as ObjetivosData, type PlanFoco } from '../../../shared/objetivos';
import { relativeTime } from '../charts/format';
import { Card, EmptyState, KpiCard, PageHeader, Skeleton } from '../components/cards';
import { Segmented } from '../components/Segmented';
import { useApp } from '../data/DataContext';
import { conversarFoco, crearPlan, loadObjetivos, saveObjetivos, scanCarpeta, type MaterialScan, type ObjetivosLimites } from '../data/objetivosApi';
import { computeFocoProgress, type FocoProgreso } from '../domain/objetivoProgress';
import { activeCount, addFoco, isDirty, removeFoco, updateFoco } from '../domain/objetivosDraft';
import { AvancePanel } from './objetivos/AvancePanel';
import { ConversacionPanel } from './objetivos/ConversacionPanel';
import { PlanPanel } from './objetivos/PlanPanel';
import styles from './Objetivos.module.css';

const ESTADOS: { value: FocoEstado; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'logrado', label: 'Logrado' },
];

/**
 * Objetivos de aprendizaje (SDD R44, R45): tu rol y lo que estudias ahora. Los focos activos sesgan el plan de los
 * challenges y su material se entrega al Generador solo como contexto. Se guarda con un botón (son textos largos).
 */
export function Objetivos() {
  const { source, data, insights, now } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [saved, setSaved] = useState<ObjetivosData | null>(null);
  const [draft, setDraft] = useState<ObjetivosData>(EMPTY_OBJETIVOS);
  const [limits, setLimits] = useState<ObjetivosLimites | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);
  const [planError, setPlanError] = useState<{ id: string; message: string } | null>(null);
  const planAbort = useRef<AbortController | null>(null);
  const [chatting, setChatting] = useState<string | null>(null);
  const [chatError, setChatError] = useState<{ id: string; message: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const real = source !== 'ejemplo';

  useEffect(() => {
    if (!real) return;
    let cancelled = false;
    loadObjetivos()
      .then(({ objetivos, limites }) => {
        if (cancelled) return;
        setSaved(objetivos);
        setDraft(objetivos);
        setLimits(limites);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [real]);

  const dirty = saved !== null && isDirty(saved, draft);
  // Avisa antes de perder cambios al cerrar o recargar la pestaña.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Guarda un borrador completo; devuelve si se pudo (el error queda a la vista). */
  const persist = useCallback(async (next: ObjetivosData): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      const stored = await saveObjetivos(next);
      setSaved(stored);
      setDraft(stored);
      setSavedAt(new Date());
      return true;
    } catch (err) {
      setSaveError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);
  const save = useCallback(() => persist(draft), [persist, draft]);

  /** Aceptar o eliminar un plan: se guarda en el momento, sin esperar a «Guardar». */
  const changePlan = (id: string, plan: PlanFoco | undefined, saveNow: boolean) => {
    const next = updateFoco(draft, id, { plan });
    setDraft(next);
    if (saveNow) void persist(next);
  };

  /** El Planificador necesita el foco guardado en disco: se guarda el borrador y luego se pide el plan. */
  const makePlan = async (id: string) => {
    setPlanError(null);
    if (dirty && !(await persist(draft))) return;
    const abort = new AbortController();
    planAbort.current = abort;
    setPlanning(id);
    try {
      const { plan } = await crearPlan(id, abort.signal);
      setSaved((s) => (s ? updateFoco(s, id, { plan }) : s));
      setDraft((d) => updateFoco(d, id, { plan }));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setPlanError({ id, message: (err as Error).message });
    } finally {
      planAbort.current = null;
      setPlanning(null);
    }
  };

  /** Feedback o revisión: igual que el plan, primero se guarda el borrador; la respuesta se añade al hilo y puede traer un plan nuevo. */
  const talk = async (id: string, body: { accion: 'feedback' | 'revision'; texto?: string }) => {
    setChatError(null);
    if (dirty && !(await persist(draft))) return;
    const abort = new AbortController();
    planAbort.current = abort;
    setChatting(id);
    try {
      const out = await conversarFoco(id, body, abort.signal);
      const apply = (o: ObjetivosData): ObjetivosData => {
        const f = o.focos.find((x) => x.id === id);
        if (!f) return o;
        return updateFoco(o, id, { conversacion: [...(f.conversacion ?? []), ...out.mensajes].slice(-CONVERSACION_MAX), ...(out.plan ? { plan: out.plan } : {}) });
      };
      setSaved((v) => (v ? apply(v) : v));
      setDraft(apply);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setChatError({ id, message: (err as Error).message });
    } finally {
      planAbort.current = null;
      setChatting(null);
    }
  };

  // Avance de cada objetivo: derivado de la Evidence y del test final, nunca guardado (R56).
  const progressById = useMemo(() => {
    const out = new Map<string, FocoProgreso>();
    if (!data) return out;
    for (const f of draft.focos) out.set(f.id, computeFocoProgress(f, data, insights));
    return out;
  }, [draft.focos, data, insights]);

  if (!real) {
    return (
      <>
        <PageHeader title="Objetivos" />
        <EmptyState icon={<Target size={22} aria-hidden="true" />} title="Disponible con tus datos" text="Con los datos de ejemplo los objetivos no se guardan. Quita ?datos=ejemplo de la dirección para registrar los tuyos." />
      </>
    );
  }
  if (loadError) {
    return (
      <>
        <PageHeader title="Objetivos" />
        <EmptyState title="No pude cargar tus objetivos" text={loadError} action={<button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>} />
      </>
    );
  }
  if (!limits || !saved) return <div aria-busy="true"><Skeleton w={320} h={32} /><div style={{ height: 20 }} /><Skeleton h={260} r={16} /></div>;

  const active = activeCount(draft);
  const createFoco = () => {
    const title = newTitle.trim();
    if (title === '') {
      setAddError('Escribe el título del objetivo.');
      document.getElementById('obj-nuevo')?.focus();
      return;
    }
    const next = addFoco(draft, title, limits.focosActivosMax);
    const created = next.focos[next.focos.length - 1]!;
    setDraft(next);
    setOpenId(created.id);
    setNewTitle('');
    setAddError(null);
    setAdding(false);
    // El objetivo nuevo se abre en Ajustes: llévalo a la vista y deja listo su título.
    window.setTimeout(() => {
      const el = document.getElementById(`foco-${created.id}-titulo`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    }, 60);
  };

  return (
    <>
      <PageHeader
        title="Objetivos"
        subtitle="Qué estás estudiando, cómo avanzas y cómo se conecta con tus retos."
        actions={
          <div className={styles.saveBar}>
            {dirty ? (
              <span className={styles.dirty} role="status">Cambios sin guardar</span>
            ) : savedAt ? (
              <span className={styles.ok} role="status"><Check size={14} aria-hidden="true" /> Guardado a las {savedAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
            ) : (
              <span className={styles.dirty} role="status">Todo guardado</span>
            )}
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => { setDraft(saved); setSaveError(null); }}>Descartar</button>
            <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        }
      />
      {saveError && <p className={styles.error} role="alert">{saveError}</p>}

      <div className={styles.layout}>
        <section className={styles.main} aria-label="Objetivos de aprendizaje">
          <div className={styles.listHead}>
            <div className={styles.listTitle}>
              <h2>Objetivos de aprendizaje</h2>
              <span className={styles.count}>{active} de {limits.focosActivosMax} activos</span>
            </div>
            <button type="button" className={`${styles.addBtn} btn btn-primary`} aria-expanded={adding} onClick={() => { setAdding(!adding); setAddError(null); }}>
              {adding ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />} {adding ? 'Cancelar' : 'Nuevo objetivo'}
            </button>
          </div>

          {adding && (
            <form className={styles.add} onSubmit={(e) => { e.preventDefault(); createFoco(); }}>
              <label className="visually-hidden" htmlFor="obj-nuevo">Título del nuevo objetivo</label>
              <input id="obj-nuevo" className={styles.input} type="text" autoFocus maxLength={120} placeholder="p. ej. Certificación de cálculo para deep learning" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); setAddError(null); }} aria-invalid={addError ? true : undefined} />
              <button type="submit" className={styles.addBtn + ' btn'}>Crear</button>
            </form>
          )}
          {addError && <p className={`${styles.hint} ${styles.warn}`} role="alert">{addError}</p>}
          {active >= limits.focosActivosMax && <p className={styles.hint}>Ya tienes {active} objetivos activos, el máximo. Los nuevos empiezan en pausa.</p>}

          {draft.focos.length === 0 && !adding && <EmptyState icon={<Target size={22} aria-hidden="true" />} title="Aún no tienes objetivos" text="Un objetivo es algo que estudias ahora, p. ej. «Certificación de cálculo para deep learning». Crea el primero con «Nuevo objetivo»." />}

          {draft.focos.map((f) => (
            <FocoCard
              key={f.id}
              foco={f}
              open={openId === f.id}
              onToggle={() => setOpenId(openId === f.id ? null : f.id)}
              progress={progressById.get(f.id) ?? null}
              now={now}
              limits={limits}
              planning={planning === f.id}
              chatting={chatting === f.id}
              agentBusy={planning !== null || chatting !== null || saving}
              planError={planError?.id === f.id ? planError.message : null}
              chatError={chatError?.id === f.id ? chatError.message : null}
              onCreatePlan={() => void makePlan(f.id)}
              onCancelAgent={() => planAbort.current?.abort()}
              onSend={(texto) => void talk(f.id, { accion: 'feedback', texto })}
              onReview={() => void talk(f.id, { accion: 'revision' })}
              onPlan={(plan, saveNow) => changePlan(f.id, plan, saveNow)}
              activeFull={f.estado !== 'activo' && active >= limits.focosActivosMax}
              onChange={(patch) => setDraft((d) => updateFoco(d, f.id, patch))}
              onRemove={() => setDraft((d) => removeFoco(d, f.id))}
            />
          ))}
        </section>

        <aside className={styles.rail} aria-label="Resumen">
          <Panorama focos={draft.focos} progress={progressById} max={limits.focosActivosMax} now={now} />

          <Card className={styles.roleCard}>
            <div className={styles.roleHead}>
              <p className="field-label">Tu rol</p>
              <button type="button" className="btn btn-sm" aria-label={editingRole ? 'Cerrar edición del rol' : 'Editar rol'} onClick={() => setEditingRole(!editingRole)}>{editingRole ? <Check size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}</button>
            </div>
            {editingRole ? (
              <>
                <input id="obj-rol" aria-label="Tu rol" className={styles.input} type="text" autoFocus maxLength={120} placeholder="p. ej. Data Scientist" value={draft.rol} onChange={(e) => setDraft({ ...draft, rol: e.target.value })} />
                <p className={styles.hint}>Los retos buscan el hands-on real de ese rol; tus objetivos solo ajustan el énfasis.</p>
              </>
            ) : (
              <p className={styles.roleValue}>{draft.rol || 'Sin definir'}</p>
            )}
          </Card>

          <Avisos focos={draft.focos} onOpen={(id) => setOpenId(id)} />
        </aside>
      </div>
    </>
  );
}

/** Resumen de todos los objetivos (barra lateral): cuántos hay activos, cuánto avanzan y qué retos los tocan. */
function Panorama({ focos, progress, max, now }: { focos: Foco[]; progress: Map<string, FocoProgreso>; max: number; now: Date }) {
  const activos = focos.filter((f) => f.estado === 'activo');
  const pcts = activos.map((f) => progress.get(f.id)?.pct ?? 0);
  const avg = pcts.length === 0 ? 0 : Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  const retos = new Set(activos.flatMap((f) => (progress.get(f.id)?.retos ?? []).map((r) => r.challenge.id)));
  const last = activos.map((f) => progress.get(f.id)?.lastActivity ?? null).reduce<string | null>((a, b) => (b && (!a || b > a) ? b : a), null);
  const stats: { label: string; value: string; sub?: string }[] = [
    { label: 'Activos', value: `${activos.length}/${max}` },
    { label: 'Avance medio', value: `${avg}%` },
    { label: 'Retos conectados', value: String(retos.size) },
    { label: 'Última práctica', value: last ? relativeTime(new Date(last), now) : '—' },
  ];
  return (
    <Card className={styles.panorama}>
      <p className="field-label">Panorama</p>
      <div className={styles.stats}>
        {stats.map((x) => <div key={x.label} className={styles.stat}><span>{x.label}</span><strong className="mono">{x.value}</strong></div>)}
      </div>
      <span className={styles.rowTrack} aria-hidden="true"><span style={{ width: `${avg}%` }} /></span>
    </Card>
  );
}

/** Lo último que dijo el Planificador sobre tus objetivos; abre el objetivo al pulsar. */
function Avisos({ focos, onOpen }: { focos: Foco[]; onOpen: (id: string) => void }) {
  const items = focos
    .flatMap((f) => (f.conversacion ?? []).filter((m) => m.rol === 'planificador').map((m) => ({ f, m })))
    .sort((a, b) => b.m.at.localeCompare(a.m.at))
    .slice(0, 4);
  return (
    <Card className={styles.avisos}>
      <p className="field-label">Del Planificador</p>
      {items.length === 0 ? (
        <p className={styles.hint}>Cuando le des feedback o pidas una revisión de avance, sus respuestas aparecen aquí.</p>
      ) : (
        <ul>
          {items.map(({ f, m }) => (
            <li key={m.id}>
              <button type="button" onClick={() => onOpen(f.id)}>
                <strong>{f.titulo}</strong>
                <span>{m.texto.length > 110 ? `${m.texto.slice(0, 110).trimEnd()}…` : m.texto}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Tab = 'avance' | 'plan' | 'conversacion' | 'ajustes';
const ESTADO_CLASS: Record<FocoEstado, string> = { activo: styles.stActivo!, pausado: styles.stPausado!, logrado: styles.stLogrado! };

function FocoCard({ foco, open, onToggle, progress, now, limits, activeFull, planning, chatting, agentBusy, planError, chatError, onCreatePlan, onCancelAgent, onSend, onReview, onPlan, onChange, onRemove }: {
  foco: Foco;
  /** Los objetivos arrancan plegados: la fila resume avance, retos y última práctica. */
  open: boolean;
  onToggle: () => void;
  progress: FocoProgreso | null;
  now: Date;
  limits: ObjetivosLimites;
  planning: boolean;
  chatting: boolean;
  /** Hay una operación de agente (plan o conversación) en curso: solo una a la vez. */
  agentBusy: boolean;
  planError: string | null;
  chatError: string | null;
  onCreatePlan: () => void;
  onCancelAgent: () => void;
  onSend: (texto: string) => void;
  onReview: () => void;
  onPlan: (plan: PlanFoco | undefined, saveNow: boolean) => void;
  /** Se alcanzó el máximo de activos: este foco no puede activarse hasta pausar otro. */
  activeFull: boolean;
  onChange: (patch: Partial<Foco>) => void;
  onRemove: () => void;
}) {
  const { data } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (foco.plan?.estado === 'aceptado' ? 'avance' : foco.plan || foco.material.trim() ? 'plan' : 'ajustes'));
  const concepts = data?.concepts ?? [];
  const over = foco.material.length > limits.materialMaxCaracteres;
  const field = `foco-${foco.id}`;
  const n = progress?.pasos.length ?? 0;

  return (
    <Card className={`${styles.foco} ${open ? styles.focoOpen : ''}`}>
      <button type="button" className={styles.rowHead} aria-expanded={open} aria-controls={`${field}-cuerpo`} onClick={onToggle}>
        {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{foco.titulo}</span>
          <span className={styles.rowMeta}>
            {n === 0 ? 'Sin plan todavía' : `${progress!.done} de ${n} conceptos · ${progress!.retos.length} ${progress!.retos.length === 1 ? 'reto' : 'retos'}${progress!.lastActivity ? ` · práctica ${relativeTime(new Date(progress!.lastActivity), now)}` : ' · sin práctica'}`}
            {foco.plan?.estado === 'propuesto' && ' · plan por aceptar'}
          </span>
        </span>
        {n > 0 && (
          <span className={styles.rowBar} role="img" aria-label={`Avance ${progress!.pct} %`}>
            <span className={styles.rowTrack}><span style={{ width: `${progress!.pct}%` }} /></span>
            <span className="mono">{progress!.pct}%</span>
          </span>
        )}
        <span className={`${styles.estado} ${ESTADO_CLASS[foco.estado]}`}>{ESTADOS.find((e) => e.value === foco.estado)!.label}</span>
      </button>

      {open && (
        <div id={`${field}-cuerpo`} className={styles.body}>
          <Segmented<Tab>
            label="Sección del objetivo"
            hideLabel
            options={[{ value: 'avance', label: 'Avance' }, { value: 'plan', label: 'Plan' }, { value: 'conversacion', label: 'Conversación' }, { value: 'ajustes', label: 'Ajustes' }]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'avance' && progress && <AvancePanel progress={progress} hasPlan={!!foco.plan} accepted={foco.plan?.estado === 'aceptado'} now={now} />}

          {tab === 'plan' && <PlanPanel foco={foco} concepts={concepts} planning={planning} busy={agentBusy} error={planError} onCreate={onCreatePlan} onCancel={onCancelAgent} onPlan={onPlan} />}

          {tab === 'conversacion' && <ConversacionPanel foco={foco} waiting={chatting} busy={agentBusy} error={chatError} onSend={onSend} onReview={onReview} onCancel={onCancelAgent} onOpenPlan={() => setTab('plan')} />}

          {tab === 'ajustes' && (
            <>
              <div className={styles.focoHead}>
                <input id={field + '-titulo'} aria-label="Título del foco" className={`${styles.input} ${styles.title}`} type="text" maxLength={120} value={foco.titulo} onChange={(e) => onChange({ titulo: e.target.value })} />
                <Segmented<FocoEstado>
                  label="Estado"
                  hideLabel
                  options={ESTADOS.filter((o) => !(o.value === 'activo' && activeFull))}
                  value={foco.estado}
                  onChange={(estado) => onChange({ estado })}
                />
              </div>

              <div className={styles.material}>
                <label className="field-label" htmlFor={field}>Objetivos de estudio</label>
                <textarea id={field} className={styles.textarea} rows={6} placeholder="Qué quieres lograr y hasta dónde. p. ej. «Entender derivadas parciales y la regla de la cadena lo suficiente para seguir backpropagation, y poder calcular gradientes a mano en casos simples»." value={foco.material} onChange={(e) => onChange({ material: e.target.value })} />
                <p className={`${styles.hint} ${over ? styles.warn : ''}`}>
                  <span className="mono">{foco.material.length.toLocaleString('es')}</span> caracteres. El Planificador los convierte en un plan; al generar un challenge se envían los primeros <span className="mono">{limits.materialMaxCaracteres.toLocaleString('es')}</span>{' '}(se reparte entre tus focos activos) como contexto.
                </p>
              </div>

              <div className={styles.dates}>
                <label>Duración estimada · desde <input className={styles.input} type="date" value={foco.desde ?? ''} onChange={(e) => onChange({ desde: e.target.value })} /></label>
                <label>Hasta <input className={styles.input} type="date" value={foco.hasta ?? ''} onChange={(e) => onChange({ hasta: e.target.value })} /></label>
                <p className={styles.hint}>Solo una referencia: no cierra el foco ni cambia tu plan. Aprender lleva lo que lleve.</p>
              </div>

              <CarpetaField carpeta={foco.carpeta ?? ''} onChange={(carpeta) => onChange({ carpeta })} id={`${field}-carpeta`} />

              <div className={styles.footer}>
                {confirming ? (
                  <span className={styles.confirm}>
                    ¿Eliminar este foco{foco.plan ? ' y su plan' : ''}?
                    <button type="button" className="btn btn-sm btn-primary" onClick={onRemove}>Sí, eliminar</button>
                    <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>Cancelar</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}><Trash2 size={14} aria-hidden="true" /> Eliminar</button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

const KIND_LABEL = { pdf: 'PDF', md: 'Markdown', txt: 'Texto', ipynb: 'Notebook' } as const;
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/** Carpeta del repo con el material del foco (R49): muestra lo que encontró el orquestador, sin esperar a guardar. */
function CarpetaField({ carpeta, onChange, id }: { carpeta: string; onChange: (carpeta: string) => void; id: string }) {
  const [scan, setScan] = useState<MaterialScan | null>(null);
  useEffect(() => {
    if (carpeta.trim() === '') {
      setScan(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      scanCarpeta(carpeta).then((s) => !cancelled && setScan(s)).catch(() => !cancelled && setScan(null));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [carpeta]);

  return (
    <div className={styles.material}>
      <label className="field-label" htmlFor={id}>Principal fuente de estudio <span className={styles.opt}>(opcional)</span></label>
      <input id={id} className={`${styles.input} mono`} type="text" maxLength={200} placeholder="material/certificacion-dl" value={carpeta} onChange={(e) => onChange(e.target.value)} />
      {scan?.problem && <p className={`${styles.hint} ${styles.warn}`} role="status">{scan.problem}</p>}
      {scan && !scan.problem && (
        <>
          <p className={styles.hint} role="status">
            {scan.files.length === 0 ? 'La carpeta existe pero no tiene archivos admitidos.' : `${scan.files.length} ${scan.files.length === 1 ? 'archivo' : 'archivos'} que el Planificador y el Generador podrán leer.`}
            {scan.skipped.length > 0 && ` ${scan.skipped.length} omitidos.`}
          </p>
          {scan.files.length > 0 && (
            <ul className={styles.files}>
              {scan.files.slice(0, 12).map((f) => <li key={f.path}><span className="mono">{f.path}</span><span>{KIND_LABEL[f.kind]} · {size(f.bytes)}</span></li>)}
              {scan.files.length > 12 && <li className={styles.hint}>… y {scan.files.length - 12} más</li>}
            </ul>
          )}
          {scan.skipped.length > 0 && (
            <details className={styles.hint}>
              <summary>Ver omitidos</summary>
              <ul className={styles.files}>{scan.skipped.map((f) => <li key={f.path}><span className="mono">{f.path}</span><span>{f.reason}</span></li>)}</ul>
            </details>
          )}
        </>
      )}
      <p className={styles.hint}>Carpeta del repo con la fuente principal de este objetivo (p. ej. el curso que sigues). Tus demás libros y apuntes van en la biblioteca general <span className="mono">material/</span>, que el Planificador y el Generador consultan siempre. Nada de esto se sube a git.</p>
    </div>
  );
}
