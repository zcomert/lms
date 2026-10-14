import { AppError } from '../errors.js';
import { prisma } from './prisma.js';
import { canManageCourse, isEnrolled, assertCanRead } from './courseAccess.js';
import { roundAverage } from './feedback.js';
import type { TokenPayload } from './jwt.js';

/** Ders yorumları + kurs değerlendirmeleri için ortak yardımcılar. */

export const MAX_BODY_LENGTH = 2000;

export type CommentUser = Pick<TokenPayload, 'userId' | 'role'>;

export const authorSelect = { select: { id: true, name: true, avatarUrl: true } } as const;

export interface CommentAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export type ReplyRole = 'INSTRUCTOR' | 'ADMIN';

function validation(message: string): never {
  throw new AppError('VALIDATION_ERROR', message, 400);
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    validation('Geçersiz istek gövdesi.');
  }
  return body as Record<string, unknown>;
}

/** Zorunlu metin: string, trim sonrası 1–2000 karakter. */
export function parseRequiredBody(body: unknown): string {
  const raw = asObject(body).body;
  if (typeof raw !== 'string') validation('Metin (body) zorunludur.');
  const text = (raw as string).trim();
  if (text.length < 1) validation('Metin boş olamaz.');
  if (text.length > MAX_BODY_LENGTH) validation(`Metin en fazla ${MAX_BODY_LENGTH} karakter olabilir.`);
  return text;
}

/** Opsiyonel metin: yok/null/boş → null. `undefined` yalnızca alan hiç gönderilmediyse döner. */
function parseOptionalText(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') validation('Metin (body) bir string olmalıdır.');
  const text = (raw as string).trim();
  if (text.length > MAX_BODY_LENGTH) validation(`Metin en fazla ${MAX_BODY_LENGTH} karakter olabilir.`);
  return text === '' ? null : text;
}

function parseRating(raw: unknown): number {
  if (!(typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 5)) {
    validation('rating 1 ile 5 arasında bir tam sayı olmalıdır.');
  }
  return raw as number;
}

export function parseReviewCreate(body: unknown): { rating: number; body: string | null } {
  const raw = asObject(body);
  if (raw.rating === undefined) validation('rating zorunludur.');
  return { rating: parseRating(raw.rating), body: parseOptionalText(raw.body) ?? null };
}

export function parseReviewPatch(body: unknown): { rating?: number; body?: string | null } {
  const raw = asObject(body);
  const patch: { rating?: number; body?: string | null } = {};
  if (raw.rating !== undefined) patch.rating = parseRating(raw.rating);
  const text = parseOptionalText(raw.body);
  if (text !== undefined) patch.body = text;
  if (patch.rating === undefined && patch.body === undefined) {
    validation('rating veya body alanlarından en az biri gönderilmelidir.');
  }
  return patch;
}

/** Yanıt yazarı rolü: yalnızca aktif rol (INSTRUCTOR | ADMIN). */
export function replyRole(user: CommentUser): ReplyRole {
  return user.role === 'ADMIN' ? 'ADMIN' : 'INSTRUCTOR';
}

export { isEnrolled, assertCanRead };

export function assertReplyAllowed(canManage: boolean) {
  if (!canManage) {
    throw new AppError('FORBIDDEN', 'Yalnızca kursun eğitmenleri ve yöneticiler yanıt verebilir.', 403);
  }
}

export function assertAuthor(authorId: string, user: CommentUser) {
  if (authorId !== user.userId) {
    throw new AppError('FORBIDDEN', 'Yalnızca kendi yorumunuzu düzenleyebilirsiniz.', 403);
  }
}

export async function assertCanDelete(authorId: string, user: CommentUser, courseId: string) {
  if (authorId === user.userId) return;
  if (!(await canManageCourse(user, courseId))) {
    throw new AppError('FORBIDDEN', 'Bu yorumu silme yetkiniz yok.', 403);
  }
}

interface ReplyRow {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  authorId: string;
  authorRole: string | null;
  author: CommentAuthor;
}

export function serializeReply(row: ReplyRow, user: CommentUser, canManage: boolean) {
  const own = row.authorId === user.userId;
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    author: { id: row.author.id, name: row.author.name, avatarUrl: row.author.avatarUrl },
    authorRole: (row.authorRole === 'ADMIN' ? 'ADMIN' : 'INSTRUCTOR') as ReplyRole,
    canEdit: own,
    canDelete: own || canManage,
  };
}

export function serializeComment(
  row: ReplyRow & { replies: ReplyRow[] },
  user: CommentUser,
  canManage: boolean,
) {
  const own = row.authorId === user.userId;
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    author: { id: row.author.id, name: row.author.name, avatarUrl: row.author.avatarUrl },
    canEdit: own,
    canDelete: own || canManage,
    replies: row.replies.map((r) => serializeReply(r, user, canManage)),
  };
}

interface ReviewRow {
  id: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  editedAt: Date | null;
  userId: string;
  user: CommentAuthor;
  replies: ReplyRow[];
}

export function serializeReview(row: ReviewRow, user: CommentUser, canManage: boolean) {
  const own = row.userId === user.userId;
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    author: { id: row.user.id, name: row.user.name, avatarUrl: row.user.avatarUrl },
    canEdit: own,
    canDelete: own || canManage,
    replies: row.replies.map((r) => serializeReply(r, user, canManage)),
  };
}

export async function buildReviewSummary(courseId: string) {
  const groups = await prisma.courseReview.groupBy({
    by: ['rating'],
    where: { courseId },
    _count: { _all: true },
  });
  const distribution: Record<'1' | '2' | '3' | '4' | '5', number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let count = 0;
  let sum = 0;
  for (const g of groups) {
    const key = String(g.rating) as keyof typeof distribution;
    if (key in distribution) distribution[key] += g._count._all;
    count += g._count._all;
    sum += g.rating * g._count._all;
  }
  return { ratingAverage: roundAverage(sum, count), ratingCount: count, distribution };
}
