import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { groupComments, parseCommentBody } from '../lib/comments.js';

describe('comment helpers', () => {
  it('validates bodies', () => {
    expect(parseCommentBody(undefined).ok).toBe(false);
    expect(parseCommentBody({}).ok).toBe(false);
    expect(parseCommentBody({ body: '' }).ok).toBe(false);
    expect(parseCommentBody({ body: '   ' }).ok).toBe(false);
    expect(parseCommentBody({ body: 'x'.repeat(2001) }).ok).toBe(false);
    expect(parseCommentBody({ body: 'ok' })).toEqual({ ok: true, parsed: { body: 'ok', parentId: null } });
    expect(parseCommentBody({ body: '  trimmed  ' })).toEqual({
      ok: true,
      parsed: { body: 'trimmed', parentId: null },
    });
    expect(parseCommentBody({ body: 'ok', parentId: 'p1' })).toEqual({
      ok: true,
      parsed: { body: 'ok', parentId: 'p1' },
    });
    expect(parseCommentBody({ body: 'ok', parentId: 1 }).ok).toBe(false);
  });

  it('groups replies under their root, both sorted by createdAt ascending', () => {
    const author = { id: 'u1', name: 'Ali', avatarUrl: null };
    const t = (n: number) => new Date(2026, 0, 1, 0, 0, n);
    const rows = [
      { id: 'r2', body: 'reply2', author, createdAt: t(4), parentId: 'root1' },
      { id: 'root2', body: 'root2', author, createdAt: t(3), parentId: null },
      { id: 'root1', body: 'root1', author, createdAt: t(1), parentId: null },
      { id: 'r1', body: 'reply1', author, createdAt: t(2), parentId: 'root1' },
    ];
    const grouped = groupComments(rows);
    expect(grouped.map((c) => c.id)).toEqual(['root1', 'root2']);
    expect(grouped[0].replies.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(grouped[1].replies).toEqual([]);
  });
});

describe('comment routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonId: string;
  let draftLessonId: string;
  let ids: Record<'s1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const get = (token?: string, id = lessonId) =>
    app.inject({ method: 'GET', url: `/api/v1/lessons/${id}/comments`, headers: token ? auth(token) : {} });
  const post = (payload: unknown, token = tokens.s1, id = lessonId) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${id}/comments`,
      headers: auth(token),
      payload: payload as Record<string, unknown>,
    });
  const rows = () => prisma.lessonComment.count();

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
    const lesson = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Ders', order: 1, status: 'PUBLISHED', contentType: 'TEXT' },
    });
    const draft = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Taslak', order: 2, status: 'DRAFT', contentType: 'TEXT' },
    });
    lessonId = lesson.id;
    draftLessonId = draft.id;

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
    expect((await get()).statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/lessons/${lessonId}/comments`,
      payload: { body: 'merhaba' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for missing and draft lessons', async () => {
    for (const id of ['nope', draftLessonId]) {
      const g = await get(tokens.s1, id);
      expect(g.statusCode).toBe(404);
      expect(g.json().error.code).toBe('NOT_FOUND');
      expect((await post({ body: 'merhaba' }, tokens.s1, id)).statusCode).toBe(404);
    }
  });

  it('returns 403 for unenrolled students and unassigned instructors', async () => {
    const g = await get(tokens.outsider);
    expect(g.statusCode).toBe(403);
    expect(g.json().error.code).toBe('NOT_ENROLLED');
    const p = await post({ body: 'merhaba' }, tokens.outsider);
    expect(p.statusCode).toBe(403);
    expect(p.json().error.code).toBe('NOT_ENROLLED');

    expect((await get(tokens.otherInstructor)).statusCode).toBe(403);
    expect((await post({ body: 'merhaba' }, tokens.otherInstructor)).statusCode).toBe(403);
  });

  it('lets ADMIN and assigned INSTRUCTOR read and write', async () => {
    for (const key of ['admin', 'instructor'] as const) {
      expect((await get(tokens[key])).statusCode).toBe(200);
      const res = await post({ body: `yorum-${key}` }, tokens[key]);
      expect(res.statusCode).toBe(201);
    }
    expect(await rows()).toBe(2);
  });

  it('creates a root comment', async () => {
    const res = await post({ body: 'Çok güzel ders!' }, tokens.s1);
    expect(res.statusCode).toBe(201);
    const { comment } = res.json();
    expect(comment.body).toBe('Çok güzel ders!');
    expect(comment.parentId).toBeNull();
    expect(comment.author).toEqual({ id: ids.s1, name: 's1', avatarUrl: null });
    expect(typeof comment.createdAt).toBe('string');
  });

  it('creates a reply to a root comment', async () => {
    const root = (await post({ body: 'kök' }, tokens.s1)).json().comment;
    const res = await post({ body: 'yanıt', parentId: root.id }, tokens.s2);
    expect(res.statusCode).toBe(201);
    expect(res.json().comment.parentId).toBe(root.id);
  });

  it('rejects empty or whitespace-only body', async () => {
    for (const body of ['', '   ', undefined]) {
      const res = await post({ body });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(await rows()).toBe(0);
  });

  it('rejects body over 2000 characters', async () => {
    const res = await post({ body: 'x'.repeat(2001) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects parentId belonging to another lesson', async () => {
    const mod = await prisma.module.create({ data: { courseId, title: 'Modül 2', order: 2 } });
    const otherLesson = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Diğer Ders', order: 1, status: 'PUBLISHED', contentType: 'TEXT' },
    });
    const otherRoot = (await post({ body: 'başka ders kökü' }, tokens.s1, otherLesson.id)).json().comment;

    const res = await post({ body: 'yanıt', parentId: otherRoot.id }, tokens.s2, lessonId);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARENT');
  });

  it('rejects replying to a reply', async () => {
    const root = (await post({ body: 'kök' }, tokens.s1)).json().comment;
    const reply = (await post({ body: 'yanıt', parentId: root.id }, tokens.s2)).json().comment;

    const res = await post({ body: 'yanıta yanıt', parentId: reply.id }, tokens.s1);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PARENT');
  });

  it('returns 404 for a nonexistent parentId', async () => {
    const res = await post({ body: 'yanıt', parentId: 'nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('COMMENT_NOT_FOUND');
  });

  it('lists comments grouped and sorted with nested replies', async () => {
    const rootA = (await post({ body: 'A' }, tokens.s1)).json().comment;
    const rootB = (await post({ body: 'B' }, tokens.s2)).json().comment;
    await post({ body: 'A-reply-1', parentId: rootA.id }, tokens.s2);
    await post({ body: 'A-reply-2', parentId: rootA.id }, tokens.s1);

    const res = await get(tokens.s1);
    expect(res.statusCode).toBe(200);
    const { comments } = res.json();
    expect(comments.map((c: { id: string }) => c.id)).toEqual([rootA.id, rootB.id]);
    expect(comments[0].replies.map((r: { body: string }) => r.body)).toEqual(['A-reply-1', 'A-reply-2']);
    expect(comments[1].replies).toEqual([]);
    expect(comments[0]).not.toHaveProperty('parentId');
  });

  it('cascades when the lesson is deleted', async () => {
    await post({ body: 'A' }, tokens.s1);
    await post({ body: 'B' }, tokens.s2);
    expect(await rows()).toBe(2);
    await prisma.lesson.delete({ where: { id: lessonId } });
    expect(await rows()).toBe(0);
  });
});
