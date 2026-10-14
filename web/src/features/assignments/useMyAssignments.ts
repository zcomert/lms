import { useApiResource } from '../../lib/useApiResource';
import type { MyAssignment } from '../../types';

/** GET /api/v1/assignments/my: öğrencinin kayıtlı olduğu kursların yayındaki ödevleri. */
export function useMyAssignments() {
  const { data, loading, error, reload } = useApiResource<{ assignments: MyAssignment[]; serverTime: string }>(
    '/api/v1/assignments/my',
  );
  return { assignments: data?.assignments ?? [], loading, error, reload };
}
