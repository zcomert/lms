import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';

describe('comment routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonId: string;
  let ids: Record<'s1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const list = (token = tokens.s1) =>
    app.inject({ method: 'GET', url: `/api/v1/lessons/${lessonId}/comments`, headers: auth(token) });
  const post = (payload: unknown, token = tokens.s1) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${lessonId}/comments`,
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });
  const del = (id: string, token = tokens.s1) =>
    app.inject({ method: 'DELETE', url: `/api/v1/comments/${id}`, headers: auth(token) });
  const react = (id: string, payload: unknown, token = tokens.s1) =>
    app.inject({
      method: 'PUT',
      url: `/api/v1/comments/${id}/reactions`,
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.commentReaction.deleteMany();
    await prisma.lessonComment.deleteMany();
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
        data: { email: `${key}@example.com`, passwordHash: 'x', name: key, role, roles: role },
      });
      ids[key] = user.id;
      tokens[key] = signToken({ userId: user.id, role, roles: [role] });
    }

    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
    });
    courseId = course.id;
    const mod = await prisma.module.create({ data: { courseId, title: 'Modül', order: 1 } });
    const lesson = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Ders', order: 1, status: 'PUBLISHED', contentType: 'TEXT' },
    });
    lessonId = lesson.id;

    for (const key of ['s1', 's2'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('lets an enrolled student post and list', async () => {
    const res = await post({ body: '  Merhaba  ' });
    expect(res.statusCode).toBe(200);
    const created = res.json().comment;
    expect(created.body).toBe('Merhaba');
    expect(created.canDelete).toBe(true);
    expect(created.author).toMatchObject({ id: ids.s1, role: 'STUDENT', avatarUrl: null });
    expect(created.reactions).toEqual({
      like: { count: 0, mine: false },
      love: { count: 0, mine: false },
      insightful: { count: 0, mine: false },
      celebrate: { count: 0, mine: false },
    });

    const listed = (await list()).json().comments;
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
    // another student sees it but cannot delete it
    expect((await list(tokens.s2)).json().comments[0].canDelete).toBe(false);
  });

  it('rejects non-enrolled students on GET and POST', async () => {
    expect((await list(tokens.outsider)).statusCode).toBe(403);
    expect((await post({ body: 'x' }, tokens.outsider)).statusCode).toBe(403);
    expect(await prisma.lessonComment.count()).toBe(0);
  });

  it('validates the body', async () => {
    for (const payload of [{}, { body: '   ' }, { body: 5 }]) {
      const res = await post(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toBe('Yorum boş olamaz.');
    }
    const long = await post({ body: 'a'.repeat(2001) });
    expect(long.statusCode).toBe(400);
    expect(long.json().error.message).toBe('Yorum en fazla 2000 karakter olabilir.');
    expect((await post({ body: 'a'.repeat(2000) })).statusCode).toBe(200);
  });

  it('returns comments newest first', async () => {
    const base = Date.now();
    for (const [i, body] of ['ilk', 'ikinci', 'üçüncü'].entries()) {
      await prisma.lessonComment.create({
        data: { lessonId, userId: ids.s1, body, createdAt: new Date(base + i * 1000) },
      });
    }
    const bodies = (await list()).json().comments.map((c: { body: string }) => c.body);
    expect(bodies).toEqual(['üçüncü', 'ikinci', 'ilk']);
  });

  it('lets the author delete their own comment', async () => {
    const id = (await post({ body: 'sil' })).json().comment.id;
    const res = await del(id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(await prisma.lessonComment.count()).toBe(0);
    expect((await del(id)).statusCode).toBe(404);
  });

  it('lets assigned instructor and admin delete others, but not other students or unassigned instructors', async () => {
    const make = async () => (await post({ body: 'yorum' })).json().comment.id as string;

    let id = await make();
    const denied = await del(id, tokens.s2);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.message).toBe('Bu yorumu silemezsiniz.');
    expect((await del(id, tokens.otherInstructor)).statusCode).toBe(403);
    expect((await del(id, tokens.instructor)).statusCode).toBe(200);

    id = await make();
    expect((await del(id, tokens.admin)).statusCode).toBe(200);
    expect(await prisma.lessonComment.count()).toBe(0);
  });

  it('toggles reactions and updates counts and mine', async () => {
    const id = (await post({ body: 'tepki' })).json().comment.id;

    let res = await react(id, { emoji: 'like', active: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().comment.reactions.like).toEqual({ count: 1, mine: true });

    // idempotent
    res = await react(id, { emoji: 'like', active: true });
    expect(res.json().comment.reactions.like).toEqual({ count: 1, mine: true });

    res = await react(id, { emoji: 'like', active: true }, tokens.s2);
    expect(res.json().comment.reactions.like).toEqual({ count: 2, mine: true });
    await react(id, { emoji: 'love', active: true }, tokens.s2);

    const s1 = (await list()).json().comments[0].reactions;
    expect(s1.like).toEqual({ count: 2, mine: true });
    expect(s1.love).toEqual({ count: 1, mine: false });

    res = await react(id, { emoji: 'like', active: false });
    expect(res.json().comment.reactions.like).toEqual({ count: 1, mine: false });
    expect((await react(id, { emoji: 'like', active: false })).statusCode).toBe(200);
  });

  it('rejects invalid reactions and unauthorized reactors', async () => {
    const id = (await post({ body: 'tepki' })).json().comment.id;
    for (const payload of [{ emoji: 'angry', active: true }, { active: true }, { emoji: 'like' }]) {
      const res = await react(id, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toBe('Geçersiz tepki.');
    }
    expect((await react(id, { emoji: 'like', active: true }, tokens.outsider)).statusCode).toBe(403);
    expect((await react('nope', { emoji: 'like', active: true })).statusCode).toBe(404);
  });

  it('badges the author role correctly', async () => {
    await post({ body: 'öğrenci' });
    await post({ body: 'eğitmen' }, tokens.instructor);
    await post({ body: 'yönetici' }, tokens.admin);
    const roles = Object.fromEntries(
      (await list()).json().comments.map((c: { body: string; author: { role: string } }) => [c.body, c.author.role]),
    );
    expect(roles).toEqual({ öğrenci: 'STUDENT', eğitmen: 'INSTRUCTOR', yönetici: 'ADMIN' });
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/lessons/${lessonId}/comments` });
    expect(res.statusCode).toBe(401);
  });
});
