import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { announcementState, normalizeAnnouncementInput } from '../lib/announcements.js';

const HOUR = 60 * 60 * 1000;

describe('announcement helpers', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('defaults to a general draft and trims text', () => {
    const data = normalizeAnnouncementInput({ title: '  Başlık  ', body: '\nMetin\n\nİkinci paragraf\n' }, now);
    expect(data).toMatchObject({
      title: 'Başlık',
      body: 'Metin\n\nİkinci paragraf',
      category: 'GENERAL',
      status: 'DRAFT',
      publishAt: null,
      pinned: false,
      courseId: null,
    });
  });

  it('publishes immediately when no publishAt is given', () => {
    const data = normalizeAnnouncementInput({ title: 'a', body: 'b', status: 'PUBLISHED' }, now);
    expect(data.publishAt?.toISOString()).toBe(now.toISOString());
  });

  it('rejects expiry at or before the publish time', () => {
    expect(() =>
      normalizeAnnouncementInput(
        { title: 'a', body: 'b', status: 'PUBLISHED', publishAt: '2026-10-14T09:00:00Z', expiresAt: '2026-10-14T09:00:00Z' },
        now,
      ),
    ).toThrow();
  });

  it('keeps markdown structure and rejects tag-like bodies', () => {
    const md = '## Başlık\n\n- **a**\n- [b](https://x.y)';
    expect(normalizeAnnouncementInput({ title: 't', body: md }, now).body).toBe(md);
    expect(normalizeAnnouncementInput({ title: 't', body: 'a < b' }, now).body).toBe('a < b');
    expect(() => normalizeAnnouncementInput({ title: 't', body: '<script>x</script>' }, now)).toThrow();
    expect(() => normalizeAnnouncementInput({ title: 't', body: 'a </b> c' }, now)).toThrow();
  });

  it('derives lifecycle state', () => {
    const at = (offsetHours: number) => new Date(now.getTime() + offsetHours * HOUR);
    expect(announcementState({ status: 'DRAFT', publishAt: at(-1), expiresAt: null }, now)).toBe('DRAFT');
    expect(announcementState({ status: 'PUBLISHED', publishAt: at(1), expiresAt: null }, now)).toBe('SCHEDULED');
    expect(announcementState({ status: 'PUBLISHED', publishAt: at(-1), expiresAt: null }, now)).toBe('PUBLISHED');
    expect(announcementState({ status: 'PUBLISHED', publishAt: at(-2), expiresAt: at(-1) }, now)).toBe('EXPIRED');
  });
});

