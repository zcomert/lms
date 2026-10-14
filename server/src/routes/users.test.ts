import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

describe('user routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.assignmentSubmission.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.examQuestion.deleteMany();
    await prisma.exam.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function registerUser() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'profile@example.com', password: 'sifre123', name: 'Profil Kullanıcı' },
    });
    return response.json().token as string;
  }

  it('updates the current user with a partial body', async () => {
    const token = await registerUser();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Yeni İsim' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.name).toBe('Yeni İsim');
    expect(body.user.email).toBe('profile@example.com');
  });

  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      payload: { name: 'Herhangi' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('allows clearing avatarUrl by setting it to null', async () => {
    const token = await registerUser();
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: 'https://example.com/avatar.png' },
    });
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { avatarUrl: null },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.avatarUrl).toBeNull();
  });
});

describe('upcoming tasks', () => {
  let app: FastifyInstance;
  let studentToken: string;
  let studentId: string;
  let courseId: string;

  const DAY = 24 * 60 * 60 * 1000;
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.assignmentSubmission.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.examQuestion.deleteMany();
    await prisma.exam.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const { signToken } = await import('../lib/jwt.js');
    const student = await prisma.user.create({
      data: { email: 'task-student@example.com', passwordHash: 'x', name: 'Görevli Öğrenci', role: 'STUDENT' },
    });
    studentId = student.id;
    studentToken = signToken({ userId: student.id, role: 'STUDENT', roles: ['STUDENT'] });

    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'A', category: 'T', level: 'B', status: 'PUBLISHED' },
    });
    courseId = course.id;
    await prisma.enrollment.create({ data: { userId: student.id, courseId, method: 'OPEN' } });
  });

  afterAll(async () => {
    await app.close();
  });

  function tasks(query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/v1/users/me/upcoming-tasks${query}`,
      headers: auth(studentToken),
    });
  }

  async function makeAssignment(extra: Record<string, unknown> = {}) {
    return prisma.assignment.create({
      data: {
        courseId,
        title: 'Ödev',
        status: 'PUBLISHED',
        dueAt: new Date(Date.now() + 2 * DAY),
        ...extra,
      },
    });
  }

  async function makeExam(extra: Record<string, unknown> = {}) {
    return prisma.exam.create({
      data: { courseId, title: 'Sınav', status: 'PUBLISHED', ...extra },
    });
  }

  it('rejects unauthenticated requests', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/users/me/upcoming-tasks' });
    expect(response.statusCode).toBe(401);
  });

  it('validates the days parameter', async () => {
    const response = await tasks('?days=0');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('includes a published assignment due within the window', async () => {
    await makeAssignment({ title: 'Yakın Ödev', dueAt: new Date(Date.now() + DAY) });
    const response = await tasks();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].kind).toBe('ASSIGNMENT');
    expect(body.tasks[0].title).toBe('Yakın Ödev');
    expect(body.totalCount).toBe(1);
  });

  it('excludes an assignment the student has already submitted', async () => {
    const assignment = await makeAssignment();
    await prisma.assignmentSubmission.create({
      data: { assignmentId: assignment.id, userId: studentId, note: 'bitti' },
    });
    const response = await tasks();
    expect(response.json().tasks).toHaveLength(0);
  });

  it('excludes a past-due assignment that no longer accepts late submissions', async () => {
    await makeAssignment({ dueAt: new Date(Date.now() - DAY), allowLateSubmission: false });
    const response = await tasks();
    expect(response.json().tasks).toHaveLength(0);
  });

  it('includes a past-due assignment that still accepts late submissions', async () => {
    await makeAssignment({ dueAt: new Date(Date.now() - DAY), allowLateSubmission: true });
    const response = await tasks();
    expect(response.json().tasks).toHaveLength(1);
  });

  it('respects the days window', async () => {
    await makeAssignment({ title: 'Çok Uzak', dueAt: new Date(Date.now() + 10 * DAY) });
    const response = await tasks('?days=1');
    expect(response.json().tasks).toHaveLength(0);
  });

  it('includes an open exam and sorts assignment before exam on tied date, mixed with assignments', async () => {
    const dueAt = new Date(Date.now() + DAY);
    await makeAssignment({ title: 'Ödev', dueAt });
    await makeExam({ title: 'Sınav', startsAt: dueAt, endsAt: new Date(dueAt.getTime() + 45 * 60 * 1000) });

    const response = await tasks();
    const body = response.json();
    expect(body.tasks).toHaveLength(2);
    expect(body.tasks[0].kind).toBe('ASSIGNMENT');
    expect(body.tasks[1].kind).toBe('EXAM');
  });

  it('applies the limit but reports the full totalCount', async () => {
    await makeAssignment({ title: 'A1', dueAt: new Date(Date.now() + DAY) });
    await makeAssignment({ title: 'A2', dueAt: new Date(Date.now() + 2 * DAY) });
    await makeAssignment({ title: 'A3', dueAt: new Date(Date.now() + 3 * DAY) });

    const response = await tasks('?limit=2');
    const body = response.json();
    expect(body.tasks).toHaveLength(2);
    expect(body.totalCount).toBe(3);
  });

  it('does not include assignments or exams from courses the student is not enrolled in', async () => {
    const otherCourse = await prisma.course.create({
      data: { title: 'Başka Kurs', description: 'A', category: 'T', level: 'B', status: 'PUBLISHED' },
    });
    await prisma.assignment.create({
      data: { courseId: otherCourse.id, title: 'Yabancı Ödev', status: 'PUBLISHED', dueAt: new Date(Date.now() + DAY) },
    });
    const response = await tasks();
    expect(response.json().tasks).toHaveLength(0);
  });
});
