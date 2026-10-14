import { useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, ConfirmDialog, Text, formStyles } from '../../../components';
import type { Assignment } from '../../../types';
import { MAX_FILES, formatSize, isOverdue, validateFiles } from '../assignmentMeta';
import styles from './SubmissionForm.module.css';

const MAX_TEXT = 20000;

interface SubmissionFormProps {
  assignment: Assignment;
  onSubmit: (text: string, files: File[]) => Promise<void>;
}

export function SubmissionForm({ assignment, onSubmit }: SubmissionFormProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const overdue = isOverdue(assignment);
  const acceptsFiles = assignment.allowedExtensions.length > 0;

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    setFiles(picked);
    setError(picked.length ? validateFiles(picked, assignment.allowedExtensions) : null);
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setError(next.length ? validateFiles(next, assignment.allowedExtensions) : null);
    if (next.length === 0 && fileInput.current) fileInput.current.value = '';
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() && files.length === 0) {
      setError('Metin veya dosyadan en az biri gereklidir.');
      return;
    }
    const problem = validateFiles(files, assignment.allowedExtensions);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setConfirming(true);
  };

  return (
    <form className={formStyles.form} onSubmit={handleSubmit} noValidate>
      {overdue && (
        <div className={styles.warning} role="status">
          <Text role="body-md" as="p" tone="main">
            Teslim tarihi geçti; teslim geç olarak işaretlenecek.
          </Text>
        </div>
      )}

      <label className={formStyles.field} htmlFor={`${id}-text`}>
        <Text role="label-md" as="span" tone="muted">
          Teslim metni (isteğe bağlı)
        </Text>
        <textarea
          id={`${id}-text`}
          className={formStyles.textarea}
          rows={6}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      {acceptsFiles ? (
        <div className={formStyles.field}>
          <label htmlFor={`${id}-files`}>
            <Text role="label-md" as="span" tone="muted">
              Dosyalar (en fazla {MAX_FILES}, dosya başına 10 MB)
            </Text>
          </label>
          <input
            ref={fileInput}
            id={`${id}-files`}
            className={formStyles.input}
            type="file"
            multiple
            accept={assignment.allowedExtensions.map((ext) => `.${ext}`).join(',')}
            onChange={handleFiles}
            aria-describedby={`${id}-hint`}
          />
          <span id={`${id}-hint`}>
            <Text role="body-sm" as="span" tone="muted">
              Kabul edilen türler: {assignment.allowedExtensions.join(', ')}
            </Text>
          </span>
          {files.length > 0 && (
            <ul className={styles.fileList}>
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className={styles.fileItem}>
                  <Text role="body-sm" as="span" className={styles.fileName}>
                    {file.name} ({formatSize(file.size)})
                  </Text>
                  <Button variant="ghost" size="sm" onClick={() => removeFile(index)} aria-label={`Kaldır: ${file.name}`}>
                    Kaldır
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Text role="body-sm" tone="muted" as="p">
          Bu ödev yalnızca metin teslimi kabul ediyor.
        </Text>
      )}

      {error && (
        <div className={formStyles.error} role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}

      <div className={formStyles.actions}>
        <Button type="submit" variant="primary" iconStart="upload">
          Teslim Et
        </Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Ödevi teslim et"
          confirmLabel="Teslim Et"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await onSubmit(text, files);
            setConfirming(false);
          }}
        >
          <Text role="body-md" as="p">
            Teslim yalnızca bir kez yapılabilir ve sonradan değiştirilemez. Devam etmek istiyor musunuz?
          </Text>
          {overdue && (
            <Text role="body-sm" as="p" tone="error">
              Teslim tarihi geçtiği için teslim geç olarak işaretlenecek.
            </Text>
          )}
        </ConfirmDialog>
      )}
    </form>
  );
}
