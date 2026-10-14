import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { serializeEvent } from '../lib/calendar.js';

/** Bildirim penceresi: şu andan itibaren bu kadar gün ileriye bakılır. */
const WINDOW_DAYS = 7;
const MAX_EVENTS = 20;

export function registerNotificationRoutes(app: FastifyInstance) {
  /**
   * Kullanıcının yaklaşan eğitimleri: şu an ile +7 gün arasında başlayan,
   * görebildiği takvim etkinlikleri. Görünürlük kuralı takvimdekiyle aynıdır —
   * genel etkinlikler herkese, kurs etkinlikleri yalnızca kayıtlı olanlara
   * ve kursa atanmış eğitmene. Yönetici hepsini görür.
   */
  app.get('/api/v1/notifications/upcoming', { preHandler: [requireAuth] }, async (request) => {
    const user = request.user!;
    const now = new Date();
    const until = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [assignedRows, enrolledRows] = await Promise.all([
      user.role === 'INSTRUCTOR'
        ? prisma.courseInstructor.findMany({ where: { userId: user.userId }, select: { courseId: true } })
        : Promise.resolve([]),
      user.role === 'ADMIN'
        ? Promise.resolve([])
        : prisma.enrollment.findMany({ where: { userId: user.userId }, select: { courseId: true } }),
    ]);

    const visibleCourseIds = [
      ...new Set([...enrolledRows.map((row) => row.courseId), ...assignedRows.map((row) => row.courseId)]),
    ];
    const visibility =
      user.role === 'ADMIN' ? {} : { OR: [{ courseId: null }, { courseId: { in: visibleCourseIds } }] };

    const events = await prisma.calendarEvent.findMany({
      where: { AND: [{ start: { gte: now, lt: until } }, visibility] },
      include: { course: { select: { id: true, title: true } } },
      orderBy: [{ start: 'asc' }, { createdAt: 'asc' }],
      take: MAX_EVENTS,
    });

    return {
      events: events.map((event) => serializeEvent(event, false)),
      count: events.length,
    };
  });
}
