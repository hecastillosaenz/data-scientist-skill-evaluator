import { useId } from 'react';
import styles from './Segmented.module.css';

interface Props<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Oculta el rótulo visualmente (sigue disponible para lectores de pantalla). */
  hideLabel?: boolean;
}

export function Segmented<T extends string>({ label, options, value, onChange, hideLabel }: Props<T>) {
  const name = useId();
  return (
    <div className={styles.wrap}>
      <span className={hideLabel ? 'visually-hidden' : styles.label} id={`${name}-l`}>
        {label}
      </span>
      <div className={styles.group} role="radiogroup" aria-labelledby={`${name}-l`}>
        {options.map((o) => (
          <label key={o.value} className={`${styles.opt} ${o.value === value ? styles.active : ''}`}>
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
