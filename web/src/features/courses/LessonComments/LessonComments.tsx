import { useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Button, Card, Text } from '../../../components';
import { useLessonComments } from '../useLessonComments';
import type { LessonComment, LessonCommentReply } from '../../../types';
import styles from './LessonComments.module.css';

interface LessonCommentsProps {
  lessonId: string;
}

const MAX_LENGTH = 2000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentForm({
  label,
  placeholder,
  posting,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  posting: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  const fieldId = `comment-textarea-${label.replace(/[^a-zA-Z0-9]+/g, '-')}`;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || posting) return;
    await onSubmit(trimmed);
    setValue('');
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor={fieldId} className={styles.visuallyHidden}>
        {label}
      </label>
      <textarea
        id={fieldId}
        className={styles.textarea}
        placeholder={placeholder}
        maxLength={MAX_LENGTH}
        value={value}
        disabled={posting}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className={styles.formFooter}>
        <Text role="label-md" tone="muted" as="span">
          {value.length} / {MAX_LENGTH}
        </Text>
        <div className={styles.actions}>
          {onCancel && (
            <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
              Vazgeç
            </Button>
          )}
          <Button variant="primary" size="sm" type="submit" disabled={posting || !value.trim()}>
            {posting ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  posting,
  replyingTo,
  onToggleReply,
  onReply,
}: {
  comment: LessonComment;
  posting: boolean;
  replyingTo: boolean;
  onToggleReply: () => void;
  onReply: (body: string) => Promise<void>;
}) {
  return (
    <div>
      <Comment comment={comment} />
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onToggleReply}>
          Yanıtla
        </Button>
      </div>

      {replyingTo && (
        <div className={styles.replyForm}>
          <CommentForm
            label={`${comment.author.name} yorumuna yanıt yaz`}
            placeholder="Yanıtınızı yazın…"
            posting={posting}
            onSubmit={onReply}
            onCancel={onToggleReply}
          />
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className={styles.replies}>
          {comment.replies.map((reply) => (
            <Comment key={reply.id} comment={reply} />
          ))}
        </div>
      )}
    </div>
  );
}

function Comment({ comment }: { comment: LessonCommentReply }) {
  return (
    <div className={styles.comment}>
      <Avatar name={comment.author.name} src={comment.author.avatarUrl ?? undefined} />
      <div className={styles.body}>
        <div className={styles.meta}>
          <Text role="label-lg" as="span" tone="main">
            {comment.author.name}
          </Text>
          <Text role="body-sm" as="span" tone="muted">
            {formatDate(comment.createdAt)}
          </Text>
        </div>
        <Text role="body-md" as="p">
          {comment.body}
        </Text>
      </div>
    </div>
  );
}

export function LessonComments({ lessonId }: LessonCommentsProps) {
  const { comments, loading, error, posting, addComment, addReply } = useLessonComments(lessonId, true);
  const [replyingId, setReplyingId] = useState<string | null>(null);

  const handleReply = (parentId: string) => async (body: string) => {
    await addReply(parentId, body);
    setReplyingId(null);
  };

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        Yorumlar
      </Text>

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

      {!loading && !error && comments.length === 0 && (
        <Text role="body-md" tone="muted" as="p" className={styles.empty}>
          Henüz yorum yok. İlk yorumu siz yazın.
        </Text>
      )}

      {!loading && comments.length > 0 && (
        <div className={styles.list}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              posting={posting}
              replyingTo={replyingId === comment.id}
              onToggleReply={() => setReplyingId(replyingId === comment.id ? null : comment.id)}
              onReply={handleReply(comment.id)}
            />
          ))}
        </div>
      )}

      {!error && (
        <CommentForm
          label="Yorum yaz"
          placeholder="Bu ders hakkında bir yorum yazın…"
          posting={posting}
          onSubmit={addComment}
        />
      )}
    </Card>
  );
}
