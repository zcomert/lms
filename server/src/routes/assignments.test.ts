import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';

const UPLOAD_DIR = path.resolve('./uploads-test');
const BOUNDARY = '----testboundary7MA4YWxkTrZu0gW';
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('içerik'), Buffer.from('\n%%EOF')]);

interface Part {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
}

function multipart(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    let head = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"`;
    if (p.filename !== undefined) head += `; filename="${p.filename}"`;
    head += '\r\n';
    if (p.filename !== undefined) head += `Content-Type: ${p.contentType ?? 'application/octet-stream'}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head, 'utf8'), p.data ?? Buffer.from(p.value ?? '', 'utf8'), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const file = (filename: string, data: Buffer, contentType?: string): Part => ({
  name: 'files',
  filename,
  data,
  contentType,
});

const diskFiles = () => (existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : []);

describe('assignment routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let otherCourseId: string;
  let lessonId: string;
  let otherLessonId: string;
  type Key = 's1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor';
  const ids = {} as Record<Key, string>;
  const tokens = {} as Record<Key, string>;

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as Record<string, unknown> | undefined,
    });
  const upload = (url: string, token: string, parts: Part[]) =>
    app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipart(parts),
    });

  const makeAssignment = (over: Record<string, unknown> = {}) =>
    prisma.assignment.create({
      data: {
        courseId,
        title: 'Ödev 1',
        description: 'Açıklama',
        dueAt: new Date(Date.now() + 86_400_000),
        allowedExtensions: 'pdf,txt,png',
        status: 'PUBLISHED',
        ...over,
      },
    });
  const submit = (token: string, assignmentId: string, parts: Part[]) =>
    upload(`/api/v1/assignments/${assignmentId}/submissions`, token, parts);

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    rmSync(UPLOAD_DIR, { recursive: true, force: true });
    mkdirSync(UPLOAD_DIR, { recursive: true });
    await prisma.assignment.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lessonComment.deleteMany();
    await prisma.courseReview.deleteMany();
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
    const base = { description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' };
    courseId = (await prisma.course.create({ data: { title: 'Kurs', ...base } })).id;
    otherCourseId = (await prisma.course.create({ data: { title: 'Diğer', ...base } })).id;
    const mod = await prisma.module.create({ data: { courseId, title: 'M', order: 1 } });
    const otherMod = await prisma.module.create({ data: { courseId: otherCourseId, title: 'M', order: 1 } });
    const lessonBase = { title: 'Ders', order: 1, status: 'PUBLISHED' };
    lessonId = (await prisma.lesson.create({ data: { moduleId: mod.id, ...lessonBase } })).id;
    otherLessonId = (await prisma.lesson.create({ data: { moduleId: otherMod.id, ...lessonBase } })).id;
    for (const key of ['s1', 's2'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    rmSync(UPLOAD_DIR, { recursive: true, force: true });
  });

  describe('create / read / update / delete', () => {
    const body = { title: 'Yeni ödev', description: 'Metin', dueAt: '2030-01-01T10:00:00.000Z' };

    it('requires authentication', async () => {
      expect((await call('GET', `/api/v1/courses/${courseId}/assignments`)).statusCode).toBe(401);
    });

    it('creates as assigned instructor and admin, with defaults', async () => {
      const res = await call('POST', `/api/v1/courses/${courseId}/assignments`, tokens.instructor, {
        ...body,
        allowedExtensions: ['.PDF', 'zip', 'pdf'],
        lessonId,
      });
      expect(res.statusCode).toBe(201);
      const a = res.json().assignment;
      expect(a).toMatchObject({
        courseId, courseTitle: 'Kurs', lessonId, lessonTitle: 'Ders', maxScore: 100,
        allowedExtensions: ['pdf', 'zip'], status: 'DRAFT', attachments: [],
      });
      expect(a.stats).toEqual({ enrolledCount: 2, submittedCount: 0, gradedCount: 0, lateCount: 0 });
      expect(a.myStatus).toBeUndefined();
      expect((await call('POST', `/api/v1/courses/${courseId}/assignments`, tokens.admin, body)).statusCode).toBe(201);
    });

    it('rejects unassigned instructors, students and outsiders from creating', async () => {
      for (const key of ['otherInstructor', 's1', 'outsider'] as const) {
        const res = await call('POST', `/api/v1/courses/${courseId}/assignments`, tokens[key], body);
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      }
    });

    it('validates fields', async () => {
      const post = (payload: unknown) => call('POST', `/api/v1/courses/${courseId}/assignments`, tokens.admin, payload);
      expect((await post({ ...body, title: '  ' })).statusCode).toBe(400);
      expect((await post({ ...body, dueAt: 'yarın' })).statusCode).toBe(400);
      expect((await post({ ...body, maxScore: 0 })).statusCode).toBe(400);
      expect((await post({ ...body, maxScore: 1.5 })).statusCode).toBe(400);
      expect((await post({ ...body, allowedExtensions: ['exe'] })).statusCode).toBe(400);
      expect((await post({ ...body, status: 'X' })).statusCode).toBe(400);
      const res = await post({ ...body, lessonId: otherLessonId });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_LESSON');
      expect((await post({ ...body, lessonId: 'yok' })).json().error.code).toBe('INVALID_LESSON');
    });

    it('PATCH validates lessonId and requires at least one field', async () => {
      const a = await makeAssignment();
      const patch = (payload: unknown) => call('PATCH', `/api/v1/assignments/${a.id}`, tokens.instructor, payload);
      expect((await patch({})).statusCode).toBe(400);
      expect((await patch({ lessonId: otherLessonId })).json().error.code).toBe('INVALID_LESSON');
      const ok = await patch({ title: 'Güncel', lessonId, status: 'DRAFT', allowedExtensions: [] });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().assignment).toMatchObject({ title: 'Güncel', lessonId, status: 'DRAFT', allowedExtensions: [] });
      expect((await call('PATCH', `/api/v1/assignments/${a.id}`, tokens.otherInstructor, { title: 'x' })).statusCode).toBe(403);
      expect((await call('PATCH', `/api/v1/assignments/${a.id}`, tokens.s1, { title: 'x' })).statusCode).toBe(403);
    });

    it('draft assignments are hidden from students (detail, list, submit, attachment download)', async () => {
      const draft = await makeAssignment({ status: 'DRAFT' });
      const att = await prisma.assignmentAttachment.create({
        data: { assignmentId: draft.id, originalName: 'a.pdf', storedName: 'a'.repeat(32), mimeType: 'application/pdf', size: 1 },
      });
      const detail = await call('GET', `/api/v1/assignments/${draft.id}`, tokens.s1);
      expect(detail.statusCode).toBe(404);
      expect(detail.json().error.code).toBe('NOT_FOUND');
      const list = await call('GET', `/api/v1/courses/${courseId}/assignments`, tokens.s1);
      expect(list.json()).toEqual({ assignments: [], canManage: false });
      expect((await submit(tokens.s1, draft.id, [{ name: 'text', value: 'merhaba' }])).statusCode).toBe(404);
      expect((await call('GET', `/api/v1/assignment-attachments/${att.id}/download`, tokens.s1)).statusCode).toBe(404);
      // Yönetici görür
      expect((await call('GET', `/api/v1/assignments/${draft.id}`, tokens.instructor)).statusCode).toBe(200);
      const adminList = await call('GET', `/api/v1/courses/${courseId}/assignments`, tokens.instructor);
      expect(adminList.json().assignments).toHaveLength(1);
      expect(adminList.json().canManage).toBe(true);
    });

    it('non-enrolled student gets 403 on list, detail and submit', async () => {
      const a = await makeAssignment();
      for (const res of [
        await call('GET', `/api/v1/courses/${courseId}/assignments`, tokens.outsider),
        await call('GET', `/api/v1/assignments/${a.id}`, tokens.outsider),
        await submit(tokens.outsider, a.id, [{ name: 'text', value: 'x' }]),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('NOT_ENROLLED');
      }
      expect(await prisma.assignmentSubmission.count()).toBe(0);
    });

    it('lists ordered by dueAt ascending', async () => {
      await makeAssignment({ title: 'Geç', dueAt: new Date('2031-01-01') });
      await makeAssignment({ title: 'Erken', dueAt: new Date('2030-01-01') });
      const res = await call('GET', `/api/v1/courses/${courseId}/assignments`, tokens.s1);
      expect(res.json().assignments.map((a: { title: string }) => a.title)).toEqual(['Erken', 'Geç']);
    });

    it('returns 404 for unknown assignment and course', async () => {
      expect((await call('GET', '/api/v1/assignments/yok', tokens.s1)).statusCode).toBe(404);
      expect((await call('GET', '/api/v1/courses/yok/assignments', tokens.s1)).statusCode).toBe(404);
    });
  });

  describe('attachments', () => {
    it('uploads, downloads byte-exact with safe headers, and deletes', async () => {
      const a = await makeAssignment();
      const res = await upload(`/api/v1/assignments/${a.id}/attachments`, tokens.instructor, [
        file('Açıklama ödevi.pdf', PDF, 'application/pdf'),
      ]);
      expect(res.statusCode).toBe(201);
      const meta = res.json().attachments[0];
      expect(meta).toMatchObject({ name: 'Açıklama ödevi.pdf', size: PDF.length, mimeType: 'application/pdf' });
      expect(diskFiles()).toHaveLength(1);
      expect(diskFiles()[0]).toMatch(/^[0-9a-f]{32}$/);

      const dl = await call('GET', `/api/v1/assignment-attachments/${meta.id}/download`, tokens.s1);
      expect(dl.statusCode).toBe(200);
      expect(dl.rawPayload.equals(PDF)).toBe(true);
      expect(dl.headers['content-type']).toBe('application/octet-stream');
      expect(dl.headers['x-content-type-options']).toBe('nosniff');
      expect(dl.headers['content-length']).toBe(String(PDF.length));
      const cd = String(dl.headers['content-disposition']);
      expect(cd).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
      expect(cd).toContain(`filename*=UTF-8''${encodeURIComponent('Açıklama ödevi.pdf')}`);

      expect((await call('GET', `/api/v1/assignment-attachments/${meta.id}/download`, tokens.outsider)).statusCode).toBe(403);
      expect((await call('DELETE', `/api/v1/assignment-attachments/${meta.id}`, tokens.s1)).statusCode).toBe(403);
      expect((await call('DELETE', `/api/v1/assignment-attachments/${meta.id}`, tokens.instructor)).statusCode).toBe(200);
      expect(diskFiles()).toHaveLength(0);
    });

    it('only managers can upload; requires multipart and at least one file', async () => {
      const a = await makeAssignment();
      const url = `/api/v1/assignments/${a.id}/attachments`;
      expect((await upload(url, tokens.s1, [file('a.pdf', PDF)])).statusCode).toBe(403);
      expect((await upload(url, tokens.otherInstructor, [file('a.pdf', PDF)])).statusCode).toBe(403);
      expect((await upload(url, tokens.instructor, [{ name: 'x', value: 'y' }])).statusCode).toBe(400);
      const notMp = await call('POST', url, tokens.instructor, { a: 1 });
      expect(notMp.statusCode).toBe(415);
      expect(notMp.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(diskFiles()).toHaveLength(0);
    });

    it('removes files from disk when the assignment is deleted', async () => {
      const a = await makeAssignment();
      await upload(`/api/v1/assignments/${a.id}/attachments`, tokens.instructor, [file('a.pdf', PDF)]);
      await submit(tokens.s1, a.id, [file('b.pdf', PDF), { name: 'text', value: 'metin' }]);
      expect(diskFiles()).toHaveLength(2);
      expect((await call('DELETE', `/api/v1/assignments/${a.id}`, tokens.s1)).statusCode).toBe(403);
      expect((await call('DELETE', `/api/v1/assignments/${a.id}`, tokens.otherInstructor)).statusCode).toBe(403);
      expect(diskFiles()).toHaveLength(2);
      expect((await call('DELETE', `/api/v1/assignments/${a.id}`, tokens.instructor)).json()).toEqual({ success: true });
      expect(diskFiles()).toHaveLength(0);
      expect(await prisma.assignmentSubmission.count()).toBe(0);
    });

    it('removes the course files from disk when the course is deleted, keeping other courses', async () => {
      const a = await makeAssignment();
      await upload(`/api/v1/assignments/${a.id}/attachments`, tokens.instructor, [file('a.pdf', PDF)]);
      await submit(tokens.s1, a.id, [file('b.pdf', PDF)]);
      const other = await makeAssignment({ courseId: otherCourseId });
      await upload(`/api/v1/assignments/${other.id}/attachments`, tokens.admin, [file('c.pdf', PDF)]);
      expect(diskFiles()).toHaveLength(3);
      const otherStored = (await prisma.assignmentAttachment.findFirstOrThrow({ where: { assignmentId: other.id } }))
        .storedName;

      expect((await call('DELETE', `/api/v1/courses/${courseId}`, tokens.admin)).json()).toEqual({ success: true });
      expect(diskFiles()).toEqual([otherStored]);
      expect(await prisma.assignment.count()).toBe(1);
    });
  });

  describe('submissions', () => {
    it('stores text + files, returns the student view, and is on time', async () => {
      const a = await makeAssignment();
      const res = await submit(tokens.s1, a.id, [
        { name: 'text', value: '  Cevabım  ' },
        file('cevap.pdf', PDF, 'application/pdf'),
        file('not.txt', Buffer.from('merhaba'), 'text/plain'),
      ]);
      expect(res.statusCode).toBe(201);
      const s = res.json().submission;
      expect(s).toMatchObject({ assignmentId: a.id, userId: ids.s1, text: 'Cevabım', isLate: false, score: null });
      expect(s.files.map((f: { name: string }) => f.name)).toEqual(['cevap.pdf', 'not.txt']);
      expect(diskFiles()).toHaveLength(2);

      const detail = (await call('GET', `/api/v1/assignments/${a.id}`, tokens.s1)).json().assignment;
      expect(detail.myStatus).toBe('SUBMITTED');
      expect(detail.mySubmission.id).toBe(s.id);
      expect(detail.stats).toBeUndefined();
    });

    it('marks late submissions with isLate=true', async () => {
      const late = await makeAssignment({ dueAt: new Date(Date.now() - 3_600_000) });
      const res = await submit(tokens.s1, late.id, [{ name: 'text', value: 'geç' }]);
      expect(res.statusCode).toBe(201);
      expect(res.json().submission.isLate).toBe(true);
      const ok = await makeAssignment();
      expect((await submit(tokens.s1, ok.id, [{ name: 'text', value: 'zamanında' }])).json().submission.isLate).toBe(false);
    });

    it('rejects a second submission with 409 and leaves no stray files', async () => {
      const a = await makeAssignment();
      expect((await submit(tokens.s1, a.id, [file('a.pdf', PDF)])).statusCode).toBe(201);
      expect(diskFiles()).toHaveLength(1);
      const again = await submit(tokens.s1, a.id, [file('b.pdf', PDF), { name: 'text', value: 'tekrar' }]);
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('SUBMISSION_EXISTS');
      expect(diskFiles()).toHaveLength(1);
      expect(await prisma.assignmentSubmission.count()).toBe(1);
    });

    it('requires text or a file', async () => {
      const a = await makeAssignment();
      for (const parts of [[], [{ name: 'text', value: '   ' }]] as Part[][]) {
        const res = await submit(tokens.s1, a.id, parts);
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
      const notMp = await call('POST', `/api/v1/assignments/${a.id}/submissions`, tokens.s1, { text: 'x' });
      expect(notMp.statusCode).toBe(415);
    });

    it('rejects disallowed extensions and mismatching content signatures', async () => {
      const a = await makeAssignment();
      const exe = await submit(tokens.s1, a.id, [file('virus.exe', Buffer.from('MZ'))]);
      expect(exe.statusCode).toBe(400);
      expect(exe.json().error.code).toBe('FILE_TYPE_NOT_ALLOWED');
      const zip = await submit(tokens.s1, a.id, [file('a.zip', Buffer.from('PK\x03\x04'))]); // listede yok
      expect(zip.json().error.code).toBe('FILE_TYPE_NOT_ALLOWED');
      const fake = await submit(tokens.s1, a.id, [file('sahte.pdf', Buffer.from('bu düz metindir'), 'application/pdf')]);
      expect(fake.statusCode).toBe(400);
      expect(fake.json().error.code).toBe('FILE_TYPE_NOT_ALLOWED');
      const wrongMime = await submit(tokens.s1, a.id, [file('a.pdf', PDF, 'image/png')]);
      expect(wrongMime.statusCode).toBe(400);
      expect(diskFiles()).toHaveLength(0);
      expect(await prisma.assignmentSubmission.count()).toBe(0);
      // Boş izin listesi: dosya kabul edilmez, metin edilir
      const textOnly = await makeAssignment({ allowedExtensions: '' });
      expect((await submit(tokens.s1, textOnly.id, [file('a.txt', Buffer.from('x'))])).statusCode).toBe(400);
      expect((await submit(tokens.s1, textOnly.id, [{ name: 'text', value: 'x' }])).statusCode).toBe(201);
    });

    it('rejects files over 10 MB with 413 and cleans up', async () => {
      const a = await makeAssignment();
      const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
      const res = await submit(tokens.s1, a.id, [file('ok.pdf', PDF), file('buyuk.txt', big)]);
      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('FILE_TOO_LARGE');
      expect(diskFiles()).toHaveLength(0);
      expect(await prisma.assignmentSubmission.count()).toBe(0);
    });

    it('accepts exactly 5 files and rejects 6 with 400 TOO_MANY_FILES', async () => {
      const a = await makeAssignment();
      const mk = (n: number) => Array.from({ length: n }, (_, i) => file(`n${i}.txt`, Buffer.from('x')));
      const six = await submit(tokens.s1, a.id, mk(6));
      expect(six.statusCode).toBe(400);
      expect(six.json().error.code).toBe('TOO_MANY_FILES');
      expect(diskFiles()).toHaveLength(0);
      const five = await submit(tokens.s1, a.id, mk(5));
      expect(five.statusCode).toBe(201);
      expect(diskFiles()).toHaveLength(5);
    });

    it('preserves Turkish file names and sanitizes path traversal', async () => {
      const a = await makeAssignment();
      const res = await submit(tokens.s1, a.id, [
        file('Ödev çözümü ığüşö.pdf', PDF),
        file('../../etc/passwd.pdf', PDF),
        file('..\\..\\win\\sistem.pdf', PDF),
      ]);
      expect(res.statusCode).toBe(201);
      const names = res.json().submission.files.map((f: { name: string }) => f.name);
      expect(names).toEqual(['Ödev çözümü ığüşö.pdf', 'passwd.pdf', 'sistem.pdf']);
      expect(readdirSync(path.dirname(UPLOAD_DIR)).includes('etc')).toBe(false);
      for (const f of diskFiles()) expect(f).toMatch(/^[0-9a-f]{32}$/);

      const fileId = res.json().submission.files[0].id;
      const dl = await call('GET', `/api/v1/submission-files/${fileId}/download`, tokens.s1);
      expect(String(dl.headers['content-disposition'])).toContain(
        `filename*=UTF-8''${encodeURIComponent('Ödev çözümü ığüşö.pdf')}`,
      );
      expect(String(dl.headers['content-disposition'])).toMatch(/filename="[\x20-\x7e]+";/);
    });
  });

  describe('visibility and grading', () => {
    async function submitted() {
      const a = await makeAssignment({ maxScore: 50 });
      const res = await submit(tokens.s1, a.id, [file('a.pdf', PDF), { name: 'text', value: 'cevap' }]);
      return { a, sub: res.json().submission };
    }

    it('other students cannot see a submission or download its file', async () => {
      const { sub } = await submitted();
      for (const key of ['s2', 'outsider', 'otherInstructor'] as const) {
        const view = await call('GET', `/api/v1/submissions/${sub.id}`, tokens[key]);
        expect(view.statusCode).toBe(403);
        expect(view.json().error.code).toBe('FORBIDDEN');
        expect((await call('GET', `/api/v1/submission-files/${sub.files[0].id}/download`, tokens[key])).statusCode).toBe(403);
      }
      expect((await call('GET', `/api/v1/submissions/${sub.id}`, tokens.s1)).statusCode).toBe(200);
      expect((await call('GET', `/api/v1/submissions/${sub.id}`, tokens.instructor)).statusCode).toBe(200);
      const dl = await call('GET', `/api/v1/submission-files/${sub.files[0].id}/download`, tokens.admin);
      expect(dl.statusCode).toBe(200);
      expect(dl.rawPayload.equals(PDF)).toBe(true);
      expect(dl.headers['x-content-type-options']).toBe('nosniff');
      expect(String(dl.headers['content-disposition'])).toMatch(/^attachment;/);
    });

    it('student views never contain other students data', async () => {
      const a = await makeAssignment();
      await submit(tokens.s1, a.id, [{ name: 'text', value: 'S1 SIRRI' }]);
      for (const url of [
        `/api/v1/assignments/${a.id}`,
        `/api/v1/courses/${courseId}/assignments`,
        '/api/v1/users/me/assignments',
      ]) {
        const raw = (await call('GET', url, tokens.s2)).body;
        expect(raw).not.toContain('S1 SIRRI');
        expect(raw).not.toContain(ids.s1);
        expect(raw).not.toContain('s1@example.com');
        expect(raw).not.toContain('"stats"');
      }
      expect((await call('GET', `/api/v1/assignments/${a.id}/submissions`, tokens.s2)).statusCode).toBe(403);
    });

    it('lists all enrolled students for managers only', async () => {
      const { a, sub } = await submitted();
      const res = await call('GET', `/api/v1/assignments/${a.id}/submissions`, tokens.instructor);
      expect(res.statusCode).toBe(200);
      const rows = res.json().submissions;
      expect(rows.map((r: { student: { name: string } }) => r.student.name)).toEqual(['s1', 's2']);
      expect(rows[0]).toMatchObject({ status: 'SUBMITTED', student: { email: 's1@example.com', avatarUrl: null } });
      expect(rows[0].submission.id).toBe(sub.id);
      expect(rows[1]).toMatchObject({ status: 'NOT_SUBMITTED', submission: null });
      expect((await call('GET', `/api/v1/assignments/${a.id}/submissions`, tokens.otherInstructor)).statusCode).toBe(403);
      expect((await call('GET', `/api/v1/assignments/${a.id}/submissions`, tokens.s1)).statusCode).toBe(403);
      const stats = (await call('GET', `/api/v1/assignments/${a.id}`, tokens.instructor)).json().assignment.stats;
      expect(stats).toEqual({ enrolledCount: 2, submittedCount: 1, gradedCount: 0, lateCount: 0 });
    });

    it('grades, corrects, and validates score range', async () => {
      const { a, sub } = await submitted();
      const grade = (token: string, payload: unknown) => call('PUT', `/api/v1/submissions/${sub.id}/grade`, token, payload);
      expect((await grade(tokens.otherInstructor, { score: 10 })).statusCode).toBe(403);
      expect((await grade(tokens.s1, { score: 10 })).statusCode).toBe(403);
      expect((await grade(tokens.instructor, { score: 51 })).statusCode).toBe(400);
      expect((await grade(tokens.instructor, { score: -1 })).statusCode).toBe(400);
      expect((await grade(tokens.instructor, { score: 2.5 })).statusCode).toBe(400);
      expect((await grade(tokens.instructor, { score: '10' })).statusCode).toBe(400);
      expect((await grade(tokens.instructor, {})).statusCode).toBe(400);

      const first = await grade(tokens.instructor, { score: 40, feedback: ' Güzel ' });
      expect(first.statusCode).toBe(200);
      expect(first.json().submission).toMatchObject({ score: 40, feedback: 'Güzel' });
      expect(first.json().submission.gradedAt).toBeTruthy();
      const fix = await grade(tokens.admin, { score: 0 });
      expect(fix.json().submission).toMatchObject({ score: 0, feedback: null });
      const row = await prisma.assignmentSubmission.findUnique({ where: { id: sub.id } });
      expect(row?.gradedById).toBe(ids.admin);

      const mine = (await call('GET', `/api/v1/assignments/${a.id}`, tokens.s1)).json().assignment;
      expect(mine.myStatus).toBe('GRADED');
      expect(mine.mySubmission.score).toBe(0);
    });

    it('refuses to lower maxScore below an awarded score', async () => {
      const { a, sub } = await submitted();
      await call('PUT', `/api/v1/submissions/${sub.id}/grade`, tokens.instructor, { score: 45 });
      const patch = (maxScore: number) => call('PATCH', `/api/v1/assignments/${a.id}`, tokens.instructor, { maxScore });
      const bad = await patch(44);
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('MAX_SCORE_BELOW_GRADES');
      expect((await patch(45)).statusCode).toBe(200);
    });
  });

  describe('GET /users/me/assignments', () => {
    it('filters by status, hides drafts and other courses', async () => {
      const notDone = await makeAssignment({ title: 'A', dueAt: new Date('2030-01-01') });
      const waiting = await makeAssignment({ title: 'B', dueAt: new Date('2030-02-01') });
      const graded = await makeAssignment({ title: 'C', dueAt: new Date('2030-03-01') });
      await makeAssignment({ title: 'Taslak', status: 'DRAFT' });
      await prisma.assignment.create({
        data: { courseId: otherCourseId, title: 'Başka kurs', description: '', dueAt: new Date(), status: 'PUBLISHED' },
      });
      await submit(tokens.s1, waiting.id, [{ name: 'text', value: 'x' }]);
      const g = (await submit(tokens.s1, graded.id, [{ name: 'text', value: 'y' }])).json().submission;
      await call('PUT', `/api/v1/submissions/${g.id}/grade`, tokens.instructor, { score: 90 });

      const titles = async (qs = '') =>
        (await call('GET', `/api/v1/users/me/assignments${qs}`, tokens.s1)).json().assignments.map(
          (a: { title: string }) => a.title,
        );
      expect(await titles()).toEqual(['A', 'B', 'C']);
      expect(await titles('?status=NOT_SUBMITTED')).toEqual([notDone.title]);
      expect(await titles('?status=SUBMITTED')).toEqual(['B']);
      expect(await titles('?status=GRADED')).toEqual(['C']);
      const bad = await call('GET', '/api/v1/users/me/assignments?status=FOO', tokens.s1);
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('VALIDATION_ERROR');
      expect((await call('GET', '/api/v1/users/me/assignments', tokens.outsider)).json()).toEqual({ assignments: [] });
      expect((await call('GET', '/api/v1/users/me/assignments')).statusCode).toBe(401);
    });
  });

  it('keeps upload bytes intact on disk', async () => {
    const a = await makeAssignment();
    await submit(tokens.s1, a.id, [file('a.pdf', PDF)]);
    expect(readFileSync(path.join(UPLOAD_DIR, diskFiles()[0]!)).equals(PDF)).toBe(true);
  });
});
