import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { LessonComment, ReactionKey } from '../../types';

interface ListResponse {
  comments: LessonComment[];
}
interface CommentResponse {
  comment: LessonComment;
}

export function useLessonComments(lessonId: string | undefined) {
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentId = useRef(lessonId);

  useEffect(() => {
    currentId.current = lessonId;
    setComments([]);
    setError(null);
    setSubmitting(false);
    if (!lessonId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<ListResponse>(`/api/v1/lessons/${lessonId}/comments`)
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

  const addComment = useCallback(
    async (body: string): Promise<boolean> => {
      const id = lessonId;
      const text = body.trim();
      if (!id || !text) return false;
      setError(null);
      setSubmitting(true);
      try {
        const res = await apiFetch<CommentResponse>(`/api/v1/lessons/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: text }),
        });
        if (currentId.current !== id) return false;
        setComments((prev) => [res.comment, ...prev]);
        return true;
      } catch (err) {
        if (currentId.current === id) {
          setError(err instanceof ApiError ? err.message : 'Yorum gönderilemedi. Lütfen tekrar deneyin.');
        }
        return false;
      } finally {
        if (currentId.current === id) setSubmitting(false);
      }
    },
    [lessonId],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const id = lessonId;
      setError(null);
      try {
        await apiFetch<{ ok: boolean }>(`/api/v1/comments/${commentId}`, { method: 'DELETE' });
        if (currentId.current !== id) return;
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err) {
        if (currentId.current === id) {
          setError(err instanceof ApiError ? err.message : 'Yorum silinemedi. Lütfen tekrar deneyin.');
        }
      }
    },
    [lessonId],
  );

  const toggleReaction = useCallback(
    async (commentId: string, emoji: ReactionKey) => {
      const id = lessonId;
      const target = comments.find((c) => c.id === commentId);
      if (!target) return;
      setError(null);
      try {
        const res = await apiFetch<CommentResponse>(`/api/v1/comments/${commentId}/reactions`, {
          method: 'PUT',
          body: JSON.stringify({ emoji, active: !target.reactions[emoji].mine }),
        });
        if (currentId.current !== id) return;
        setComments((prev) => prev.map((c) => (c.id === commentId ? res.comment : c)));
      } catch (err) {
        if (currentId.current === id) {
          setError(err instanceof ApiError ? err.message : 'Tepki kaydedilemedi. Lütfen tekrar deneyin.');
        }
      }
    },
    [lessonId, comments],
  );

  return { comments, loading, error, submitting, addComment, deleteComment, toggleReaction };
}
