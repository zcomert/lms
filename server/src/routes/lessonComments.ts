import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import { buildCommentTree, parseCommentBody, toCommentNode } from '../lib/lessonComments.js';

const authorSelect = { select: { id: true, name: true, avatarUrl: true, role: true } } as const;

async function loadComment(id: string) {
  const comment = await prisma.lessonComment.findUnique({
    where: { id },
    include: { user: authorSelect, lesson: { include: { module: true } } },
  });
  if (!comment) {
    throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
  }
  return comment;
}

export function registerLessonCommentRoutes(app: FastifyInstance) {
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
        include: { user: authorSelect },
        orderBy: { createdAt: 'asc' },
      });
      return { comments: buildCommentTree(rows, user.userId, canManage) };
    },
  );

  app.post<{ Params: { lessonId: string }; Body: { body?: unknown; parentId?: unknown } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      const canManage = await canManageCourse(user, courseId);
      if (!canManage) await assertEnrolled(user.userId, courseId);

      const payload = (request.body ?? {}) as { body?: unknown; parentId?: unknown };
      const parsed = parseCommentBody(payload.body);
      if (!parsed.ok) {
        throw new AppError('VALIDATION_ERROR', parsed.message, 400);
      }

      let parentId: string | null = null;
      if (payload.parentId !== undefined && payload.parentId !== null) {
        if (typeof payload.parentId !== 'string') {
          throw new AppError('VALIDATION_ERROR', 'Geçersiz üst yorum.', 400);
        }
        const parent = await prisma.lessonComment.findUnique({ where: { id: payload.parentId } });
        if (!parent || parent.lessonId !== lesson.id) {
          throw new AppError('NOT_FOUND', 'Üst yorum bulunamadı.', 404);
        }
        // Tek kademe: cevaba verilen cevap köke bağlanır.
        parentId = parent.parentId ?? parent.id;
      }

      const row = await prisma.lessonComment.create({
        data: { lessonId: lesson.id, userId: user.userId, parentId, body: parsed.body },
        include: { user: authorSelect },
      });
      reply.status(201);
      return { comment: toCommentNode(row, user.userId, canManage) };
    },
  );

  app.patch<{ Params: { id: string }; Body: { body?: unknown } }>(
    '/api/v1/lesson-comments/:id',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const comment = await loadComment(request.params.id);
      if (comment.userId !== user.userId) {
        throw new AppError('FORBIDDEN', 'Yalnızca kendi yorumunuzu düzenleyebilirsiniz.', 403);
      }
      const parsed = parseCommentBody(((request.body ?? {}) as { body?: unknown }).body);
      if (!parsed.ok) {
        throw new AppError('VALIDATION_ERROR', parsed.message, 400);
      }
      const canManage = await canManageCourse(user, comment.lesson.module.courseId);
      const row = await prisma.lessonComment.update({
        where: { id: comment.id },
        data: { body: parsed.body, editedAt: new Date() },
        include: { user: authorSelect },
      });
      return { comment: toCommentNode(row, user.userId, canManage) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/lesson-comments/:id',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const comment = await loadComment(request.params.id);
      if (
        comment.userId !== user.userId &&
        !(await canManageCourse(user, comment.lesson.module.courseId))
      ) {
        throw new AppError('FORBIDDEN', 'Bu yorumu silme yetkiniz yok.', 403);
      }
      // Cevaplar veritabanında ON DELETE CASCADE ile silinir.
      await prisma.lessonComment.delete({ where: { id: comment.id } });
      return { ok: true };
    },
  );
}
