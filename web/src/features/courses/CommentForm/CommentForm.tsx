import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button, formStyles, Text } from '../../../components';
import { COMMENT_MAX_LENGTH } from '../commentLimits';
import styles from './CommentForm.module.css';

interface CommentFormProps {
  label: string;
  submitLabel: string;
  placeholder?: string;
  initialValue?: string;
  /** false ise boş metin gönderilebilir (ör. yalnızca puan veren değerlendirme). */
  required?: boolean;
  /** Başarılı gönderimden sonra metin alanını temizler (yeni yorum/yanıt için). */
  resetOnSuccess?: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  /** Metin alanının yanında/üstünde ek alan (ör. yıldız seçici). */
  children?: ReactNode;
  disabled?: boolean;
}

export function CommentForm({
  label,
  submitLabel,
  placeholder,
  initialValue = '',
  required = true,
  resetOnSuccess = false,
  autoFocus = false,
  onSubmit,
  onCancel,
  children,
  disabled = false,
}: CommentFormProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (required && trimmed.length === 0) {
      setError('Lütfen bir metin yazın.');
      return;
    }
    if (trimmed.length > COMMENT_MAX_LENGTH) {
      setError(`Metin en fazla ${COMMENT_MAX_LENGTH} karakter olabilir.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      if (resetOnSuccess) setValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const empty = value.trim().length === 0;

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
      {children}
      <div className={formStyles.field}>
        <label htmlFor={fieldId}>
          <Text role="label-lg" as="span" tone="main">
            {label}
          </Text>
        </label>
        <textarea
          id={fieldId}
          className={formStyles.textarea}
          rows={3}
          maxLength={COMMENT_MAX_LENGTH}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={busy || disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
        />
        <Text role="label-md" tone="muted" as="span" className={styles.counter}>
          {value.length} / {COMMENT_MAX_LENGTH}
        </Text>
      </div>
      {error && (
        <div id={errorId} role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Vazgeç
          </Button>
        )}
        <Button type="submit" variant="primary" size="sm" disabled={busy || disabled || (required && empty)}>
          {busy ? 'Gönderiliyor…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
