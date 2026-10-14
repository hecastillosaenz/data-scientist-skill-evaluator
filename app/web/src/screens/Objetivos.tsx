import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Target, Trash2, X } from 'lucide-react';
import { EMPTY_OBJETIVOS, type Foco, type FocoEstado, type Objetivos as ObjetivosData } from '../../../shared/objetivos';
import { Card, EmptyState, PageHeader, Skeleton } from '../components/cards';
import { DomainTile } from '../components/DomainTile';
import { Segmented } from '../components/Segmented';
import { useApp } from '../data/DataContext';
import { loadObjetivos, saveObjetivos, scanCarpeta, type MaterialScan, type ObjetivosLimites } from '../data/objetivosApi';
import { searchConcepts } from '../domain/graphQueries';
import { activeCount, addFoco, isDirty, removeFoco, updateFoco } from '../domain/objetivosDraft';
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
  const { source } = useApp();
  const [saved, setSaved] = useState<ObjetivosData | null>(null);
  const [draft, setDraft] = useState<ObjetivosData>(EMPTY_OBJETIVOS);
  const [limits, setLimits] = useState<ObjetivosLimites | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
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

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveObjetivos(draft);
      setSaved(next);
      setDraft(next);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft]);

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
  const canAdd = newTitle.trim().length > 0 && newTitle.trim().length <= 120;

  return (
    <>
      <PageHeader
        title="Objetivos"
        subtitle="Cuéntale al sistema qué estás estudiando para que tus retos se relacionen con ese material."
        actions={
          <div className={styles.saveBar}>
            {justSaved && <span className={styles.ok} role="status">Guardado</span>}
            {dirty && !justSaved && <span className={styles.dirty}>Cambios sin guardar</span>}
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => { setDraft(saved); setSaveError(null); }}>Descartar</button>
            <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        }
      />
      {saveError && <p className={styles.error} role="alert">{saveError}</p>}

      <div className={styles.column}>
        <Card className={styles.role}>
          <label className="field-label" htmlFor="obj-rol">Tu rol</label>
          <input id="obj-rol" className={styles.input} type="text" maxLength={120} placeholder="p. ej. Data Scientist" value={draft.rol} onChange={(e) => setDraft({ ...draft, rol: e.target.value })} />
          <p className={styles.hint}>Los retos buscan el hands-on real de ese rol; tus focos solo ajustan el énfasis.</p>
        </Card>

        <div className={styles.listHead}>
          <h2>Focos de aprendizaje</h2>
          <span className={styles.count}>{active} de {limits.focosActivosMax} activos</span>
        </div>

        {draft.focos.length === 0 && <EmptyState icon={<Target size={22} aria-hidden="true" />} title="Aún no tienes focos" text="Un foco es algo que estudias ahora, p. ej. «Certificación de cálculo para deep learning». Añade el primero abajo." />}

        {draft.focos.map((f) => (
          <FocoCard
            key={f.id}
            foco={f}
            limits={limits}
            activeFull={f.estado !== 'activo' && active >= limits.focosActivosMax}
            onChange={(patch) => setDraft((d) => updateFoco(d, f.id, patch))}
            onRemove={() => setDraft((d) => removeFoco(d, f.id))}
          />
        ))}

        <form
          className={styles.add}
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAdd) return;
            setDraft((d) => addFoco(d, newTitle.trim(), limits.focosActivosMax));
            setNewTitle('');
          }}
        >
          <label className="visually-hidden" htmlFor="obj-nuevo">Título del nuevo foco</label>
          <input id="obj-nuevo" className={styles.input} type="text" maxLength={120} placeholder="Nuevo foco, p. ej. Certificación de cálculo para deep learning" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <button type="submit" className="btn" disabled={!canAdd}><Plus size={14} aria-hidden="true" /> Nuevo foco</button>
        </form>
        {active >= limits.focosActivosMax && <p className={styles.hint}>Ya tienes {active} focos activos, el máximo. Los nuevos empiezan en pausa.</p>}
      </div>
    </>
  );
}

