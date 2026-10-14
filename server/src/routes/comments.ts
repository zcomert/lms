import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import { groupComments, parseCommentBody, type FlatComment } from '../lib/comments.js';

const authorSelect = { select: { id: true, name: true, avatarUrl: true } } as const;

function toAuthor(user: { id: string; name: string; avatarUrl: string | null }) {
  return { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
}

export function registerCommentRoutes(app: FastifyInstance) {
  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      if (!(await canManageCourse(user, courseId))) {
        await assertEnrolled(user.userId, courseId);
      }

      const rows = await prisma.lessonComment.findMany({
        where: { lessonId: lesson.id },
        select: { id: true, body: true, parentId: true, createdAt: true, user: authorSelect },
      });
      const flat: FlatComment[] = rows.map((row) => ({
        id: row.id,
        body: row.body,
        author: toAuthor(row.user),
        createdAt: row.createdAt,
        parentId: row.parentId,
      }));
      const grouped = groupComments(flat);
      return {
        comments: grouped.map((comment) => ({
          ...comment,
          createdAt: comment.createdAt.toISOString(),
          replies: comment.replies.map((reply) => ({ ...reply, createdAt: reply.createdAt.toISOString() })),
        })),
      };
    },
  );

  app.post<{ Params: { lessonId: string }; Body: unknown }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      if (!(await canManageCourse(user, courseId))) {
        await assertEnrolled(user.userId, courseId);
      }

      const parsed = parseCommentBody(request.body);
      if (!parsed.ok) {
        throw new AppError('VALIDATION_ERROR', parsed.message, 400);
      }
      const { body, parentId } = parsed.parsed;

      if (parentId !== null) {
        const parent = await prisma.lessonComment.findUnique({
          where: { id: parentId },
          select: { lessonId: true, parentId: true },
        });
        if (!parent) {
          throw new AppError('COMMENT_NOT_FOUND', 'Yanıtlanan yorum bulunamadı.', 404);
        }
        if (parent.lessonId !== lesson.id) {
          throw new AppError('INVALID_PARENT', 'Yorum bu derse ait değil.', 400);
        }
        if (parent.parentId !== null) {
          throw new AppError('INVALID_PARENT', 'Yalnızca üst seviye yorumlar yanıtlanabilir.', 400);
        }
      }

      const created = await prisma.lessonComment.create({
        data: { lessonId: lesson.id, userId: user.userId, body, parentId },
        select: { id: true, body: true, parentId: true, createdAt: true, user: authorSelect },
      });

      reply.status(201);
      return {
        comment: {
          id: created.id,
          body: created.body,
          author: toAuthor(created.user),
          createdAt: created.createdAt.toISOString(),
          parentId: created.parentId,
        },
      };
    },
  );
}
