import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Dialog, Text, formStyles } from '../../../../components';
import type { AssignmentType } from '../../../../types';
import { ASSIGNMENT_TYPES } from '../../../assignments/assignmentMeta';
import type { NewAssignmentInput } from '../data/assignmentApi';

const TYPE_KEYS = Object.keys(ASSIGNMENT_TYPES) as AssignmentType[];

interface AssignmentCreateDialogProps {
  courses: { id: string; title: string }[];
  onCreate: (input: NewAssignmentInput) => Promise<void>;
  onClose: () => void;
}

export function AssignmentCreateDialog({ courses, onCreate, onClose }: AssignmentCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState('');
  const [type, setType] = useState<AssignmentType>('HOMEWORK');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCourseId = courseId || (courses[0]?.id ?? '');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return setError('Ödev adı zorunludur.');
    if (!selectedCourseId) return setError('Bir kurs seçmelisiniz.');
    if (!dueDate) return setError('Teslim tarihi zorunludur.');
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        courseId: selectedCourseId,
        type,
        dueAt: new Date(dueDate).toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödev oluşturulamadı.');
      setBusy(false);
    }
  };

  return (
    <Dialog title="Yeni Ödev" busy={busy} onClose={onClose}>
      <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
        <label className={formStyles.field}>
          <Text role="label-md" as="span" tone="muted">
            Ödev adı
          </Text>
          <input
            className={formStyles.input}
            type="text"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
            aria-required="true"
          />
        </label>

        <div className={formStyles.row}>
          <label className={formStyles.field}>
            <Text role="label-md" as="span" tone="muted">
              Kurs
            </Text>
            <select
              className={formStyles.input}
              value={selectedCourseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              {courses.length === 0 && <option value="">Yönetebildiğiniz kurs yok</option>}
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <label className={formStyles.field}>
            <Text role="label-md" as="span" tone="muted">
              Tür
            </Text>
            <select
              className={formStyles.input}
              value={type}
              onChange={(event) => setType(event.target.value as AssignmentType)}
            >
              {TYPE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {ASSIGNMENT_TYPES[key].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={formStyles.field}>
          <Text role="label-md" as="span" tone="muted">
            Teslim tarihi
          </Text>
          <input
            className={formStyles.input}
            type="datetime-local"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
            aria-required="true"
          />
        </label>

        <Text role="body-sm" as="p" tone="muted">
          Ödevin kursu sonradan değiştirilemez. Açıklama, geç teslim ayarları ve diğer detayları bir
          sonraki adımda düzenleyeceksiniz.
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
            {busy ? 'Oluşturuluyor…' : 'Oluştur ve düzenle'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
