import type { Assignment, SubmissionStatus } from '../../types';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

/** Sunucudaki global uzantı beyaz listesiyle aynı sırada. */
export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'txt', 'md', 'csv', 'zip',
  'png', 'jpg', 'jpeg', 'gif', 'py', 'java', 'c', 'cpp', 'js', 'ts', 'ipynb', 'sql',
] as const;

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  NOT_SUBMITTED: 'Teslim edilmedi',
  SUBMITTED: 'Değerlendiriliyor',
  GRADED: 'Notlandı',
};

export const STATUS_TONES = {
  NOT_SUBMITTED: 'warning',
  SUBMITTED: 'cyan',
  GRADED: 'success',
} as const;

export function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
}

export function formatDueShort(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function isOverdue(assignment: Pick<Assignment, 'dueAt'>): boolean {
  return new Date(assignment.dueAt).getTime() < Date.now();
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

/**
 * İstemci tarafı ön kontrol (sunucu yine doğrular). `allowed` boş dizi ise dosya kabul edilmez;
 * `null` ise yalnızca global beyaz liste uygulanır.
 */
export function validateFiles(files: File[], allowed: string[] | null): string | null {
  if (files.length > MAX_FILES) return `En fazla ${MAX_FILES} dosya yükleyebilirsiniz.`;
  if (allowed !== null && allowed.length === 0 && files.length > 0) {
    return 'Bu ödev yalnızca metin teslimi kabul ediyor; dosya eklenemez.';
  }
  const list = allowed ?? (ALLOWED_EXTENSIONS as readonly string[]);
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return `"${file.name}" 10 MB sınırını aşıyor.`;
    if (!list.includes(extensionOf(file.name))) {
      return `"${file.name}" için dosya türü kabul edilmiyor. Kabul edilenler: ${list.join(', ')}.`;
    }
  }
  return null;
}
