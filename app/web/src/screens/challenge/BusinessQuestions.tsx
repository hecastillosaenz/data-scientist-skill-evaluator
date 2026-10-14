import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { BusinessQuestion } from '../../../../shared/types';
import { Card } from '../../components/cards';
import { Markdown } from '../../components/Markdown';
import { useApp } from '../../data/DataContext';
import { answersToSave, latestAnswers, reflectionVisible, versionsSaved } from '../../domain/businessAnswers';
import styles from './BusinessQuestions.module.css';

const draftKey = (challengeId: string) => `dsc-bq-draft:${challengeId}`;

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function loadDrafts(challengeId: string): Record<string, string> {
  try {
    const raw = storage()?.getItem(draftKey(challengeId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

interface Props {
  challengeId: string;
  questions: BusinessQuestion[];
}

/**
 * Preguntas de negocio respondibles en la app (HU17, R22). El borrador se guarda en el navegador mientras escribes;
 * «Guardar respuestas» crea registros append-only y solo entonces se muestra la guía de reflexión de cada pregunta.
 */
export function BusinessQuestions({ challengeId, questions }: Props) {
  const { data, actions } = useApp();
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts(challengeId));
  const answers = data?.businessAnswers ?? [];
  const saved = useMemo(() => latestAnswers(answers, challengeId), [answers, challengeId]);
  const pending = answersToSave(drafts, questions, saved);

  useEffect(() => {
    try {
      storage()?.setItem(draftKey(challengeId), JSON.stringify(drafts));
    } catch {
      /* sin almacenamiento: el borrador solo vive mientras la página esté abierta */
    }
  }, [challengeId, drafts]);

  // Si ya hay respuestas guardadas y no hay borrador, se parte de la última versión guardada.
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        const last = saved.get(q.id);
        if (last && next[q.id] === undefined) {
          next[q.id] = last.text;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [saved, questions]);

  const save = () => actions.addBusinessAnswers(challengeId, pending);
  const answered = questions.filter((q) => reflectionVisible(q.id, saved)).length;

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <h2>Preguntas de negocio</h2>
        <span className={`${styles.count} mono`}>{answered} de {questions.length} guardadas</span>
      </div>
      <p className={styles.intro}>
        Conectan el resultado técnico con una decisión real. No tienen una única respuesta correcta y <strong>no cambian tu Acierto o Fallo</strong>.
        Escribe tus respuestas antes de ver la guía: aparecerá al guardarlas.
      </p>

      <ol className={styles.list}>
        {questions.map((q) => {
          const last = saved.get(q.id);
          const dirty = (drafts[q.id] ?? '').trim() !== (last?.text ?? '');
          const versions = versionsSaved(answers, challengeId, q.id);
          return (
            <li key={q.id} className={styles.item}>
              <div className={styles.question}>
                <Markdown inline>{q.text}</Markdown>
              </div>
              <label className="visually-hidden" htmlFor={`bq-${q.id}`}>Tu respuesta a: {q.text}</label>
              <textarea
                id={`bq-${q.id}`}
                className={styles.textarea}
                rows={4}
                placeholder="Escribe tu respuesta…"
                value={drafts[q.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
              />
              <p className={styles.status}>
                {last ? (
                  <>
                    <Check size={14} aria-hidden="true" />
                    {dirty ? 'Guardada · tienes cambios sin guardar' : 'Guardada'}
                    {versions > 1 && <span className="mono"> · {versions} versiones</span>}
                  </>
                ) : (
                  'Sin guardar'
                )}
              </p>
              {reflectionVisible(q.id, saved) && q.reflectionGuide && (
                <div className={styles.guide}>
                  <h3>Guía de reflexión</h3>
                  <Markdown>{q.reflectionGuide}</Markdown>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.actions}>
        <button type="button" className="btn btn-primary" disabled={pending.length === 0} onClick={save}>
          Guardar respuestas
        </button>
        <p className={styles.note}>
          {pending.length === 0
            ? answered === questions.length ? 'Todo guardado. Si editas una respuesta, se guarda como una versión nueva.' : 'Escribe al menos una respuesta para guardar.'
            : `${pending.length} ${pending.length === 1 ? 'respuesta nueva' : 'respuestas nuevas'} por guardar.`}
        </p>
      </div>
    </Card>
  );
}
