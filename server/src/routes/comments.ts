import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { loadPublishedLesson } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import {
  commentInclude,
  isReactionKey,
  parseCommentBody,
  resolveCommentAccess,
  toCommentDTOs,
} from '../lib/comments.js';

async function loadComment(commentId: string) {
  const comment = await prisma.lessonComment.findUnique({
    where: { id: commentId },
    include: { ...commentInclude, lesson: { select: { module: { select: { courseId: true } } } } },
  });
  if (!comment) throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
  return { comment, courseId: comment.lesson.module.courseId };
}

export function registerCommentRoutes(app: FastifyInstance) {
  app.get<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      const manages = await resolveCommentAccess(user, courseId);
      const rows = await prisma.lessonComment.findMany({
        where: { lessonId: lesson.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: commentInclude,
      });
      return { comments: await toCommentDTOs(rows, courseId, user.userId, manages) };
    },
  );

  app.post<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      const courseId = lesson.module.courseId;
      const manages = await resolveCommentAccess(user, courseId);
      const body = parseCommentBody(request.body);
      const created = await prisma.lessonComment.create({
        data: { lessonId: lesson.id, userId: user.userId, body },
        include: commentInclude,
      });
      const [comment] = await toCommentDTOs([created], courseId, user.userId, manages);
      return { comment };
    },
  );

  app.delete<{ Params: { commentId: string } }>(
    '/api/v1/comments/:commentId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const { comment, courseId } = await loadComment(request.params.commentId);
      if (comment.userId !== user.userId && !(await canManageCourse(user, courseId))) {
        throw new AppError('FORBIDDEN', 'Bu yorumu silemezsiniz.', 403);
      }
      await prisma.lessonComment.deleteMany({ where: { id: comment.id } });
      return { ok: true };
    },
  );

  app.put<{ Params: { commentId: string } }>(
    '/api/v1/comments/:commentId/reactions',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const { comment, courseId } = await loadComment(request.params.commentId);
      const manages = await resolveCommentAccess(user, courseId);

      const { emoji, active } = (request.body ?? {}) as { emoji?: unknown; active?: unknown };
      if (!isReactionKey(emoji) || typeof active !== 'boolean') {
        throw new AppError('VALIDATION_ERROR', 'Geçersiz tepki.', 400);
      }
      if (active) {
        await prisma.commentReaction.upsert({
          where: { commentId_userId_emoji: { commentId: comment.id, userId: user.userId, emoji } },
          create: { commentId: comment.id, userId: user.userId, emoji },
          update: {},
        });
      } else {
        await prisma.commentReaction.deleteMany({
          where: { commentId: comment.id, userId: user.userId, emoji },
        });
      }
      const fresh = await prisma.lessonComment.findUnique({
        where: { id: comment.id },
        include: commentInclude,
      });
      if (!fresh) throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
      const [dto] = await toCommentDTOs([fresh], courseId, user.userId, manages);
      return { comment: dto };
    },
  );
}
