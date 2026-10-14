import { AppError } from '../errors.js';
import { parseDateTime } from './calendar.js';

export const ASSIGNMENT_TYPES = ['HOMEWORK', 'LAB', 'PROJECT'] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const ASSIGNMENT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Öğrencinin kendi görünümünde türetilen teslim durumu (FR-66). */
export type MyAssignmentStatus = 'PENDING' | 'LATE' | 'SUBMITTED' | 'GRADED';

export const ASSIGNMENT_LIMITS = {
  title: 200,
  description: 5000,
  maxScoreMax: 1000,
  acceptedFileTypeMax: 20,
  acceptedFileTypesCountMax: 30,
  note: 5000,
  feedback: 5000,
} as const;

function validation(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, 400);
}

export interface RawAssignmentInput {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  status?: unknown;
  dueAt?: unknown;
  availableFrom?: unknown;
  allowLateSubmission?: unknown;
  latePenaltyPercent?: unknown;
  maxScore?: unknown;
  attachmentUrl?: unknown;
  attachmentName?: unknown;
  acceptedFileTypes?: unknown;
}

export interface AssignmentSettings {
  title: string;
  description: string | null;
  type: AssignmentType;
  status: AssignmentStatus;
  dueAt: Date;
  availableFrom: Date | null;
  allowLateSubmission: boolean;
  latePenaltyPercent: number | null;
  maxScore: number;
  attachmentUrl: string | null;
  attachmentName: string | null;
  acceptedFileTypes: string[];
}

export const ASSIGNMENT_SETTING_FIELDS = [
  'title',
  'description',
  'type',
  'status',
  'dueAt',
  'availableFrom',
  'allowLateSubmission',
  'latePenaltyPercent',
  'maxScore',
  'attachmentUrl',
  'attachmentName',
  'acceptedFileTypes',
] as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw validation(`${field} şunlardan biri olmalıdır: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function bool(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw validation(`${field} boolean olmalıdır.`);
  return value;
}

function optionalInt(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw validation(`${field} ${min} ile ${max} arasında bir tam sayı olmalıdır.`);
  }
  return value;
}

function optionalString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw validation(`${field} metin olmalıdır.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw validation(`${field} en fazla ${maxLength} karakter olabilir.`);
  return trimmed === '' ? null : trimmed;
}

function requiredInstant(value: unknown, field: string): Date {
  const date = parseDateTime(value);
  if (!date) throw validation(`${field} ofset veya Z içeren ISO tarih-saat olmalıdır ve zorunludur.`);
  return date;
}

function optionalInstant(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  const date = parseDateTime(value);
  if (!date) throw validation(`${field} ofset veya Z içeren ISO tarih-saat olmalıdır.`);
  return date;
}

function parseAcceptedFileTypes(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw validation('acceptedFileTypes bir metin dizisi olmalıdır.');
  if (value.length > ASSIGNMENT_LIMITS.acceptedFileTypesCountMax) {
    throw validation(`acceptedFileTypes en fazla ${ASSIGNMENT_LIMITS.acceptedFileTypesCountMax} öğe içerebilir.`);
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      throw validation('acceptedFileTypes yalnızca boş olmayan metinler içerebilir.');
    }
    const normalized = item.trim().toLowerCase().replace(/^\./, '');
    if (normalized.length > ASSIGNMENT_LIMITS.acceptedFileTypeMax) {
      throw validation(`acceptedFileTypes öğeleri en fazla ${ASSIGNMENT_LIMITS.acceptedFileTypeMax} karakter olabilir.`);
    }
    seen.add(normalized);
  }
  return [...seen];
}

/** Ödev ayarlarını (oluşturma gövdesi ya da PATCH birleşimi) doğrular. */
export function normalizeAssignmentInput(raw: RawAssignmentInput): AssignmentSettings {
  if (typeof raw.title !== 'string') throw validation('title zorunludur.');
  const title = raw.title.trim();
  if (title.length < 1 || title.length > ASSIGNMENT_LIMITS.title) {
    throw validation(`title 1 ile ${ASSIGNMENT_LIMITS.title} karakter arasında olmalıdır.`);
  }

  const dueAt = requiredInstant(raw.dueAt, 'dueAt');
  const availableFrom = optionalInstant(raw.availableFrom, 'availableFrom');
  if (availableFrom && availableFrom.getTime() >= dueAt.getTime()) {
    throw validation('availableFrom, dueAt\'ten önce olmalıdır.');
  }

  const latePenaltyPercent = optionalInt(raw.latePenaltyPercent, 'latePenaltyPercent', 0, 100);
  const maxScore = optionalInt(raw.maxScore, 'maxScore', 1, ASSIGNMENT_LIMITS.maxScoreMax) ?? 100;

  return {
    title,
    description: optionalString(raw.description, 'description', ASSIGNMENT_LIMITS.description),
    type: oneOf(raw.type, ASSIGNMENT_TYPES, 'type', 'HOMEWORK'),
    status: oneOf(raw.status, ASSIGNMENT_STATUSES, 'status', 'DRAFT'),
    dueAt,
    availableFrom,
    allowLateSubmission: bool(raw.allowLateSubmission, 'allowLateSubmission', true),
    latePenaltyPercent,
    maxScore,
    attachmentUrl: optionalString(raw.attachmentUrl, 'attachmentUrl', 2000),
    attachmentName: optionalString(raw.attachmentName, 'attachmentName', 255),
    acceptedFileTypes: parseAcceptedFileTypes(raw.acceptedFileTypes),
  };
}

type StoredSettings = Omit<AssignmentSettings, 'type' | 'status' | 'acceptedFileTypes'> & {
  type: string;
  status: string;
  acceptedFileTypes: string; // CSV
};

/** Mevcut kaydı PATCH birleşimi için API'nin kullandığı ham biçime çevirir. */
export function toRawInput(assignment: StoredSettings): Record<(typeof ASSIGNMENT_SETTING_FIELDS)[number], unknown> {
  return {
    title: assignment.title,
    description: assignment.description,
    type: assignment.type,
    status: assignment.status,
    dueAt: assignment.dueAt.toISOString(),
    availableFrom: assignment.availableFrom?.toISOString() ?? null,
    allowLateSubmission: assignment.allowLateSubmission,
    latePenaltyPercent: assignment.latePenaltyPercent,
    maxScore: assignment.maxScore,
    attachmentUrl: assignment.attachmentUrl,
    attachmentName: assignment.attachmentName,
    acceptedFileTypes: assignment.acceptedFileTypes === '' ? [] : assignment.acceptedFileTypes.split(','),
  };
}

export function acceptedFileTypesToCsv(types: string[]): string {
  return types.join(',');
}

export function acceptedFileTypesFromCsv(csv: string): string[] {
  return csv === '' ? [] : csv.split(',');
}

/**
 * Öğrencinin kendi görünümünde teslim durumu (FR-66):
 * PENDING  = teslim yok, hâlâ teslim alınabilir
 * LATE     = teslim yok, süre geçti ve geç teslime kapalı
 * SUBMITTED = teslim var, henüz notlandırılmadı
 * GRADED   = teslim var ve notlandırıldı
 */
export function myAssignmentStatus(
  assignment: { dueAt: Date; allowLateSubmission: boolean },
  submission: { score: number | null } | null,
  now: Date,
): MyAssignmentStatus {
  if (submission) return submission.score === null ? 'SUBMITTED' : 'GRADED';
  const pastDue = now.getTime() > assignment.dueAt.getTime();
  if (pastDue && !assignment.allowLateSubmission) return 'LATE';
  return 'PENDING';
}