describe('announcement routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let instructorToken: string;
  let otherInstructorToken: string;
  let studentToken: string;
  let outsiderToken: string;
  let courseA: string; // öğrenci kayıtlı, eğitmen atanmış
  let courseB: string; // kimse yok

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function list(token: string, query = '') {
    return app.inject({ method: 'GET', url: `/api/v1/announcements${query}`, headers: auth(token) });
  }
  function manage(token: string, query = '') {
    return app.inject({ method: 'GET', url: `/api/v1/announcements/manage${query}`, headers: auth(token) });
  }
  function get(token: string, id: string) {
    return app.inject({ method: 'GET', url: `/api/v1/announcements/${id}`, headers: auth(token) });
  }
  function post(token: string, payload: unknown) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/announcements',
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });
  }
  function patch(token: string, id: string, payload: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/announcements/${id}`,
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });
  }
  function del(token: string, id: string) {
    return app.inject({ method: 'DELETE', url: `/api/v1/announcements/${id}`, headers: auth(token) });
  }
  async function seed(data: {
    title: string;
    status?: 'DRAFT' | 'PUBLISHED';
    publishAt?: Date | null;
    expiresAt?: Date | null;
    courseId?: string | null;
    pinned?: boolean;
    category?: string;
  }) {
    const status = data.status ?? 'PUBLISHED';
    return prisma.announcement.create({
      data: {
        title: data.title,
        body: 'Metin',
        status,
        publishAt: data.publishAt === undefined ? (status === 'PUBLISHED' ? new Date(Date.now() - HOUR) : null) : data.publishAt,
        expiresAt: data.expiresAt ?? null,
        courseId: data.courseId ?? null,
        pinned: data.pinned ?? false,
        category: data.category ?? 'GENERAL',
      },
    });
  }
  const titles = (res: { json: () => { announcements: { title: string }[] } }) =>
    res.json().announcements.map((a) => a.title);

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.announcement.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const makeUser = (email: string, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') =>
      prisma.user.create({ data: { email, passwordHash: 'x', name: email, role } });
    const admin = await makeUser('admin@example.com', 'ADMIN');
    const instructor = await makeUser('instructor@example.com', 'INSTRUCTOR');
    const otherInstructor = await makeUser('instructor2@example.com', 'INSTRUCTOR');
    const student = await makeUser('student@example.com', 'STUDENT');
    const outsider = await makeUser('outsider@example.com', 'STUDENT');
    const tokenFor = (userId: string, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') =>
      signToken({ userId, role, roles: [role] });
    adminToken = tokenFor(admin.id, 'ADMIN');
    instructorToken = tokenFor(instructor.id, 'INSTRUCTOR');
    otherInstructorToken = tokenFor(otherInstructor.id, 'INSTRUCTOR');
    studentToken = tokenFor(student.id, 'STUDENT');
    outsiderToken = tokenFor(outsider.id, 'STUDENT');

    const makeCourse = (title: string) =>
      prisma.course.create({
        data: { title, description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
      });
    courseA = (await makeCourse('Kurs A')).id;
    courseB = (await makeCourse('Kurs B')).id;
    await prisma.enrollment.create({ data: { userId: student.id, courseId: courseA, method: 'OPEN' } });
    await prisma.courseInstructor.create({ data: { courseId: courseA, userId: instructor.id, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET reader feed', () => {
    it('requires auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/announcements' });
      expect(res.statusCode).toBe(401);
    });

    it('shows only live announcements visible to the reader', async () => {
      await seed({ title: 'Genel' });
      await seed({ title: 'A duyurusu', courseId: courseA, publishAt: new Date(Date.now() - 2 * HOUR) });
      await seed({ title: 'B duyurusu', courseId: courseB });
      await seed({ title: 'Taslak', status: 'DRAFT' });
      await seed({ title: 'Zamanlanmış', publishAt: new Date(Date.now() + HOUR) });
      await seed({ title: 'Süresi dolmuş', publishAt: new Date(Date.now() - 2 * HOUR), expiresAt: new Date(Date.now() - HOUR) });

      expect(titles(await list(studentToken))).toEqual(['Genel', 'A duyurusu']);
      expect(titles(await list(outsiderToken))).toEqual(['Genel']);
      expect(titles(await list(instructorToken))).toEqual(['Genel', 'A duyurusu']);
      expect(titles(await list(adminToken)).sort()).toEqual(['A duyurusu', 'B duyurusu', 'Genel']);
    });

    it('puts pinned announcements first, then newest', async () => {
      await seed({ title: 'Eski sabit', pinned: true, publishAt: new Date(Date.now() - 5 * HOUR) });
      await seed({ title: 'Yeni', publishAt: new Date(Date.now() - HOUR) });
      await seed({ title: 'Eski', publishAt: new Date(Date.now() - 3 * HOUR) });
      expect(titles(await list(studentToken))).toEqual(['Eski sabit', 'Yeni', 'Eski']);
    });

    it('filters by category and limit and validates them', async () => {
      await seed({ title: 'Akademik', category: 'ACADEMIC' });
      await seed({ title: 'BT', category: 'IT', publishAt: new Date(Date.now() - 2 * HOUR) });
      expect(titles(await list(studentToken, '?category=IT'))).toEqual(['BT']);
      expect(titles(await list(studentToken, '?limit=1'))).toEqual(['Akademik']);
      expect((await list(studentToken, '?category=X')).statusCode).toBe(400);
      expect((await list(studentToken, '?limit=0')).statusCode).toBe(400);
    });

    it('marks canEdit per viewer', async () => {
      await seed({ title: 'A duyurusu', courseId: courseA });
      expect((await list(instructorToken)).json().announcements[0].canEdit).toBe(true);
      expect((await list(studentToken)).json().announcements[0].canEdit).toBe(false);
    });
  });

  describe('GET detail', () => {
    it('hides drafts and other-course announcements from readers', async () => {
      const draft = await seed({ title: 'Taslak', status: 'DRAFT', courseId: courseA });
      const other = await seed({ title: 'B', courseId: courseB });
      const live = await seed({ title: 'A', courseId: courseA });

      expect((await get(studentToken, draft.id)).statusCode).toBe(404);
      expect((await get(studentToken, other.id)).statusCode).toBe(404);
      expect((await get(studentToken, live.id)).json().announcement).toMatchObject({ title: 'A', state: 'PUBLISHED' });
      // Yönetici/eğitmen taslağı görebilir.
      expect((await get(instructorToken, draft.id)).json().announcement.state).toBe('DRAFT');
    });
  });

  describe('GET manage', () => {
    it('is forbidden for students', async () => {
      expect((await manage(studentToken)).statusCode).toBe(403);
    });

    it('lists every state for admin, only assigned courses for instructors', async () => {
      await seed({ title: 'Genel taslak', status: 'DRAFT' });
      await seed({ title: 'A zamanlanmış', courseId: courseA, publishAt: new Date(Date.now() + HOUR) });
      await seed({ title: 'B yayında', courseId: courseB });

      expect(titles(await manage(adminToken)).sort()).toEqual(['A zamanlanmış', 'B yayında', 'Genel taslak']);
      expect(titles(await manage(instructorToken))).toEqual(['A zamanlanmış']);
      expect(titles(await manage(otherInstructorToken))).toEqual([]);
      expect(titles(await manage(adminToken, '?state=SCHEDULED'))).toEqual(['A zamanlanmış']);
      expect((await manage(adminToken, '?state=X')).statusCode).toBe(400);
    });
  });

  describe('POST', () => {
    it('lets admin create a general announcement and records the author', async () => {
      const res = await post(adminToken, { title: 'Duyuru', body: 'Metin', status: 'PUBLISHED', category: 'ACADEMIC' });
      expect(res.statusCode).toBe(201);
      const created = res.json().announcement;
      expect(created).toMatchObject({ title: 'Duyuru', state: 'PUBLISHED', category: 'ACADEMIC', course: null });
      expect(created.author.name).toBe('admin@example.com');
      expect(titles(await list(studentToken))).toEqual(['Duyuru']);
    });

    it('validates input', async () => {
      expect((await post(adminToken, { title: '', body: 'x' })).statusCode).toBe(400);
      expect((await post(adminToken, { title: 'x' })).statusCode).toBe(400);
      expect((await post(adminToken, { title: 'x', body: 'y', category: 'NOPE' })).statusCode).toBe(400);
      expect((await post(adminToken, { title: 'x', body: 'y', publishAt: '2026-10-14T09:00' })).statusCode).toBe(400);
      expect((await post(adminToken, { title: 'x', body: 'y', courseId: 'yok' })).statusCode).toBe(404);
    });

    it('round-trips a markdown body unchanged', async () => {
      const body = '## Başlık\n\nBu **kalın** ve *italik*.\n\n- bir\n- iki\n\n1. a\n2. b\n\n> alıntı\n\n[bağlantı](https://example.com)';
      const res = await post(adminToken, { title: 'MD', body, status: 'PUBLISHED' });
      expect(res.statusCode).toBe(201);
      expect(res.json().announcement.body).toBe(body);
      const detail = await get(studentToken, res.json().announcement.id);
      expect(detail.json().announcement.body).toBe(body);
    });

    it('rejects raw HTML in the body but accepts plain text', async () => {
      for (const body of ['<script>alert(1)</script>', 'x <iframe src="a"></iframe>', '<img src=x onerror=alert(1)>']) {
        const res = await post(adminToken, { title: 'x', body });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
      expect((await post(adminToken, { title: 'x', body: 'a < b ve c > d' })).statusCode).toBe(201);
      expect((await post(adminToken, { title: 'x', body: 'Eski düz metin.\n\nİkinci paragraf.' })).statusCode).toBe(201);
    });

    it('enforces write targets', async () => {
      expect((await post(instructorToken, { title: 'x', body: 'y' })).statusCode).toBe(403);
      expect((await post(instructorToken, { title: 'x', body: 'y', courseId: courseB })).statusCode).toBe(403);
      expect((await post(studentToken, { title: 'x', body: 'y', courseId: courseA })).statusCode).toBe(403);
      expect((await post(instructorToken, { title: 'x', body: 'y', courseId: courseA })).statusCode).toBe(201);
    });
  });

  describe('PATCH', () => {
    it('publishes a draft now even if it had an old publishAt', async () => {
      const draft = await seed({ title: 'T', status: 'DRAFT', publishAt: new Date('2020-01-01T00:00:00Z') });
      const before = Date.now();
      const res = await patch(adminToken, draft.id, { status: 'PUBLISHED' });
      expect(res.statusCode).toBe(200);
      expect(new Date(res.json().announcement.publishAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('unpublishes and pins', async () => {
      const live = await seed({ title: 'T' });
      const res = await patch(adminToken, live.id, { status: 'DRAFT', pinned: true });
      expect(res.json().announcement).toMatchObject({ state: 'DRAFT', pinned: true });
      expect(titles(await list(studentToken))).toEqual([]);
    });

    it('requires a field and enforces both source and target permissions', async () => {
      const own = await seed({ title: 'A', courseId: courseA });
      expect((await patch(instructorToken, own.id, {})).statusCode).toBe(400);
      expect((await patch(instructorToken, own.id, { courseId: courseB })).statusCode).toBe(403);
      expect((await patch(instructorToken, own.id, { courseId: null })).statusCode).toBe(403);
      expect((await patch(otherInstructorToken, own.id, { title: 'x' })).statusCode).toBe(403);
      expect((await patch(instructorToken, own.id, { title: 'Yeni' })).json().announcement.title).toBe('Yeni');
    });
  });

  describe('DELETE', () => {
    it('deletes with write permission only', async () => {
      const own = await seed({ title: 'A', courseId: courseA });
      expect((await del(studentToken, own.id)).statusCode).toBe(403);
      expect((await del(instructorToken, own.id)).json()).toEqual({ deleted: true });
      expect((await del(instructorToken, own.id)).statusCode).toBe(404);
    });
  });
});
