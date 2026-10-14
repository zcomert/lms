import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { LessonComment } from '../../types';

export function useLessonComments(lessonId: string | undefined) {
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentId = useRef(lessonId);

  useEffect(() => {
    currentId.current = lessonId;
    setComments([]);
    setLoadError(null);
    setActionError(null);
    setNotEnrolled(false);
    setSubmitting(false);
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
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NOT_ENROLLED') setNotEnrolled(true);
        setLoadError(err instanceof ApiError ? err.message : 'Yorumlar yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const add = useCallback(
    async (body: string): Promise<boolean> => {
      const id = lessonId;
      if (!id) return false;
      setActionError(null);
      setSubmitting(true);
      try {
        const res = await apiFetch<{ comment: LessonComment }>(`/api/v1/lessons/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        });
        if (currentId.current !== id) return false;
        setComments((prev) => [res.comment, ...prev]);
        return true;
      } catch (err) {
        if (currentId.current === id) {
          setActionError(err instanceof ApiError ? err.message : 'Yorum gönderilemedi. Lütfen tekrar deneyin.');
        }
        return false;
      } finally {
        if (currentId.current === id) setSubmitting(false);
      }
    },
    [lessonId],
  );

  const remove = useCallback(
    async (commentId: string) => {
      const id = lessonId;
      if (!id) return;
      setActionError(null);
      try {
        await apiFetch<void>(`/api/v1/lessons/${id}/comments/${commentId}`, { method: 'DELETE' });
        if (currentId.current !== id) return;
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err) {
        if (currentId.current === id) {
          setActionError(err instanceof ApiError ? err.message : 'Yorum silinemedi. Lütfen tekrar deneyin.');
        }
      }
    },
    [lessonId],
  );

  return { comments, loading, loadError, notEnrolled, actionError, submitting, add, remove };
}
