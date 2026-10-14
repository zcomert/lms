import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { computeProgress } from '../lib/progress.js';
import { issueCertificate } from '../lib/certificates.js';
import { awardBadge } from '../lib/badges.js';
import { assertEnrolled, loadPublishedLesson, assertLessonUnlocked } from '../lib/lessonAccess.js';

export function registerProgressRoutes(app: FastifyInstance) {
  app.put<{ Params: { id: string } }>(
    '/api/v1/lessons/:id/completion',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const lesson = await loadPublishedLesson(request.params.id);
      const courseId = lesson.module.courseId;
      await assertEnrolled(userId, courseId);
      await assertLessonUnlocked(userId, lesson.id, request.user);
      await prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: lesson.id } },
        create: { userId, lessonId: lesson.id },
        update: {},
      });
      const progress = await computeProgress(userId, courseId);
      if (progress.percent === 100) {
        try {
          const course = await prisma.course.findUnique({ where: { id: courseId } });
          await issueCertificate(userId, courseId);
          await awardBadge(userId, 'course_complete', courseId, course?.title ?? '');
        } catch (err) {
          request.log.error({ err }, 'certificate/badge issuance failed');
        }
      }
      return { progress };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/lessons/:id/completion',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const lesson = await loadPublishedLesson(request.params.id);
      const courseId = lesson.module.courseId;
      await assertEnrolled(userId, courseId);
      await prisma.lessonProgress.deleteMany({ where: { userId, lessonId: lesson.id } });
      return { progress: await computeProgress(userId, courseId) };
    },
  );

  app.get<{ Params: { courseId: string } }>(
    '/api/v1/courses/:courseId/progress',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const course = await prisma.course.findUnique({ where: { id: request.params.courseId } });
      if (!course) {
        throw new AppError('NOT_FOUND', 'Kurs bulunamadı.', 404);
      }
      await assertEnrolled(userId, course.id);
      return { progress: await computeProgress(userId, course.id) };
    },
  );
}
