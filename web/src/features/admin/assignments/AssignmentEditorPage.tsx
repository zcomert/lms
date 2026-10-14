import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ConfirmDialog, Icon, Text, formStyles } from '../../../components';
import { PageContainer } from '../../../layout/PageContainer';
import type { AssignmentType } from '../../../types';
import { toDateTimeInput } from '../../calendar/dateUtils';
import { ASSIGNMENT_TYPES } from '../../assignments/assignmentMeta';
import { SubmissionRow } from './components/SubmissionRow';
import { deleteAssignment, gradeSubmission, updateAssignment, useAssignmentDetail } from './data/assignmentApi';
import type { AssignmentPatch } from './data/assignmentApi';
import styles from './AssignmentEditorPage.module.css';

const TYPE_KEYS = Object.keys(ASSIGNMENT_TYPES) as AssignmentType[];

export function AssignmentEditorPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { detail, setDetail, loading, error, reload } = useAssignmentDetail(assignmentId);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form alanları yalnızca ödev ilk yüklendiğinde doldurulur; sonraki yeniden render'larda korunur.
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [type, setType] = useState<AssignmentType | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [allowLate, setAllowLate] = useState<boolean | null>(null);
  const [latePenalty, setLatePenalty] = useState<string | null>(null);
  const [maxScore, setMaxScore] = useState<string | null>(null);

  if (!detail) {
    return (
      <PageContainer>
        <Link to="/yonetim/odevler" className={styles.back}>
          <Icon name="arrow_back" size="sm" />
          Ödevler
        </Link>
        {loading ? (
          <Text role="body-md" tone="muted" as="p">
            Yükleniyor…
          </Text>
        ) : (
          <Card padding="lg" elevation="1">
            <Text role="body-md" tone="error" as="p">
              {error ?? 'Ödev bulunamadı.'}
            </Text>
          </Card>
        )}
      </PageContainer>
    );
  }

  const { assignment, submissions } = detail;
  const f = {
    title: title ?? assignment.title,
    description: description ?? assignment.description ?? '',
    type: type ?? assignment.type,
    dueAt: dueAt ?? toDateTimeInput(new Date(assignment.dueAt)),
    allowLate: allowLate ?? assignment.allowLateSubmission,
    latePenalty: latePenalty ?? (assignment.latePenaltyPercent === null ? '' : String(assignment.latePenaltyPercent)),
    maxScore: maxScore ?? String(assignment.maxScore),
  };

  const changeStatus = async (next: 'DRAFT' | 'PUBLISHED') => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      setDetail({ ...detail, assignment: (await updateAssignment(assignment.id, { status: next })).assignment });
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Durum değiştirilemedi.');
    } finally {
      setStatusBusy(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!f.title.trim()) return setSaveError('Ödev adı zorunludur.');
    if (!f.dueAt) return setSaveError('Teslim tarihi zorunludur.');

    const penalty = f.latePenalty.trim() === '' ? null : Number(f.latePenalty);
    if (penalty !== null && (!Number.isInteger(penalty) || penalty < 0 || penalty > 100)) {
      return setSaveError('Geç teslim cezası 0 ile 100 arasında bir tam sayı olmalıdır.');
    }
    const max = Number(f.maxScore);
    if (!Number.isInteger(max) || max < 1 || max > 1000) {
      return setSaveError('Maksimum puan 1 ile 1000 arasında bir tam sayı olmalıdır.');
    }

    const patch: AssignmentPatch = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      type: f.type,
      dueAt: new Date(f.dueAt).toISOString(),
      allowLateSubmission: f.allowLate,
      latePenaltyPercent: penalty,
      maxScore: max,
    };

    setSaving(true);
    setSaveError(null);
    try {
      const { assignment: updated } = await updateAssignment(assignment.id, patch);
      setDetail({ ...detail, assignment: updated });
      setTitle(null);
      setDescription(null);
      setType(null);
      setDueAt(null);
      setAllowLate(null);
      setLatePenalty(null);
      setMaxScore(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ödev kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <div className={styles.top}>
        <Link to="/yonetim/odevler" className={styles.back}>
          <Icon name="arrow_back" size="sm" />
          Ödevler
        </Link>

        <div className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.badges}>
              <Badge tone="cyan" icon="menu_book">
                {assignment.course.title}
              </Badge>
              <Badge tone="secondary" icon={ASSIGNMENT_TYPES[assignment.type].icon}>
                {ASSIGNMENT_TYPES[assignment.type].label}
              </Badge>
              <Badge tone={assignment.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                {assignment.status === 'PUBLISHED' ? 'Yayında' : 'Taslak'}
              </Badge>
            </span>
            <Text role="headline-lg" as="h1">
              {assignment.title}
            </Text>
            <Text role="body-md" tone="muted" as="p">
              {submissions.filter((s) => s.submittedAt).length} / {submissions.length} öğrenci teslim etti
            </Text>
          </div>
          <div className={styles.headerActions}>
            {assignment.status === 'PUBLISHED' ? (
              <Button variant="secondary" iconStart="unpublished" disabled={statusBusy} onClick={() => void changeStatus('DRAFT')}>
                Taslağa al
              </Button>
            ) : (
              <Button variant="primary" iconStart="publish" disabled={statusBusy} onClick={() => void changeStatus('PUBLISHED')}>
                Yayınla
              </Button>
            )}
            <Button variant="ghost" iconStart="delete" onClick={() => setDeleting(true)}>
              Sil
            </Button>
          </div>
        </div>

        <div aria-live="polite" className={styles.live}>
          {statusError && (
            <div className={styles.errorBanner} role="alert">
              <Text role="body-sm" tone="error" as="p">
                {statusError}
              </Text>
            </div>
          )}
        </div>
      </div>

      <form className={formStyles.form} onSubmit={handleSave} noValidate>
        <label className={formStyles.field}>
          <Text role="label-md" as="span" tone="muted">
            Ödev adı
          </Text>
          <input className={formStyles.input} type="text" value={f.title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className={formStyles.field}>
          <Text role="label-md" as="span" tone="muted">
            Açıklama
          </Text>
          <textarea
            className={formStyles.textarea}
            rows={4}
            maxLength={5000}
            value={f.description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className={formStyles.row}>
          <label className={formStyles.field}>
            <Text role="label-md" as="span" tone="muted">
              Tür
            </Text>
            <select className={formStyles.input} value={f.type} onChange={(e) => setType(e.target.value as AssignmentType)}>
              {TYPE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {ASSIGNMENT_TYPES[key].label}
                </option>
              ))}
            </select>
          </label>
          <label className={formStyles.field}>
            <Text role="label-md" as="span" tone="muted">
              Teslim tarihi
            </Text>
            <input
              className={formStyles.input}
              type="datetime-local"
              value={f.dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </label>
        </div>

        <div className={formStyles.row}>
          <label className={formStyles.field}>
            <Text role="label-md" as="span" tone="muted">
              Geç teslim cezası (%)
            </Text>
            <input
              className={formStyles.input}
              type="number"
              min={0}
              max={100}
              value={f.latePenalty}
              disabled={!f.allowLate}
              onChange={(e) => setLatePenalty(e.target.value)}
              placeholder="Yok"
            />
          </label>
          <label className={formStyles.field}>
            <Text role="label-md" as="span" tone="muted">
              Maksimum puan
            </Text>
            <input
              className={formStyles.input}
              type="number"
              min={1}
              max={1000}
              value={f.maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </label>
        </div>

        <label className={formStyles.checkbox}>
          <input type="checkbox" checked={f.allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
          <Text role="body-sm" as="span">
            Geç teslime izin ver
          </Text>
        </label>

        {saveError && (
          <div className={formStyles.error} role="alert">
            <Text role="body-sm" tone="error" as="p">
              {saveError}
            </Text>
          </div>
        )}

        <div className={formStyles.actions}>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </form>

      <div className={styles.section}>
        <Text role="headline-sm" as="h2">
          Teslimler ({submissions.filter((s) => s.submittedAt).length})
        </Text>
        {submissions.length === 0 ? (
          <Text role="body-md" tone="muted" as="p">
            Bu kursa kayıtlı öğrenci yok.
          </Text>
        ) : (
          <ul className={styles.list}>
            {submissions.map((row) => (
              <li key={row.student.id}>
                <SubmissionRow
                  row={row}
                  maxScore={assignment.maxScore}
                  onSave={async (score, feedback) => {
                    await gradeSubmission(assignment.id, row.student.id, { score, feedback });
                    reload();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title="Ödevi sil"
          confirmLabel="Ödevi sil"
          destructive
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await deleteAssignment(assignment.id);
            navigate('/yonetim/odevler');
          }}
        >
          <Text role="body-md" as="p">
            “{assignment.title}” ödevi ve tüm öğrenci teslimleri kalıcı olarak silinecek.
          </Text>
        </ConfirmDialog>
      )}
    </PageContainer>
  );
}
