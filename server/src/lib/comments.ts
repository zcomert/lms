import { prisma } from './prisma.js';
import { AppError } from '../errors.js';
import { assertEnrolled } from './lessonAccess.js';
import { canManageCourse } from './courseAccess.js';

export const REACTION_KEYS = ['like', 'love', 'insightful', 'celebrate'] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];
export type CommentAuthorRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export const MAX_COMMENT_LENGTH = 2000;

export function isReactionKey(value: unknown): value is ReactionKey {
  return typeof value === 'string' && (REACTION_KEYS as readonly string[]).includes(value);
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatarUrl: string | null; role: CommentAuthorRole };
  canDelete: boolean;
  reactions: Record<ReactionKey, { count: number; mine: boolean }>;
}

export const commentInclude = {
  user: { select: { id: true, name: true, avatarUrl: true, roles: true } },
  reactions: { select: { userId: true, emoji: true } },
} as const;

interface CommentRow {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  user: { id: string; name: string; avatarUrl: string | null; roles: string };
  reactions: { userId: string; emoji: string }[];
}

export function parseCommentBody(body: unknown): string {
  const raw = (body as { body?: unknown } | undefined)?.body;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw new AppError('VALIDATION_ERROR', 'Yorum boş olamaz.', 400);
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new AppError('VALIDATION_ERROR', 'Yorum en fazla 2000 karakter olabilir.', 400);
  }
  return text;
}

function authorRole(roles: string, userId: string, instructorIds: Set<string>): CommentAuthorRole {
  const list = roles.split(',').map((r) => r.trim());
  if (list.includes('ADMIN')) return 'ADMIN';
  if (instructorIds.has(userId) || list.includes('INSTRUCTOR')) return 'INSTRUCTOR';
  return 'STUDENT';
}

/** Kurs eğitmenleri tek sorguda alınır; yorumlar bellekte DTO'ya çevrilir. */
export async function toCommentDTOs(
  rows: CommentRow[],
  courseId: string,
  viewerId: string,
  managesCourse: boolean,
): Promise<CommentDTO[]> {
  const assigned = await prisma.courseInstructor.findMany({ where: { courseId }, select: { userId: true } });
  const instructorIds = new Set(assigned.map((a) => a.userId));
  return rows.map((row) => {
    const reactions = Object.fromEntries(
      REACTION_KEYS.map((key) => [key, { count: 0, mine: false }]),
    ) as CommentDTO['reactions'];
    for (const r of row.reactions) {
      if (!isReactionKey(r.emoji)) continue;
      reactions[r.emoji].count += 1;
      if (r.userId === viewerId) reactions[r.emoji].mine = true;
    }
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.user.id,
        name: row.user.name,
        avatarUrl: row.user.avatarUrl,
        role: authorRole(row.user.roles, row.userId, instructorIds),
      },
      canDelete: row.userId === viewerId || managesCourse,
      reactions,
    };
  });
}

/** Yönetici ise true döner; değilse kayıt zorunlu (403 NOT_ENROLLED). */
export async function resolveCommentAccess(
  user: { userId: string; role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' },
  courseId: string,
): Promise<boolean> {
  const manages = await canManageCourse(user, courseId);
  if (!manages) await assertEnrolled(user.userId, courseId);
  return manages;
}
