import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertCanManageCourse, assertCanRead, canManageCourse } from '../lib/courseAccess.js';
import { assertEnrolled } from '../lib/lessonAccess.js';
import {
  SUBMISSION_STATUSES,
  assertLessonInCourse,
  assignmentInclude,
  loadAssignment,
  notFound,
  parseAssignmentCreate,
  parseAssignmentPatch,
  parseGrade,
  parseSubmissionText,
  serializeAssignments,
  serializeFile,
  serializeSubmission,
  splitExtensions,
  statusOf,
  submissionInclude,
  type SubmissionStatus,
} from '../lib/assignments.js';
import { deleteStoredFiles, receiveUpload, sendDownload } from '../lib/uploads.js';

const forbidden = () => new AppError('FORBIDDEN', 'Bu işlem için yetkiniz yok.', 403);

async function loadCourse(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw new AppError('NOT_FOUND', 'Kurs bulunamadı.', 404);
  return course;
}

/** Ödevi okuma yetkisiyle yükler: yönetici veya kayıtlı; taslak yalnızca yöneticiye görünür. */
async function loadReadable(id: string, user: NonNullable<import('fastify').FastifyRequest['user']>) {
  const row = await loadAssignment(id);
  const manage = await assertCanRead(user, row.courseId);
  if (row.status !== 'PUBLISHED' && !manage) notFound();
  return { row, manage };
}

async function loadManageable(id: string, user: NonNullable<import('fastify').FastifyRequest['user']>) {
  const row = await loadAssignment(id);
  await assertCanManageCourse(user, row.courseId);
  return row;
}

async function oneAssignment(id: string, viewerId: string, manage: boolean) {
  const row = await loadAssignment(id);
  const [out] = await serializeAssignments([row], viewerId, () => manage);
  return out!;
}

