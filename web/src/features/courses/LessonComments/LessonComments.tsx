import { Card, Text } from '../../../components';
import { CommentForm } from '../CommentForm';
import { CommentItem } from '../CommentItem';
import { useLessonComments } from '../useLessonComments';
import styles from './LessonComments.module.css';

interface LessonCommentsProps {
  lessonId: string;
}

export function LessonComments({ lessonId }: LessonCommentsProps) {
  const { comments, permissions, loading, error, forbidden, addComment, addReply, editComment, deleteComment } =
    useLessonComments(lessonId, true);

  // Okuma yetkisi yoksa bölüm hiç gösterilmez.
  if (forbidden) return null;

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        {`Yorumlar${comments.length > 0 ? ` (${comments.length})` : ''}`}
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

      {permissions.canComment && (
        <CommentForm
          label="Yorumunuz"
          placeholder="Bu ders hakkında düşüncelerinizi ya da sorularınızı yazın…"
          submitLabel="Yorum Yap"
          resetOnSuccess
          onSubmit={addComment}
        />
      )}

      {!loading && !error && comments.length === 0 && (
        <Text role="body-md" tone="muted" as="p">
          Bu derse henüz yorum yapılmamış.
        </Text>
      )}

      {comments.length > 0 && (
        <ul className={styles.list}>
          {comments.map((comment) => (
            <li key={comment.id} className={styles.listItem}>
              <CommentItem
                author={comment.author}
                body={comment.body}
                createdAt={comment.createdAt}
                editedAt={comment.editedAt}
                canEdit={comment.canEdit}
                canDelete={comment.canDelete}
                onEdit={(body) => editComment(comment.id, body)}
                onDelete={() => deleteComment(comment.id)}
                deleteTitle="Yorumu sil"
                deleteMessage="Bu yorum ve altındaki tüm yanıtlar kalıcı olarak silinecek. Emin misiniz?"
                canReply={permissions.canReply}
                onReply={(body) => addReply(comment.id, body)}
              >
                {comment.replies.length > 0 && (
                  <div className={styles.replies}>
                    {comment.replies.map((reply) => (
                      <CommentItem
                        key={reply.id}
                        nested
                        author={reply.author}
                        authorRole={reply.authorRole}
                        body={reply.body}
                        createdAt={reply.createdAt}
                        editedAt={reply.editedAt}
                        canEdit={reply.canEdit}
                        canDelete={reply.canDelete}
                        onEdit={(body) => editComment(reply.id, body)}
                        onDelete={() => deleteComment(reply.id)}
                        deleteTitle="Yanıtı sil"
                        deleteMessage="Bu yanıt kalıcı olarak silinecek. Emin misiniz?"
                      />
                    ))}
                  </div>
                )}
              </CommentItem>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
