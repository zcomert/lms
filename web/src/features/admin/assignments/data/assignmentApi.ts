import { apiFetch } from '../../../../lib/apiClient';
import { useApiResource } from '../../../../lib/useApiResource';
import type { AssignmentType, ManagedAssignment, ManagedAssignmentDetail } from '../../../../types';

export interface NewAssignmentInput {
  courseId: string;
  title: string;
  type: AssignmentType;
  dueAt: string;
}

export interface AssignmentPatch {
  title?: string;
  description?: string | null;
  type?: AssignmentType;
  status?: 'DRAFT' | 'PUBLISHED';
  dueAt?: string;
  availableFrom?: string | null;
  allowLateSubmission?: boolean;
  latePenaltyPercent?: number | null;
  maxScore?: number;
  acceptedFileTypes?: string[];
}

/** GET /api/v1/assignments/manage: kullanıcının yönetebildiği ödevler. */
export function useManagedAssignments() {
  const { data, loading, error, reload } = useApiResource<{ assignments: ManagedAssignment[] }>(
    '/api/v1/assignments/manage',
  );
  return { assignments: data?.assignments ?? [], loading, error, reload };
}

/** Ödev ayrıntısı + teslim rosteri; değişiklik çağrıları güncel ayrıntıyı döndürür. */
export function useAssignmentDetail(id: string | undefined) {
  const { data, setData, loading, error, reload } = useApiResource<ManagedAssignmentDetail>(
    id ? `/api/v1/assignments/${id}` : null,
  );
  return { detail: data, setDetail: setData, loading, error, reload };
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function createAssignment(input: NewAssignmentInput): Promise<{ assignment: ManagedAssignment }> {
  return apiFetch(`/api/v1/courses/${input.courseId}/assignments`, json('POST', input));
}

export function updateAssignment(id: string, patch: AssignmentPatch): Promise<{ assignment: ManagedAssignment }> {
  return apiFetch(`/api/v1/assignments/${id}`, json('PATCH', patch));
}

export async function deleteAssignment(id: string): Promise<void> {
  await apiFetch(`/api/v1/assignments/${id}`, json('DELETE'));
}

export function gradeSubmission(
  assignmentId: string,
  userId: string,
  body: { score: number; feedback?: string | null },
): Promise<unknown> {
  return apiFetch(`/api/v1/assignments/${assignmentId}/submissions/${userId}/grade`, json('PUT', body));
}
