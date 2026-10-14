import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { buildCommentTree, parseCommentBody, type CommentRow } from '../lib/lessonComments.js';

describe('lessonComments helpers', () => {
  it('validates body', () => {
    expect(parseCommentBody(undefined).ok).toBe(false);
    expect(parseCommentBody(5).ok).toBe(false);
    expect(parseCommentBody('   ').ok).toBe(false);
    expect(parseCommentBody('x'.repeat(2001)).ok).toBe(false);
    expect(parseCommentBody('  merhaba ')).toEqual({ ok: true, body: 'merhaba' });
    expect(parseCommentBody('x'.repeat(2000)).ok).toBe(true);
  });

  it('builds a one-level tree in ascending order', () => {
    const user = { id: 'u', name: 'U', avatarUrl: null, role: 'STUDENT' };
    const row = (id: string, parentId: string | null, t: number): CommentRow => ({
      id, parentId, body: id, createdAt: new Date(t), editedAt: null, user,
    });
    const tree = buildCommentTree([row('r2', 'a', 5), row('b', null, 2), row('a', null, 1), row('r1', 'a', 3)], 'u', false);
    expect(tree.map((n) => n.id)).toEqual(['a', 'b']);
    expect(tree[0].replies.map((n) => n.id)).toEqual(['r1', 'r2']);
    expect(tree[0].replies[0].replies).toEqual([]);
    expect(tree[0].canEdit).toBe(true);
  });
});