export function registerAssignmentRoutes(app: FastifyInstance) {
  app.get<{ Params: { courseId: string } }>(
    '/api/v1/courses/:courseId/assignments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const course = await loadCourse(request.params.courseId);
      const manage = await assertCanRead(user, course.id);
      const rows = await prisma.assignment.findMany({
        where: { courseId: course.id, ...(manage ? {} : { status: 'PUBLISHED' }) },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: assignmentInclude,
      });
      return { assignments: await serializeAssignments(rows, user.userId, () => manage), canManage: manage };
    },
  );

  app.post<{ Params: { courseId: string } }>(
    '/api/v1/courses/:courseId/assignments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const course = await loadCourse(request.params.courseId);
      await assertCanManageCourse(user, course.id);
      const data = parseAssignmentCreate(request.body);
      await assertLessonInCourse(data.lessonId, course.id);
      const row = await prisma.assignment.create({
        data: {
          courseId: course.id,
          title: data.title,
          description: data.description,
          dueAt: data.dueAt,
          maxScore: data.maxScore,
          allowedExtensions: data.allowedExtensions.join(','),
          lessonId: data.lessonId,
          status: data.status,
          createdById: user.userId,
        },
      });
      reply.status(201);
      return { assignment: await oneAssignment(row.id, user.userId, true) };
    },
  );

  app.get<{ Params: { id: string } }>('/api/v1/assignments/:id', { preHandler: [requireAuth] }, async (request) => {
    const user = request.user!;
    const { row, manage } = await loadReadable(request.params.id, user);
    const [assignment] = await serializeAssignments([row], user.userId, () => manage);
    return { assignment };
  });

  app.patch<{ Params: { id: string } }>('/api/v1/assignments/:id', { preHandler: [requireAuth] }, async (request) => {
    const user = request.user!;
    const target = await loadManageable(request.params.id, user);
    const patch = parseAssignmentPatch(request.body);
    if (patch.lessonId !== undefined) await assertLessonInCourse(patch.lessonId, target.courseId);
    if (patch.maxScore !== undefined) {
      const top = await prisma.assignmentSubmission.aggregate({
        where: { assignmentId: target.id },
        _max: { score: true },
      });
      if (top._max.score !== null && patch.maxScore < top._max.score) {
        throw new AppError(
          'MAX_SCORE_BELOW_GRADES',
          `Maksimum puan verilmiş en yüksek puanın (${top._max.score}) altına indirilemez.`,
          400,
        );
      }
    }
    const { allowedExtensions, ...rest } = patch;
    await prisma.assignment.update({
      where: { id: target.id },
      data: { ...rest, ...(allowedExtensions !== undefined ? { allowedExtensions: allowedExtensions.join(',') } : {}) },
    });
    return { assignment: await oneAssignment(target.id, user.userId, true) };
  });

  app.delete<{ Params: { id: string } }>('/api/v1/assignments/:id', { preHandler: [requireAuth] }, async (request) => {
    const user = request.user!;
    const target = await loadManageable(request.params.id, user);
    const [att, files] = await Promise.all([
      prisma.assignmentAttachment.findMany({ where: { assignmentId: target.id }, select: { storedName: true } }),
      prisma.submissionFile.findMany({
        where: { submission: { assignmentId: target.id } },
        select: { storedName: true },
      }),
    ]);
    await prisma.assignment.deleteMany({ where: { id: target.id } });
    await deleteStoredFiles([...att, ...files].map((f) => f.storedName));
    return { success: true };
  });

  app.post<{ Params: { id: string } }>(
    '/api/v1/assignments/:id/attachments',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const target = await loadManageable(request.params.id, user);
      const upload = await receiveUpload(request, () => true);
      if (upload.files.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'En az bir dosya gereklidir.', 400);
      }
      try {
        const created = await prisma.$transaction(
          upload.files.map((f) =>
            prisma.assignmentAttachment.create({
              data: { assignmentId: target.id, uploadedById: user.userId, ...f },
            }),
          ),
        );
        reply.status(201);
        return { attachments: created.map(serializeFile) };
      } catch (err) {
        await deleteStoredFiles(upload.files.map((f) => f.storedName));
        throw err;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/v1/assignment-attachments/:id',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const att = await prisma.assignmentAttachment.findUnique({
        where: { id: request.params.id },
        include: { assignment: { select: { courseId: true } } },
      });
      if (!att) throw new AppError('NOT_FOUND', 'Dosya bulunamadı.', 404);
      await assertCanManageCourse(user, att.assignment.courseId);
      await prisma.assignmentAttachment.deleteMany({ where: { id: att.id } });
      await deleteStoredFiles([att.storedName]);
      return { success: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/assignment-attachments/:id/download',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const att = await prisma.assignmentAttachment.findUnique({
        where: { id: request.params.id },
        include: { assignment: { select: { courseId: true, status: true } } },
      });
      if (!att) throw new AppError('NOT_FOUND', 'Dosya bulunamadı.', 404);
      const manage = await assertCanRead(user, att.assignment.courseId);
      if (att.assignment.status !== 'PUBLISHED' && !manage) throw new AppError('NOT_FOUND', 'Dosya bulunamadı.', 404);
      return sendDownload(reply, att);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/assignments/:id/submissions',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const assignment = await loadAssignment(request.params.id);
      await assertEnrolled(user.userId, assignment.courseId);
      if (assignment.status !== 'PUBLISHED') notFound();
      const exists = () => new AppError('SUBMISSION_EXISTS', 'Bu ödevi zaten teslim ettiniz.', 409);
      const existing = { where: { assignmentId_userId: { assignmentId: assignment.id, userId: user.userId } } };
      // Dosya yazmadan önce erken red: ikinci teslimde diske hiçbir şey yazılmaz.
      if (await prisma.assignmentSubmission.findUnique({ ...existing, select: { id: true } })) throw exists();

      const allowed = splitExtensions(assignment.allowedExtensions);
      const upload = await receiveUpload(request, (ext) => allowed.includes(ext));
      const cleanup = () => deleteStoredFiles(upload.files.map((f) => f.storedName));
      let created;
      try {
        const text = parseSubmissionText(upload.fields.text);
        if (text === null && upload.files.length === 0) {
          throw new AppError('VALIDATION_ERROR', 'Metin veya dosyadan en az biri gereklidir.', 400);
        }
        const now = new Date();
        created = await prisma.assignmentSubmission.create({
          data: {
            assignmentId: assignment.id,
            userId: user.userId,
            text,
            submittedAt: now,
            isLate: now.getTime() > assignment.dueAt.getTime(),
            files: { create: upload.files },
          },
          include: submissionInclude,
        });
      } catch (err) {
        await cleanup();
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw exists();
        throw err;
      }
      reply.status(201);
      return { submission: serializeSubmission(created) };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/assignments/:id/submissions',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const target = await loadManageable(request.params.id, user);
      const [enrollments, subs] = await Promise.all([
        prisma.enrollment.findMany({
          where: { courseId: target.courseId },
          select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        }),
        prisma.assignmentSubmission.findMany({
          where: { assignmentId: target.id },
          include: submissionInclude,
        }),
      ]);
      const byUser = new Map(subs.map((s) => [s.userId, s]));
      const submissions = enrollments
        .map((e) => e.user)
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        .map((student) => {
          const sub = byUser.get(student.id);
          return {
            student: {
              id: student.id,
              name: student.name,
              email: student.email,
              avatarUrl: student.avatarUrl,
            },
            status: statusOf(sub),
            submission: sub ? serializeSubmission(sub) : null,
          };
        });
      return { submissions };
    },
  );

  async function loadSubmissionFor(id: string, user: NonNullable<import('fastify').FastifyRequest['user']>) {
    const sub = await prisma.assignmentSubmission.findUnique({
      where: { id },
      include: { ...submissionInclude, assignment: { select: { courseId: true, maxScore: true } } },
    });
    if (!sub) throw new AppError('NOT_FOUND', 'Teslim bulunamadı.', 404);
    return sub;
  }

  app.get<{ Params: { id: string } }>('/api/v1/submissions/:id', { preHandler: [requireAuth] }, async (request) => {
    const user = request.user!;
    const sub = await loadSubmissionFor(request.params.id, user);
    if (sub.userId !== user.userId && !(await canManageCourse(user, sub.assignment.courseId))) throw forbidden();
    return { submission: serializeSubmission(sub) };
  });

  app.put<{ Params: { id: string } }>(
    '/api/v1/submissions/:id/grade',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const sub = await loadSubmissionFor(request.params.id, user);
      await assertCanManageCourse(user, sub.assignment.courseId);
      const { score, feedback } = parseGrade(request.body, sub.assignment.maxScore);
      const updated = await prisma.assignmentSubmission.update({
        where: { id: sub.id },
        data: { score, feedback, gradedAt: new Date(), gradedById: user.userId },
        include: submissionInclude,
      });
      return { submission: serializeSubmission(updated) };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/submission-files/:id/download',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = request.user!;
      const file = await prisma.submissionFile.findUnique({
        where: { id: request.params.id },
        include: { submission: { select: { userId: true, assignment: { select: { courseId: true } } } } },
      });
      if (!file) throw new AppError('NOT_FOUND', 'Dosya bulunamadı.', 404);
      if (
        file.submission.userId !== user.userId &&
        !(await canManageCourse(user, file.submission.assignment.courseId))
      ) {
        throw forbidden();
      }
      return sendDownload(reply, file);
    },
  );

  app.get<{ Querystring: { status?: string } }>(
    '/api/v1/users/me/assignments',
    { preHandler: [requireAuth] },
    async (request) => {
      const user = request.user!;
      const filter = request.query.status;
      if (filter !== undefined && !SUBMISSION_STATUSES.includes(filter as SubmissionStatus)) {
        throw new AppError('VALIDATION_ERROR', 'status NOT_SUBMITTED, SUBMITTED veya GRADED olmalıdır.', 400);
      }
      const enrollments = await prisma.enrollment.findMany({
        where: { userId: user.userId },
        select: { courseId: true },
      });
      const rows = await prisma.assignment.findMany({
        where: { courseId: { in: enrollments.map((e) => e.courseId) }, status: 'PUBLISHED' },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: assignmentInclude,
      });
      const all = await serializeAssignments(rows, user.userId, () => false);
      const assignments = filter ? all.filter((a) => 'myStatus' in a && a.myStatus === filter) : all;
      return { assignments };
    },
  );
}
