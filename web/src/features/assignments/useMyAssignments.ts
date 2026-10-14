import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { Assignment, MyAssignmentsResponse } from '../../types';

/** GET /api/v1/users/me/assignments (filtre istemcide uygulanır; sayılar tutarlı kalsın). */
export function useMyAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MyAssignmentsResponse>('/api/v1/users/me/assignments')
      .then((res) => {
        if (!cancelled) setAssignments(res.assignments);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Ödevler yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { assignments, loading, error };
}
