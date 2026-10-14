import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import {
  assertAuthor,
  assertCanDelete,
  assertCanRead,
  assertReplyAllowed,
  authorSelect,
  isEnrolled,
  parseRequiredBody,
  replyRole,
  serializeComment,
  serializeReply,
} from '../lib/comments.js';

const repliesInclude = {
  orderBy: { createdAt: 'asc' },
  include: { author: authorSelect },
} as const;

async function loadComment(commentId: string) {
  const comment = await prisma.lessonComment.findUnique({
    where: { id: commentId },
    include: { lesson: { include: { module: true } } },
  });
  if (!comment) throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
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
      const manage = await assertCanRead(user, courseId);
      const rows = await prisma.lessonComment.findMany({
        where: { lessonId: lesson.id, parentId: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { author: authorSelect, replies: repliesInclude },
      });
      return {
        comments: rows.map((r) => serializeComment(r, user, manage)),
        permissions: { canComment: await isEnrolled(user.userId, courseId), canReply: manage },
      };
    },
  );

  app.post<{ Params: { lessonId: string } }>(
    '/api/v1/lessons/:lessonId/comments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const lesson = await loadPublishedLesson(request.params.lessonId);
      await assertEnrolled(user.userId, lesson.module.courseId);
      const body = parseRequiredBody(request.body);
      const row = await prisma.lessonComment.create({
        data: { lessonId: lesson.id, authorId: user.userId, body },
        include: { author: authorSelect, replies: repliesInclude },
      });
      const manage = await canManageCourse(user, lesson.module.courseId);
      reply.status(201);
      return { comment: serializeComment(row, user, manage) };
    },
  );

  app.post<{ Params: { commentId: string } }>(
    '/api/v1/lesson-comments/:commentId/replies',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const target = await loadComment(request.params.commentId);
      if (target.lesson.status !== 'PUBLISHED') throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
      assertReplyAllowed(await canManageCourse(user, target.lesson.module.courseId));
      if (target.parentId) {
        throw new AppError('REPLY_DEPTH_EXCEEDED', 'Yanıtlara yanıt verilemez.', 400);
      }
      const body = parseRequiredBody(request.body);
      const row = await prisma.lessonComment.create({
        data: {
          lessonId: target.lessonId,
          authorId: user.userId,
          parentId: target.id,
          authorRole: replyRole(user),
          body,
        },
        include: { author: authorSelect },
      });
      reply.status(201);
      return { reply: serializeReply(row, user, true) };
    },
  );

  app.patch<{ Params: { commentId: string } }>(
    '/api/v1/lesson-comments/:commentId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const target = await loadComment(request.params.commentId);
      if (target.lesson.status !== 'PUBLISHED') throw new AppError('NOT_FOUND', 'Yorum bulunamadı.', 404);
      const courseId = target.lesson.module.courseId;
      const manage = await assertCanRead(user, courseId);
      assertAuthor(target.authorId, user);
      const body = parseRequiredBody(request.body);
      const row = await prisma.lessonComment.update({
        where: { id: target.id },
        data: { body, editedAt: new Date() },
        include: { author: authorSelect, replies: repliesInclude },
      });
      return target.parentId
        ? { reply: serializeReply(row, user, manage) }
        : { comment: serializeComment(row, user, manage) };
    },
  );

  app.delete<{ Params: { commentId: string } }>(
    '/api/v1/lesson-comments/:commentId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const target = await loadComment(request.params.commentId);
      await assertCanDelete(target.authorId, user, target.lesson.module.courseId);
      await prisma.lessonComment.deleteMany({ where: { id: target.id } });
      return { success: true };
    },
  );
}
