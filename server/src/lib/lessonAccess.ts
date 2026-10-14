import { prisma } from './prisma.js';
import { AppError } from '../errors.js';
import { canManageCourse } from './courseAccess.js';
import type { TokenPayload } from './jwt.js';

/** Kullanıcı kursa kayıtlı değilse 403 NOT_ENROLLED fırlatır. */
export async function assertEnrolled(userId: string, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment) {
    throw new AppError('NOT_ENROLLED', 'Bu kursa kayıtlı değilsiniz.', 403);
  }
}

/** Yayınlanmış dersi modülüyle getirir; yoksa veya taslaksa 404 (taslağın varlığı sızdırılmaz). */
export async function loadPublishedLesson(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { module: true },
  });
  if (!lesson || lesson.status !== 'PUBLISHED') {
    throw new AppError('NOT_FOUND', 'Ders bulunamadı.', 404);
  }
  return lesson;
}

/**
 * SEQUENTIAL kurslarda dersin kilitli olup olmadığını denetler.
 * Kullanıcı eğitmen/yönetici ise veya ders zaten tamamlanmışsa veya önceki tüm dersler tamamlanmışsa kilit açılır.
 * Aksi halde 403 LESSON_LOCKED fırlatılır.
 */
export async function assertLessonUnlocked(
  userId: string,
  lessonId: string,
  user?: Pick<TokenPayload, 'userId' | 'role'>,
): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      module: {
        include: {
          course: {
            include: {
              modules: {
                orderBy: { order: 'asc' },
                include: {
                  lessons: {
                    where: { status: 'PUBLISHED' },
                    orderBy: { order: 'asc' },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!lesson || lesson.status !== 'PUBLISHED') {
    throw new AppError('NOT_FOUND', 'Ders bulunamadı.', 404);
  }

  const course = lesson.module.course;
  if (course.accessMode !== 'SEQUENTIAL') {
    return;
  }

  if (user && (await canManageCourse(user, course.id))) {
    return;
  }

  const completed = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });
  if (completed) {
    return;
  }

  const orderedLessons = course.modules.flatMap((m) => m.lessons);
  const targetIndex = orderedLessons.findIndex((l) => l.id === lessonId);
  if (targetIndex <= 0) {
    return;
  }

  const priorLessonIds = orderedLessons.slice(0, targetIndex).map((l) => l.id);
  const userCompletedPrior = await prisma.lessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: priorLessonIds },
    },
    select: { lessonId: true },
  });

  const completedSet = new Set(userCompletedPrior.map((p) => p.lessonId));
  const hasIncompletePrior = priorLessonIds.some((id) => !completedSet.has(id));

  if (hasIncompletePrior) {
    throw new AppError(
      'LESSON_LOCKED',
      'Bu ders kilitli. Sıralı erişim modunda önceki dersleri tamamlamalısınız.',
      403,
    );
  }
}
