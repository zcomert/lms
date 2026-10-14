import { useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Button, Card, ConfirmDialog, IconButton, Text, formStyles } from '../../../components';
import { ApiError } from '../../../lib/apiClient';
import type { LessonComment } from '../../../types';
import { useLessonComments } from '../useLessonComments';
import styles from './LessonComments.module.css';

/** Sunucudaki COMMENT_MAX_LENGTH ile aynı tutulmalı. */
const MAX_LENGTH = 1000;

interface LessonCommentsProps {
  lessonId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function LessonComments({ lessonId }: LessonCommentsProps) {
  const { comments, loading, error, addComment, deleteComment } = useLessonComments(lessonId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LessonComment | null>(null);

  const trimmed = draft.trim();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || sending) return;
    setSending(true);
    setSubmitError(null);
    try {
      await addComment(trimmed);
      setDraft('');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Yorum gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        Yorumlar{comments && comments.length > 0 ? ` (${comments.length})` : ''}
      </Text>

      <form className={styles.form} onSubmit={onSubmit}>
        <label className={formStyles.field}>
          <span className={formStyles.srOnly}>Yorumunuz</span>
          <textarea
            className={formStyles.textarea}
            rows={3}
            maxLength={MAX_LENGTH}
            placeholder="Ders hakkındaki düşüncelerinizi paylaşın…"
            value={draft}
            disabled={sending}
            onChange={(event) => {
              setDraft(event.target.value);
              if (submitError) setSubmitError(null);
            }}
            aria-invalid={submitError ? true : undefined}
            aria-describedby="lesson-comment-hint"
          />
        </label>
        <div className={styles.formFooter}>
          <span id="lesson-comment-hint">
            <Text role="body-sm" tone="muted" as="span">
              Saygılı bir dil kullanın; hakaret içeren yorumlar yayınlanmaz. {draft.length}/{MAX_LENGTH}
            </Text>
          </span>
          <Button type="submit" variant="primary" size="sm" iconStart="send" disabled={!trimmed || sending}>
            {sending ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </div>
        {submitError && (
          <div role="alert" className={formStyles.error}>
            <Text role="body-sm" tone="error" as="p">
              {submitError}
            </Text>
          </div>
        )}
      </form>

      {loading && (
        <Text role="body-sm" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}
      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
      {comments && comments.length === 0 && (
        <Text role="body-sm" tone="muted" as="p">
          Henüz yorum yok. İlk yorumu siz yazın.
        </Text>
      )}

      {comments && comments.length > 0 && (
        <ul className={styles.list}>
          {comments.map((comment) => (
            <li key={comment.id} className={styles.item}>
              <Avatar name={comment.author.name} src={comment.author.avatarUrl ?? undefined} />
              <div className={styles.content}>
                <div className={styles.meta}>
                  <Text role="label-lg" as="span">
                    {comment.author.name}
                  </Text>
                  <Text role="body-sm" tone="muted" as="span">
                    <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
                  </Text>
                </div>
                <Text role="body-md" as="p" className={styles.body}>
                  {comment.body}
                </Text>
              </div>
              {comment.canDelete && (
                <IconButton icon="delete" label="Yorumu sil" onClick={() => setDeleting(comment)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="Yorumu sil"
          confirmLabel="Yorumu sil"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteComment(deleting.id);
            setDeleting(null);
          }}
        >
          <Text role="body-md" as="p">
            Bu yorum kalıcı olarak silinecek.
          </Text>
        </ConfirmDialog>
      )}
    </Card>
  );
}
