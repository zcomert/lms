import { prisma } from '../lib/prisma.js';
import { awardBadge } from '../lib/badges.js';
import { addDays, computeStreak, dayKey, STREAK_LOOKBACK_DAYS } from '../lib/activity.js';
import type { ScheduledJob } from './types.js';

export const syncAnnouncementsAndExamsJob: ScheduledJob = {
  name: 'sync-announcements-exams',
  description: 'Duyuru ve sınav durumlarını (aktif, yaklaşan, süresi dolan, taslak) senkronize eder.',
  intervalMs: 5 * 60 * 1000, // 5 dakika
  runOnInit: true,
  execute: async () => {
    const now = new Date();

    // Duyuru durumları
    const activeAnnouncements = await prisma.announcement.count({
      where: {
        status: 'PUBLISHED',
        publishAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    const scheduledAnnouncements = await prisma.announcement.count({
      where: {
        status: 'PUBLISHED',
        publishAt: { gt: now },
      },
    });

    const expiredAnnouncements = await prisma.announcement.count({
      where: {
        status: 'PUBLISHED',
        expiresAt: { lte: now },
      },
    });

    const draftAnnouncements = await prisma.announcement.count({
      where: { status: 'DRAFT' },
    });

    // Sınav durumları
    const openExams = await prisma.exam.count({
      where: {
        status: 'PUBLISHED',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });

    const upcomingExams = await prisma.exam.count({
      where: {
        status: 'PUBLISHED',
        startsAt: { gt: now },
      },
    });

    const closedExams = await prisma.exam.count({
      where: {
        status: 'PUBLISHED',
        endsAt: { lte: now },
      },
    });

    const draftExams = await prisma.exam.count({
      where: { status: 'DRAFT' },
    });

    return {
      activeAnnouncements,
      scheduledAnnouncements,
      expiredAnnouncements,
      draftAnnouncements,
      openExams,
      upcomingExams,
      closedExams,
      draftExams,
      syncedAt: now.toISOString(),
    };
  },
};

export const updateStreaksAndBadgesJob: ScheduledJob = {
  name: 'update-streaks-and-badges',
  description: 'Öğrenci çalışma günlerini ve 7 günlük kesintisiz seri rozetlerini değerlendirir.',
  intervalMs: 60 * 60 * 1000, // 1 saat
  runOnInit: true,
  execute: async () => {
    const today = dayKey(new Date());
    const minDay = addDays(today, -STREAK_LOOKBACK_DAYS);

    // O(1) sorgu: Tek seferde son periyottaki tüm kullanıcı-gün aktivitelerini al (N+1 sorgu problemi önlendi)
    const activities = await prisma.studyActivity.findMany({
      where: {
        day: { gte: minDay, lte: today },
        seconds: { gt: 0 },
        user: { disabledAt: null },
      },
      select: { userId: true, day: true },
    });

    // Kullanıcı bazlı gün kümesi oluştur
    const userDaysMap = new Map<string, Set<string>>();
    for (const act of activities) {
      let days = userDaysMap.get(act.userId);
      if (!days) {
        days = new Set<string>();
        userDaysMap.set(act.userId, days);
      }
      days.add(act.day);
    }

    let activeStreaksCount = 0;
    const candidatesForStreak7: string[] = [];

    for (const [userId, days] of userDaysMap.entries()) {
      const streak = computeStreak(days, today);
      if (streak > 0) {
        activeStreaksCount++;
      }
      if (streak >= 7) {
        candidatesForStreak7.push(userId);
      }
    }

    // Yalnızca henüz bu rozeti almamış olanları tespit et (doğru metrik sayımı)
    let badgesAwarded = 0;
    if (candidatesForStreak7.length > 0) {
      const existingBadges = await prisma.userBadge.findMany({
        where: {
          userId: { in: candidatesForStreak7 },
          type: 'streak_7',
          courseId: null,
        },
        select: { userId: true },
      });
      const alreadyAwardedSet = new Set(existingBadges.map((b) => b.userId));

      for (const userId of candidatesForStreak7) {
        if (!alreadyAwardedSet.has(userId)) {
          try {
            const badge = await awardBadge(userId, 'streak_7', null, '7 Gün Seri');
            if (badge) {
              badgesAwarded++;
            }
          } catch {
            // Idempotent hatası yutulur
          }
        }
      }
    }

    return {
      evaluatedUsers: userDaysMap.size,
      activeStreaksCount,
      badgesAwarded,
      evaluatedAt: new Date().toISOString(),
    };
  },
};

export const detectAtRiskStudentsJob: ScheduledJob = {
  name: 'detect-at-risk-students',
  description: 'İlerlemesi düşük veya uzun süredir aktif olmayan riskli öğrencileri tespit eder (FR-73).',
  intervalMs: 6 * 60 * 60 * 1000, // 6 saat
  runOnInit: false,
  execute: async () => {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgoKey = dayKey(fourteenDaysAgo);

    // Yalnızca etkin durumdaki STUDENT kullanıcıların kayıtlarını değerlendir (devre dışı hesaplar hariç)
    const enrollments = await prisma.enrollment.findMany({
      where: {
        user: { disabledAt: null, role: 'STUDENT' },
        course: { status: 'PUBLISHED' },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: {
          select: {
            id: true,
            title: true,
            modules: {
              select: {
                lessons: {
                  where: { status: 'PUBLISHED' },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    const atRiskStudents: Array<{
      userId: string;
      name: string;
      email: string;
      courseId: string;
      courseTitle: string;
      reason: string;
    }> = [];

    // İlgili kullanıcıların son 14 gündeki toplam aktivitelerini toplu olarak çek
    const userIds = Array.from(new Set(enrollments.map((e) => e.userId)));
    const recentActivities = userIds.length > 0
      ? await prisma.studyActivity.groupBy({
          by: ['userId', 'courseId'],
          where: {
            userId: { in: userIds },
            day: { gte: fourteenDaysAgoKey },
          },
          _sum: { seconds: true },
        })
      : [];

    const activityMap = new Map<string, number>();
    for (const act of recentActivities) {
      if (act.courseId) {
        activityMap.set(`${act.userId}:${act.courseId}`, act._sum.seconds ?? 0);
      }
    }

    // İlgili kullanıcıların tamamladığı ders sayılarını toplu olarak çek
    const progressList = userIds.length > 0
      ? await prisma.lessonProgress.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, lessonId: true },
        })
      : [];

    const userCompletedLessons = new Map<string, Set<string>>();
    for (const prog of progressList) {
      let set = userCompletedLessons.get(prog.userId);
      if (!set) {
        set = new Set<string>();
        userCompletedLessons.set(prog.userId, set);
      }
      set.add(prog.lessonId);
    }

    for (const enrollment of enrollments) {
      const publishedLessons = enrollment.course.modules.flatMap((m) => m.lessons);
      const totalLessons = publishedLessons.length;
      if (totalLessons === 0) continue;

      const userCompleted = userCompletedLessons.get(enrollment.userId) ?? new Set<string>();
      let completedCount = 0;
      for (const lesson of publishedLessons) {
        if (userCompleted.has(lesson.id)) {
          completedCount++;
        }
      }

      const percent = Math.round((100 * completedCount) / totalLessons);

      // Kursu tamamlamış (%100) öğrenciler risk altında sayılmaz
      if (percent >= 100) continue;

      const enrolledDays = Math.floor(
        (now.getTime() - new Date(enrollment.enrolledAt).getTime()) / (24 * 60 * 60 * 1000),
      );

      const recentSeconds = activityMap.get(`${enrollment.userId}:${enrollment.courseId}`) ?? 0;

      if (enrolledDays >= 7 && percent < 20) {
        atRiskStudents.push({
          userId: enrollment.userId,
          name: enrollment.user.name,
          email: enrollment.user.email,
          courseId: enrollment.courseId,
          courseTitle: enrollment.course.title,
          reason: `Kayıttan sonra ${enrolledDays} gün geçti, ilerleme yalnızca %${percent}.`,
        });
      } else if (enrolledDays >= 14 && recentSeconds === 0) {
        atRiskStudents.push({
          userId: enrollment.userId,
          name: enrollment.user.name,
          email: enrollment.user.email,
          courseId: enrollment.courseId,
          courseTitle: enrollment.course.title,
          reason: `Son 14 gündür kursta çalışma aktivitesi yok.`,
        });
      }
    }

    return {
      totalEnrollmentsChecked: enrollments.length,
      atRiskCount: atRiskStudents.length,
      sampleAtRisk: atRiskStudents.slice(0, 10),
      checkedAt: now.toISOString(),
    };
  },
};

export const databaseMaintenanceJob: ScheduledJob = {
  name: 'database-maintenance',
  description: 'SQLite veritabanı bütünlük denetimi ve WAL checkpoint işlemi gerçekleştirir.',
  intervalMs: 12 * 60 * 60 * 1000, // 12 saat
  runOnInit: false,
  execute: async () => {
    // WAL Checkpoint (SQLite bellek/disk senkronizasyonu)
    let checkpointResult = 'PASSIVE_CHECKPOINT_OK';
    try {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(PASSIVE)');
    } catch (err) {
      checkpointResult = `CHECKPOINT_WARN: ${err instanceof Error ? err.message : String(err)}`;
    }

    // Integrity Check
    let integrity = 'ok';
    try {
      const rows = (await prisma.$queryRawUnsafe('PRAGMA integrity_check')) as Array<{
        integrity_check: string;
      }>;
      integrity = rows[0]?.integrity_check ?? 'ok';
    } catch (err) {
      integrity = `INTEGRITY_CHECK_WARN: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      checkpoint: checkpointResult,
      integrityCheck: integrity,
      timestamp: new Date().toISOString(),
    };
  },
};

export const upcomingTaskRemindersJob: ScheduledJob = {
  name: 'upcoming-task-reminders',
  description: 'Önümüzdeki 24 saatte kapanacak sınavları ve bekleyen öğrencileri belirler (FR-91).',
  intervalMs: 60 * 60 * 1000, // 1 saat
  runOnInit: true,
  execute: async () => {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const closingExams = await prisma.exam.findMany({
      where: {
        status: 'PUBLISHED',
        endsAt: { gt: now, lte: next24h },
      },
      select: {
        id: true,
        title: true,
        endsAt: true,
        audience: true,
        courseId: true,
        course: { select: { title: true } },
      },
    });

    let totalPendingStudents = 0;
    const examsSummary = [];

    for (const exam of closingExams) {
      let eligibleStudents = 0;

      // Audience tipine göre doğru hedef kitle hesaplaması (SELECTED vs COURSE)
      if (exam.audience === 'SELECTED') {
        eligibleStudents = await prisma.examCandidate.count({
          where: {
            examId: exam.id,
            user: { disabledAt: null },
          },
        });
      } else {
        eligibleStudents = await prisma.enrollment.count({
          where: {
            courseId: exam.courseId,
            user: { disabledAt: null },
          },
        });
      }

      totalPendingStudents += eligibleStudents;

      examsSummary.push({
        examId: exam.id,
        examTitle: exam.title,
        courseTitle: exam.course.title,
        audience: exam.audience,
        endsAt: exam.endsAt?.toISOString(),
        eligibleStudents,
      });
    }

    return {
      examsClosingIn24Hours: closingExams.length,
      exams: examsSummary,
      estimatedStudentsToNotify: totalPendingStudents,
      checkedAt: now.toISOString(),
    };
  },
};

export const ALL_SCHEDULED_JOBS: ScheduledJob[] = [
  syncAnnouncementsAndExamsJob,
  updateStreaksAndBadgesJob,
  detectAtRiskStudentsJob,
  databaseMaintenanceJob,
  upcomingTaskRemindersJob,
];
