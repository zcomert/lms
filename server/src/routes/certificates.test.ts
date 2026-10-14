import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { addDays, dayKey } from '../lib/activity.js';

describe('certificates and badges', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonIds: string[];
  let userId: string;
  let otherId: string;
  let token: string;

  const auth = () => ({ authorization: `Bearer ${token}` });
  const complete = (lessonId: string) =>
    app.inject({ method: 'PUT', url: `/api/v1/lessons/${lessonId}/completion`, headers: auth() });
  const heartbeat = () =>
    app.inject({
      method: 'POST',
      url: '/api/v1/users/me/activity',
      headers: auth(),
      payload: { lessonId: lessonIds[0], seconds: 30 },
    });
  const completeAll = async () => {
    for (const id of lessonIds) await complete(id);
  };
  const seedDays = async (count: number) => {
    const today = dayKey(new Date());
    for (let i = 1; i <= count; i += 1) {
      await prisma.studyActivity.create({
        data: { userId, day: addDays(today, -i), courseId, category: 'READING', seconds: 60 },
      });
    }
  };

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.certificate.deleteMany();
    await prisma.userBadge.deleteMany();
    await prisma.studyActivity.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const user = await prisma.user.create({
      data: { email: 'ogrenci@example.com', passwordHash: 'x', name: 'Şebnem Işık', role: 'STUDENT', roles: 'STUDENT' },
    });
    const other = await prisma.user.create({
      data: { email: 'diger@example.com', passwordHash: 'x', name: 'Diğer', role: 'STUDENT', roles: 'STUDENT' },
    });
    userId = user.id;
    otherId = other.id;
    token = signToken({ userId, role: 'STUDENT', roles: ['STUDENT'] });

    const course = await prisma.course.create({
      data: { title: 'Çağrı Kursu', description: 'A', category: 'T', level: 'Başlangıç', status: 'PUBLISHED' },
    });
    courseId = course.id;
    const mod = await prisma.module.create({ data: { courseId, title: 'M', order: 1 } });
    lessonIds = [];
    for (const order of [1, 2]) {
      const lesson = await prisma.lesson.create({
        data: { moduleId: mod.id, title: `Ders ${order}`, order, status: 'PUBLISHED', contentType: 'TEXT' },
      });
      lessonIds.push(lesson.id);
    }
    await prisma.enrollment.create({ data: { userId, courseId, method: 'OPEN' } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('issues certificate and badge on 100% and is idempotent', async () => {
    await complete(lessonIds[0]);
    expect(await prisma.certificate.count()).toBe(0);
    const res = await complete(lessonIds[1]);
    expect(res.json().progress.percent).toBe(100);
    expect(await prisma.certificate.count()).toBe(1);
    const badge = await prisma.userBadge.findFirstOrThrow();
    expect(badge).toMatchObject({ type: 'course_complete', courseId, userId });

    await complete(lessonIds[1]);
    expect(await prisma.certificate.count()).toBe(1);
    expect(await prisma.userBadge.count()).toBe(1);
    const cert = await prisma.certificate.findFirstOrThrow();
    expect(cert.code).toMatch(/^BTK-[A-HJ-NP-Z2-9]{8}$/);
    expect(cert).toMatchObject({ studentName: 'Şebnem Işık', courseTitle: 'Çağrı Kursu' });
  });

  it('lists own certificates and badges', async () => {
    await completeAll();
    const certs = await app.inject({ method: 'GET', url: '/api/v1/me/certificates', headers: auth() });
    expect(certs.json().certificates).toHaveLength(1);
    expect(certs.json().certificates[0]).toMatchObject({ courseId, courseTitle: 'Çağrı Kursu' });
    const badges = await app.inject({ method: 'GET', url: '/api/v1/me/badges', headers: auth() });
    expect(badges.json().badges).toHaveLength(1);
    expect(badges.json().badges[0]).toMatchObject({ type: 'course_complete', name: 'Kurs Bitirme' });

    const otherToken = signToken({ userId: otherId, role: 'STUDENT', roles: ['STUDENT'] });
    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/me/certificates',
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(empty.json().certificates).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me/badges' })).statusCode).toBe(401);
  });

  it('serves public verification and 404 for unknown code', async () => {
    await completeAll();
    const { code } = await prisma.certificate.findFirstOrThrow();
    const ok = await app.inject({ method: 'GET', url: `/api/v1/certificates/${code}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().certificate).toMatchObject({ code, studentName: 'Şebnem Işık', courseTitle: 'Çağrı Kursu' });
    const missing = await app.inject({ method: 'GET', url: '/api/v1/certificates/BTK-NOPE' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.message).toBe('Sertifika bulunamadı.');
    expect((await app.inject({ method: 'GET', url: '/api/v1/certificates/BTK-NOPE/pdf' })).statusCode).toBe(404);
  });

  it('renders a PDF publicly', async () => {
    await completeAll();
    const { code } = await prisma.certificate.findFirstOrThrow();
    const res = await app.inject({ method: 'GET', url: `/api/v1/certificates/${code}/pdf` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`sertifika-${code}.pdf`);
    expect(res.rawPayload.length).toBeGreaterThan(1000);
    expect(res.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('returns public achievements without private fields', async () => {
    await completeAll();
    const res = await app.inject({ method: 'GET', url: `/api/v1/achievements/${userId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toEqual({ name: 'Şebnem Işık', avatarUrl: null });
    expect(body.certificates).toHaveLength(1);
    expect(body.badges).toHaveLength(1);
    expect(res.body).not.toContain('ogrenci@example.com');
    expect((await app.inject({ method: 'GET', url: '/api/v1/achievements/nope' })).statusCode).toBe(404);
  });

  it('awards streak_7 once after 7 consecutive days', async () => {
    await seedDays(6); // 6 past days + today's heartbeat = 7
    expect((await heartbeat()).statusCode).toBe(200);
    expect(await prisma.userBadge.count({ where: { type: 'streak_7' } })).toBe(1);
    const badge = await prisma.userBadge.findFirstOrThrow({ where: { type: 'streak_7' } });
    expect(badge.courseId).toBeNull();
    await heartbeat();
    expect(await prisma.userBadge.count({ where: { type: 'streak_7' } })).toBe(1);
  });

  it('awards nothing for a streak below 7', async () => {
    await seedDays(4);
    expect((await heartbeat()).statusCode).toBe(200);
    expect(await prisma.userBadge.count()).toBe(0);
  });
});
