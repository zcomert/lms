import { useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Badge, Button, Card, Text } from '../../../../components';
import { ApiError } from '../../../../lib/apiClient';
import type { AssignmentSubmissionRow } from '../../../../types';
import styles from './SubmissionRow.module.css';

interface SubmissionRowProps {
  row: AssignmentSubmissionRow;
  maxScore: number;
  onSave: (score: number, feedback: string | null) => Promise<void>;
}

/** Tek öğrencinin ödev teslimi: not/dosya önizleme + 0-maxScore not girişi ve geri bildirim. */
export function SubmissionRow({ row, maxScore, onSave }: SubmissionRowProps) {
  const { student } = row;
  const [score, setScore] = useState(row.score === null ? '' : String(row.score));
  const [feedback, setFeedback] = useState(row.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = score.trim();
    const value = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(value) || value < 0 || value > maxScore) {
      setError(`Not 0 ile ${maxScore} arasında bir tam sayı olmalıdır.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(value, feedback.trim() || null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Not kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  if (!row.submittedAt) {
    return (
      <Card padding="md" elevation="1">
        <div className={styles.top}>
          <div className={styles.student}>
            <Avatar name={student.name} src={student.avatarUrl ?? undefined} />
            <div className={styles.studentInfo}>
              <Text role="title-md" as="p" tone="main" className={styles.wrap}>
                {student.name}
              </Text>
              <Text role="body-sm" as="p" tone="muted" className={styles.wrap}>
                {student.email}
              </Text>
            </div>
          </div>
          <Badge tone="neutral">Henüz teslim yok</Badge>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="md" elevation="1">
      <div className={styles.row}>
        <div className={styles.top}>
          <div className={styles.student}>
            <Avatar name={student.name} src={student.avatarUrl ?? undefined} />
            <div className={styles.studentInfo}>
              <Text role="title-md" as="p" tone="main" className={styles.wrap}>
                {student.name}
              </Text>
              <Text role="body-sm" as="p" tone="muted" className={styles.wrap}>
                {new Date(row.submittedAt).toLocaleString('tr-TR')}
              </Text>
            </div>
          </div>
          <span className={styles.scoreRow}>
            {row.isLate && <Badge tone="warning">Geç Teslim</Badge>}
            {row.score !== null && <Badge tone="success">Notlandırıldı</Badge>}
          </span>
        </div>

        {row.note && (
          <Text role="body-sm" as="p" className={styles.note}>
            {row.note}
          </Text>
        )}
        {row.fileUrl && (
          <a href={row.fileUrl} target="_blank" rel="noreferrer">
            <Text role="label-md" tone="secondary" as="span">
              {row.fileName ?? 'Dosyayı indir'}
            </Text>
          </a>
        )}

        <form className={styles.gradeForm} onSubmit={handleSubmit} noValidate>
          <div className={styles.scoreRow}>
            <span className={styles.scoreField}>
              <input
                className={styles.input}
                type="number"
                inputMode="numeric"
                min={0}
                max={maxScore}
                step={1}
                value={score}
                onChange={(event) => {
                  setScore(event.target.value);
                  setError(null);
                }}
                readOnly={busy}
                aria-label={`${student.name} notu`}
              />
              <Text role="body-md" tone="muted" as="span">
                / {maxScore}
              </Text>
            </span>
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Notlandır'}
            </Button>
          </div>
          <textarea
            className={styles.textarea}
            placeholder="Geri bildirim (isteğe bağlı)"
            maxLength={5000}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            readOnly={busy}
          />
        </form>

        {error && (
          <div role="alert" className={styles.error}>
            <Text role="body-sm" tone="error" as="p">
              {error}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
}
