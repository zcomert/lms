import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';

const DAY = 24 * 60 * 60 * 1000;

describe('assignment routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let instructorToken: string;
  let otherInstructorToken: string;
  let studentToken: string;
  let outsiderToken: string;
  let studentId: string;
  let courseA: string; // instructor atanmış; student kayıtlı
  let courseB: string; // outsider kayıtlı, instructor atanmamış

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: auth(token), payload: payload as Record<string, unknown> | undefined });

  function createAssignment(token = instructorToken, extra: Record<string, unknown> = {}) {
    return req('POST', `/api/v1/courses/${courseA}/assignments`, token, {
      title: 'Ödev 1',
      dueAt: new Date(Date.now() + 2 * DAY).toISOString(),
      ...extra,
    });
  }

  async function publishedAssignment(extra: Record<string, unknown> = {}) {
    const res = await createAssignment(instructorToken, extra);
    const id = res.json().assignment.id as string;
    await req('PATCH', `/api/v1/assignments/${id}`, instructorToken, { status: 'PUBLISHED' });
    return id;
  }

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.assignmentSubmission.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const makeUser = (email: string, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') =>
      prisma.user.create({ data: { email, passwordHash: 'x', name: email, role, roles: role } });
    const admin = await makeUser('admin@example.com', 'ADMIN');
    const instructor = await makeUser('instructor@example.com', 'INSTRUCTOR');
    const otherInstructor = await makeUser('other-instructor@example.com', 'INSTRUCTOR');
    const student = await makeUser('student@example.com', 'STUDENT');
    const outsider = await makeUser('outsider@example.com', 'STUDENT');
    studentId = student.id;

    const tokenFor = (userId: string, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') =>
      signToken({ userId, role, roles: [role] });
    adminToken = tokenFor(admin.id, 'ADMIN');
    instructorToken = tokenFor(instructor.id, 'INSTRUCTOR');
    otherInstructorToken = tokenFor(otherInstructor.id, 'INSTRUCTOR');
    studentToken = tokenFor(student.id, 'STUDENT');
    outsiderToken = tokenFor(outsider.id, 'STUDENT');

    const makeCourse = (title: string) =>
      prisma.course.create({ data: { title, description: 'A', category: 'T', level: 'B', status: 'PUBLISHED' } });
    courseA = (await makeCourse('Kurs A')).id;
    courseB = (await makeCourse('Kurs B')).id;
    await prisma.courseInstructor.create({ data: { courseId: courseA, userId: instructor.id, position: 1 } });
    await prisma.enrollment.create({ data: { userId: student.id, courseId: courseA, method: 'OPEN' } });
    await prisma.enrollment.create({ data: { userId: outsider.id, courseId: courseB, method: 'OPEN' } });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('management', () => {
    it('lets an assigned instructor create a draft assignment', async () => {
      const res = await createAssignment();
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.assignment.status).toBe('DRAFT');
      expect(body.assignment.type).toBe('HOMEWORK');
      expect(body.assignment.course.id).toBe(courseA);
    });

    it('rejects a non-assigned instructor from creating an assignment', async () => {
      const res = await createAssignment(otherInstructorToken);
      expect(res.statusCode).toBe(403);
    });

    it('lets ADMIN create an assignment on any course', async () => {
      const res = await createAssignment(adminToken);
      expect(res.statusCode).toBe(201);
    });

    it('requires dueAt', async () => {
      const res = await req('POST', `/api/v1/courses/${courseA}/assignments`, instructorToken, { title: 'X' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('scopes GET /assignments/manage to the instructor\'s own courses, ADMIN sees all', async () => {
      await createAssignment();
      await req('POST', `/api/v1/courses/${courseB}/assignments`, adminToken, {
        title: 'Kurs B Ödevi',
        dueAt: new Date(Date.now() + DAY).toISOString(),
      });

      const instructorList = await req('GET', '/api/v1/assignments/manage', instructorToken);
      expect(instructorList.json().assignments).toHaveLength(1);

      const adminList = await req('GET', '/api/v1/assignments/manage', adminToken);
      expect(adminList.json().assignments).toHaveLength(2);
    });

    it('publishes a draft via PATCH', async () => {
      const created = await createAssignment();
      const id = created.json().assignment.id;
      const patched = await req('PATCH', `/api/v1/assignments/${id}`, instructorToken, { status: 'PUBLISHED' });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().assignment.status).toBe('PUBLISHED');
    });

    it('rejects changing courseId via PATCH', async () => {
      const created = await createAssignment();
      const id = created.json().assignment.id;
      const res = await req('PATCH', `/api/v1/assignments/${id}`, instructorToken, { courseId: courseB });
      expect(res.statusCode).toBe(400);
    });

    it('deletes an assignment', async () => {
      const created = await createAssignment();
      const id = created.json().assignment.id;
      const res = await req('DELETE', `/api/v1/assignments/${id}`, instructorToken);
      expect(res.statusCode).toBe(200);
      expect(await prisma.assignment.findUnique({ where: { id } })).toBeNull();
    });

    it('returns a submission roster with one row per enrolled student', async () => {
      const id = await publishedAssignment();
      await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'Teslimim' });

      const detail = await req('GET', `/api/v1/assignments/${id}`, instructorToken);
      expect(detail.statusCode).toBe(200);
      const body = detail.json();
      expect(body.submissions).toHaveLength(1);
      expect(body.submissions[0].student.id).toBe(studentId);
      expect(body.submissions[0].note).toBe('Teslimim');
    });

    it('rejects grading a submission that does not exist', async () => {
      const id = await publishedAssignment();
      const res = await req('PUT', `/api/v1/assignments/${id}/submissions/${studentId}/grade`, instructorToken, {
        score: 80,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SUBMISSION_NOT_FOUND');
    });

    it('grades an existing submission', async () => {
      const id = await publishedAssignment();
      await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'Teslimim' });
      const res = await req('PUT', `/api/v1/assignments/${id}/submissions/${studentId}/grade`, instructorToken, {
        score: 92,
        feedback: 'Harika iş.',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().submission.score).toBe(92);
      expect(res.json().submission.feedback).toBe('Harika iş.');
    });
  });

  describe('student flow', () => {
    it('only lists published assignments from enrolled courses', async () => {
      await publishedAssignment({ title: 'Yayında' });
      await createAssignment(instructorToken, { title: 'Taslak' }); // DRAFT

      const res = await req('GET', '/api/v1/assignments/my', studentToken);
      expect(res.statusCode).toBe(200);
      const items = res.json().assignments;
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Yayında');
      expect(items[0].status).toBe('PENDING');
    });

    it('does not list assignments from courses the student is not enrolled in', async () => {
      const res = await req('GET', '/api/v1/assignments/my', outsiderToken);
      expect(res.json().assignments).toHaveLength(0);
    });

    it('rejects submission from a non-enrolled user', async () => {
      const id = await publishedAssignment();
      const res = await req('POST', `/api/v1/assignments/${id}/submission`, outsiderToken, { note: 'x' });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_ENROLLED');
    });

    it('rejects an empty submission body (no note, no file)', async () => {
      const id = await publishedAssignment();
      const res = await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, {});
      expect(res.statusCode).toBe(400);
    });

    it('marks a submission as late when allowLateSubmission=false and dueAt has passed', async () => {
      const id = await publishedAssignment({
        dueAt: new Date(Date.now() - DAY).toISOString(),
        allowLateSubmission: false,
      });
      const res = await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'Geç kaldım' });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('SUBMISSION_CLOSED');
    });

    it('accepts a late submission when allowLateSubmission=true and marks isLate', async () => {
      const id = await publishedAssignment({
        dueAt: new Date(Date.now() - DAY).toISOString(),
        allowLateSubmission: true,
      });
      const res = await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'Geç kaldım' });
      expect(res.statusCode).toBe(200);
      expect(res.json().submission.isLate).toBe(true);
    });

    it('overwrites a previous submission on resubmission (no duplicate rows)', async () => {
      const id = await publishedAssignment();
      await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'İlk' });
      await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'İkinci' });
      const count = await prisma.assignmentSubmission.count({ where: { assignmentId: id, userId: studentId } });
      expect(count).toBe(1);
      const detail = await req('GET', `/api/v1/assignments/${id}`, instructorToken);
      expect(detail.json().submissions[0].note).toBe('İkinci');
    });

    it('rejects a disallowed file type on submission', async () => {
      const id = await publishedAssignment({ acceptedFileTypes: ['pdf'] });
      const res = await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, {
        fileUrl: '/uploads/assignments/x-malware.exe',
        fileName: 'malware.exe',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_FILE_TYPE');
    });

    it('moves status from PENDING to SUBMITTED after submitting, and to GRADED after grading', async () => {
      const id = await publishedAssignment();
      let list = await req('GET', '/api/v1/assignments/my', studentToken);
      expect(list.json().assignments[0].status).toBe('PENDING');

      await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'x' });
      list = await req('GET', '/api/v1/assignments/my', studentToken);
      expect(list.json().assignments[0].status).toBe('SUBMITTED');

      await req('PUT', `/api/v1/assignments/${id}/submissions/${studentId}/grade`, instructorToken, { score: 70 });
      list = await req('GET', '/api/v1/assignments/my', studentToken);
      expect(list.json().assignments[0].status).toBe('GRADED');
      expect(list.json().assignments[0].mySubmission.score).toBe(70);
    });

    it('lets a student withdraw an ungraded submission, but not a graded one', async () => {
      const id = await publishedAssignment();
      await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'x' });

      const withdrawn = await req('DELETE', `/api/v1/assignments/${id}/submission`, studentToken);
      expect(withdrawn.statusCode).toBe(200);
      expect(await prisma.assignmentSubmission.count()).toBe(0);

      await req('POST', `/api/v1/assignments/${id}/submission`, studentToken, { note: 'x' });
      await req('PUT', `/api/v1/assignments/${id}/submissions/${studentId}/grade`, instructorToken, { score: 50 });
      const blocked = await req('DELETE', `/api/v1/assignments/${id}/submission`, studentToken);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.code).toBe('ALREADY_GRADED');
    });
  });
});
