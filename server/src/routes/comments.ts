import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import { parseCommentBody } from '../lib/comments.js';

type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  user: { id: string; name: string };
};

function serialize(row: CommentRow, viewerId: string, canManage: boolean) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { id: row.user.id, name: row.user.name },
    canDelete: canManage || row.user.id === viewerId,
  };
}

const include = { user: { select: { id: true, name: true } } } as const;

export function registerCommentRoutes(app: FastifyInstance) {
  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      const canManage = await canManageCourse(user, courseId);
      if (!canManage) await assertEnrolled(user.userId, courseId);
      const rows = await prisma.lessonComment.findMany({
        where: { lessonId: lesson.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include,
      });
      return { comments: rows.map((r) => serialize(r, user.userId, canManage)) };
    },
  );

  app.post<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      const canManage = await canManageCourse(user, courseId);
      if (!canManage) await assertEnrolled(user.userId, courseId);
      const parsed = parseCommentBody(request.body);
      if (!parsed.ok) throw new AppError('VALIDATION_ERROR', parsed.message, 400);
      const row = await prisma.lessonComment.create({
        data: { lessonId: lesson.id, userId: user.userId, body: parsed.body },
        include,
      });
      return reply.code(201).send({ comment: serialize(row, user.userId, canManage) });
    },
  );

  app.delete<{ Params: { lessonId: string; commentId: string } }>(
    '/api/v1/lessons/:lessonId/comments/:commentId',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const comment = await prisma.lessonComment.findUnique({
        where: { id: request.params.commentId },
        select: { id: true, lessonId: true, userId: true },
      });
      if (!comment || comment.lessonId !== lesson.id) {
        throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
      }
      if (comment.userId !== user.userId && !(await canManageCourse(user, lesson.module.courseId))) {
        throw new AppError('FORBIDDEN', 'Bu yorumu silme yetkiniz yok.', 403);
      }
      await prisma.lessonComment.deleteMany({ where: { id: comment.id } });
      return reply.code(204).send();
    },
  );
}
