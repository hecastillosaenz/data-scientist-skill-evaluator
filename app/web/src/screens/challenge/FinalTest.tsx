import { useMemo, useState } from 'react';
import { CircleCheck, CircleX, Lock, RotateCcw } from 'lucide-react';
import type { Challenge, TestQuestion } from '../../../../shared/types';
import { BloomChip } from '../../components/chips';
import { Card } from '../../components/cards';
import { Markdown } from '../../components/Markdown';
import { useApp } from '../../data/DataContext';
import { gradeQuestion, isAnswered, latestResults, scoreOf, type Graded, type TestAnswer } from '../../domain/finalTest';
import styles from './FinalTest.module.css';

interface Props {
  challenge: Challenge;
  unlocked: boolean;
  stagesDone: number;
  stagesTotal: number;
}

/**
 * Test final de retención (HU18, R21): preguntas aplicadas atadas a un concepto. Se desbloquea al terminar las
 * etapas; al calificar se registran los resultados (append-only) y alimentan el estado de los conceptos (R23).
 */
export function FinalTest({ challenge, unlocked, stagesDone, stagesTotal }: Props) {
  const { data, actions } = useApp();
  const questions = challenge.finalTest ?? [];
  const [answers, setAnswers] = useState<Record<string, TestAnswer>>({});
  const [graded, setGraded] = useState<Record<string, Graded> | null>(null);

  const previous = useMemo(() => latestResults(data?.testResults ?? [], challenge.id), [data?.testResults, challenge.id]);
  const previousScore = scoreOf(previous, questions);
  const conceptName = (id: string) => data?.concepts.find((c) => c.id === id)?.name ?? id;

  if (questions.length === 0) return null;

  if (!unlocked) {
    return (
      <Card className={styles.card}>
        <div className={styles.head}>
          <h2>Test final de retención</h2>
          <span className={styles.lock}><Lock size={14} aria-hidden="true" /> Bloqueado</span>
        </div>
        <p className={styles.intro}>
          {questions.length} preguntas aplicadas para comprobar si recuerdas los conceptos. Completa las etapas del challenge para desbloquearlo:{' '}
          <span className="mono">{stagesDone} de {stagesTotal}</span> hechas.
        </p>
      </Card>
    );
  }

  const allAnswered = questions.every((q) => isAnswered(q, answers[q.id]));
  const set = (q: TestQuestion, a: TestAnswer) => setAnswers((prev) => ({ ...prev, [q.id]: { ...prev[q.id], ...a } }));

  const grade = () => {
    const result: Record<string, Graded> = {};
    for (const q of questions) result[q.id] = gradeQuestion(q, answers[q.id] ?? {});
    setGraded(result);
    actions.addTestResults(
      questions.map((q) => ({ challengeId: challenge.id, questionId: q.id, conceptId: q.conceptId, bloom: q.bloom, correct: result[q.id]!.correct })),
    );
  };
  const retry = () => {
    setAnswers({});
    setGraded(null);
  };

  const correct = graded ? questions.filter((q) => graded[q.id]!.correct).length : 0;
  const weak = graded ? [...new Set(questions.filter((q) => !graded[q.id]!.correct).map((q) => q.conceptId))] : [];

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <h2>Test final de retención</h2>
        {graded ? (
          <span className={`${styles.score} mono`}>{correct} de {questions.length}</span>
        ) : previousScore ? (
          <span className={`${styles.score} mono`}>Último: {previousScore.correct} de {previousScore.total}</span>
        ) : null}
      </div>
      <p className={styles.intro}>
        Preguntas aplicadas sobre lo que acabas de practicar. Cada una cuenta como evidencia de su concepto (nivel Recordar–Aplicar) y un fallo entra a tu cola de Repaso.
        No es requisito para completar el challenge.
      </p>

      <ol className={styles.list}>
        {questions.map((q) => {
          const g = graded?.[q.id];
          const a = answers[q.id];
          return (
            <li key={q.id} className={styles.item}>
              <div className={styles.qhead}>
                <div className={styles.prompt} id={`${q.id}-p`}><Markdown>{q.prompt}</Markdown></div>
                <BloomChip bloom={q.bloom} />
              </div>

              {q.kind === 'opcion_multiple' && (
                <div role="radiogroup" aria-labelledby={`${q.id}-p`} className={styles.options}>
                  {q.options?.map((opt, i) => (
                    <label key={opt} className={`${styles.option} ${a?.choice === i ? styles.picked : ''} ${g && i === q.correctIndex ? styles.right : ''}`}>
                      <input type="radio" name={q.id} checked={a?.choice === i} disabled={!!graded} onChange={() => set(q, { choice: i })} />
                      <Markdown inline>{opt}</Markdown>
                    </label>
                  ))}
                </div>
              )}
              {q.kind === 'numerica' && (
                <input
                  className={`${styles.field} mono`}
                  inputMode="decimal"
                  aria-labelledby={`${q.id}-p`}
                  placeholder="Tu respuesta numérica"
                  value={a?.text ?? ''}
                  disabled={!!graded}
                  onChange={(e) => set(q, { text: e.target.value })}
                />
              )}
              {q.kind === 'texto' && (
                <textarea
                  className={styles.field}
                  rows={3}
                  aria-labelledby={`${q.id}-p`}
                  placeholder="Escribe tu respuesta…"
                  value={a?.text ?? ''}
                  disabled={!!graded}
                  onChange={(e) => set(q, { text: e.target.value })}
                />
              )}

              {g && (
                <div className={`${styles.feedback} ${g.correct ? styles.ok : styles.bad}`} role="status">
                  <p className={styles.verdict}>
                    {g.correct ? <CircleCheck size={16} aria-hidden="true" /> : <CircleX size={16} aria-hidden="true" />}
                    {g.correct ? 'Correcta' : 'Incorrecta'}
                    {q.kind !== 'texto' && !g.correct && g.expected && <span className={styles.expected}> · respuesta: {g.expected}</span>}
                  </p>
                  <Markdown>{q.explanation}</Markdown>
                  {g.simulated && <p className={styles.sim}>Calificación provisional por longitud: el Evaluador conceptual real la revisará con la rúbrica.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {graded ? (
        <div className={styles.summary}>
          <p>
            <strong>{correct} de {questions.length} correctas.</strong>{' '}
            {weak.length === 0 ? 'No quedan conceptos por reforzar en este test.' : 'Conceptos para reforzar:'}
          </p>
          {weak.length > 0 && <ul className={styles.weak}>{weak.map((id) => <li key={id}>{conceptName(id)}</li>)}</ul>}
          <p className={styles.note}>Resultado registrado en tu grafo. Si lo repites, cuenta el último resultado de cada pregunta.</p>
          <button type="button" className="btn" onClick={retry}><RotateCcw size={14} aria-hidden="true" /> Hacer el test de nuevo</button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" disabled={!allAnswered} onClick={grade}>Calificar test</button>
          <p className={styles.note}>{allAnswered ? 'Listo para calificar.' : 'Responde todas las preguntas para calificar.'}</p>
        </div>
      )}
    </Card>
  );
}
