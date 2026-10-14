import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertCanManageCourse } from '../lib/courseAccess.js';

interface StudentAnalytics {
  userId: string;
  name: string;
  email: string;
  enrolledAt: string;
  completedCount: number;
  totalLessons: number;
  percent: number;
  studySeconds: number;
  studyMinutes: number;
  lastCompletedLesson: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}

interface DropoffLesson {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  order: number;
  completedCount: number;
  completedPercent: number;
  dropoffCount: number;
  dropoffPercent: number;
}

export async function computeCourseAnalytics(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      accessMode: true,
      modules: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          order: true,
          lessons: {
            where: { status: 'PUBLISHED' },
            orderBy: { order: 'asc' },
            select: { id: true, title: true, order: true },
          },
        },
      },
    },
  });

  if (!course) {
    throw new AppError('NOT_FOUND', 'Kurs bulunamadı.', 404);
  }

  // Yayınlanmış tüm derslerin sıralı düz listesi
  const orderedLessons = course.modules.flatMap((module) =>
    module.lessons.map((lesson) => ({
      ...lesson,
      moduleTitle: module.title,
    })),
  );
  const totalLessons = orderedLessons.length;
  const lessonIdToIndex = new Map(orderedLessons.map((l, index) => [l.id, index]));

  // Kursa kayıtlı öğrenciler
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { enrolledAt: 'asc' },
  });

  const enrolledUserIds = enrollments.map((e) => e.userId);

  // Bu kursun yayınlanmış derslerindeki tamamlama kayıtları
  const progressRecords = await prisma.lessonProgress.findMany({
    where: {
      userId: { in: enrolledUserIds },
      lessonId: { in: orderedLessons.map((l) => l.id) },
    },
    select: { userId: true, lessonId: true, completedAt: true },
  });

  // Kullanıcı başına tamamlanan dersler kümesi
  const userCompletedLessons = new Map<string, Set<string>>();
  for (const record of progressRecords) {
    if (!userCompletedLessons.has(record.userId)) {
      userCompletedLessons.set(record.userId, new Set());
    }
    userCompletedLessons.get(record.userId)!.add(record.lessonId);
  }

  // Bu kurstaki çalışma süreleri
  const activitySums = await prisma.studyActivity.groupBy({
    by: ['userId'],
    where: {
      courseId,
      userId: { in: enrolledUserIds },
    },
    _sum: { seconds: true },
  });
  const userSecondsMap = new Map(activitySums.map((a) => [a.userId, a._sum.seconds ?? 0]));

  // Terk analizi sayacı: ders indeksine göre bırakma sayıları
  const dropoffCountByLessonIndex = new Map<number, number>();
  const completedCountByLessonIndex = new Map<number, number>();

  for (let i = 0; i < orderedLessons.length; i++) {
    dropoffCountByLessonIndex.set(i, 0);
    completedCountByLessonIndex.set(i, 0);
  }

  const students: StudentAnalytics[] = enrollments.map((enrollment) => {
    const user = enrollment.user;
    const completedSet = userCompletedLessons.get(user.id) ?? new Set<string>();
    const completedCount = completedSet.size;
    const percent = totalLessons > 0 ? Math.round((100 * completedCount) / totalLessons) : 0;
    const studySeconds = userSecondsMap.get(user.id) ?? 0;
    const studyMinutes = Math.round(studySeconds / 60);

    let status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' = 'NOT_STARTED';
    let lastCompletedLesson: string | null = null;
    let furthestCompletedIndex = -1;

    for (let i = 0; i < orderedLessons.length; i++) {
      if (completedSet.has(orderedLessons[i].id)) {
        completedCountByLessonIndex.set(i, (completedCountByLessonIndex.get(i) ?? 0) + 1);
        furthestCompletedIndex = i;
        lastCompletedLesson = orderedLessons[i].title;
      }
    }

    if (totalLessons > 0 && completedCount === totalLessons) {
      status = 'COMPLETED';
    } else if (completedCount > 0) {
      status = 'IN_PROGRESS';
      // Kursu henüz bitirmemiş ve en az bir ders tamamlamışsa terk noktası sayılır
      if (furthestCompletedIndex >= 0) {
        dropoffCountByLessonIndex.set(
          furthestCompletedIndex,
          (dropoffCountByLessonIndex.get(furthestCompletedIndex) ?? 0) + 1,
        );
      }
    }

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      completedCount,
      totalLessons,
      percent,
      studySeconds,
      studyMinutes,
      lastCompletedLesson,
      status,
    };
  });

  const totalEnrolled = students.length;
  const notStartedCount = students.filter((s) => s.status === 'NOT_STARTED').length;
  const inProgressCount = students.filter((s) => s.status === 'IN_PROGRESS').length;
  const completedCount = students.filter((s) => s.status === 'COMPLETED').length;
  const completionRate = totalEnrolled > 0 ? Math.round((100 * completedCount) / totalEnrolled) : 0;
  const averagePercent =
    totalEnrolled > 0 ? Math.round(students.reduce((sum, s) => sum + s.percent, 0) / totalEnrolled) : 0;
  const totalStudySeconds = students.reduce((sum, s) => sum + s.studySeconds, 0);
  const averageStudyMinutes =
    totalEnrolled > 0 ? Math.round(totalStudySeconds / 60 / totalEnrolled) : 0;

  const dropoffAnalysis: DropoffLesson[] = orderedLessons.map((lesson, index) => {
    const completed = completedCountByLessonIndex.get(index) ?? 0;
    const dropoff = dropoffCountByLessonIndex.get(index) ?? 0;
    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      moduleTitle: lesson.moduleTitle,
      order: index + 1,
      completedCount: completed,
      completedPercent: totalEnrolled > 0 ? Math.round((100 * completed) / totalEnrolled) : 0,
      dropoffCount: dropoff,
      dropoffPercent: totalEnrolled > 0 ? Math.round((100 * dropoff) / totalEnrolled) : 0,
    };
  });

  return {
    course: { id: course.id, title: course.title, accessMode: course.accessMode },
    summary: {
      totalEnrolled,
      notStartedCount,
      inProgressCount,
      completedCount,
      completionRate,
      averagePercent,
      totalStudySeconds,
      averageStudyMinutes,
    },
    dropoffAnalysis,
    students,
  };
}

