import { AppError } from '../errors.js';
import { parseDateTime } from './calendar.js';

export const ANNOUNCEMENT_CATEGORIES = ['ACADEMIC', 'COURSE', 'IT', 'EVENT', 'GENERAL'] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/** Türetilmiş yaşam döngüsü durumu (saklanmaz). */
export const ANNOUNCEMENT_STATES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED'] as const;
export type AnnouncementState = (typeof ANNOUNCEMENT_STATES)[number];

export const MAX_TITLE = 200;
export const MAX_BODY = 10000;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

/** `<harf`, `</harf` veya `<!--` ile başlayan etiket benzeri yapılar; "a < b" gibi düz `<` eşleşmez. */
const HTML_TAG_LIKE = /<\/?[A-Za-z]|<!--/;

function validation(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, 400);
}

export interface RawAnnouncementInput {
  title?: unknown;
  body?: unknown;
  category?: unknown;
  status?: unknown;
  publishAt?: unknown;
  expiresAt?: unknown;
  pinned?: unknown;
  courseId?: unknown;
}

export interface AnnouncementData {
  title: string;
  body: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  publishAt: Date | null;
  expiresAt: Date | null;
  pinned: boolean;
  courseId: string | null;
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw validation(`${field} zorunludur.`);
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw validation(`${field} 1 ile ${max} karakter arasında olmalıdır.`);
  }
  return trimmed;
}

function optionalInstant(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  const date = parseDateTime(value);
  if (!date) throw validation(`${field} ofset veya Z içeren ISO tarih-saat olmalıdır.`);
  return date;
}

/**
 * Ham girdiyi (oluşturma gövdesi ya da PATCH birleşimi) doğrular ve saklanacak biçime çevirir.
 * PUBLISHED iken publishAt verilmemişse `now` kullanılır (hemen yayın). Taslakta publishAt
 * planlanan tarih olarak korunur. expiresAt verilirse etkin yayın anından sonra olmalıdır.
 */
export function normalizeAnnouncementInput(raw: RawAnnouncementInput, now: Date): AnnouncementData {
  const title = requiredText(raw.title, 'title', MAX_TITLE);
  // Gövde sınırlı bir Markdown alt kümesidir; satır/paragraf yapısı korunur, yalnızca baş/son boşluk kırpılır.
  const body = requiredText(raw.body, 'body', MAX_BODY);
  if (HTML_TAG_LIKE.test(body)) {
    throw validation('body ham HTML etiketi içeremez; yalnızca Markdown biçimlendirmesi kullanın.');
  }

  const category = raw.category === undefined || raw.category === null ? 'GENERAL' : raw.category;
  if (typeof category !== 'string' || !(ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(category)) {
    throw validation(`category şunlardan biri olmalıdır: ${ANNOUNCEMENT_CATEGORIES.join(', ')}.`);
  }

  const status = raw.status === undefined || raw.status === null ? 'DRAFT' : raw.status;
  if (typeof status !== 'string' || !(ANNOUNCEMENT_STATUSES as readonly string[]).includes(status)) {
    throw validation(`status şunlardan biri olmalıdır: ${ANNOUNCEMENT_STATUSES.join(', ')}.`);
  }

  const pinned = raw.pinned === undefined || raw.pinned === null ? false : raw.pinned;
  if (typeof pinned !== 'boolean') throw validation('pinned boolean olmalıdır.');

  let courseId: string | null = null;
  if (raw.courseId !== undefined && raw.courseId !== null) {
    if (typeof raw.courseId !== 'string' || raw.courseId === '') {
      throw validation('courseId geçerli bir kurs kimliği veya null olmalıdır.');
    }
    courseId = raw.courseId;
  }

  let publishAt = optionalInstant(raw.publishAt, 'publishAt');
  if (status === 'PUBLISHED' && publishAt === null) publishAt = now;
  const expiresAt = optionalInstant(raw.expiresAt, 'expiresAt');
  if (expiresAt && expiresAt.getTime() <= (publishAt ?? now).getTime()) {
    throw validation('expiresAt, yayın tarihinden sonra olmalıdır.');
  }

  return {
    title,
    body,
    category: category as AnnouncementCategory,
    status: status as AnnouncementStatus,
    publishAt,
    expiresAt,
    pinned,
    courseId,
  };
}

export interface StoredAnnouncement {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  publishAt: Date | null;
  expiresAt: Date | null;
  pinned: boolean;
  courseId: string | null;
  course: { id: string; title: string } | null;
  author: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Mevcut kaydı PATCH birleşimi için API'nin kullandığı ham biçime çevirir. */
export function toRawInput(announcement: StoredAnnouncement): Required<RawAnnouncementInput> {
  return {
    title: announcement.title,
    body: announcement.body,
    category: announcement.category,
    status: announcement.status,
    publishAt: announcement.publishAt?.toISOString() ?? null,
    expiresAt: announcement.expiresAt?.toISOString() ?? null,
    pinned: announcement.pinned,
    courseId: announcement.courseId,
  };
}

export function announcementState(
  announcement: Pick<StoredAnnouncement, 'status' | 'publishAt' | 'expiresAt'>,
  now: Date,
): AnnouncementState {
  if (announcement.status !== 'PUBLISHED' || !announcement.publishAt) return 'DRAFT';
  if (announcement.publishAt.getTime() > now.getTime()) return 'SCHEDULED';
  if (announcement.expiresAt && announcement.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  return 'PUBLISHED';
}

/** Okuyucuya şu an görünen duyurular için Prisma where parçası. */
export function liveWhere(now: Date) {
  return {
    status: 'PUBLISHED',
    publishAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/** ADMIN her duyuruyu, aktif rolü INSTRUCTOR olan eğitmen yalnızca atandığı kursun duyurusunu düzenler. */
export function canEditAnnouncement(
  viewer: { role: string },
  courseId: string | null,
  assignedCourseIds: ReadonlySet<string>,
): boolean {
  if (viewer.role === 'ADMIN') return true;
  return viewer.role === 'INSTRUCTOR' && courseId !== null && assignedCourseIds.has(courseId);
}

export function serializeAnnouncement(announcement: StoredAnnouncement, now: Date, canEdit: boolean) {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    category: announcement.category,
    status: announcement.status,
    state: announcementState(announcement, now),
    publishAt: announcement.publishAt?.toISOString() ?? null,
    expiresAt: announcement.expiresAt?.toISOString() ?? null,
    pinned: announcement.pinned,
    course: announcement.course ? { id: announcement.course.id, title: announcement.course.title } : null,
    author: announcement.author ? { id: announcement.author.id, name: announcement.author.name } : null,
    createdAt: announcement.createdAt.toISOString(),
    updatedAt: announcement.updatedAt.toISOString(),
    canEdit,
  };
}
