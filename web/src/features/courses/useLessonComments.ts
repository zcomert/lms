import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CommentReply, LessonComment, LessonCommentPermissions, LessonCommentsResponse } from '../../types';

const NO_PERMISSIONS: LessonCommentPermissions = { canComment: false, canReply: false };

function toError(err: unknown, fallback: string): Error {
  return new Error(err instanceof ApiError ? err.message : fallback);
}

/**
 * Ders yorumları. Eylemler başarısızlıkta `Error(message)` fırlatır (çağıran form/diyalog gösterir);
 * başarıda durum sunucunun döndürdüğü nesneyle güncellenir.
 */
export function useLessonComments(lessonId: string | undefined, enabled: boolean) {
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [permissions, setPermissions] = useState<LessonCommentPermissions>(NO_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentId = useRef(lessonId);

  useEffect(() => {
    currentId.current = lessonId;
    setComments([]);
    setPermissions(NO_PERMISSIONS);
    setError(null);
    setForbidden(false);
    setSubmitting(false);
    if (!lessonId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<LessonCommentsResponse>(`/api/v1/lessons/${lessonId}/comments`)
      .then((res) => {
        if (cancelled) return;
        setComments(res.comments);
        setPermissions(res.permissions);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NOT_ENROLLED') setForbidden(true);
        else setError(err instanceof ApiError ? err.message : 'Yorumlar yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, enabled]);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, apply: (result: T) => void, fallback: string) => {
      const id = lessonId;
      setSubmitting(true);
      try {
        const result = await fn();
        if (currentId.current === id) apply(result);
      } catch (err) {
        throw toError(err, fallback);
      } finally {
        if (currentId.current === id) setSubmitting(false);
      }
    },
    [lessonId],
  );

  const send = (path: string, method: string, body?: string) =>
    apiFetch<Record<string, unknown>>(path, { method, ...(body !== undefined ? { body: JSON.stringify({ body }) } : {}) });

  const addComment = useCallback(
    (body: string) =>
      run(
        () => send(`/api/v1/lessons/${lessonId}/comments`, 'POST', body),
        (res) => setComments((prev) => [res.comment as LessonComment, ...prev]),
        'Yorum gönderilemedi. Lütfen tekrar deneyin.',
      ),
    [lessonId, run],
  );

  const addReply = useCallback(
    (commentId: string, body: string) =>
      run(
        () => send(`/api/v1/lesson-comments/${commentId}/replies`, 'POST', body),
        (res) =>
          setComments((prev) =>
            prev.map((c) => (c.id === commentId ? { ...c, replies: [...c.replies, res.reply as CommentReply] } : c)),
          ),
        'Yanıt gönderilemedi. Lütfen tekrar deneyin.',
      ),
    [run],
  );

  /** Üst düzey yorum ya da yanıt olabilir; sunucu `comment` veya `reply` döndürür. */
  const editComment = useCallback(
    (id: string, body: string) =>
      run(
        () => send(`/api/v1/lesson-comments/${id}`, 'PATCH', body),
        (res) => {
          if (res.comment) {
            const updated = res.comment as LessonComment;
            setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
          } else if (res.reply) {
            const updated = res.reply as CommentReply;
            setComments((prev) =>
              prev.map((c) => ({ ...c, replies: c.replies.map((r) => (r.id === id ? updated : r)) })),
            );
          }
        },
        'Yorum güncellenemedi. Lütfen tekrar deneyin.',
      ),
    [run],
  );

  const deleteComment = useCallback(
    (id: string) =>
      run(
        () => send(`/api/v1/lesson-comments/${id}`, 'DELETE'),
        () =>
          setComments((prev) =>
            prev.filter((c) => c.id !== id).map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== id) })),
          ),
        'Yorum silinemedi. Lütfen tekrar deneyin.',
      ),
    [run],
  );

  return { comments, permissions, loading, error, forbidden, submitting, addComment, addReply, editComment, deleteComment };
}
