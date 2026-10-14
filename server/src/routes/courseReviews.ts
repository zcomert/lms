import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled } from '../lib/lessonAccess.js';
import { canManageCourse } from '../lib/courseAccess.js';
import {
  assertAuthor,
  assertCanDelete,
  assertCanRead,
  assertReplyAllowed,
  authorSelect,
  buildReviewSummary,
  isEnrolled,
  parseRequiredBody,
  parseReviewCreate,
  parseReviewPatch,
  replyRole,
  serializeReply,
  serializeReview,
} from '../lib/comments.js';

const reviewInclude = {
  user: authorSelect,
  replies: { orderBy: { createdAt: 'asc' }, include: { author: authorSelect } },
} as const;

async function loadVisibleCourse(courseId: string, user: { userId: string; role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN' }) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, status: true } });
  if (!course) throw new AppError('NOT_FOUND', 'Kurs bulunamadı.', 404);
  if (course.status !== 'PUBLISHED' && !(await canManageCourse(user, courseId))) {
    throw new AppError('NOT_FOUND', 'Kurs bulunamadı.', 404);
  }
  return course;
}

async function loadReview(reviewId: string) {
  const review = await prisma.courseReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new AppError('NOT_FOUND', 'Değerlendirme bulunamadı.', 404);
  return review;
}

async function loadReply(replyId: string) {
  const reply = await prisma.courseReviewReply.findUnique({
    where: { id: replyId },
    include: { review: { select: { courseId: true } } },
  });
  if (!reply) throw new AppError('NOT_FOUND', 'Yanıt bulunamadı.', 404);
  return reply;
}

export function registerCourseReviewRoutes(app: FastifyInstance) {
  app.get<{ Params: { courseId: string } }>(
    '/api/v1/courses/:courseId/reviews',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const course = await loadVisibleCourse(request.params.courseId, user);
      const manage = await assertCanRead(user, course.id);
      const [rows, summary, mineRow, enrolled] = await Promise.all([
        prisma.courseReview.findMany({
          where: { courseId: course.id },
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: reviewInclude,
        }),
        buildReviewSummary(course.id),
        prisma.courseReview.findUnique({
          where: { courseId_userId: { courseId: course.id, userId: user.userId } },
          include: reviewInclude,
        }),
        isEnrolled(user.userId, course.id),
      ]);
      return {
        summary,
        reviews: rows.map((r) => serializeReview(r, user, manage)),
        mine: mineRow ? serializeReview(mineRow, user, manage) : null,
        permissions: { canReview: enrolled && !mineRow, canReply: manage },
      };
    },
  );

  app.post<{ Params: { courseId: string } }>(
    '/api/v1/courses/:courseId/reviews',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const course = await loadVisibleCourse(request.params.courseId, user);
      await assertEnrolled(user.userId, course.id);
      const data = parseReviewCreate(request.body);
      const exists = () => new AppError('REVIEW_EXISTS', 'Bu kursu zaten değerlendirdiniz.', 409);
      if (await prisma.courseReview.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: user.userId } },
        select: { id: true },
      })) {
        throw exists();
      }
      let row;
      try {
        row = await prisma.courseReview.create({
          data: { courseId: course.id, userId: user.userId, ...data },
          include: reviewInclude,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw exists();
        throw err;
      }
      const manage = await canManageCourse(user, course.id);
      reply.status(201);
      return { review: serializeReview(row, user, manage), summary: await buildReviewSummary(course.id) };
    },
  );

  app.patch<{ Params: { reviewId: string } }>(
    '/api/v1/course-reviews/:reviewId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const target = await loadReview(request.params.reviewId);
      const manage = await assertCanRead(user, target.courseId);
      assertAuthor(target.userId, user);
      const patch = parseReviewPatch(request.body);
      const row = await prisma.courseReview.update({
        where: { id: target.id },
        data: { ...patch, editedAt: new Date() },
        include: reviewInclude,
      });
      return { review: serializeReview(row, user, manage), summary: await buildReviewSummary(target.courseId) };
    },
  );

  app.delete<{ Params: { reviewId: string } }>(
    '/api/v1/course-reviews/:reviewId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const target = await loadReview(request.params.reviewId);
      await assertCanDelete(target.userId, user, target.courseId);
      await prisma.courseReview.deleteMany({ where: { id: target.id } });
      return { success: true, summary: await buildReviewSummary(target.courseId) };
    },
  );

  app.post<{ Params: { reviewId: string } }>(
    '/api/v1/course-reviews/:reviewId/replies',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const target = await loadReview(request.params.reviewId);
      assertReplyAllowed(await canManageCourse(user, target.courseId));
      const body = parseRequiredBody(request.body);
      const row = await prisma.courseReviewReply.create({
        data: { reviewId: target.id, authorId: user.userId, authorRole: replyRole(user), body },
        include: { author: authorSelect },
      });
      reply.status(201);
      return { reply: serializeReply(row, user, true) };
    },
  );

  app.patch<{ Params: { replyId: string } }>(
    '/api/v1/course-review-replies/:replyId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const target = await loadReply(request.params.replyId);
      const manage = await assertCanRead(user, target.review.courseId);
      assertAuthor(target.authorId, user);
      const body = parseRequiredBody(request.body);
      const row = await prisma.courseReviewReply.update({
        where: { id: target.id },
        data: { body, editedAt: new Date() },
        include: { author: authorSelect },
      });
      return { reply: serializeReply(row, user, manage) };
    },
  );

  app.delete<{ Params: { replyId: string } }>(
    '/api/v1/course-review-replies/:replyId',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const target = await loadReply(request.params.replyId);
      await assertCanDelete(target.authorId, user, target.review.courseId);
      await prisma.courseReviewReply.deleteMany({ where: { id: target.id } });
      return { success: true };
    },
  );
}
