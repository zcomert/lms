import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';

describe('progress routes', () => {
  let app: FastifyInstance;
  let studentToken: string;
  let otherToken: string;
  let outsiderToken: string;
  let studentId: string;
  let courseId: string;
  let moduleId: string;
  let lessonIds: string[];

  async function login(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'sifre123' },
    });
    return res.json().token as string;
  }

  async function createLesson(status: string, order: number) {
    const lesson = await prisma.lesson.create({
      data: { moduleId, title: `Ders ${order}`, order, status },
    });
    return lesson.id;
  }

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function complete(lessonId: string, token = studentToken) {
    return app.inject({
      method: 'PUT',
      url: `/api/v1/lessons/${lessonId}/completion`,
      headers: auth(token),
    });
  }

  async function getProgress(id = courseId, token = studentToken) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/courses/${id}/progress`,
      headers: auth(token),
    });
  }

  async function setupCourse(accessMode = 'FREE') {
    const instructor = await prisma.user.findUniqueOrThrow({
      where: { email: 'instructor@example.com' },
    });
    const course = await prisma.course.create({
      data: {
        title: 'Kurs',
        description: 'Açıklama',
        category: 'Test',
        level: 'Başlangıç',
        accessMode,
        status: 'PUBLISHED',
        instructors: { create: [{ userId: instructor.id, position: 1 }] },
      },
    });
    const mod = await prisma.module.create({
      data: { courseId: course.id, title: 'Modül', order: 1 },
    });
    courseId = course.id;
    moduleId = mod.id;
    await prisma.enrollment.create({
      data: { userId: studentId, courseId, method: 'OPEN' },
    });
  }

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.enrollment.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('sifre123', 12);
    await prisma.user.create({
      data: { email: 'instructor@example.com', passwordHash, name: 'Eğitmen', role: 'INSTRUCTOR' },
    });
    const student = await prisma.user.create({
      data: { email: 'student@example.com', passwordHash, name: 'Öğrenci', role: 'STUDENT' },
    });
    studentId = student.id;
    await prisma.user.create({
      data: { email: 'other@example.com', passwordHash, name: 'Diğer', role: 'STUDENT' },
    });
    await prisma.user.create({
      data: { email: 'outsider@example.com', passwordHash, name: 'Dışarıdan', role: 'STUDENT' },
    });
    studentToken = await login('student@example.com');
    otherToken = await login('other@example.com');
    outsiderToken = await login('outsider@example.com');

    await setupCourse();
    lessonIds = [
      await createLesson('PUBLISHED', 1),
      await createLesson('PUBLISHED', 2),
      await createLesson('PUBLISHED', 3),
    ];
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('PUT completion is idempotent and keeps completedAt', async () => {
    const first = await complete(lessonIds[0]);
    expect(first.statusCode).toBe(200);
    expect(first.json().progress).toMatchObject({
      courseId,
      percent: 33,
      completedLessonIds: [lessonIds[0]],
      completedCount: 1,
      totalLessons: 3,
    });
    const record = await prisma.lessonProgress.findFirstOrThrow({ where: { userId: studentId } });

    const second = await complete(lessonIds[0]);
    expect(second.statusCode).toBe(200);
    expect(second.json().progress.completedCount).toBe(1);
    const again = await prisma.lessonProgress.findMany({ where: { userId: studentId } });
    expect(again).toHaveLength(1);
    expect(again[0].completedAt.getTime()).toBe(record.completedAt.getTime());
  });

  it('accepts bodyless PUT/DELETE sent with Content-Type: application/json', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/v1/lessons/${lessonIds[0]}/completion`,
      headers: { ...auth(studentToken), 'content-type': 'application/json' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().progress.completedCount).toBe(1);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/lessons/${lessonIds[0]}/completion`,
      headers: { ...auth(studentToken), 'content-type': 'application/json' },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().progress.completedCount).toBe(0);
  });

  it('still rejects malformed JSON bodies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('DELETE lowers percent and is idempotent', async () => {
    await complete(lessonIds[0]);
    await complete(lessonIds[1]);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/lessons/${lessonIds[1]}/completion`,
      headers: auth(studentToken),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().progress.percent).toBe(33);
    const del2 = await app.inject({
      method: 'DELETE',
      url: `/api/v1/lessons/${lessonIds[1]}/completion`,
      headers: auth(studentToken),
    });
    expect(del2.statusCode).toBe(200);
    expect(del2.json().progress.percent).toBe(33);
    expect(del2.json().progress.completedLessonIds).toEqual([lessonIds[0]]);
  });

  it('rounds percent (1/3 -> 33, 2/3 -> 67, 3/3 -> 100)', async () => {
    expect((await complete(lessonIds[0])).json().progress.percent).toBe(33);
    expect((await complete(lessonIds[1])).json().progress.percent).toBe(67);
    expect((await complete(lessonIds[2])).json().progress.percent).toBe(100);
    expect((await getProgress()).json().progress.percent).toBe(100);
  });

  it('excludes DRAFT lessons and 404s on PUT for a DRAFT lesson', async () => {
    const draftId = await createLesson('DRAFT', 4);
    const res = await complete(draftId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toEqual({ code: 'NOT_FOUND', message: 'Ders bulunamadı.' });
    const progress = (await getProgress()).json().progress;
    expect(progress.totalLessons).toBe(3);
  });

  it('returns 0 percent when the course has no published lessons', async () => {
    await prisma.lesson.deleteMany();
    const res = await getProgress();
    expect(res.statusCode).toBe(200);
    expect(res.json().progress).toEqual({
      courseId,
      percent: 0,
      completedLessonIds: [],
      completedCount: 0,
      totalLessons: 0,
    });
  });

  it('returns 403 NOT_ENROLLED for non-enrolled users on all endpoints', async () => {
    const expected = { code: 'NOT_ENROLLED', message: 'Bu kursa kayıtlı değilsiniz.' };
    const put = await complete(lessonIds[0], outsiderToken);
    expect(put.statusCode).toBe(403);
    expect(put.json().error).toEqual(expected);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/lessons/${lessonIds[0]}/completion`,
      headers: auth(outsiderToken),
    });
    expect(del.statusCode).toBe(403);
    expect(del.json().error).toEqual(expected);
    const get = await getProgress(courseId, outsiderToken);
    expect(get.statusCode).toBe(403);
    expect(get.json().error).toEqual(expected);
    expect(await prisma.lessonProgress.count()).toBe(0);
  });

  it('returns 401 without a token', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/v1/lessons/${lessonIds[0]}/completion`,
    });
    expect(put.statusCode).toBe(401);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/lessons/${lessonIds[0]}/completion`,
    });
    expect(del.statusCode).toBe(401);
    const get = await app.inject({ method: 'GET', url: `/api/v1/courses/${courseId}/progress` });
    expect(get.statusCode).toBe(401);
    expect(get.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 for a missing lesson or course', async () => {
    const put = await complete('yok');
    expect(put.statusCode).toBe(404);
    expect(put.json().error.message).toBe('Ders bulunamadı.');
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/v1/lessons/yok/completion',
      headers: auth(studentToken),
    });
    expect(del.statusCode).toBe(404);
    const get = await getProgress('yok');
    expect(get.statusCode).toBe(404);
    expect(get.json().error).toEqual({ code: 'NOT_FOUND', message: 'Kurs bulunamadı.' });
  });

  it('isolates progress per user', async () => {
    await prisma.enrollment.create({ data: { userId: (await userId('other@example.com')), courseId, method: 'OPEN' } });
    await complete(lessonIds[0]);
    const other = await getProgress(courseId, otherToken);
    expect(other.json().progress.completedCount).toBe(0);
    await complete(lessonIds[1], otherToken);
    const mine = await getProgress();
    expect(mine.json().progress.completedLessonIds).toEqual([lessonIds[0]]);
  });

  async function userId(email: string) {
    return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  }

  it('GET /users/me/courses includes progress (0 when no records)', async () => {
    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/courses',
      headers: auth(studentToken),
    });
    expect(empty.json().courses[0].progress).toEqual({
      percent: 0,
      completedCount: 0,
      totalLessons: 3,
    });
    await complete(lessonIds[0]);
    await complete(lessonIds[1]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me/courses',
      headers: auth(studentToken),
    });
    expect(res.json().courses[0].progress).toEqual({
      percent: 67,
      completedCount: 2,
      totalLessons: 3,
    });
  });

  it('cascades progress records when a lesson is deleted', async () => {
    await complete(lessonIds[0]);
    await prisma.lesson.delete({ where: { id: lessonIds[0] } });
    expect(await prisma.lessonProgress.count()).toBe(0);
    const progress = (await getProgress()).json().progress;
    expect(progress.totalLessons).toBe(2);
    expect(progress.completedCount).toBe(0);
  });

  it('drops a lesson moved to DRAFT from completedLessonIds', async () => {
    await complete(lessonIds[0]);
    await complete(lessonIds[1]);
    await prisma.lesson.update({ where: { id: lessonIds[0] }, data: { status: 'DRAFT' } });
    const progress = (await getProgress()).json().progress;
    expect(progress.completedLessonIds).toEqual([lessonIds[1]]);
    expect(progress.totalLessons).toBe(2);
    expect(progress.percent).toBe(50);
  });

  it('enforces completion order in SEQUENTIAL courses and rejects locked lessons', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { accessMode: 'SEQUENTIAL' } });
    const lockedRes = await complete(lessonIds[2]);
    expect(lockedRes.statusCode).toBe(403);
    expect(lockedRes.json().error.code).toBe('LESSON_LOCKED');

    const res0 = await complete(lessonIds[0]);
    expect(res0.statusCode).toBe(200);

    const res1 = await complete(lessonIds[1]);
    expect(res1.statusCode).toBe(200);

    const res2 = await complete(lessonIds[2]);
    expect(res2.statusCode).toBe(200);
    expect(res2.json().progress.percent).toBe(100);
  });
});
