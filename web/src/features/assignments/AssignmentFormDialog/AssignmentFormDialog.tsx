import { useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Dialog, Text, formStyles } from '../../../components';
import type { Assignment, AssignmentPayload, AssignmentStatus, FileMeta } from '../../../types';
import { toDateTimeInput } from '../../calendar/dateUtils';
import { ALLOWED_EXTENSIONS, MAX_FILES, formatSize, validateFiles } from '../assignmentMeta';
import styles from './AssignmentFormDialog.module.css';

export interface LessonOption {
  id: string;
  title: string;
  moduleTitle: string;
}

interface AssignmentFormDialogProps {
  /** Düzenlenen ödev; yoksa yeni ödev oluşturulur. */
  assignment: Assignment | null;
  lessons: LessonOption[];
  onSave: (payload: AssignmentPayload, newFiles: File[], removedAttachmentIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function AssignmentFormDialog({ assignment, lessons, onSave, onClose }: AssignmentFormDialogProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [description, setDescription] = useState(assignment?.description ?? '');
  const [dueAt, setDueAt] = useState(assignment ? toDateTimeInput(new Date(assignment.dueAt)) : '');
  const [maxScore, setMaxScore] = useState(String(assignment?.maxScore ?? 100));
  const [extensions, setExtensions] = useState<string[]>(assignment?.allowedExtensions ?? []);
  const [lessonId, setLessonId] = useState(assignment?.lessonId ?? '');
  const [status, setStatus] = useState<AssignmentStatus>(assignment?.status ?? 'DRAFT');
  const [existing, setExisting] = useState<FileMeta[]>(assignment?.attachments ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleExt = (ext: string) =>
    setExtensions((prev) => (prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext]));

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    setNewFiles(picked);
    setError(picked.length ? validateFiles(picked, null) : null);
  };

  const removeExisting = (file: FileMeta) => {
    setExisting((prev) => prev.filter((f) => f.id !== file.id));
    setRemoved((prev) => [...prev, file.id]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return setError('Başlık zorunludur.');
    if (title.trim().length > 200) return setError('Başlık en fazla 200 karakter olabilir.');
    if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) return setError('Teslim tarihi seçmelisiniz.');
    const max = Number(maxScore);
    if (!Number.isInteger(max) || max < 1 || max > 1000) return setError('Maksimum puan 1 ile 1000 arasında bir tam sayı olmalıdır.');
    const fileProblem = validateFiles(newFiles, null);
    if (fileProblem) return setError(fileProblem);

    const payload: AssignmentPayload = {
      title: title.trim(),
      description: description.trim(),
      dueAt: new Date(dueAt).toISOString(),
      maxScore: max,
      allowedExtensions: extensions,
      lessonId: lessonId || null,
      status,
    };
    setBusy(true);
    setError(null);
    try {
      await onSave(payload, newFiles, removed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ödev kaydedilemedi.');
      setBusy(false);
    }
  };

  const modules = Array.from(new Set(lessons.map((l) => l.moduleTitle)));

  return (
    <Dialog title={assignment ? 'Ödevi Düzenle' : 'Yeni Ödev'} size="lg" busy={busy} onClose={onClose}>
      <form className={formStyles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className={formStyles.field} htmlFor={`${id}-title`}>
          <Text role="label-md" as="span" tone="muted">
            Başlık
          </Text>
          <input
            id={`${id}-title`}
            className={formStyles.input}
            type="text"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
            aria-required="true"
          />
        </label>

        <label className={formStyles.field} htmlFor={`${id}-desc`}>
          <Text role="label-md" as="span" tone="muted">
            Açıklama
          </Text>
          <textarea
            id={`${id}-desc`}
            className={formStyles.textarea}
            rows={6}
            maxLength={10000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <div className={formStyles.row}>
          <label className={formStyles.field} htmlFor={`${id}-due`}>
            <Text role="label-md" as="span" tone="muted">
              Teslim tarihi
            </Text>
            <input
              id={`${id}-due`}
              className={formStyles.input}
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              required
              aria-required="true"
            />
          </label>
          <label className={formStyles.field} htmlFor={`${id}-max`}>
            <Text role="label-md" as="span" tone="muted">
              Maksimum puan
            </Text>
            <input
              id={`${id}-max`}
              className={formStyles.input}
              type="number"
              min={1}
              max={1000}
              step={1}
              value={maxScore}
              onChange={(event) => setMaxScore(event.target.value)}
              required
              aria-required="true"
            />
          </label>
        </div>

        <div className={formStyles.row}>
          <label className={formStyles.field} htmlFor={`${id}-lesson`}>
            <Text role="label-md" as="span" tone="muted">
              Bağlı ders (isteğe bağlı)
            </Text>
            <select
              id={`${id}-lesson`}
              className={formStyles.input}
              value={lessonId}
              onChange={(event) => setLessonId(event.target.value)}
            >
              <option value="">Derse bağlı değil</option>
              {modules.map((moduleTitle) => (
                <optgroup key={moduleTitle} label={moduleTitle}>
                  {lessons
                    .filter((l) => l.moduleTitle === moduleTitle)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={formStyles.field} htmlFor={`${id}-status`}>
            <Text role="label-md" as="span" tone="muted">
              Durum
            </Text>
            <select
              id={`${id}-status`}
              className={formStyles.input}
              value={status}
              onChange={(event) => setStatus(event.target.value as AssignmentStatus)}
            >
              <option value="DRAFT">Taslak (öğrenciler görmez)</option>
              <option value="PUBLISHED">Yayında</option>
            </select>
          </label>
        </div>

        <fieldset className={formStyles.fieldset}>
          <legend>
            <Text role="label-md" as="span" tone="muted">
              Kabul edilen dosya türleri
            </Text>
          </legend>
          <Text role="body-sm" as="p" tone="muted">
            Hiçbiri seçilmezse yalnızca metin teslimi kabul edilir.
          </Text>
          <div className={styles.extGrid}>
            {ALLOWED_EXTENSIONS.map((ext) => (
              <label key={ext} className={formStyles.checkbox}>
                <input type="checkbox" checked={extensions.includes(ext)} onChange={() => toggleExt(ext)} />
                <Text role="body-sm" as="span">
                  .{ext}
                </Text>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={formStyles.fieldset}>
          <legend>
            <Text role="label-md" as="span" tone="muted">
              Ek dosyalar
            </Text>
          </legend>
          {existing.length > 0 && (
            <ul className={styles.fileList}>
              {existing.map((file) => (
                <li key={file.id} className={styles.fileItem}>
                  <Text role="body-sm" as="span" className={styles.fileName}>
                    {file.name} ({formatSize(file.size)})
                  </Text>
                  <Button variant="ghost" size="sm" iconStart="delete" onClick={() => removeExisting(file)} aria-label={`Sil: ${file.name}`}>
                    Sil
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <label htmlFor={`${id}-files`}>
            <Text role="body-sm" as="span" tone="muted">
              Dosya ekle (en fazla {MAX_FILES}, dosya başına 10 MB)
            </Text>
          </label>
          <input
            ref={fileInput}
            id={`${id}-files`}
            className={formStyles.input}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
            onChange={handleFiles}
          />
        </fieldset>

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
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
