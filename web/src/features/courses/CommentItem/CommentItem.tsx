import { useState } from 'react';
import type { ReactNode } from 'react';
import { Avatar, Badge, Button, ConfirmDialog, Text } from '../../../components';
import { CommentForm } from '../CommentForm';
import { formatDateTime } from '../formatDateTime';
import type { CommentAuthor, CommentAuthorRole } from '../../../types';
import styles from './CommentItem.module.css';

interface CommentItemProps {
  author: CommentAuthor;
  authorRole?: CommentAuthorRole;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  /** Yazar satırının altına (ör. yıldız göstergesi). */
  meta?: ReactNode;
  canEdit: boolean;
  canDelete: boolean;
  /** Basit metin düzenleme; `renderEditor` verilmezse kullanılır. */
  onEdit?: (body: string) => Promise<void>;
  /** Özel düzenleme arayüzü (ör. puan + metin). `done` düzenlemeyi kapatır. */
  renderEditor?: (done: () => void) => ReactNode;
  onDelete?: () => Promise<void>;
  deleteTitle: string;
  deleteMessage: string;
  /** Yanıt verme yetkisi (sunucudan); verilirse "Yanıtla" düğmesi görünür. */
  canReply?: boolean;
  onReply?: (body: string) => Promise<void>;
  /** Yanıt listesi. */
  children?: ReactNode;
  nested?: boolean;
}

export function CommentItem({
  author,
  authorRole,
  body,
  createdAt,
  editedAt,
  meta,
  canEdit,
  canDelete,
  onEdit,
  renderEditor,
  onDelete,
  deleteTitle,
  deleteMessage,
  canReply = false,
  onReply,
  children,
  nested = false,
}: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const editable = canEdit && Boolean(onEdit || renderEditor);
  const deletable = canDelete && Boolean(onDelete);
  const replyable = canReply && Boolean(onReply);

  return (
    <article className={`${styles.item} ${nested ? styles.nested : ''}`}>
      <Avatar name={author.name} src={author.avatarUrl ?? undefined} />
      <div className={styles.content}>
        <div className={styles.header}>
          <Text role="label-lg" as="span" tone="main">
            {author.name}
          </Text>
          {authorRole && (
            <Badge tone={authorRole === 'ADMIN' ? 'navy' : 'secondary'} variant="soft">
              {authorRole === 'ADMIN' ? 'Yönetici' : 'Eğitmen'}
            </Badge>
          )}
          <Text role="body-sm" as="span" tone="muted">
            <time dateTime={createdAt}>{formatDateTime(createdAt)}</time>
            {editedAt ? ' (düzenlendi)' : ''}
          </Text>
        </div>
        {meta}

        {editing ? (
          renderEditor ? (
            renderEditor(() => setEditing(false))
          ) : (
            <CommentForm
              label="Yorumu düzenle"
              submitLabel="Kaydet"
              initialValue={body ?? ''}
              autoFocus
              onSubmit={async (value) => {
                await onEdit?.(value);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          )
        ) : (
          body && (
            <Text role="body-md" as="p" className={styles.body}>
              {body}
            </Text>
          )
        )}

        {!editing && (editable || deletable || replyable) && (
          <div className={styles.actions}>
            {replyable && (
              <Button
                variant="ghost"
                size="sm"
                iconStart="reply"
                aria-expanded={replying}
                onClick={() => setReplying((v) => !v)}
              >
                Yanıtla
              </Button>
            )}
            {editable && (
              <Button variant="ghost" size="sm" iconStart="edit" onClick={() => setEditing(true)}>
                Düzenle
              </Button>
            )}
            {deletable && (
              <Button variant="ghost" size="sm" iconStart="delete" onClick={() => setConfirmingDelete(true)}>
                Sil
              </Button>
            )}
          </div>
        )}

        {children}

        {replying && onReply && (
          <div className={styles.replyForm}>
            <CommentForm
              label="Yanıtınız"
              submitLabel="Yanıtla"
              autoFocus
              resetOnSuccess
              onSubmit={async (value) => {
                await onReply(value);
                setReplying(false);
              }}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}
      </div>

      {confirmingDelete && onDelete && (
        <ConfirmDialog
          title={deleteTitle}
          confirmLabel="Sil"
          destructive
          onConfirm={async () => {
            await onDelete();
            setConfirmingDelete(false);
          }}
          onClose={() => setConfirmingDelete(false)}
        >
          <Text role="body-md" as="p">
            {deleteMessage}
          </Text>
        </ConfirmDialog>
      )}
    </article>
  );
}
