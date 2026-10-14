import type { BadgeTone } from '../../components';
import type { AssignmentType, MyAssignmentStatus } from '../../types';

export const ASSIGNMENT_TYPES: Record<AssignmentType, { label: string; icon: string }> = {
  HOMEWORK: { label: 'Ödev', icon: 'assignment' },
  LAB: { label: 'Laboratuvar', icon: 'science' },
  PROJECT: { label: 'Proje', icon: 'folder_special' },
};

export const STATUS_INFO: Record<MyAssignmentStatus, { tone: BadgeTone; label: string }> = {
  PENDING: { tone: 'warning', label: 'Teslim Bekleniyor' },
  LATE: { tone: 'error', label: 'Gecikmiş' },
  SUBMITTED: { tone: 'cyan', label: 'Teslim Edildi' },
  GRADED: { tone: 'success', label: 'Puanlandı' },
};

export function getStatusInfo(status: MyAssignmentStatus) {
  return STATUS_INFO[status];
}

const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDueDate(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
