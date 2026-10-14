import { useNavigate } from 'react-router';
import { ChevronDown, Eye, EyeOff, ExternalLink, Lightbulb, Network } from 'lucide-react';
import { APOYO_LABEL, DOMAIN_BY_ID } from '../../../../shared/domains';
import type { Apoyo, Concept, ConceptState, Stage, StageStatus } from '../../../../shared/types';
import { BloomChip, DifficultyChip, StatusChip, TimeChip } from '../../components/chips';
import { DomainTile } from '../../components/DomainTile';
import { Markdown } from '../../components/Markdown';
import { ResultTable } from '../../components/ResultTable';
import { Segmented } from '../../components/Segmented';
import { TimerControl } from '../../components/TimerControl';
import type { StageResult } from '../../domain/simulate';
import type { VerifyState } from '../../domain/verifyState';
import { VerificationPanel } from './VerificationPanel';
import { initialHelp, toggleHint, toggleSolution } from '../../domain/stageHelp';
import styles from './StageCard.module.css';

export interface StageUI {
  open: boolean;
  hintVisible: boolean;
  /** Permanente: marca el intento «Con ayuda» (R7) aunque luego se oculte. */
  solutionOpened: boolean;
  solutionVisible: boolean;
  answer: string;
  result: StageResult | null;
  /** Entregables marcados en la checklist. */
  checks: boolean[];
}

export const initialStageUI: StageUI = { open: false, ...initialHelp, answer: '', result: null, checks: [] };

const APOYO_OPTIONS: { value: Apoyo; label: string }[] = [
  { value: 'guiado', label: APOYO_LABEL.guiado },
  { value: 'pistas', label: APOYO_LABEL.pistas },
  { value: 'autonomo', label: APOYO_LABEL.autonomo },
];

const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

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
  /** Challenge real: se resuelve en el notebook de VS Code y se verifica con el orquestador. */
  real: boolean;
  verification: VerifyState | undefined;
  onVerify: () => void;
  onCancelVerify: () => void;
}

const SOLUTION_SECTIONS = [
  ['expectedResult', 'Resultado esperado'],
  ['reasoning', 'Razonamiento paso a paso'],
  ['conceptLinks', 'Cómo se conectan los conceptos con la solución'],
  ['businessInterpretation', 'Interpretación de negocio'],
  ['commonError', 'Error común'],
  ['dsFlow', 'Conexión con el flujo de DS'],
  ['skill', 'Habilidad que entrena'],
] as const;

