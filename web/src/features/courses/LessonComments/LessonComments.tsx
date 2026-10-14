import { useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Button, Card, Text } from '../../../components';
import { useLessonComments } from '../useLessonComments';
import styles from './LessonComments.module.css';

interface LessonCommentsProps {
  lessonId: string;
}

const MAX = 2000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function LessonComments({ lessonId }: LessonCommentsProps) {
  const { comments, loading, loadError, notEnrolled, actionError, submitting, add, remove } =
    useLessonComments(lessonId);
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const tooLong = text.length > MAX;
  const canSubmit = trimmed.length > 0 && !tooLong && !submitting;
  const fieldId = `lesson-comment-${lessonId}`;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (await add(trimmed)) setText('');
  };

  const onDelete = (id: string) => {
    if (window.confirm('Bu yorumu silmek istediğine emin misin?')) void remove(id);
  };

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        Yorumlar{!loading && !notEnrolled && !loadError ? ` (${comments.length})` : ''}
      </Text>

      {!notEnrolled && (
        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor={fieldId} className={styles.label}>
            <Text role="label-md" as="span" tone="muted">
              Yorumun
            </Text>
          </label>
          <textarea
            id={fieldId}
            className={styles.textarea}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Bu ders hakkında düşüncelerini paylaş…"
            aria-invalid={tooLong}
          />
          <div className={styles.formFooter}>
            <Text role="body-sm" as="span" tone={tooLong ? 'error' : 'muted'} aria-live="polite">
              {text.length}/{MAX}
            </Text>
            <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
              Yorum Gönder
            </Button>
          </div>
        </form>
      )}

      {(actionError || loadError) && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {actionError ?? loadError}
          </Text>
        </div>
      )}

      {loading && (
        <Text role="body-sm" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}

      {!loading && !notEnrolled && !loadError && comments.length === 0 && (
        <Text role="body-md" tone="muted" as="p">
          Henüz yorum yok. İlk yorumu sen yaz!
        </Text>
      )}

      {comments.length > 0 && (
        <ul className={styles.list}>
          {comments.map((c) => (
            <li key={c.id} className={styles.item}>
              <Avatar name={c.author.name} />
              <div className={styles.content}>
                <div className={styles.meta}>
                  <Text role="label-lg" as="span" tone="main">
                    {c.author.name}
                  </Text>
                  <Text role="body-sm" as="span" tone="muted">
                    {formatDate(c.createdAt)}
                  </Text>
                  {c.canDelete && (
                    <button
                      type="button"
                      className={styles.delete}
                      onClick={() => onDelete(c.id)}
                      aria-label={`${c.author.name} yorumunu sil`}
                    >
                      Sil
                    </button>
                  )}
                </div>
                <p className={styles.body}>{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