function FocoCard({ foco, limits, activeFull, onChange, onRemove }: {
  foco: Foco;
  limits: ObjetivosLimites;
  /** Se alcanzó el máximo de activos: este foco no puede activarse hasta pausar otro. */
  activeFull: boolean;
  onChange: (patch: Partial<Foco>) => void;
  onRemove: () => void;
}) {
  const { data } = useApp();
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const concepts = data?.concepts ?? [];
  const results = useMemo(() => searchConcepts(query, concepts).filter((c) => !foco.conceptIds.includes(c.id)), [query, concepts, foco.conceptIds]);
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const over = foco.material.length > limits.materialMaxCaracteres;
  const field = `foco-${foco.id}`;

  return (
    <Card className={styles.foco}>
      <div className={styles.focoHead}>
        <input aria-label="Título del foco" className={`${styles.input} ${styles.title}`} type="text" maxLength={120} value={foco.titulo} onChange={(e) => onChange({ titulo: e.target.value })} />
        <Segmented<FocoEstado>
          label="Estado"
          hideLabel
          options={ESTADOS.filter((o) => !(o.value === 'activo' && activeFull))}
          value={foco.estado}
          onChange={(estado) => onChange({ estado })}
        />
      </div>

      <div className={styles.dates}>
        <label>Desde <input className={styles.input} type="date" value={foco.desde ?? ''} onChange={(e) => onChange({ desde: e.target.value })} /></label>
        <label>Hasta <input className={styles.input} type="date" value={foco.hasta ?? ''} onChange={(e) => onChange({ hasta: e.target.value })} /></label>
      </div>

      <div className={styles.concepts}>
        <p className="field-label">Conceptos del grafo que toca</p>
        {foco.conceptIds.length > 0 && (
          <ul className={styles.chips}>
            {foco.conceptIds.map((id) => {
              const c = byId.get(id);
              return (
                <li key={id}>
                  <button type="button" className={styles.chip} aria-label={`Quitar ${c?.name ?? id}`} onClick={() => onChange({ conceptIds: foco.conceptIds.filter((x) => x !== id) })}>
                    {c && <DomainTile domain={c.domain} size={18} />}
                    <span>{c?.name ?? id}</span>
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className={styles.searchWrap}>
          <input aria-label="Buscar concepto para este foco" className={styles.input} type="search" placeholder="Buscar concepto…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <ul className={styles.results}>
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { onChange({ conceptIds: [...foco.conceptIds, c.id] }); setQuery(''); }}>
                    <DomainTile domain={c.domain} size={20} />
                    <span>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className={styles.hint}>Con estos conceptos, el plan prefiere lo de este foco cuando varias opciones sirven por igual.</p>
      </div>

      <CarpetaField carpeta={foco.carpeta ?? ''} onChange={(carpeta) => onChange({ carpeta })} id={`${field}-carpeta`} />

      <div className={styles.material}>
        <label className="field-label" htmlFor={field}>Material de estudio (texto)</label>
        <textarea id={field} className={styles.textarea} rows={6} placeholder="Pega el temario, tus notas o los temas de la semana." value={foco.material} onChange={(e) => onChange({ material: e.target.value })} />
        <p className={`${styles.hint} ${over ? styles.warn : ''}`}>
          <span className="mono">{foco.material.length.toLocaleString('es')}</span> caracteres. Al generar se envían los primeros <span className="mono">{limits.materialMaxCaracteres.toLocaleString('es')}</span>{' '}(se reparte entre tus focos activos). Se usa solo como contexto para tus retos.
        </p>
      </div>

      <div className={styles.footer}>
        {confirming ? (
          <span className={styles.confirm}>
            ¿Eliminar este foco?
            <button type="button" className="btn btn-sm btn-primary" onClick={onRemove}>Sí, eliminar</button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>Cancelar</button>
          </span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)}><Trash2 size={14} aria-hidden="true" /> Eliminar</button>
        )}
      </div>
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
      <label className="field-label" htmlFor={id}>Carpeta de material en el repo <span className={styles.opt}>(opcional)</span></label>
      <input id={id} className={`${styles.input} mono`} type="text" maxLength={200} placeholder="material/certificacion-dl" value={carpeta} onChange={(e) => onChange(e.target.value)} />
      {scan?.problem && <p className={`${styles.hint} ${styles.warn}`} role="status">{scan.problem}</p>}
      {scan && !scan.problem && (
        <>
          <p className={styles.hint} role="status">
            {scan.files.length === 0 ? 'La carpeta existe pero no tiene archivos admitidos.' : `${scan.files.length} ${scan.files.length === 1 ? 'archivo' : 'archivos'} que el Generador podrá leer.`}
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
      <p className={styles.hint}>Pon ahí tus PDF, apuntes y notebooks. La carpeta no se sube a git y solo la lee el Generador.</p>
    </div>
  );
}
