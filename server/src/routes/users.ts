import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { toPublicUser } from '../lib/publicUser.js';
import { AppError } from '../errors.js';
import { examAvailability } from '../lib/exams.js';

const ALLOWED_LOCALES = ['tr', 'en'];
const DEFAULT_UPCOMING_DAYS = 7;
const MAX_UPCOMING_DAYS = 90;
const DEFAULT_UPCOMING_LIMIT = 5;
const MAX_UPCOMING_LIMIT = 20;

type UpcomingTask =
  | {
      kind: 'ASSIGNMENT';
      id: string;
      title: string;
      description: string | null;
      course: { id: string; title: string };
      dueAt: string;
      assignmentType: string;
      isPastDue: boolean;
      allowLateSubmission: boolean;
      sortKey: number;
    }
  | {
      kind: 'EXAM';
      id: string;
      title: string;
      description: string | null;
      course: { id: string; title: string };
      startsAt: string | null;
      endsAt: string | null;
      durationMinutes: number | null;
      availability: 'UPCOMING' | 'OPEN' | 'CLOSED';
      questionCount: number;
      sortKey: number;
    };

interface UpdateMeBody {
  name?: string;
  avatarUrl?: string | null;
  locale?: string;
}

export function registerUserRoutes(app: FastifyInstance) {
  app.patch<{ Body: UpdateMeBody }>(
    '/api/v1/users/me',
    { preHandler: [requireAuth] },
    async (request) => {
      const { name, avatarUrl, locale } = request.body ?? {};

      if (locale !== undefined && !ALLOWED_LOCALES.includes(locale)) {
        throw new AppError(
          'INVALID_LOCALE',
          `Geçersiz dil seçeneği. Desteklenenler: ${ALLOWED_LOCALES.join(', ')}.`,
          400,
        );
      }

      const data: { name?: string; avatarUrl?: string | null; locale?: string } = {};
      if (name !== undefined) data.name = name;
      if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
      if (locale !== undefined) data.locale = locale;

      const user =
        Object.keys(data).length > 0
          ? await prisma.user.update({ where: { id: request.user!.userId }, data })
          : await prisma.user.findUniqueOrThrow({ where: { id: request.user!.userId } });

      return { user: toPublicUser(user) };
    },
  );

  // Dashboard "Yaklaşan Görevler" paneli: ödev + sınav birleşik, yaklaşan görevler (FR-12).
  app.get<{ Querystring: { days?: string; limit?: string } }>(
    '/api/v1/users/me/upcoming-tasks',
    { preHandler: [requireAuth] },
    async (request) => {
      const rawDays = request.query.days ?? String(DEFAULT_UPCOMING_DAYS);
      const days = Number(rawDays);
      if (!/^\d+$/.test(rawDays) || days < 1 || days > MAX_UPCOMING_DAYS) {
        throw new AppError('VALIDATION_ERROR', `days 1 ile ${MAX_UPCOMING_DAYS} arasında bir tam sayı olmalıdır.`, 400);
      }
      const rawLimit = request.query.limit ?? String(DEFAULT_UPCOMING_LIMIT);
      const limit = Number(rawLimit);
      if (!/^\d+$/.test(rawLimit) || limit < 1 || limit > MAX_UPCOMING_LIMIT) {
        throw new AppError('VALIDATION_ERROR', `limit 1 ile ${MAX_UPCOMING_LIMIT} arasında bir tam sayı olmalıdır.`, 400);
      }

      const userId = request.user!.userId;
      const now = new Date();
      const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const enrollments = await prisma.enrollment.findMany({ where: { userId }, select: { courseId: true } });
      const courseIds = enrollments.map((row) => row.courseId);

      const [assignments, exams] = await Promise.all([
        prisma.assignment.findMany({
          where: {
            status: 'PUBLISHED',
            courseId: { in: courseIds },
            dueAt: { lte: windowEnd },
            submissions: { none: { userId } },
          },
          include: { course: { select: { id: true, title: true } } },
        }),
        prisma.exam.findMany({
          where: {
            status: 'PUBLISHED',
            courseId: { in: courseIds },
            OR: [{ audience: 'COURSE' }, { candidates: { some: { userId } } }],
          },
          include: { course: { select: { id: true, title: true } }, _count: { select: { questions: true } } },
        }),
      ]);

      const assignmentTasks: UpcomingTask[] = assignments
        // Süresi geçmiş ve geç teslime kapalı ödevler artık "yaklaşan" değildir.
        .filter((a) => a.dueAt.getTime() >= now.getTime() || a.allowLateSubmission)
        .map((a) => ({
          kind: 'ASSIGNMENT',
          id: a.id,
          title: a.title,
          description: a.description,
          course: a.course,
          dueAt: a.dueAt.toISOString(),
          assignmentType: a.type,
          isPastDue: a.dueAt.getTime() < now.getTime(),
          allowLateSubmission: a.allowLateSubmission,
          sortKey: a.dueAt.getTime(),
        }));

      const examTasks: UpcomingTask[] = exams
        .map((exam) => ({ exam, availability: examAvailability(exam, now) }))
        .filter(
          ({ exam, availability }) =>
            availability === 'OPEN' || (availability === 'UPCOMING' && exam.startsAt!.getTime() <= windowEnd.getTime()),
        )
        .map(({ exam, availability }) => ({
          kind: 'EXAM' as const,
          id: exam.id,
          title: exam.title,
          description: exam.description,
          course: exam.course,
          startsAt: exam.startsAt?.toISOString() ?? null,
          endsAt: exam.endsAt?.toISOString() ?? null,
          durationMinutes: exam.durationMinutes,
          availability,
          questionCount: exam._count.questions,
          sortKey: exam.startsAt?.getTime() ?? exam.endsAt?.getTime() ?? now.getTime(),
        }));

      const all = [...assignmentTasks, ...examTasks].sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
        if (a.kind === b.kind) return 0;
        return a.kind === 'ASSIGNMENT' ? -1 : 1;
      });

      return {
        tasks: all.slice(0, limit).map(({ sortKey: _sortKey, ...task }) => task),
        totalCount: all.length,
        serverTime: now.toISOString(),
      };
    },
  );
}
