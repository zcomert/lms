import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { LessonComment } from '../../types';

interface CommentsResponse {
  comments: LessonComment[];
}

interface CommentResponse {
  comment: LessonComment;
}

export function useLessonComments(lessonId: string | undefined, enabled: boolean) {
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const currentId = useRef(lessonId);

  const load = useCallback((id: string) => {
    setError(null);
    setLoading(true);
    return apiFetch<CommentsResponse>(`/api/v1/lessons/${id}/comments`)
      .then((res) => {
        if (currentId.current === id) setComments(res.comments);
      })
      .catch((err) => {
        if (currentId.current === id) {
          setError(err instanceof ApiError ? err.message : 'Yorumlar yüklenemedi.');
        }
      })
      .finally(() => {
        if (currentId.current === id) setLoading(false);
      });
  }, []);

  useEffect(() => {
    currentId.current = lessonId;
    setComments([]);
    setError(null);
    setPosting(false);
    if (!lessonId || !enabled) {
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
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Yorumlar yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, enabled]);

  const post = useCallback(
    async (body: string, parentId?: string) => {
      const id = lessonId;
      if (!id) return;
      setError(null);
      setPosting(true);
      try {
        await apiFetch<CommentResponse>(`/api/v1/lessons/${id}/comments`, {
          method: 'POST',
          body: JSON.stringify(parentId ? { body, parentId } : { body }),
        });
        if (currentId.current !== id) return;
        await load(id);
      } catch (err) {
        if (currentId.current !== id) return;
        setError(err instanceof ApiError ? err.message : 'Yorum gönderilemedi. Lütfen tekrar deneyin.');
      } finally {
        if (currentId.current === id) setPosting(false);
      }
    },
    [lessonId, load],
  );

  const addComment = useCallback((body: string) => post(body), [post]);
  const addReply = useCallback((parentId: string, body: string) => post(body, parentId), [post]);

  return { comments, loading, error, posting, addComment, addReply };
}
