import { apiFetch } from '../../lib/apiClient';
import type {
  Assignment,
  AssignmentPayload,
  AssignmentResponse,
  FileMeta,
  Submission,
  SubmissionResponse,
} from '../../types';

const json = (method: string, payload?: unknown): RequestInit => ({
  method,
  ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
});

export function createAssignment(courseId: string, payload: AssignmentPayload): Promise<Assignment> {
  return apiFetch<AssignmentResponse>(`/api/v1/courses/${courseId}/assignments`, json('POST', payload)).then(
    (r) => r.assignment,
  );
}

export function updateAssignment(id: string, payload: AssignmentPayload): Promise<Assignment> {
  return apiFetch<AssignmentResponse>(`/api/v1/assignments/${id}`, json('PATCH', payload)).then((r) => r.assignment);
}

export function deleteAssignment(id: string): Promise<void> {
  return apiFetch<{ success: true }>(`/api/v1/assignments/${id}`, json('DELETE')).then(() => undefined);
}

export function uploadAttachments(id: string, files: File[]): Promise<FileMeta[]> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  return apiFetch<{ attachments: FileMeta[] }>(`/api/v1/assignments/${id}/attachments`, {
    method: 'POST',
    body: form,
  }).then((r) => r.attachments);
}

export function deleteAttachment(id: string): Promise<void> {
  return apiFetch<{ success: true }>(`/api/v1/assignment-attachments/${id}`, json('DELETE')).then(() => undefined);
}

export function submitAssignment(id: string, text: string, files: File[]): Promise<Submission> {
  const form = new FormData();
  if (text.trim()) form.append('text', text.trim());
  files.forEach((file) => form.append('files', file));
  return apiFetch<SubmissionResponse>(`/api/v1/assignments/${id}/submissions`, { method: 'POST', body: form }).then(
    (r) => r.submission,
  );
}

export function gradeSubmission(id: string, score: number, feedback: string): Promise<Submission> {
  return apiFetch<SubmissionResponse>(
    `/api/v1/submissions/${id}/grade`,
    json('PUT', { score, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) }),
  ).then((r) => r.submission);
}
