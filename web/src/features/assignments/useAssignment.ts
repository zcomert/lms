import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { Assignment, AssignmentResponse, SubmissionRow, SubmissionsResponse } from '../../types';
import { gradeSubmission, submitAssignment } from './assignmentApi';

function fail(err: unknown, fallback: string): Error {
  return new Error(err instanceof Error ? err.message : fallback);
}

/** Tek ödev: GET /api/v1/assignments/:id. */
export function useAssignment(id: string | undefined) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await apiFetch<AssignmentResponse>(`/api/v1/assignments/${id}`);
    setAssignment(res.assignment);
  }, [id]);

  useEffect(() => {
    setAssignment(null);
    setError(null);
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Ödev yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  const submit = useCallback(
    async (text: string, files: File[]) => {
      if (!id) return;
      try {
        await submitAssignment(id, text, files);
      } catch (err) {
        throw fail(err, 'Teslim gönderilemedi. Lütfen tekrar deneyin.');
      }
      await load().catch(() => undefined);
    },
    [id, load],
  );

  return { assignment, loading, error, submit, reload: load };
}

/** Yönetici: GET /api/v1/assignments/:id/submissions ve notlama. */
export function useSubmissions(assignmentId: string | undefined, enabled: boolean) {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assignmentId) return;
    const res = await apiFetch<SubmissionsResponse>(`/api/v1/assignments/${assignmentId}/submissions`);
    setRows(res.submissions);
  }, [assignmentId]);

  useEffect(() => {
    setRows([]);
    setError(null);
    if (!assignmentId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Teslimler yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, enabled, load]);

  const grade = useCallback(
    async (submissionId: string, score: number, feedback: string) => {
      let updated;
      try {
        updated = await gradeSubmission(submissionId, score, feedback);
      } catch (err) {
        throw fail(err, 'Not kaydedilemedi. Lütfen tekrar deneyin.');
      }
      setRows((prev) =>
        prev.map((row) =>
          row.submission?.id === submissionId ? { ...row, status: 'GRADED', submission: updated } : row,
        ),
      );
    },
    [],
  );

  return { rows, loading, error, grade, reload: load };
}
