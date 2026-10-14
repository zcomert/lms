import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertEnrolled, loadPublishedLesson } from '../lib/lessonAccess.js';
import {
  ACTIVITY_TIMEZONE,
  MAX_HEARTBEAT_SECONDS,
  MAX_REPORT_DAYS,
  addDays,
  categoryFor,
  computeStreak,
  dayKey,
  getStreakDays,
} from '../lib/activity.js';

interface HeartbeatBody {
  lessonId?: unknown;
  seconds?: unknown;
}

interface ActivityDayReport {
  date: string;
  videoSeconds: number;
  quizSeconds: number;
  readingSeconds: number;
  totalSeconds: number;
}

export function registerActivityRoutes(app: FastifyInstance) {
  // Çalışma süresi bildirimi (heartbeat). Gün/kurs/kategori satırının süresini artırır.
  app.post<{ Body: HeartbeatBody }>(
    '/api/v1/users/me/activity',
    { preHandler: [requireAuth] },
    async (request) => {
      const { lessonId, seconds } = request.body ?? {};
      if (typeof lessonId !== 'string' || lessonId === '') {
        throw new AppError('VALIDATION_ERROR', 'lessonId zorunludur.', 400);
      }
      if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1) {
        throw new AppError('VALIDATION_ERROR', 'seconds pozitif bir tam sayı olmalıdır.', 400);
      }

      const userId = request.user!.userId;
      const lesson = await loadPublishedLesson(lessonId);
      const courseId = lesson.module.courseId;
      await assertEnrolled(userId, courseId);

      const recorded = Math.min(seconds, MAX_HEARTBEAT_SECONDS);
      const key = { userId, day: dayKey(new Date()), courseId, category: categoryFor(lesson.contentType) };
      const increment = () =>
        prisma.studyActivity.update({
          where: { userId_day_courseId_category: key },
          data: { seconds: { increment: recorded } },
        });

      try {
        await prisma.studyActivity.upsert({
          where: { userId_day_courseId_category: key },
          create: { ...key, seconds: recorded },
          update: { seconds: { increment: recorded } },
        });
      } catch (err) {
        // Aynı satırı ilk kez oluşturan eşzamanlı iki istekten kaybeden artırmaya düşer.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          await increment();
        } else {
          throw err;
        }
      }

      return { recorded };
    },
  );

  // Kullanıcının kendi çalışma raporu: günlük dağılım, toplamlar ve gün serisi.
  app.get<{ Querystring: { days?: string } }>(
    '/api/v1/users/me/activity',
    { preHandler: [requireAuth] },
    async (request) => {
      const rawDays = request.query.days ?? '7';
      const days = Number(rawDays);
      if (!/^\d+$/.test(rawDays) || days < 1 || days > MAX_REPORT_DAYS) {
        throw new AppError('VALIDATION_ERROR', `days 1 ile ${MAX_REPORT_DAYS} arasında bir tam sayı olmalıdır.`, 400);
      }

      const userId = request.user!.userId;
      const today = dayKey(new Date());
      const rangeStart = addDays(today, -(days - 1));
      const monthStart = `${today.slice(0, 8)}01`;

      const [rangeRows, monthAggregate, activeDays] = await Promise.all([
        prisma.studyActivity.groupBy({
          by: ['day', 'category'],
          where: { userId, day: { gte: rangeStart, lte: today } },
          _sum: { seconds: true },
        }),
        prisma.studyActivity.aggregate({
          where: { userId, day: { gte: monthStart, lte: today } },
          _sum: { seconds: true },
        }),
        getStreakDays(userId, today),
      ]);

      const byDay = new Map<string, ActivityDayReport>();
      for (let offset = 0; offset < days; offset += 1) {
        const date = addDays(rangeStart, offset);
        byDay.set(date, { date, videoSeconds: 0, quizSeconds: 0, readingSeconds: 0, totalSeconds: 0 });
      }
      for (const row of rangeRows) {
        const entry = byDay.get(row.day);
        if (!entry) continue;
        const seconds = row._sum.seconds ?? 0;
        if (row.category === 'VIDEO') entry.videoSeconds += seconds;
        else if (row.category === 'QUIZ') entry.quizSeconds += seconds;
        else entry.readingSeconds += seconds;
        entry.totalSeconds += seconds;
      }

      const dayList = [...byDay.values()];
      return {
        timezone: ACTIVITY_TIMEZONE,
        today,
        days: dayList,
        totals: {
          todaySeconds: byDay.get(today)?.totalSeconds ?? 0,
          rangeSeconds: dayList.reduce((sum, day) => sum + day.totalSeconds, 0),
          monthSeconds: monthAggregate._sum.seconds ?? 0,
        },
        streakDays: computeStreak(activeDays, today),
      };
    },
  );
}
