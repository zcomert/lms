import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from '../../../components';
import styles from './StarRating.module.css';

interface StarRatingProps {
  /** 0 = seçilmemiş. */
  value: number;
  /** Verilirse etkileşimli radio group; verilmezse salt okunur görüntü. */
  onChange?: (value: number) => void;
  label?: string;
  disabled?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

export function StarRating({ value, onChange, label = 'Puan', disabled = false }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (!onChange) {
    return (
      <span className={styles.stars} role="img" aria-label={`5 üzerinden ${value} puan`}>
        {STARS.map((n) => (
          <span key={n} className={`${styles.star} ${n <= value ? styles.on : ''}`} aria-hidden="true">
            <Icon name="star" size="md" filled={n <= value} />
          </span>
        ))}
      </span>
    );
  }

  const shown = hover ?? value;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, (value || 0) + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, (value || 2) - 1);
    if (next !== null) {
      event.preventDefault();
      onChange(next);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[next - 1]?.focus();
    }
  };

  return (
    <div
      className={styles.stars}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHover(null)}
    >
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} yıldız`}
          tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
          className={`${styles.star} ${styles.button} ${n <= shown ? styles.on : ''}`}
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
        >
          <Icon name="star" size="lg" filled={n <= shown} />
        </button>
      ))}
    </div>
  );
}
