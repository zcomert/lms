import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import { parseCommentBody } from '../lib/comments.js';

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  userId: string;
  user: { id: string; name: string; avatarUrl: string | null };
};

/** Yorumu yazarı ya da kursu yöneten (eğitmen/yönetici) silebilir. */
function toPublicComment(row: CommentRow, viewerId: string, canManage: boolean) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: row.user,
    canDelete: canManage || row.userId === viewerId,
  };
}

export function registerCommentRoutes(app: FastifyInstance) {
  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const canManage = await canManageCourse(user, lesson.module.courseId);
      if (!canManage) {
        await assertEnrolled(user.userId, lesson.module.courseId);
      }
      const rows = await prisma.lessonComment.findMany({
        where: { lessonId: lesson.id },
        orderBy: { createdAt: 'desc' },
        select: commentSelect,
      });
      return { comments: rows.map((row) => toPublicComment(row, user.userId, canManage)) };
    },
  );

  app.post<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const canManage = await canManageCourse(user, lesson.module.courseId);
      if (!canManage) {
        await assertEnrolled(user.userId, lesson.module.courseId);
      }

      const parsed = parseCommentBody(request.body);
      if (!parsed.ok) {
        throw new AppError(parsed.code, parsed.message, parsed.code === 'INAPPROPRIATE_CONTENT' ? 422 : 400);
      }

      const row = await prisma.lessonComment.create({
        data: { userId: user.userId, lessonId: lesson.id, body: parsed.body },
        select: commentSelect,
      });
      reply.status(201);
      return { comment: toPublicComment(row, user.userId, canManage) };
    },
  );

  app.delete<{ Params: { lessonId: string; commentId: string } }>(
    '/api/v1/lessons/:lessonId/comments/:commentId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const comment = await prisma.lessonComment.findFirst({
        where: { id: request.params.commentId, lessonId: lesson.id },
        select: { id: true, userId: true },
      });
      if (!comment) {
        throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
      }
      if (comment.userId !== user.userId && !(await canManageCourse(user, lesson.module.courseId))) {
        throw new AppError('FORBIDDEN', 'Bu yorumu silme yetkiniz yok.', 403);
      }
      await prisma.lessonComment.delete({ where: { id: comment.id } });
      return { deleted: true };
    },
  );
}
