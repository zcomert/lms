import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';

describe('lesson comment routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonId: string;
  let draftLessonId: string;
  type Key = 's1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor';
  const ids = {} as Record<Key, string>;
  const tokens = {} as Record<Key, string>;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as Record<string, unknown> | undefined,
    });
  const list = (token: string, id = lessonId) => call('GET', `/api/v1/lessons/${id}/comments`, token);
  const post = (token: string, payload: unknown, id = lessonId) =>
    call('POST', `/api/v1/lessons/${id}/comments`, token, payload);
  const reply = (token: string, commentId: string, payload: unknown) =>
    call('POST', `/api/v1/lesson-comments/${commentId}/replies`, token, payload);

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
    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
    });
    courseId = course.id;
    const mod = await prisma.module.create({ data: { courseId, title: 'Modül', order: 1 } });
    lessonId = (
      await prisma.lesson.create({
        data: { moduleId: mod.id, title: 'Ders', order: 1, status: 'PUBLISHED', contentType: 'TEXT' },
      })
    ).id;
    draftLessonId = (
      await prisma.lesson.create({
        data: { moduleId: mod.id, title: 'Taslak', order: 2, status: 'DRAFT', contentType: 'TEXT' },
      })
    ).id;
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
    expect((await call('GET', `/api/v1/lessons/${lessonId}/comments`)).statusCode).toBe(401);
    expect((await call('DELETE', `/api/v1/lesson-comments/x`)).statusCode).toBe(401);
  });

  it('blocks non-enrolled users from reading and writing', async () => {
    expect((await list(tokens.outsider)).statusCode).toBe(403);
    const res = await post(tokens.outsider, { body: 'Merhaba' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_ENROLLED');
    // Yönetici kayıtlı olmadıkça üst düzey yorum yazamaz.
    expect((await post(tokens.admin, { body: 'Merhaba' })).statusCode).toBe(403);
    expect((await post(tokens.instructor, { body: 'Merhaba' })).statusCode).toBe(403);
  });

  it('creates a comment and returns the flags without email', async () => {
    const res = await post(tokens.s1, { body: '  Güzel ders  ' });
    expect(res.statusCode).toBe(201);
    const { comment } = res.json();
    expect(comment).toMatchObject({
      body: 'Güzel ders',
      editedAt: null,
      canEdit: true,
      canDelete: true,
      replies: [],
      author: { id: ids.s1, name: 's1', avatarUrl: null },
    });
    expect(JSON.stringify(res.json())).not.toContain('@example.com');

    const other = (await list(tokens.s2)).json();
    expect(other.comments).toHaveLength(1);
    expect(other.comments[0]).toMatchObject({ canEdit: false, canDelete: false });
    expect(other.permissions).toEqual({ canComment: true, canReply: false });
    expect(JSON.stringify(other)).not.toContain('@example.com');

    const mod = (await list(tokens.instructor)).json();
    expect(mod.comments[0]).toMatchObject({ canEdit: false, canDelete: true });
    expect(mod.permissions).toEqual({ canComment: false, canReply: true });
    expect((await list(tokens.otherInstructor)).statusCode).toBe(403);
    expect((await list(tokens.admin)).json().permissions.canReply).toBe(true);
  });

  it('validates body', async () => {
    for (const payload of [undefined, {}, { body: '' }, { body: '   ' }, { body: 5 }, { body: 'a'.repeat(2001) }]) {
      const res = await post(tokens.s1, payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect((await post(tokens.s1, { body: 'a'.repeat(2000) })).statusCode).toBe(201);
  });

  it('returns 404 for draft or unknown lessons', async () => {
    expect((await list(tokens.s1, draftLessonId)).statusCode).toBe(404);
    expect((await post(tokens.s1, { body: 'x' }, draftLessonId)).statusCode).toBe(404);
    expect((await list(tokens.s1, 'nope')).statusCode).toBe(404);
  });

  it('lets only assigned instructors and admins reply', async () => {
    const { comment } = (await post(tokens.s1, { body: 'Soru' })).json();
    expect((await reply(tokens.s2, comment.id, { body: 'Yanıt' })).statusCode).toBe(403);
    expect((await reply(tokens.s1, comment.id, { body: 'Yanıt' })).statusCode).toBe(403);
    const denied = await reply(tokens.otherInstructor, comment.id, { body: 'Yanıt' });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
    expect((await reply(tokens.instructor, comment.id, { body: '' })).statusCode).toBe(400);
    expect((await reply(tokens.instructor, 'nope', { body: 'x' })).statusCode).toBe(404);

    const ok = await reply(tokens.instructor, comment.id, { body: 'Cevap' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().reply).toMatchObject({ body: 'Cevap', authorRole: 'INSTRUCTOR', canEdit: true, canDelete: true });
    const adm = await reply(tokens.admin, comment.id, { body: 'Yönetici' });
    expect(adm.statusCode).toBe(201);
    expect(adm.json().reply.authorRole).toBe('ADMIN');

    const listed = (await list(tokens.s1)).json();
    const replies = listed.comments[0].replies;
    expect(replies.map((r: { body: string }) => r.body)).toEqual(['Cevap', 'Yönetici']);
    expect(replies[0]).toMatchObject({ canEdit: false, canDelete: false });
  });

  it('rejects replies to replies', async () => {
    const { comment } = (await post(tokens.s1, { body: 'Soru' })).json();
    const r = (await reply(tokens.instructor, comment.id, { body: 'Cevap' })).json().reply;
    const res = await reply(tokens.instructor, r.id, { body: 'Daha' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('REPLY_DEPTH_EXCEEDED');
  });

  it('edits only own comments and sets editedAt', async () => {
    const { comment } = (await post(tokens.s1, { body: 'Eski' })).json();
    const url = `/api/v1/lesson-comments/${comment.id}`;
    expect((await call('PATCH', url, tokens.s2, { body: 'Hack' })).statusCode).toBe(403);
    expect((await call('PATCH', url, tokens.instructor, { body: 'Hack' })).statusCode).toBe(403);
    expect((await call('PATCH', url, tokens.outsider, { body: 'Hack' })).statusCode).toBe(403);
    expect((await call('PATCH', url, tokens.s1, { body: ' ' })).statusCode).toBe(400);
    expect((await call('PATCH', '/api/v1/lesson-comments/nope', tokens.s1, { body: 'x' })).statusCode).toBe(404);

    const res = await call('PATCH', url, tokens.s1, { body: 'Yeni' });
    expect(res.statusCode).toBe(200);
    expect(res.json().comment.body).toBe('Yeni');
    expect(res.json().comment.editedAt).toEqual(expect.any(String));
  });

  it('edits own reply but not someone elses', async () => {
    const { comment } = (await post(tokens.s1, { body: 'Soru' })).json();
    const r = (await reply(tokens.instructor, comment.id, { body: 'Cevap' })).json().reply;
    const url = `/api/v1/lesson-comments/${r.id}`;
    expect((await call('PATCH', url, tokens.admin, { body: 'Hack' })).statusCode).toBe(403);
    expect((await call('PATCH', url, tokens.s1, { body: 'Hack' })).statusCode).toBe(403);
    const res = await call('PATCH', url, tokens.instructor, { body: 'Düzeltme' });
    expect(res.statusCode).toBe(200);
    expect(res.json().reply).toMatchObject({ body: 'Düzeltme', authorRole: 'INSTRUCTOR' });
    expect(res.json().reply.editedAt).toEqual(expect.any(String));
    expect(res.json().comment).toBeUndefined();
  });

  it('deletes: author, assigned instructor (cascade) and admin; others forbidden', async () => {
    const mk = async () => (await post(tokens.s1, { body: 'Soru' })).json().comment.id as string;
    let id = await mk();
    const url = (x: string) => `/api/v1/lesson-comments/${x}`;
    expect((await call('DELETE', url(id), tokens.s2)).statusCode).toBe(403);
    expect((await call('DELETE', url(id), tokens.otherInstructor)).statusCode).toBe(403);
    expect((await call('DELETE', url('nope'), tokens.s1)).statusCode).toBe(404);

    // eğitmen moderasyonu + yanıtlar cascade
    await reply(tokens.instructor, id, { body: 'Cevap' });
    await reply(tokens.admin, id, { body: 'Cevap2' });
    expect(await prisma.lessonComment.count()).toBe(3);
    const res = await call('DELETE', url(id), tokens.instructor);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
    expect(await prisma.lessonComment.count()).toBe(0);

    id = await mk();
    expect((await call('DELETE', url(id), tokens.admin)).statusCode).toBe(200);
    id = await mk();
    expect((await call('DELETE', url(id), tokens.s1)).statusCode).toBe(200);

    // yanıtı silme: yazar ve yönetici
    id = await mk();
    const r1 = (await reply(tokens.instructor, id, { body: 'a' })).json().reply.id;
    expect((await call('DELETE', url(r1), tokens.s1)).statusCode).toBe(403);
    expect((await call('DELETE', url(r1), tokens.instructor)).statusCode).toBe(200);
    const r2 = (await reply(tokens.instructor, id, { body: 'b' })).json().reply.id;
    expect((await call('DELETE', url(r2), tokens.admin)).statusCode).toBe(200);
    expect(await prisma.lessonComment.count()).toBe(1);
  });
});