export function StageCard({ stage, status, apoyo, active, ui, concepts, onApoyo, onUI, onActivate, real, verification, onVerify, onCancelVerify }: Props) {
  const navigate = useNavigate();
  const c = stage.content;
  const isCode = stage.mechanism === 'codigo_assert';
  const panelId = `stage-${stage.id}`;
  const lang = c.skeleton?.language ?? (stage.domain === 'sql' ? 'sql' : 'python');
  const fence = (code: string) => `\`\`\`${lang}\n${code}\n\`\`\``;
  const toggleCheck = (i: number) => {
    const next = [...ui.checks];
    next[i] = !next[i];
    onUI({ checks: next });
  };

  const showGuided = apoyo === 'guiado' && (c.theory?.length || c.workedExample || c.steps?.length || c.skeleton);
  const hints = c.hints ?? [];

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
          <Markdown>{stage.description}</Markdown>

          <section className={styles.section} aria-label="Cronómetro">
            <TimerControl stageId={stage.id} targetMinutes={stage.estimatedMinutes} />
            <p className={styles.note}>Investigar los conceptos y leer la teoría no cuentan en el Tiempo real: inicia el cronómetro cuando empieces a resolver.</p>
          </section>

          {showGuided && (
            <>
              {c.theory && c.theory.length > 0 && (
                <section className={styles.section}>
                  <h3>Teoría aplicada</h3>
                  <ol className={styles.theory}>
                    {c.theory.map((t) => (
                      <li key={t.title}>
                        <strong><Markdown inline>{t.title}</Markdown></strong>
                        <Markdown>{t.body}</Markdown>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {c.workedExample && (
                <section className={styles.section}>
                  <h3>Ejemplo resuelto <span className={styles.tag}>otro dominio: {c.workedExample.domain}</span></h3>
                  <Markdown>{c.workedExample.body}</Markdown>
                </section>
              )}
              {c.steps && c.steps.length > 0 && (
                <section className={styles.section}>
                  <h3>Paso a paso</h3>
                  <ol className={styles.steps}>
                    {c.steps.map((s) => <li key={s}><Markdown inline>{s}</Markdown></li>)}
                  </ol>
                </section>
              )}
              {c.skeleton && (
                <section className={styles.section}>
                  <h3>Esqueleto para completar</h3>
                  <Markdown>{fence(c.skeleton.code)}</Markdown>
                </section>
              )}
            </>
          )}

          {apoyo === 'pistas' && hints.length > 0 && (
            <section className={styles.section}>
              <div className={styles.helpRow}>
                <button type="button" className="btn btn-sm" aria-expanded={ui.hintVisible} onClick={() => onUI(toggleHint(ui))}>
                  <Lightbulb size={14} aria-hidden="true" /> {ui.hintVisible ? 'Ocultar pistas' : 'Ver pistas'}
                </button>
                {ui.hintVisible && (
                  <ol className={styles.hints}>
                    {hints.map((h) => <li key={h}><Markdown inline>{h}</Markdown></li>)}
                  </ol>
                )}
              </div>
            </section>
          )}
          {apoyo === 'autonomo' && <p className={styles.note}>Modo autónomo: sin teoría, pasos ni pistas. Solo conceptos y entregable.</p>}
          {apoyo !== 'autonomo' && <p className={styles.note}>Con Apoyo {APOYO_LABEL[apoyo]} el Nivel de esta etapa no sube.</p>}

          <section className={styles.section}>
            <h3>{apoyo === 'guiado' ? 'Para profundizar (opcional)' : 'Conceptos para investigar'}</h3>
            {c.research && c.research.length > 0 ? (
              <ul className={styles.research}>
                {c.research.map((r) => {
                  const entry = concepts.get(r.conceptId);
                  return (
                    <li key={r.conceptId}>
                      <div className={styles.researchHead}>
                        <strong>{entry?.concept.name ?? r.conceptId}</strong>
                        {entry && <StatusChip state={entry.state} kind="concept" />}
                      </div>
                      <p>{r.why}</p>
                      <div className={styles.searches}>
                        <a href={search(r.searchEs)} target="_blank" rel="noreferrer noopener"><ExternalLink size={12} aria-hidden="true" /> ES · {r.searchEs}</a>
                        <a href={search(r.searchEn)} target="_blank" rel="noreferrer noopener"><ExternalLink size={12} aria-hidden="true" /> EN · {r.searchEn}</a>
                        <button type="button" onClick={() => navigate(`/grafo?concepto=${encodeURIComponent(r.conceptId)}`)}>
                          <Network size={12} aria-hidden="true" /> Ver en el grafo
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
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
            )}
            <p className={styles.note}>Si no puedes explicar un concepto en una frase, investígalo antes de empezar. Ese tiempo no cuenta en el Tiempo real.</p>
          </section>

          <section className={styles.section}>
            <h3>Entregable</h3>
            {c.deliverables && c.deliverables.length > 0 && (
              <ul className={styles.checklist}>
                {c.deliverables.map((d, i) => (
                  <li key={d}>
                    <label>
                      <input type="checkbox" checked={!!ui.checks[i]} onChange={() => toggleCheck(i)} />
                      <Markdown inline>{d}</Markdown>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {c.expected && (
              <div className={styles.expected}>
                <p className="field-label">Resultado esperado</p>
                <ResultTable table={c.expected} />
              </div>
            )}
            {c.asserts && (
              <div className={styles.expected}>
                <p className="field-label">Asserts que se ejecutarán</p>
                <Markdown>{fence(c.asserts)}</Markdown>
              </div>
            )}
            <p className={styles.note}>
              <strong>Cómo se marca el resultado.</strong> Acierto: cumples todos los criterios sin abrir la solución. Con ayuda: abriste la solución antes de cumplirlos. Fallo: al terminar el tiempo no los cumples. Leer la teoría, el ejemplo o el paso a paso no cuenta como ayuda.
            </p>
          </section>

          <section className={styles.verify}>
            <h3>{isCode ? 'Verificación' : real ? 'Evaluación' : 'Tu respuesta'}</h3>
            {isCode || real ? (
              <p>
                Resuelve en tu notebook de VS Code. Se ejecuta solo la celda cuya primera línea sea{' '}
                <code className="mono">{`# Entregable - Etapa ${stage.number}:`}</code>
                {isCode ? ' contra el resultado esperado.' : ' y su texto se evalúa con la rúbrica.'}
              </p>
            ) : (
              <>
                <label className="visually-hidden" htmlFor={`${panelId}-answer`}>Respuesta de la Etapa {stage.number}</label>
                <textarea
                  id={`${panelId}-answer`}
                  className={styles.textarea}
                  rows={6}
                  placeholder="Escribe tu respuesta…"
                  value={ui.answer}
                  onChange={(e) => onUI({ answer: e.target.value, result: null })}
                />
              </>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={verification?.phase === 'running' || (!isCode && !real && ui.answer.trim().length === 0)}
              onClick={onVerify}
            >
              {isCode ? 'Verificar etapa' : 'Evaluar respuesta'}
            </button>
          </section>

          {verification && <VerificationPanel state={verification} simulated={!real} onCancel={onCancelVerify} onRetry={onVerify} />}

          {c.solution && (
            <section className={styles.solution}>
              <div className={styles.solutionBar}>
                <button type="button" className="btn btn-sm" aria-expanded={ui.solutionVisible} onClick={() => onUI(toggleSolution(ui))}>
                  {ui.solutionVisible ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  {ui.solutionVisible ? 'Ocultar solución' : ui.solutionOpened ? 'Mostrar solución' : 'Ver solución'}
                </button>
                {ui.solutionOpened && <span className={styles.helpBadge}>Con ayuda</span>}
              </div>
              {!ui.solutionOpened && <p className={styles.note}>Revélala después de verificar tu intento: abrirla marca el intento «Con ayuda».</p>}
              {ui.solutionVisible && (
                <div className={styles.solutionBody}>
                  {c.solution.code && (
                    <div>
                      <h3>{isCode ? 'Solución' : 'Respuesta de referencia'}</h3>
                      <Markdown>{isCode ? fence(c.solution.code) : c.solution.code}</Markdown>
                    </div>
                  )}
                  {SOLUTION_SECTIONS.map(([key, label]) =>
                    c.solution?.[key] ? (
                      <div key={key}>
                        <h3>{label}</h3>
                        <Markdown>{c.solution[key]!}</Markdown>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </article>
  );
}
