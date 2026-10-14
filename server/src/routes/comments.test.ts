import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { parseCommentBody } from '../lib/comments.js';

describe('parseCommentBody', () => {
  it('trims and validates', () => {
    expect(parseCommentBody({ body: '  merhaba  ' })).toEqual({ ok: true, body: 'merhaba' });
    expect(parseCommentBody({ body: '   ' }).ok).toBe(false);
    expect(parseCommentBody({ body: 'a'.repeat(2000) }).ok).toBe(true);
    expect(parseCommentBody({ body: 'a'.repeat(2001) }).ok).toBe(false);
    expect(parseCommentBody({ body: 5 }).ok).toBe(false);
    expect(parseCommentBody(undefined).ok).toBe(false);
  });
});

describe('comment routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonId: string;
  let otherLessonId: string;
  let draftLessonId: string;
  let ids: Record<'s1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const list = (token?: string, id = lessonId) =>
    app.inject({ method: 'GET', url: `/api/v1/lessons/${id}/comments`, headers: token ? auth(token) : {} });
  const post = (payload: unknown, token = tokens.s1, id = lessonId) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${id}/comments`,
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });
  const del = (commentId: string, token = tokens.s1, id = lessonId) =>
    app.inject({ method: 'DELETE', url: `/api/v1/lessons/${id}/comments/${commentId}`, headers: auth(token) });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.lessonComment.deleteMany();
    await prisma.lessonFeedback.deleteMany();
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
      outsider: 'STUDENT',
      admin: 'ADMIN',
      instructor: 'INSTRUCTOR',
      otherInstructor: 'INSTRUCTOR',
    } as const;
    ids = {} as typeof ids;
    for (const [key, role] of Object.entries(roles) as [keyof typeof ids, 'STUDENT' | 'ADMIN' | 'INSTRUCTOR'][]) {
      const user = await prisma.user.create({
        data: { email: `${key}@example.com`, passwordHash: 'x', name: key, role },
      });
      ids[key] = user.id;
      tokens[key] = signToken({ userId: user.id, role, roles: [role] });
    }

    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
    });
    courseId = course.id;
    const mod = await prisma.module.create({ data: { courseId, title: 'Modül', order: 1 } });
    const mk = (title: string, order: number, status: 'PUBLISHED' | 'DRAFT') =>
      prisma.lesson.create({ data: { moduleId: mod.id, title, order, status, contentType: 'TEXT' } });
    lessonId = (await mk('Ders', 1, 'PUBLISHED')).id;
    draftLessonId = (await mk('Taslak', 2, 'DRAFT')).id;
    otherLessonId = (await mk('Ders 2', 3, 'PUBLISHED')).id;

    for (const key of ['s1', 's2'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    expect((await list()).statusCode).toBe(401);
    const p = await app.inject({ method: 'POST', url: `/api/v1/lessons/${lessonId}/comments`, payload: { body: 'x' } });
    expect(p.statusCode).toBe(401);
    const d = await app.inject({ method: 'DELETE', url: `/api/v1/lessons/${lessonId}/comments/x` });
    expect(d.statusCode).toBe(401);
  });

  it('returns 404 for missing and draft lessons', async () => {
    for (const id of ['nope', draftLessonId]) {
      const g = await list(tokens.s1, id);
      expect(g.statusCode).toBe(404);
      expect(g.json().error.code).toBe('NOT_FOUND');
      expect((await post({ body: 'x' }, tokens.s1, id)).statusCode).toBe(404);
      expect((await del('x', tokens.s1, id)).statusCode).toBe(404);
    }
  });

  it('returns 403 for unenrolled users on GET and POST', async () => {
    for (const key of ['outsider', 'otherInstructor'] as const) {
      const g = await list(tokens[key]);
      expect(g.statusCode).toBe(403);
      expect(g.json().error.code).toBe('NOT_ENROLLED');
      const p = await post({ body: 'x' }, tokens[key]);
      expect(p.statusCode).toBe(403);
      expect(p.json().error.code).toBe('NOT_ENROLLED');
    }
    expect(await prisma.lessonComment.count()).toBe(0);
  });

  it('creates and lists newest first with author and canDelete', async () => {
    const c1 = await post({ body: '  ilk  ' }, tokens.s1);
    expect(c1.statusCode).toBe(201);
    expect(c1.json().comment).toMatchObject({ body: 'ilk', author: { id: ids.s1, name: 's1' }, canDelete: true });
    const c2 = await post({ body: 'ikinci' }, tokens.s2);
    expect(c2.statusCode).toBe(201);

    const res = await list(tokens.s1);
    expect(res.statusCode).toBe(200);
    const comments = res.json().comments;
    expect(comments.map((c: { body: string }) => c.body)).toEqual(['ikinci', 'ilk']);
    expect(comments[0].author).toEqual({ id: ids.s2, name: 's2' });
    expect(comments[0].canDelete).toBe(false);
    expect(comments[1].canDelete).toBe(true);
    expect(typeof comments[0].createdAt).toBe('string');
  });

  it('validates the body', async () => {
    const bad: unknown[] = [{ body: '' }, { body: '   ' }, { body: 'a'.repeat(2001) }, { body: 123 }, { body: null }, {}];
    for (const payload of bad) {
      const res = await post(payload);
      expect(res.statusCode, JSON.stringify(payload).slice(0, 40)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect(res.json().error.message).toBe('Yorum 1 ile 2000 karakter arasında olmalıdır.');
    }
    expect((await post({ body: 'a'.repeat(2000) })).statusCode).toBe(201);
    expect(await prisma.lessonComment.count()).toBe(1);
  });

  it('lets course instructor and admin list/post without enrollment and delete others', async () => {
    const c = (await post({ body: 'öğrenci' }, tokens.s1)).json().comment;
    for (const key of ['instructor', 'admin'] as const) {
      const p = await post({ body: `${key} yorumu` }, tokens[key]);
      expect(p.statusCode).toBe(201);
      const g = await list(tokens[key]);
      expect(g.statusCode).toBe(200);
      expect(g.json().comments.every((x: { canDelete: boolean }) => x.canDelete)).toBe(true);
    }
    expect((await del(c.id, tokens.instructor)).statusCode).toBe(204);
    expect(await prisma.lessonComment.findUnique({ where: { id: c.id } })).toBeNull();
  });

  it('forbids students from deleting others comments; authors can delete their own', async () => {
    const c = (await post({ body: 'benim' }, tokens.s1)).json().comment;
    const res = await del(c.id, tokens.s2);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toEqual({ code: 'FORBIDDEN', message: 'Bu yorumu silme yetkiniz yok.' });
    expect(await prisma.lessonComment.count()).toBe(1);
    expect((await del(c.id, tokens.s1)).statusCode).toBe(204);
    expect(await prisma.lessonComment.count()).toBe(0);
    const again = await del(c.id, tokens.s1);
    expect(again.statusCode).toBe(404);
    expect(again.json().error.message).toBe('Yorum bulunamadı.');
  });

  it('returns 404 for a comment belonging to another lesson', async () => {
    const c = (await post({ body: 'x' }, tokens.s1, otherLessonId)).json().comment;
    const res = await del(c.id, tokens.s1, lessonId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('Yorum bulunamadı.');
    expect(await prisma.lessonComment.count()).toBe(1);
  });
});
