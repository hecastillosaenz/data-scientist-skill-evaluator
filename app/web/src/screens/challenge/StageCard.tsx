import { useNavigate } from 'react-router';
import { ChevronDown, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { APOYO_LABEL, DOMAIN_BY_ID } from '../../../../shared/domains';
import type { Apoyo, AttemptResult, Concept, ConceptState, Stage, StageStatus } from '../../../../shared/types';
import { BloomChip, DifficultyChip, StatusChip, TimeChip } from '../../components/chips';
import { DomainTile } from '../../components/DomainTile';
import { Segmented } from '../../components/Segmented';
import type { StageResult } from '../../domain/simulate';
import { toggleHint, toggleSolution, initialHelp } from '../../domain/stageHelp';
import styles from './StageCard.module.css';

export interface StageUI {
  open: boolean;
  hintVisible: boolean;
  /** Permanente: marca el intento «Con ayuda» (R7) aunque luego se oculte. */
  solutionOpened: boolean;
  solutionVisible: boolean;
  answer: string;
  result: StageResult | null;
}

export const initialStageUI: StageUI = { open: false, ...initialHelp, answer: '', result: null };

const APOYO_OPTIONS: { value: Apoyo; label: string }[] = [
  { value: 'guiado', label: APOYO_LABEL.guiado },
  { value: 'pistas', label: APOYO_LABEL.pistas },
  { value: 'autonomo', label: APOYO_LABEL.autonomo },
];

const RESULT_LABEL: Record<AttemptResult, string> = { aprobada: 'Aprobada', parcial: 'Parcial', fallida: 'No pasó' };

interface Props {
  stage: Stage;
  status: StageStatus;
  apoyo: Apoyo;
  active: boolean;
  ui: StageUI;
  concepts: Map<string, { concept: Concept; state: ConceptState }>;
  onApoyo: (apoyo: Apoyo) => void;
  onUI: (patch: Partial<StageUI>) => void;
  onActivate: () => void;
  onVerify: () => void;
}

export function StageCard({ stage, status, apoyo, active, ui, concepts, onApoyo, onUI, onActivate, onVerify }: Props) {
  const navigate = useNavigate();
  const isCode = stage.mechanism === 'codigo_assert';
  const panelId = `stage-${stage.id}`;

  return (
    <article className={`${styles.card} ${active ? styles.active : ''}`} aria-label={`Etapa ${stage.number}: ${stage.title}`}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={ui.open}
          aria-controls={panelId}
          onClick={() => {
            onUI({ open: !ui.open });
            onActivate();
          }}
        >
          <span className={`${styles.num} mono`}>{stage.number}</span>
          <span className={styles.titleBlock}>
            <span className={styles.title}>{stage.title}</span>
            <span className={styles.meta}>
              <DomainTile domain={stage.domain} size={22} />
              <span className={styles.domainName}>{DOMAIN_BY_ID[stage.domain].name}</span>
              <DifficultyChip difficulty={stage.difficulty} />
              <BloomChip bloom={stage.bloom} />
              <TimeChip minutes={stage.estimatedMinutes} />
              <StatusChip state={status} />
            </span>
          </span>
          <ChevronDown size={18} aria-hidden="true" className={ui.open ? styles.chevOpen : ''} />
        </button>
        <Segmented label="Apoyo" options={APOYO_OPTIONS} value={apoyo} onChange={onApoyo} />
      </header>

      {ui.open && (
        <div id={panelId} className={styles.body}>
          <p className={styles.desc}>{stage.description}</p>

          {apoyo === 'guiado' && (
            <div className={styles.support}>
              <Lightbulb size={16} aria-hidden="true" />
              <p><strong>Paso sugerido.</strong> {stage.suggestedStep}</p>
            </div>
          )}
          {apoyo === 'pistas' && (
            <div className={styles.helpRow}>
              <button type="button" className="btn btn-sm" aria-expanded={ui.hintVisible} onClick={() => onUI(toggleHint(ui))}>
                <Lightbulb size={14} aria-hidden="true" /> {ui.hintVisible ? 'Ocultar pista' : 'Ver pista'}
              </button>
              {ui.hintVisible && (
                <div className={styles.support}>
                  <Lightbulb size={16} aria-hidden="true" />
                  <p><strong>Pista.</strong> {stage.hint}</p>
                </div>
              )}
            </div>
          )}
          {apoyo === 'autonomo' && <p className={styles.note}>Modo autónomo: sin pasos sugeridos ni pistas.</p>}
          {apoyo !== 'autonomo' && (
            <p className={styles.note}>Con Apoyo {APOYO_LABEL[apoyo]} el Nivel de esta etapa no sube.</p>
          )}

          <section>
            <h3>Conceptos para investigar</h3>
            <ul className={styles.concepts}>
              {stage.conceptIds.map((id) => {
                const entry = concepts.get(id);
                if (!entry) return null;
                return (
                  <li key={id}>
                    <button type="button" className={styles.conceptChip} onClick={() => navigate(`/grafo?concepto=${encodeURIComponent(id)}`)} title="Abrir en el grafo">
                      <StatusChip state={entry.state} kind="concept" />
                      <span>{entry.concept.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3>Entregables</h3>
            <ol className={styles.deliverables}>
              {stage.deliverables.map((d) => <li key={d}>{d}</li>)}
            </ol>
          </section>

          {isCode ? (
            <section className={styles.verify}>
              <h3>Verificación</h3>
              <p>{stage.verification}</p>
              <p className={styles.note}>
                Se ejecuta solo la celda de tu notebook cuya primera línea sea{' '}
                <code className="mono">{`# Entregable - Etapa ${stage.number}:`}</code>
              </p>
              <button type="button" className="btn btn-primary btn-sm" onClick={onVerify}>Verificar etapa</button>
            </section>
          ) : (
            <section className={styles.verify}>
              <h3>Tu respuesta</h3>
              <p>{stage.verification}</p>
              <label className="visually-hidden" htmlFor={`${panelId}-answer`}>Respuesta de la Etapa {stage.number}</label>
              <textarea
                id={`${panelId}-answer`}
                className={styles.textarea}
                rows={5}
                placeholder="Escribe tu respuesta…"
                value={ui.answer}
                onChange={(e) => onUI({ answer: e.target.value, result: null })}
              />
              <button type="button" className="btn btn-primary btn-sm" disabled={ui.answer.trim().length === 0} onClick={onVerify}>
                Evaluar respuesta
              </button>
            </section>
          )}

          {ui.result && (
            <div className={`${styles.result} ${styles[ui.result.status]}`} role="status">
              <strong>{isCode ? RESULT_LABEL[ui.result.status] : ui.result.status === 'aprobada' ? 'Correcta' : ui.result.status === 'parcial' ? 'Parcial' : 'Incorrecta'}</strong>
              <p>{ui.result.detail}</p>
              <p className={styles.note}>Resultado listo: regístralo con el botón "Registrar etapa" de la columna lateral.</p>
            </div>
          )}

          <section className={styles.solution}>
            <div className={styles.solutionBar}>
              <button type="button" className="btn btn-sm" aria-expanded={ui.solutionVisible} onClick={() => onUI(toggleSolution(ui))}>
                {ui.solutionVisible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                {ui.solutionVisible ? 'Ocultar solución' : ui.solutionOpened ? 'Mostrar solución' : 'Ver solución'}
              </button>
              {ui.solutionOpened && <span className={styles.helpBadge}>Con ayuda</span>}
            </div>
            {!ui.solutionOpened && <p className={styles.note}>Revélala después de verificar tu intento: abrirla marca el intento «Con ayuda».</p>}
            {ui.solutionVisible && <pre className={`${styles.code} mono`}>{stage.solution}</pre>}
          </section>
        </div>
      )}
    </article>
  );
}
