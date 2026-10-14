import { useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Badge, Button, Card, Text } from '../../../components';
import type { LessonComment } from '../../../types';
import { useLessonComments } from '../useLessonComments';
import styles from './LessonComments.module.css';

interface LessonCommentsProps {
  lessonId: string;
}

const MAX_LENGTH = 2000;

interface CommentFormProps {
  label: string;
  initial?: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}

function CommentForm({ label, initial = '', submitLabel, submitting, onSubmit, onCancel }: CommentFormProps) {
  const [value, setValue] = useState(initial);
  const empty = value.trim().length === 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (empty || submitting) return;
    const ok = await onSubmit(value.trim());
    if (ok) setValue('');
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <textarea
        className={styles.textarea}
        aria-label={label}
        value={value}
        maxLength={MAX_LENGTH}
        rows={3}
        disabled={submitting}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" size="sm" disabled={empty || submitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={onCancel}>
            İptal
          </Button>
        )}
      </div>
    </form>
  );
}

interface CommentItemProps {
  comment: LessonComment;
  isReply?: boolean;
  submitting: boolean;
  onReply: (body: string, parentId: string) => Promise<boolean>;
  onEdit: (id: string, body: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

function CommentItem({ comment, isReply = false, submitting, onReply, onEdit, onDelete }: CommentItemProps) {
  const [mode, setMode] = useState<'view' | 'reply' | 'edit'>('view');
  const staff = comment.author.role === 'INSTRUCTOR' || comment.author.role === 'ADMIN';

  const handleDelete = () => {
    const warning = isReply
      ? 'Bu yorumu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.'
      : 'Bu yorumu silmek istediğinize emin misiniz? Cevapları da silinecek ve işlem geri alınamaz.';
    if (window.confirm(warning)) void onDelete(comment.id);
  };

  return (
    <li className={styles.item}>
      <div className={styles.header}>
        <Avatar name={comment.author.name} src={comment.author.avatarUrl ?? undefined} />
        <Text role="label-lg" as="span" tone="main">
          {comment.author.name}
        </Text>
        {staff && (
          <Badge tone="brand" variant="soft">
            Eğitmen
          </Badge>
        )}
        <Text role="body-sm" as="span" tone="muted">
          {new Date(comment.createdAt).toLocaleString('tr-TR')}
        </Text>
        {comment.editedAt && (
          <Text role="body-sm" as="span" tone="muted">
            (düzenlendi)
          </Text>
        )}
      </div>

      {mode === 'edit' ? (
        <CommentForm
          label="Yorumu düzenle"
          initial={comment.body}
          submitLabel="Kaydet"
          submitting={submitting}
          onSubmit={async (body) => {
            const ok = await onEdit(comment.id, body);
            if (ok) setMode('view');
            return ok;
          }}
          onCancel={() => setMode('view')}
        />
      ) : (
        <Text role="body-md" as="p" tone="main" className={styles.body}>
          {comment.body}
        </Text>
      )}

      {mode === 'view' && (
        <div className={styles.actions}>
          {!isReply && (
            <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => setMode('reply')}>
              Cevapla
            </Button>
          )}
          {comment.canEdit && (
            <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => setMode('edit')}>
              Düzenle
            </Button>
          )}
          {comment.canDelete && (
            <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={handleDelete}>
              Sil
            </Button>
          )}
        </div>
      )}

      {mode === 'reply' && (
        <CommentForm
          label={`${comment.author.name} adlı kullanıcıya cevap yaz`}
          submitLabel="Cevabı gönder"
          submitting={submitting}
          onSubmit={async (body) => {
            const ok = await onReply(body, comment.id);
            if (ok) setMode('view');
            return ok;
          }}
          onCancel={() => setMode('view')}
        />
      )}

      {comment.replies.length > 0 && (
        <ul className={`${styles.list} ${styles.replies}`}>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              isReply
              submitting={submitting}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function LessonComments({ lessonId }: LessonCommentsProps) {
  const { comments, loading, error, submitting, notEnrolled, addComment, editComment, deleteComment } =
    useLessonComments(lessonId);

  const total = comments.reduce((sum, c) => sum + 1 + c.replies.length, 0);

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        {`Tartışma · ${total} yorum`}
      </Text>

      {loading && (
        <Text role="body-sm" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}

      {notEnrolled ? (
        <Text role="body-md" tone="muted" as="p">
          Yorum yazmak için kursa kayıtlı olmalısınız.
        </Text>
      ) : (
        !loading && (
          <>
            <CommentForm
              label="Yeni yorum"
              submitLabel="Gönder"
              submitting={submitting}
              onSubmit={(body) => addComment(body)}
            />
            {comments.length === 0 && !error ? (
              <Text role="body-md" tone="muted" as="p">
                Henüz yorum yok. İlk yorumu sen yaz.
              </Text>
            ) : (
              <ul className={styles.list}>
                {comments.map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    submitting={submitting}
                    onReply={addComment}
                    onEdit={editComment}
                    onDelete={deleteComment}
                  />
                ))}
              </ul>
            )}
          </>
        )
      )}

      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
    </Card>
  );
}