describe('lesson comment routes', () => {
  let app: FastifyInstance;
  let lessonId: string;
  let otherLessonId: string;
  let draftLessonId: string;
  let ids: Record<'s1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const list = (token?: string, id = lessonId) =>
    app.inject({ method: 'GET', url: `/api/v1/lessons/${id}/comments`, headers: token ? auth(token) : {} });
  const post = (payload: unknown, token = tokens.s1, id = lessonId) =>
    app.inject({ method: 'POST', url: `/api/v1/lessons/${id}/comments`, headers: auth(token), payload: payload as Record<string, unknown> });
  const patch = (cid: string, payload: unknown, token = tokens.s1) =>
    app.inject({ method: 'PATCH', url: `/api/v1/lesson-comments/${cid}`, headers: auth(token), payload: payload as Record<string, unknown> });
  const del = (cid: string, token = tokens.s1) =>
    app.inject({ method: 'DELETE', url: `/api/v1/lesson-comments/${cid}`, headers: auth(token) });

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
      s1: 'STUDENT', s2: 'STUDENT', outsider: 'STUDENT',
      admin: 'ADMIN', instructor: 'INSTRUCTOR', otherInstructor: 'INSTRUCTOR',
    } as const;
    ids = {} as typeof ids;
    for (const [key, role] of Object.entries(roles) as [keyof typeof ids, 'STUDENT' | 'ADMIN' | 'INSTRUCTOR'][]) {
      const user = await prisma.user.create({ data: { email: `${key}@example.com`, passwordHash: 'x', name: key, role } });
      ids[key] = user.id;
      tokens[key] = signToken({ userId: user.id, role, roles: [role] });
    }
    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'A', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
    });
    const mod = await prisma.module.create({ data: { courseId: course.id, title: 'M', order: 1 } });
    const mk = (title: string, order: number, status: string) =>
      prisma.lesson.create({ data: { moduleId: mod.id, title, order, status, contentType: 'TEXT' } });
    lessonId = (await mk('Ders', 1, 'PUBLISHED')).id;
    otherLessonId = (await mk('Ders 2', 2, 'PUBLISHED')).id;
    draftLessonId = (await mk('Taslak', 3, 'DRAFT')).id;
    for (const key of ['s1', 's2'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId: course.id, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId: course.id, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    expect((await list()).statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: `/api/v1/lessons/${lessonId}/comments`, payload: { body: 'x' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for draft lessons', async () => {
    expect((await list(tokens.s1, draftLessonId)).statusCode).toBe(404);
    expect((await post({ body: 'x' }, tokens.s1, draftLessonId)).statusCode).toBe(404);
  });

  it('returns 403 NOT_ENROLLED for unenrolled students', async () => {
    for (const res of [await list(tokens.outsider), await post({ body: 'x' }, tokens.outsider)]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_ENROLLED');
    }
  });

  it('rejects empty, whitespace and too long bodies', async () => {
    for (const payload of [{}, { body: '' }, { body: '   ' }, { body: 'x'.repeat(2001) }, { body: 5 }]) {
      const res = await post(payload);
      expect(res.statusCode, JSON.stringify(payload).slice(0, 40)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('lets an enrolled student write a root comment', async () => {
    const res = await post({ body: '  Merhaba  ' });
    expect(res.statusCode).toBe(201);
    expect(res.json().comment).toMatchObject({
      body: 'Merhaba', editedAt: null, canEdit: true, canDelete: true, replies: [],
      author: { id: ids.s1, name: 's1', avatarUrl: null, role: 'STUDENT' },
    });
  });

  it('flattens replies to the root and lists them in order', async () => {
    const a = (await post({ body: 'A' })).json().comment;
    const b = (await post({ body: 'B', parentId: a.id }, tokens.s2)).json().comment;
    const c = (await post({ body: 'C', parentId: b.id })).json().comment;
    const row = await prisma.lessonComment.findUnique({ where: { id: c.id } });
    expect(row?.parentId).toBe(a.id);

    const comments = (await list(tokens.s2)).json().comments;
    expect(comments).toHaveLength(1);
    expect(comments[0].replies.map((r: { id: string }) => r.id)).toEqual([b.id, c.id]);
    expect(comments[0].replies[0].replies).toEqual([]);
    expect(comments[0].canEdit).toBe(false);
    expect(comments[0].canDelete).toBe(false);
    expect(comments[0].replies[0].canEdit).toBe(true);
  });

  it('rejects a parent from another lesson or a missing parent', async () => {
    const other = (await post({ body: 'X' }, tokens.s1, otherLessonId)).json().comment;
    expect((await post({ body: 'Y', parentId: other.id })).statusCode).toBe(404);
    expect((await post({ body: 'Y', parentId: 'nope' })).statusCode).toBe(404);
  });

  it('allows only the author to edit', async () => {
    const a = (await post({ body: 'A' })).json().comment;
    expect((await patch(a.id, { body: 'Z' }, tokens.s2)).statusCode).toBe(403);
    expect((await patch(a.id, { body: 'Z' }, tokens.admin)).statusCode).toBe(403);
    expect((await patch(a.id, { body: ' ' })).statusCode).toBe(400);
    const res = await patch(a.id, { body: 'Düzenlendi' });
    expect(res.statusCode).toBe(200);
    expect(res.json().comment.body).toBe('Düzenlendi');
    expect(res.json().comment.editedAt).not.toBeNull();
    expect((await patch('nope', { body: 'x' })).statusCode).toBe(404);
  });

  it('lets an unenrolled assigned instructor write and delete comments of others', async () => {
    const a = (await post({ body: 'A' })).json().comment;
    const w = await post({ body: 'Eğitmen', parentId: a.id }, tokens.instructor);
    expect(w.statusCode).toBe(201);
    expect(w.json().comment.author.role).toBe('INSTRUCTOR');
    const seen = (await list(tokens.instructor)).json().comments[0];
    expect(seen.canDelete).toBe(true);
    expect(seen.canEdit).toBe(false);
    const res = await del(a.id, tokens.instructor);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('forbids delete by other students and unassigned instructors', async () => {
    const a = (await post({ body: 'A' })).json().comment;
    expect((await del(a.id, tokens.s2)).statusCode).toBe(403);
    expect((await del(a.id, tokens.otherInstructor)).statusCode).toBe(403);
    expect((await del('nope')).statusCode).toBe(404);
  });

  it('deletes replies with the root (cascade)', async () => {
    const a = (await post({ body: 'A' })).json().comment;
    await post({ body: 'B', parentId: a.id }, tokens.s2);
    await post({ body: 'C', parentId: a.id });
    expect(await prisma.lessonComment.count()).toBe(3);
    expect((await del(a.id)).statusCode).toBe(200);
    expect((await list(tokens.s1)).json().comments).toEqual([]);
    expect(await prisma.lessonComment.count()).toBe(0);
  });
});
