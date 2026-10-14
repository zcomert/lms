import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CommentReply, CourseReview, CourseReviewsResponse } from '../../types';

function toError(err: unknown, fallback: string): Error {
  return new Error(err instanceof ApiError ? err.message : fallback);
}

export interface ReviewInput {
  rating?: number;
  body?: string | null;
}

/**
 * Kurs değerlendirmeleri. Eylemler başarısızlıkta `Error(message)` fırlatır.
 * Oluşturma/silme sonrası `mine` ve `permissions.canReview` sunucudan yeniden yüklenerek tazelenir.
 */
export function useCourseReviews(courseId: string | undefined, enabled: boolean) {
  const [data, setData] = useState<CourseReviewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentId = useRef(courseId);

  const fetchReviews = useCallback(async (id: string) => {
    const res = await apiFetch<CourseReviewsResponse>(`/api/v1/courses/${id}/reviews`);
    if (currentId.current === id) setData(res);
  }, []);

  useEffect(() => {
    currentId.current = courseId;
    setData(null);
    setError(null);
    setForbidden(false);
    setSubmitting(false);
    if (!courseId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchReviews(courseId)
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NOT_ENROLLED') setForbidden(true);
        else setError(err instanceof ApiError ? err.message : 'Değerlendirmeler yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, enabled, fetchReviews]);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, apply: (result: T) => void | Promise<void>, fallback: string) => {
      const id = courseId;
      setSubmitting(true);
      try {
        const result = await fn();
        if (currentId.current === id) await apply(result);
      } catch (err) {
        throw toError(err, fallback);
      } finally {
        if (currentId.current === id) setSubmitting(false);
      }
    },
    [courseId],
  );

  const call = (path: string, method: string, payload?: unknown) =>
    apiFetch<Record<string, unknown>>(path, {
      method,
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    });

  const reload = useCallback(async () => {
    if (courseId) await fetchReviews(courseId);
  }, [courseId, fetchReviews]);

  const createReview = useCallback(
    (input: { rating: number; body?: string | null }) =>
      run(
        () => call(`/api/v1/courses/${courseId}/reviews`, 'POST', input),
        reload,
        'Değerlendirme gönderilemedi. Lütfen tekrar deneyin.',
      ),
    [courseId, run, reload],
  );

  const updateReview = useCallback(
    (reviewId: string, input: ReviewInput) =>
      run(
        () => call(`/api/v1/course-reviews/${reviewId}`, 'PATCH', input),
        (res) => {
          const updated = res.review as CourseReview;
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  summary: res.summary as CourseReviewsResponse['summary'],
                  reviews: prev.reviews.map((r) => (r.id === reviewId ? updated : r)),
                  mine: prev.mine?.id === reviewId ? updated : prev.mine,
                }
              : prev,
          );
        },
        'Değerlendirme güncellenemedi. Lütfen tekrar deneyin.',
      ),
    [run],
  );

  const deleteReview = useCallback(
    (reviewId: string) =>
      run(
        () => call(`/api/v1/course-reviews/${reviewId}`, 'DELETE'),
        reload,
        'Değerlendirme silinemedi. Lütfen tekrar deneyin.',
      ),
    [run, reload],
  );

  const addReply = useCallback(
    (reviewId: string, body: string) =>
      run(
        () => call(`/api/v1/course-reviews/${reviewId}/replies`, 'POST', { body }),
        (res) => {
          const reply = res.reply as CommentReply;
          setData((prev) => (prev ? withReplies(prev, reviewId, (list) => [...list, reply]) : prev));
        },
        'Yanıt gönderilemedi. Lütfen tekrar deneyin.',
      ),
    [run],
  );

  const editReply = useCallback(
    (replyId: string, body: string) =>
      run(
        () => call(`/api/v1/course-review-replies/${replyId}`, 'PATCH', { body }),
        (res) => {
          const reply = res.reply as CommentReply;
          setData((prev) => (prev ? mapReplies(prev, (list) => list.map((r) => (r.id === replyId ? reply : r))) : prev));
        },
        'Yanıt güncellenemedi. Lütfen tekrar deneyin.',
      ),
    [run],
  );

  const deleteReply = useCallback(
    (replyId: string) =>
      run(
        () => call(`/api/v1/course-review-replies/${replyId}`, 'DELETE'),
        () => setData((prev) => (prev ? mapReplies(prev, (list) => list.filter((r) => r.id !== replyId)) : prev)),
        'Yanıt silinemedi. Lütfen tekrar deneyin.',
      ),
    [run],
  );

  return {
    summary: data?.summary ?? null,
    reviews: data?.reviews ?? [],
    mine: data?.mine ?? null,
    permissions: data?.permissions ?? { canReview: false, canReply: false },
    loaded: data !== null,
    loading,
    error,
    forbidden,
    submitting,
    createReview,
    updateReview,
    deleteReview,
    addReply,
    editReply,
    deleteReply,
  };
}

type ReplyMapper = (replies: CommentReply[]) => CommentReply[];

function mapReview(review: CourseReview, fn: ReplyMapper): CourseReview {
  return { ...review, replies: fn(review.replies) };
}

function mapReplies(data: CourseReviewsResponse, fn: ReplyMapper): CourseReviewsResponse {
  return {
    ...data,
    reviews: data.reviews.map((r) => mapReview(r, fn)),
    mine: data.mine ? mapReview(data.mine, fn) : null,
  };
}

function withReplies(data: CourseReviewsResponse, reviewId: string, fn: ReplyMapper): CourseReviewsResponse {
  return {
    ...data,
    reviews: data.reviews.map((r) => (r.id === reviewId ? mapReview(r, fn) : r)),
    mine: data.mine && data.mine.id === reviewId ? mapReview(data.mine, fn) : data.mine,
  };
}
