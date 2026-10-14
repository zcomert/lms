import { Fragment, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Button, Panel, Text, formStyles } from '../../../components';
import type { Assignment, SubmissionRow, SubmissionStatus } from '../../../types';
import { AssignmentStatusBadge } from '../AssignmentStatusBadge';
import { SubmissionView } from '../SubmissionView';
import { STATUS_LABELS, formatDueShort } from '../assignmentMeta';
import { useSubmissions } from '../useAssignment';
import styles from './SubmissionsPanel.module.css';

type Filter = 'ALL' | SubmissionStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Tümü' },
  { value: 'NOT_SUBMITTED', label: STATUS_LABELS.NOT_SUBMITTED },
  { value: 'SUBMITTED', label: STATUS_LABELS.SUBMITTED },
  { value: 'GRADED', label: STATUS_LABELS.GRADED },
];

export function SubmissionsPanel({ assignment }: { assignment: Assignment }) {
  const { rows, loading, error, grade } = useSubmissions(assignment.id, true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const filtered = filter === 'ALL' ? rows : rows.filter((row) => row.status === filter);

  return (
    <Panel title="Teslimler" icon="assignment_turned_in">
      <div className={styles.filters} role="group" aria-label="Teslim durumu filtresi">
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={filter === item.value ? 'navy' : 'secondary'}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {loading && (
        <Text role="body-md" tone="muted" as="p">
          Teslimler yükleniyor…
        </Text>
      )}
      {error && (
        <div role="alert">
          <Text role="body-md" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <Text role="body-md" tone="muted" as="p">
          {rows.length === 0 ? 'Bu kursa kayıtlı öğrenci yok.' : 'Bu filtreye uyan teslim yok.'}
        </Text>
      )}

      {filtered.length > 0 && (
        <table className={styles.table}>
          <caption className={styles.srOnly}>Öğrenci teslimleri</caption>
          <thead>
            <tr>
              <th scope="col">Öğrenci</th>
              <th scope="col">Durum</th>
              <th scope="col">Teslim zamanı</th>
              <th scope="col">Puan</th>
              <th scope="col">
                <span className={styles.srOnly}>İşlem</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const sub = row.submission;
              const open = sub !== null && openId === sub.id;
              return (
                <Fragment key={row.student.id}>
                  <tr>
                    <td data-label="Öğrenci">
                      <div className={styles.student}>
                        <Avatar name={row.student.name} src={row.student.avatarUrl ?? undefined} />
                        <div className={styles.studentText}>
                          <Text role="body-md" as="span" tone="main">
                            {row.student.name}
                          </Text>
                          <Text role="body-sm" as="span" tone="muted" className={styles.email}>
                            {row.student.email}
                          </Text>
                        </div>
                      </div>
                    </td>
                    <td data-label="Durum">
                      <div className={styles.badges}>
                        <AssignmentStatusBadge status={row.status} isLate={sub?.isLate} />
                      </div>
                    </td>
                    <td data-label="Teslim zamanı">
                      <Text role="body-sm" as="span">
                        {sub ? formatDueShort(sub.submittedAt) : '—'}
                      </Text>
                    </td>
                    <td data-label="Puan">
                      <Text role="body-sm" as="span">
                        {sub && sub.score !== null ? `${sub.score} / ${assignment.maxScore}` : '—'}
                      </Text>
                    </td>
                    <td className={styles.actionCell}>
                      {sub && (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-expanded={open}
                          aria-controls={`panel-${sub.id}`}
                          onClick={() => setOpenId(open ? null : sub.id)}
                          aria-label={`${open ? 'Kapat' : 'Aç'}: ${row.student.name}`}
                        >
                          {open ? 'Kapat' : sub.score !== null ? 'İncele' : 'Notla'}
                        </Button>
                      )}
                    </td>
                  </tr>
                  {open && sub && (
                    <tr className={styles.detailRow}>
                      <td colSpan={5} id={`panel-${sub.id}`}>
                        <div className={styles.detail}>
                          <SubmissionView submission={sub} maxScore={assignment.maxScore} status={row.status} showGrade={false} />
                          <GradeForm row={row} maxScore={assignment.maxScore} onGrade={grade} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function GradeForm({
  row,
  maxScore,
  onGrade,
}: {
  row: SubmissionRow;
  maxScore: number;
  onGrade: (submissionId: string, score: number, feedback: string) => Promise<void>;
}) {
  const id = useId();
  const sub = row.submission!;
  const [score, setScore] = useState(sub.score !== null ? String(sub.score) : '');
  const [feedback, setFeedback] = useState(sub.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    const value = Number(score);
    if (score.trim() === '' || !Number.isInteger(value) || value < 0 || value > maxScore) {
      setError(`Puan 0 ile ${maxScore} arasında bir tam sayı olmalıdır.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onGrade(sub.id, value, feedback);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={formStyles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
      <Text role="title-md" as="h4" tone="main">
        Notlandırma
      </Text>
      <label className={formStyles.field} htmlFor={`${id}-score`}>
        <Text role="label-md" as="span" tone="muted">
          Puan (0–{maxScore})
        </Text>
        <input
          id={`${id}-score`}
          className={formStyles.input}
          type="number"
          inputMode="numeric"
          min={0}
          max={maxScore}
          step={1}
          value={score}
          onChange={(event) => setScore(event.target.value)}
          required
          aria-required="true"
        />
      </label>
      <label className={formStyles.field} htmlFor={`${id}-fb`}>
        <Text role="label-md" as="span" tone="muted">
          Geri bildirim (isteğe bağlı)
        </Text>
        <textarea
          id={`${id}-fb`}
          className={formStyles.textarea}
          rows={4}
          maxLength={10000}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </label>
      {error && (
        <div className={formStyles.error} role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
      {saved && (
        <div className={formStyles.success} role="status">
          <Text role="body-sm" as="p">
            Not kaydedildi.
          </Text>
        </div>
      )}
      <div className={formStyles.actions}>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : sub.score !== null ? 'Notu Güncelle' : 'Notu Kaydet'}
        </Button>
      </div>
    </form>
  );
}
