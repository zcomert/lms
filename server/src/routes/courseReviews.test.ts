import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';

describe('course review routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let draftCourseId: string;
  type Key = 's1' | 's2' | 's3' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor';
  const ids = {} as Record<Key, string>;
  const tokens = {} as Record<Key, string>;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as Record<string, unknown> | undefined,
    });
  const list = (token: string, id = courseId) => call('GET', `/api/v1/courses/${id}/reviews`, token);
  const post = (token: string, payload: unknown, id = courseId) =>
    call('POST', `/api/v1/courses/${id}/reviews`, token, payload);
  const reply = (token: string, reviewId: string, payload: unknown) =>
    call('POST', `/api/v1/course-reviews/${reviewId}/replies`, token, payload);

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.lessonComment.deleteMany();
    await prisma.courseReview.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const roles = {
      s1: 'STUDENT',
      s2: 'STUDENT',
      s3: 'STUDENT',
      outsider: 'STUDENT',
      admin: 'ADMIN',
      instructor: 'INSTRUCTOR',
      otherInstructor: 'INSTRUCTOR',
    } as const;
    for (const [key, role] of Object.entries(roles) as [Key, 'STUDENT' | 'ADMIN' | 'INSTRUCTOR'][]) {
      const user = await prisma.user.create({
        data: { email: `${key}@example.com`, passwordHash: 'x', name: key, role },
      });
      ids[key] = user.id;
      tokens[key] = signToken({ userId: user.id, role, roles: [role] });
    }
    const base = { description: 'Açıklama', category: 'Test', level: 'Başlangıç' };
    courseId = (await prisma.course.create({ data: { title: 'Kurs', ...base, status: 'PUBLISHED' } })).id;
    draftCourseId = (await prisma.course.create({ data: { title: 'Taslak', ...base, status: 'DRAFT' } })).id;
    for (const key of ['s1', 's2', 's3'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
    }
    await prisma.enrollment.create({ data: { userId: ids.s1, courseId: draftCourseId, method: 'OPEN' } });
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    expect((await call('GET', `/api/v1/courses/${courseId}/reviews`)).statusCode).toBe(401);
  });

  it('blocks non-enrolled users', async () => {
    expect((await list(tokens.outsider)).statusCode).toBe(403);
    const res = await post(tokens.outsider, { rating: 5 });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_ENROLLED');
    expect((await post(tokens.admin, { rating: 5 })).statusCode).toBe(403);
    expect((await list(tokens.otherInstructor)).statusCode).toBe(403);
  });

  it('hides unpublished and unknown courses', async () => {
    expect((await list(tokens.s1, draftCourseId)).statusCode).toBe(404);
    expect((await post(tokens.s1, { rating: 5 }, draftCourseId)).statusCode).toBe(404);
    expect((await list(tokens.s1, 'nope')).statusCode).toBe(404);
    expect((await list(tokens.admin, draftCourseId)).statusCode).toBe(200);
  });

  it('validates rating and body', async () => {
    for (const payload of [
      undefined,
      {},
      { rating: 0 },
      { rating: 6 },
      { rating: 3.5 },
      { rating: '4' },
      { rating: null },
      { rating: 4, body: 5 },
      { rating: 4, body: 'a'.repeat(2001) },
    ]) {
      const res = await post(tokens.s1, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.courseReview.count()).toBe(0);
    const ok = await post(tokens.s1, { rating: 4, body: '   ' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().review.body).toBeNull();
  });

  it('creates a review, rejects a second one and reports summary', async () => {
    const res = await post(tokens.s1, { rating: 5, body: ' Harika ' });
    expect(res.statusCode).toBe(201);
    expect(res.json().review).toMatchObject({
      rating: 5,
      body: 'Harika',
      editedAt: null,
      canEdit: true,
      canDelete: true,
      replies: [],
      author: { id: ids.s1, name: 's1', avatarUrl: null },
    });
    expect(JSON.stringify(res.json())).not.toContain('@example.com');

    const dup = await post(tokens.s1, { rating: 1 });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('REVIEW_EXISTS');

    await post(tokens.s2, { rating: 4 });
    const third = await post(tokens.s3, { rating: 4 });
    expect(third.json().summary).toEqual({
      ratingAverage: 4.3,
      ratingCount: 3,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 2, '5': 1 },
    });

    const mine = (await list(tokens.s1)).json();
    expect(mine.mine.rating).toBe(5);
    expect(mine.permissions).toEqual({ canReview: false, canReply: false });
    expect(mine.reviews).toHaveLength(3);
    const dates = mine.reviews.map((r: { createdAt: string }) => r.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    const s2view = (await list(tokens.s2)).json();
    expect(s2view.reviews.find((r: { author: { id: string } }) => r.author.id === ids.s1)).toMatchObject({
      canEdit: false,
      canDelete: false,
    });

    const empty = await list(tokens.instructor);
    expect(empty.json().permissions).toEqual({ canReview: false, canReply: true });
    expect(empty.json().mine).toBeNull();
  });

  it('shows empty summary and canReview for a fresh student', async () => {
    const res = (await list(tokens.s1)).json();
    expect(res.summary).toEqual({
      ratingAverage: null,
      ratingCount: 0,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    });
    expect(res.permissions.canReview).toBe(true);
    expect(res.mine).toBeNull();
  });

  it('edits only own review and sets editedAt', async () => {
    const { review } = (await post(tokens.s1, { rating: 5, body: 'İyi' })).json();
    const url = `/api/v1/course-reviews/${review.id}`;
    expect((await call('PATCH', url, tokens.s2, { rating: 1 })).statusCode).toBe(403);
    expect((await call('PATCH', url, tokens.instructor, { rating: 1 })).statusCode).toBe(403);
    expect((await call('PATCH', url, tokens.outsider, { rating: 1 })).statusCode).toBe(403);
    expect((await call('PATCH', url, tokens.s1, {})).statusCode).toBe(400);
    expect((await call('PATCH', url, tokens.s1, { rating: 7 })).statusCode).toBe(400);
    expect((await call('PATCH', '/api/v1/course-reviews/nope', tokens.s1, { rating: 3 })).statusCode).toBe(404);

    const res = await call('PATCH', url, tokens.s1, { rating: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.json().review).toMatchObject({ rating: 3, body: 'İyi' });
    expect(res.json().review.editedAt).toEqual(expect.any(String));
    expect(res.json().summary.ratingAverage).toBe(3);

    const cleared = await call('PATCH', url, tokens.s1, { body: null });
    expect(cleared.json().review.body).toBeNull();
    expect(cleared.json().review.rating).toBe(3);
  });

  it('handles replies: permissions, editing, deletion', async () => {
    const { review } = (await post(tokens.s1, { rating: 5, body: 'İyi' })).json();
    expect((await reply(tokens.s2, review.id, { body: 'x' })).statusCode).toBe(403);
    expect((await reply(tokens.s1, review.id, { body: 'x' })).statusCode).toBe(403);
    expect((await reply(tokens.otherInstructor, review.id, { body: 'x' })).statusCode).toBe(403);
    expect((await reply(tokens.instructor, review.id, { body: '' })).statusCode).toBe(400);
    expect((await reply(tokens.instructor, 'nope', { body: 'x' })).statusCode).toBe(404);

    const r1 = await reply(tokens.instructor, review.id, { body: 'Teşekkürler' });
    expect(r1.statusCode).toBe(201);
    expect(r1.json().reply).toMatchObject({ authorRole: 'INSTRUCTOR', canEdit: true, canDelete: true });
    const r2 = await reply(tokens.admin, review.id, { body: 'Yönetici' });
    expect(r2.json().reply.authorRole).toBe('ADMIN');
    const id1 = r1.json().reply.id;
    const id2 = r2.json().reply.id;

    const seen = (await list(tokens.s1)).json().reviews[0].replies;
    expect(seen.map((r: { body: string }) => r.body)).toEqual(['Teşekkürler', 'Yönetici']);
    expect(seen[0]).toMatchObject({ canEdit: false, canDelete: false });

    const url = (id: string) => `/api/v1/course-review-replies/${id}`;
    expect((await call('PATCH', url(id1), tokens.admin, { body: 'Hack' })).statusCode).toBe(403);
    expect((await call('PATCH', url(id1), tokens.s1, { body: 'Hack' })).statusCode).toBe(403);
    expect((await call('PATCH', url('nope'), tokens.instructor, { body: 'x' })).statusCode).toBe(404);
    const edited = await call('PATCH', url(id1), tokens.instructor, { body: 'Güncel' });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().reply.body).toBe('Güncel');
    expect(edited.json().reply.editedAt).toEqual(expect.any(String));

    expect((await call('DELETE', url(id1), tokens.s1)).statusCode).toBe(403);
    expect((await call('DELETE', url(id1), tokens.otherInstructor)).statusCode).toBe(403);
    expect((await call('DELETE', url(id1), tokens.instructor)).statusCode).toBe(200);
    expect((await call('DELETE', url(id2), tokens.instructor)).statusCode).toBe(200); // moderasyon
    expect(await prisma.courseReviewReply.count()).toBe(0);
  });

  it('deletes reviews: author, assigned instructor (cascade), admin; others forbidden', async () => {
    const url = (id: string) => `/api/v1/course-reviews/${id}`;
    const r1 = (await post(tokens.s1, { rating: 2 })).json().review.id as string;
    await post(tokens.s2, { rating: 4 });
    await reply(tokens.instructor, r1, { body: 'Yanıt' });

    expect((await call('DELETE', url(r1), tokens.s2)).statusCode).toBe(403);
    expect((await call('DELETE', url(r1), tokens.otherInstructor)).statusCode).toBe(403);
    expect((await call('DELETE', url('nope'), tokens.s1)).statusCode).toBe(404);

    const res = await call('DELETE', url(r1), tokens.instructor);
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().summary).toMatchObject({ ratingAverage: 4, ratingCount: 1 });
    expect(await prisma.courseReviewReply.count()).toBe(0);

    // silinen kullanıcı tekrar değerlendirebilir
    const again = await post(tokens.s1, { rating: 5 });
    expect(again.statusCode).toBe(201);
    expect((await call('DELETE', url(again.json().review.id), tokens.admin)).statusCode).toBe(200);
    const own = await post(tokens.s1, { rating: 5 });
    expect((await call('DELETE', url(own.json().review.id), tokens.s1)).statusCode).toBe(200);
  });
});