function statusToLabel(status: StudentAnalytics['status']): string {
  switch (status) {
    case 'COMPLETED':
      return 'Tamamlandı';
    case 'IN_PROGRESS':
      return 'Devam Ediyor';
    case 'NOT_STARTED':
      return 'Başlamadı';
  }
}

export function generateCsvReport(analytics: Awaited<ReturnType<typeof computeCourseAnalytics>>): string {
  const headers = [
    'Öğrenci Adı',
    'E-posta',
    'Kayıt Tarihi',
    'Tamamlanan Ders',
    'Toplam Ders',
    'İlerleme (%)',
    'Çalışma Süresi (Dk)',
    'Son Tamamlanan Ders',
    'Durum',
  ];

  const rows = analytics.students.map((s) => [
    `"${s.name.replace(/"/g, '""')}"`,
    `"${s.email.replace(/"/g, '""')}"`,
    s.enrolledAt.slice(0, 10),
    s.completedCount,
    s.totalLessons,
    `%${s.percent}`,
    s.studyMinutes,
    `"${(s.lastCompletedLesson ?? '—').replace(/"/g, '""')}"`,
    `"${statusToLabel(s.status)}"`,
  ]);

  // UTF-8 BOM (\uFEFF) Excel'in Türkçe karakterleri (ş, ğ, ı, ö, ü, ç) doğru algılamasını sağlar
  return '\uFEFF' + [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\r\n');
}

export function registerCourseAnalyticsRoutes(app: FastifyInstance) {
  const staff = { preHandler: [requireAuth, requireRole('INSTRUCTOR', 'ADMIN')] };

  app.get<{ Params: { id: string } }>('/api/v1/courses/:id/analytics', staff, async (request) => {
    await assertCanManageCourse(request.user, request.params.id);
    return computeCourseAnalytics(request.params.id);
  });

  app.get<{ Params: { id: string } }>(
    '/api/v1/courses/:id/analytics/export',
    staff,
    async (request, reply) => {
      await assertCanManageCourse(request.user, request.params.id);
      const analytics = await computeCourseAnalytics(request.params.id);
      const csv = generateCsvReport(analytics);

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="kurs-analitik-${analytics.course.id}.csv"`,
      );
      return reply.send(csv);
    },
  );
}
