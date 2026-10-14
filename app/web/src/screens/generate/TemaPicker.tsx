import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { DOMAINS, DOMAIN_BY_ID } from '../../../../shared/domains';
import type { TemaPedido } from '../../../../shared/objetivos';
import type { DomainId } from '../../../../shared/types';
import { FilterChip } from '../../components/FilterChip';
import styles from './TemaPicker.module.css';

interface Match {
  id: string;
  name: string;
  domain: DomainId;
}
interface Resolution {
  status: 'unica' | 'varias' | 'ninguna';
  matches: Match[];
}

interface Props {
  value: TemaPedido | null;
  onChange: (tema: TemaPedido | null) => void;
  /** Se llama tras crear un concepto, para recargar el grafo. */
  onConceptCreated: () => void;
}

/**
 * Campo «Tema» del diálogo de generar (SDD R43): el usuario escribe qué quiere practicar, el orquestador lo resuelve
 * contra el grafo (una coincidencia, varias para elegir o ninguna: entonces puede crear el concepto).
 */
export function TemaPicker({ value, onChange, onConceptCreated }: Props) {
  const [text, setText] = useState('');
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [domain, setDomain] = useState<DomainId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 3 || value) {
      setResolution(null);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      fetch(`/api/tema?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? (res.json() as Promise<Resolution>) : null))
        .then((r) => {
          if (cancelled || !r) return;
          setResolution(r);
          // Una sola coincidencia clara se elige sola.
          if (r.status === 'unica' && r.matches[0]) onChange({ conceptId: r.matches[0].id, texto: q });
        })
        .catch(() => !cancelled && setResolution(null));
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [text, value, onChange]);

  const create = async () => {
    if (!domain) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/concepts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: text.trim(), domain }) });
      const body = (await res.json()) as { id?: string; message?: string };
      if (!res.ok || !body.id) setError(body.message ?? 'No pude crear el concepto.');
      else {
        onConceptCreated();
        onChange({ conceptId: body.id, texto: text.trim() });
      }
    } catch {
      setError('No pude contactar al orquestador local.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <label className="field-label" htmlFor="gen-tema">Tema <span className={styles.opt}>(opcional)</span></label>
      {value ? (
        <p className={styles.picked} role="status">
          <Check size={14} aria-hidden="true" />
          <span><strong>{value.texto}</strong></span>
          <button type="button" className={styles.clear} aria-label="Quitar el tema" onClick={() => { onChange(null); setResolution(null); setText(''); }}>
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      ) : (
        <input
          id="gen-tema"
          className={styles.input}
          type="text"
          maxLength={120}
          autoComplete="off"
          placeholder="¿Algo concreto? p. ej. descenso del gradiente"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {!value && resolution?.status === 'varias' && (
        <div className={styles.options} role="group" aria-label="Conceptos que coinciden">
          <p className={styles.hint}>Varios conceptos coinciden: elige uno.</p>
          <div className={styles.chips}>
            {resolution.matches.map((m) => (
              <FilterChip key={m.id} active={false} onClick={() => onChange({ conceptId: m.id, texto: m.name })}>
                {m.name} · {DOMAIN_BY_ID[m.domain].short}
              </FilterChip>
            ))}
          </div>
        </div>
      )}
      {!value && resolution?.status === 'ninguna' && (
        <div className={styles.options}>
          <p className={styles.hint}>No hay un concepto así en tu grafo. Puedes crearlo para practicarlo; elige su dominio.</p>
          <div className={styles.chips} role="group" aria-label="Dominio del concepto nuevo">
            {DOMAINS.map((d) => (
              <FilterChip key={d.id} active={domain === d.id} onClick={() => setDomain(d.id)}>{d.short}</FilterChip>
            ))}
          </div>
          <button type="button" className="btn btn-sm" disabled={!domain || busy} onClick={() => void create()}>
            {busy ? 'Creando…' : `Crear «${text.trim()}» y usarlo`}
          </button>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
