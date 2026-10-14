import { useApiResource } from '../lib/useApiResource';
import type { UpcomingTaskRaw } from '../types';

/** GET /api/v1/users/me/upcoming-tasks: ödev + sınav birleşik, yaklaşan görevler (FR-12). */
export function useUpcomingTasks(days = 7, limit = 5) {
  const { data, loading, error } = useApiResource<{
    tasks: UpcomingTaskRaw[];
    totalCount: number;
    serverTime: string;
  }>(`/api/v1/users/me/upcoming-tasks?days=${days}&limit=${limit}`);
  return { tasks: data?.tasks ?? [], totalCount: data?.totalCount ?? 0, loading, error };
}
