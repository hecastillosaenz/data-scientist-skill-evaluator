import { useEffect, useState } from 'react';
import { FALLO_LABEL, type Attempt, type AttemptSummary } from '../../../../shared/intentos';
import { Skeleton } from '../../components/cards';
import styles from './StageAttempts.module.css';

const RESULT_LABEL = { aprobada: 'Aprobada', parcial: 'Parcial', fallida: 'Fallida' } as const;
const when = (iso: string) => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function loadAttempt(challengeId: string, number: number): Promise<Attempt> {
  const res = await fetch(`/api/challenges/${encodeURIComponent(challengeId)}/attempts/${number}`);
  const body = (await res.json().catch(() => null)) as (Attempt & { message?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.message ?? `El orquestador respondió con un error (${res.status}).`);
  return body;
}

/**
 * Intentos de la etapa (SDD R54): cada verificación guardada, no solo lo que registraste. Al abrir uno se ve el código o
 * la respuesta tal como estaba y el feedback. No cuentan como resultado oficial: ese es «Registrar etapa».
 */
export function StageAttempts({ attempts }: { attempts: AttemptSummary[] }) {
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  if (attempts.length === 0) return null;
  const failedCount = attempts.filter((a) => a.result !== 'aprobada').length;
  // Los más recientes primero: lo que más interesa es el último intento.
  const list = [...attempts].reverse();

  return (
    <details className={styles.wrap}>
      <summary>
        Intentos de esta etapa <span className={`${styles.count} mono`}>{attempts.length}</span>
        {failedCount > 0 && <span className={styles.muted}> · {failedCount} sin aprobar</span>}
      </summary>
      <p className={styles.note}>Cada verificación queda guardada en tu repo con tu código. No cuentan como resultado oficial: eso es «Registrar etapa».</p>
      <ol className={styles.list}>
        {list.map((a) => (
          <li key={a.id}>
            <button type="button" className={styles.row} aria-expanded={openNumber === a.number} onClick={() => setOpenNumber(openNumber === a.number ? null : a.number)}>
              <span className={`${styles.num} mono`}>#{a.number}</span>
              <span className={`${styles.chip} ${styles[`r_${a.result}`]}`}>{RESULT_LABEL[a.result]}</span>
              <span className={styles.text}>
                {a.fallo ? <><strong>{FALLO_LABEL[a.fallo.tipo]}</strong> · {a.fallo.resumen}</> : <span className={styles.muted}>Pasó todas las comprobaciones</span>}
              </span>
              <span className={`${styles.when} mono`}>{when(a.at)}</span>
            </button>
            {openNumber === a.number && <AttemptDetail attempt={a} />}
          </li>
        ))}
      </ol>
    </details>
  );
}

function AttemptDetail({ attempt }: { attempt: AttemptSummary }) {
  const [full, setFull] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAttempt(attempt.challengeId, attempt.number).then((a) => !cancelled && setFull(a)).catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [attempt.challengeId, attempt.number]);

  if (error) return <p className={styles.note}>No pude abrir este intento: {error}</p>;
  if (!full) return <Skeleton h={60} r={10} />;
  return (
    <div className={styles.detail}>
      <p className={styles.note}>{attempt.kind === 'code' ? 'Tu celda en ese momento' : 'Tu respuesta en ese momento'} · <span className="mono">{attempt.folder}/</span></p>
      <pre className={`${styles.pre} mono`}>{full.entregable}</pre>
      {full.feedback && (
        <>
          <p className={styles.note}>Feedback del Evaluador</p>
          <p className={styles.feedback}>{full.feedback}</p>
        </>
      )}
    </div>
  );
}
