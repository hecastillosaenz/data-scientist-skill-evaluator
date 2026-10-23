import { useEffect, useRef, useState } from 'react';
import { Loader, Send, Sparkles } from 'lucide-react';
import { MENSAJE_MAX_USUARIO, type Foco } from '../../../../shared/objetivos';
import styles from './Conversacion.module.css';

interface Props {
  foco: Foco;
  /** El Planificador está respondiendo a este objetivo. */
  waiting: boolean;
  /** Otra operación de agente está en curso. */
  busy: boolean;
  error: string | null;
  onSend: (texto: string) => void;
  onReview: () => void;
  onCancel: () => void;
  onOpenPlan: () => void;
}

const when = (iso: string) => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');

/**
 * Conversación con el Planificador sobre este objetivo (R57): le das feedback («el plan es muy básico», «quiero más
 * práctica de X»), le pides que revise tu avance y, si hace falta, te propone un plan nuevo que tú aceptas o no.
 */
export function ConversacionPanel({ foco, waiting, busy, error, onSend, onReview, onCancel, onOpenPlan }: Props) {
  const [texto, setTexto] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const mensajes = foco.conversacion ?? [];
  const canSend = texto.trim().length > 0 && texto.length <= MENSAJE_MAX_USUARIO && !busy;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes.length, waiting]);

  const send = () => {
    if (!canSend) return;
    onSend(texto.trim());
    setTexto('');
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>Dile al Planificador cómo te va con este objetivo: qué te parece el plan, qué te cuesta, qué quieres reforzar. Responde, ajusta el plan si hace falta (te lo propone, tú decides) y puede revisar tu avance con tus resultados.</p>

      <ol className={styles.thread} aria-label="Conversación con el Planificador" aria-live="polite">
        {mensajes.length === 0 && !waiting && <li className={styles.empty}>Aún no hay mensajes. Prueba con «Quiero más práctica de derivadas» o pide una revisión de tu avance.</li>}
        {mensajes.map((m) => (
          <li key={m.id} className={`${styles.msg} ${m.rol === 'usuario' ? styles.mine : styles.theirs}`}>
            <span className={styles.who}>{m.rol === 'usuario' ? 'Tú' : m.tipo === 'revision' ? 'Planificador · revisión de avance' : 'Planificador'} · {when(m.at)}</span>
            <p>{m.texto}</p>
            {m.planCambiado && <button type="button" className={styles.planLink} onClick={onOpenPlan}>Propuso un plan nuevo · verlo en «Plan»</button>}
          </li>
        ))}
        {waiting && (
          <li className={`${styles.msg} ${styles.theirs}`} aria-busy="true">
            <span className={styles.who}>Planificador</span>
            <p className={styles.thinking}><Loader size={14} className={styles.spin} aria-hidden="true" /> Leyendo tu plan y tu avance… puede tardar un minuto.</p>
            <button type="button" className="btn btn-sm" onClick={onCancel}>Cancelar</button>
          </li>
        )}
        <div ref={endRef} />
      </ol>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.composer}>
        <label className="visually-hidden" htmlFor={`chat-${foco.id}`}>Tu mensaje al Planificador</label>
        <textarea
          id={`chat-${foco.id}`}
          className={styles.input}
          rows={3}
          maxLength={MENSAJE_MAX_USUARIO}
          placeholder="Escribe tu feedback o una duda sobre este objetivo…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <div className={styles.actions}>
          <button type="button" className="btn" disabled={busy} onClick={onReview}><Sparkles size={14} aria-hidden="true" /> Pedir revisión de mi avance</button>
          <button type="button" className="btn btn-primary" disabled={!canSend} onClick={send}><Send size={14} aria-hidden="true" /> Enviar</button>
        </div>
        <p className={styles.hint}>⌘/Ctrl + Enter para enviar. Cada respuesta usa tu suscripción de Claude Code y queda en «Agentes» con sus pasos.</p>
      </div>
    </div>
  );
}
