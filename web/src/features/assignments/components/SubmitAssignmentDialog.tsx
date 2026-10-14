import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Dialog, Text, formStyles } from '../../../components';
import { apiFetch, ApiError } from '../../../lib/apiClient';
import type { MyAssignment } from '../../../types';

interface SubmitAssignmentDialogProps {
  assignment: MyAssignment;
  onSubmitted: () => void;
  onClose: () => void;
}

/** Ödeve metin (ve ileride dosya) ile teslim yapma diyaloğu — POST /api/v1/assignments/:id/submission. */
export function SubmitAssignmentDialog({ assignment, onSubmitted, onClose }: SubmitAssignmentDialogProps) {
  const [note, setNote] = useState(assignment.mySubmission?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!note.trim()) {
      setError('Teslim için en az bir not girmelisiniz.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/assignments/${assignment.id}/submission`, {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() }),
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ödev teslim edilemedi.');
      setBusy(false);
    }
  };

  return (
    <Dialog title={assignment.title} busy={busy} onClose={onClose}>
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        <Text role="body-sm" tone="muted" as="p">
          {assignment.course.title} · Son teslim: {new Date(assignment.dueAt).toLocaleString('tr-TR')}
        </Text>

        <label className={formStyles.field}>
          <Text role="label-md" as="span" tone="muted">
            Teslim notunuz
          </Text>
          <textarea
            className={formStyles.textarea}
            rows={6}
            maxLength={5000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Çözümünüzü, bağlantınızı veya açıklamanızı buraya yazın…"
            required
            aria-required="true"
          />
        </label>

        <Text role="body-sm" tone="muted" as="p">
          Dosya yükleme yakında eklenecek; şimdilik metin veya bağlantı ile teslim edebilirsiniz.
        </Text>

        {error && (
          <div className={formStyles.error} role="alert">
            <Text role="body-sm" tone="error" as="p">
              {error}
            </Text>
          </div>
        )}

        <div className={formStyles.actions}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            İptal
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Teslim Et'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
