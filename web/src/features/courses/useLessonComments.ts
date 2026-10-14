import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { LessonComment } from '../../types';

export function useLessonComments(lessonId: string | undefined) {
  const [comments, setComments] = useState<LessonComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentId = useRef(lessonId);

  useEffect(() => {
    currentId.current = lessonId;
    setComments(null);
    setError(null);
    if (!lessonId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<{ comments: LessonComment[] }>(`/api/v1/lessons/${lessonId}/comments`)
      .then((res) => {
        if (!cancelled) setComments(res.comments);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Yorumlar yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  /** Yorumu gönderir; sunucu reddederse ApiError fırlatır (ör. INAPPROPRIATE_CONTENT). */
  const addComment = useCallback(
    async (body: string) => {
      const id = lessonId;
      if (!id) return;
      const res = await apiFetch<{ comment: LessonComment }>(`/api/v1/lessons/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      if (currentId.current === id) setComments((prev) => [res.comment, ...(prev ?? [])]);
    },
    [lessonId],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const id = lessonId;
      if (!id) return;
      await apiFetch(`/api/v1/lessons/${id}/comments/${commentId}`, { method: 'DELETE' });
      if (currentId.current === id) setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? null);
    },
    [lessonId],
  );

  return { comments, loading, error, addComment, deleteComment };
}
