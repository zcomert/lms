import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { LessonComment } from '../../types';

interface CommentsResponse {
  comments: LessonComment[];
}

export function useLessonComments(lessonId: string | undefined) {
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const currentId = useRef(lessonId);

  useEffect(() => {
    currentId.current = lessonId;
    setComments([]);
    setError(null);
    setSubmitting(false);
    setNotEnrolled(false);
    if (!lessonId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<CommentsResponse>(`/api/v1/lessons/${lessonId}/comments`)
      .then((res) => {
        if (!cancelled) setComments(res.comments);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NOT_ENROLLED') setNotEnrolled(true);
        else setError(err instanceof ApiError ? err.message : 'Yorumlar yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  /** Başarılı yazmadan sonra ağacı sunucudan yeniden çeker. */
  const write = useCallback(
    async (request: () => Promise<unknown>, fallback: string): Promise<boolean> => {
      const id = lessonId;
      if (!id) return false;
      setError(null);
      setSubmitting(true);
      try {
        await request();
        const res = await apiFetch<CommentsResponse>(`/api/v1/lessons/${id}/comments`);
        if (currentId.current !== id) return false;
        setComments(res.comments);
        return true;
      } catch (err) {
        if (currentId.current !== id) return false;
        if (err instanceof ApiError && err.code === 'NOT_ENROLLED') setNotEnrolled(true);
        else setError(err instanceof ApiError ? err.message : fallback);
        return false;
      } finally {
        if (currentId.current === id) setSubmitting(false);
      }
    },
    [lessonId],
  );

  const addComment = useCallback(
    (body: string, parentId?: string) =>
      write(
        () =>
          apiFetch(`/api/v1/lessons/${lessonId}/comments`, {
            method: 'POST',
            body: JSON.stringify(parentId ? { body, parentId } : { body }),
          }),
        'Yorum gönderilemedi. Lütfen tekrar deneyin.',
      ),
    [write, lessonId],
  );

  const editComment = useCallback(
    (id: string, body: string) =>
      write(
        () => apiFetch(`/api/v1/lesson-comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
        'Yorum güncellenemedi. Lütfen tekrar deneyin.',
      ),
    [write],
  );

  const deleteComment = useCallback(
    (id: string) =>
      write(
        () => apiFetch(`/api/v1/lesson-comments/${id}`, { method: 'DELETE' }),
        'Yorum silinemedi. Lütfen tekrar deneyin.',
      ),
    [write],
  );

  return { comments, loading, error, submitting, notEnrolled, addComment, editComment, deleteComment };
}
