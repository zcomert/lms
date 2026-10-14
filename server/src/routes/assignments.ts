import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { assertCanManageCourse, assignedCourseIds } from '../lib/courseAccess.js';
import {
  ASSIGNMENT_LIMITS,
  ASSIGNMENT_SETTING_FIELDS,
  ASSIGNMENT_STATUSES,
  acceptedFileTypesFromCsv,
  acceptedFileTypesToCsv,
  myAssignmentStatus,
  normalizeAssignmentInput,
  toRawInput,
  type AssignmentStatus,
  type RawAssignmentInput,
} from '../lib/assignments.js';

type AuthUser = NonNullable<Parameters<typeof assertCanManageCourse>[0]>;

function validation(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, 400);
}

function requireBodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validation('İstek gövdesi bir nesne olmalıdır.');
  }
  return body as Record<string, unknown>;
}

const assignmentInclude = {
  course: { select: { id: true, title: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { submissions: true } },
} as const;

type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

function serializeAssignment(assignment: AssignmentRow) {
  return {
    id: assignment.id,
    course: { id: assignment.course.id, title: assignment.course.title },
    title: assignment.title,
    description: assignment.description,
    type: assignment.type,
    status: assignment.status,
    dueAt: assignment.dueAt.toISOString(),
    availableFrom: assignment.availableFrom?.toISOString() ?? null,
    allowLateSubmission: assignment.allowLateSubmission,
    latePenaltyPercent: assignment.latePenaltyPercent,
    maxScore: assignment.maxScore,
    attachmentUrl: assignment.attachmentUrl,
    attachmentName: assignment.attachmentName,
    acceptedFileTypes: acceptedFileTypesFromCsv(assignment.acceptedFileTypes),
    submissionCount: assignment._count.submissions,
    createdBy: assignment.createdBy ? { id: assignment.createdBy.id, name: assignment.createdBy.name } : null,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}

async function loadManagedAssignment(user: AuthUser, id: string): Promise<AssignmentRow> {
  const assignment = await prisma.assignment.findUnique({ where: { id }, include: assignmentInclude });
  if (!assignment) throw new AppError('NOT_FOUND', 'Ödev bulunamadı.', 404);
  await assertCanManageCourse(user, assignment.courseId);
  return assignment;
}

function parseStatus(value: string | undefined): AssignmentStatus | undefined {
  if (value === undefined || value === '') return undefined;
  if (!(ASSIGNMENT_STATUSES as readonly string[]).includes(value)) {
    throw validation(`status şunlardan biri olmalıdır: ${ASSIGNMENT_STATUSES.join(', ')}.`);
  }
  return value as AssignmentStatus;
}

export function registerAssignmentRoutes(app: FastifyInstance) {
  const staff = { preHandler: [requireAuth, requireRole('ADMIN', 'INSTRUCTOR')] };

  // Eğitmen/Admin: bir kursa yeni ödev tanımla. Her zaman taslak olarak oluşturulur.
  app.post<{ Params: { courseId: string }; Body: unknown }>(
    '/api/v1/courses/:courseId/assignments',
    staff,
    async (request, reply) => {
      const user = request.user!;
      const course = await prisma.course.findUnique({
        where: { id: request.params.courseId },
        select: { id: true },
      });
      if (!course) throw new AppError('NOT_FOUND', 'Kurs bulunamadı.', 404);
      await assertCanManageCourse(user, course.id);

      const body = requireBodyObject(request.body);
      const settings = normalizeAssignmentInput({ ...(body as RawAssignmentInput), status: 'DRAFT' });

      const created = await prisma.assignment.create({
        data: {
          ...settings,
          acceptedFileTypes: acceptedFileTypesToCsv(settings.acceptedFileTypes),
          courseId: course.id,
          createdById: user.userId,
        },
        include: assignmentInclude,
      });
      reply.status(201);
      return { assignment: serializeAssignment(created) };
    },
  );

  // Yönetim listesi: ADMIN hepsini, INSTRUCTOR yalnızca atandığı kursların ödevlerini görür.
  app.get<{ Querystring: { courseId?: string; status?: string } }>(
    '/api/v1/assignments/manage',
    staff,
    async (request) => {
      const user = request.user!;
      const status = parseStatus(request.query.status);
      const courseId = request.query.courseId || undefined;

      const assigned = await assignedCourseIds(user);
      const scope = user.role === 'ADMIN' ? {} : { courseId: { in: [...assigned] } };

      const assignments = await prisma.assignment.findMany({
        where: { AND: [scope, courseId ? { courseId } : {}, status ? { status } : {}] },
        include: assignmentInclude,
        orderBy: { updatedAt: 'desc' },
      });
      return { assignments: assignments.map(serializeAssignment) };
    },
  );

  // Yönetim ayrıntısı: ödev + kursa kayıtlı her öğrenci için bir teslim satırı (notlandırma ekranı).
  app.get<{ Params: { id: string } }>('/api/v1/assignments/:id', staff, async (request) => {
    const assignment = await loadManagedAssignment(request.user!, request.params.id);
    const [enrollments, submissions] = await Promise.all([
      prisma.enrollment.findMany({
        where: { courseId: assignment.courseId },
        select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      }),
      prisma.assignmentSubmission.findMany({
        where: { assignmentId: assignment.id },
        select: {
          userId: true,
          note: true,
          fileUrl: true,
          fileName: true,
          submittedAt: true,
          isLate: true,
          score: true,
          feedback: true,
          gradedAt: true,
        },
      }),
    ]);
    const byUser = new Map(submissions.map((s) => [s.userId, s]));
    const roster = enrollments
      .map(({ user }) => {
        const submission = byUser.get(user.id);
        return {
          student: user,
          note: submission?.note ?? null,
          fileUrl: submission?.fileUrl ?? null,
          fileName: submission?.fileName ?? null,
          submittedAt: submission?.submittedAt.toISOString() ?? null,
          isLate: submission?.isLate ?? false,
          score: submission?.score ?? null,
          feedback: submission?.feedback ?? null,
          gradedAt: submission?.gradedAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name, 'tr'));

    return { assignment: serializeAssignment(assignment), submissions: roster };
  });

  app.patch<{ Params: { id: string }; Body: unknown }>('/api/v1/assignments/:id', staff, async (request) => {
    const user = request.user!;
    const existing = await loadManagedAssignment(user, request.params.id);
    const body = requireBodyObject(request.body);
    if (body.courseId !== undefined && body.courseId !== existing.courseId) {
      throw validation('Ödevin kursu sonradan değiştirilemez; yeni bir ödev oluşturun.');
    }
    if (!ASSIGNMENT_SETTING_FIELDS.some((field) => body[field] !== undefined)) {
      throw validation('Güncellenecek en az bir alan gönderilmelidir.');
    }

    const merged: Record<string, unknown> = { ...toRawInput(existing) };
    for (const field of ASSIGNMENT_SETTING_FIELDS) {
      if (body[field] !== undefined) merged[field] = body[field];
    }
    const settings = normalizeAssignmentInput(merged as RawAssignmentInput);

    const updated = await prisma.assignment.update({
      where: { id: existing.id },
      data: { ...settings, acceptedFileTypes: acceptedFileTypesToCsv(settings.acceptedFileTypes) },
      include: assignmentInclude,
    });
    return { assignment: serializeAssignment(updated) };
  });

  app.delete<{ Params: { id: string } }>('/api/v1/assignments/:id', staff, async (request) => {
    const existing = await loadManagedAssignment(request.user!, request.params.id);
    // deleteMany: eşzamanlı silmede P2025 yerine idempotent davranır.
    await prisma.assignment.deleteMany({ where: { id: existing.id } });
    return { deleted: true };
  });

  // Teslime not + geri bildirim gir. Teslim yoksa (öğrenci hiç teslim etmemiş) 400.
  app.put<{ Params: { id: string; userId: string }; Body: unknown }>(
    '/api/v1/assignments/:id/submissions/:userId/grade',
    staff,
    async (request) => {
      const assignment = await loadManagedAssignment(request.user!, request.params.id);
      const { userId } = request.params;
      const body = requireBodyObject(request.body);

      const score = body.score;
      if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > assignment.maxScore) {
        throw validation(`score 0 ile ${assignment.maxScore} arasında bir tam sayı olmalıdır.`);
      }
      let feedback: string | null = null;
      if (body.feedback !== undefined && body.feedback !== null) {
        if (typeof body.feedback !== 'string') throw validation('feedback metin olmalıdır.');
        const trimmed = body.feedback.trim();
        if (trimmed.length > ASSIGNMENT_LIMITS.feedback) {
          throw validation(`feedback en fazla ${ASSIGNMENT_LIMITS.feedback} karakter olabilir.`);
        }
        feedback = trimmed === '' ? null : trimmed;
      }

      const existing = await prisma.assignmentSubmission.findUnique({
        where: { assignmentId_userId: { assignmentId: assignment.id, userId } },
      });
      if (!existing) {
        throw new AppError('SUBMISSION_NOT_FOUND', 'Öğrenci bu ödevi henüz teslim etmedi.', 400);
      }

      const updated = await prisma.assignmentSubmission.update({
        where: { assignmentId_userId: { assignmentId: assignment.id, userId } },
        data: { score, feedback, gradedAt: new Date(), gradedById: request.user!.userId },
      });

      return {
        submission: {
          userId: updated.userId,
          note: updated.note,
          fileUrl: updated.fileUrl,
          fileName: updated.fileName,
          submittedAt: updated.submittedAt.toISOString(),
          isLate: updated.isLate,
          score: updated.score,
          feedback: updated.feedback,
          gradedAt: updated.gradedAt?.toISOString() ?? null,
        },
      };
    },
  );

  // Öğrenci: kayıtlı olduğu kursların yayındaki ödevleri, kendi teslim durumuyla birlikte.
  app.get('/api/v1/assignments/my', { preHandler: [requireAuth] }, async (request) => {
    const userId = request.user!.userId;
    const now = new Date();
    const enrollments = await prisma.enrollment.findMany({ where: { userId }, select: { courseId: true } });
    const assignments = await prisma.assignment.findMany({
      where: { status: 'PUBLISHED', courseId: { in: enrollments.map((row) => row.courseId) } },
      include: {
        course: { select: { id: true, title: true } },
        submissions: { where: { userId }, take: 1 },
      },
    });

    const items = assignments.map((assignment) => {
      const submission = assignment.submissions[0] ?? null;
      return {
        id: assignment.id,
        course: assignment.course,
        title: assignment.title,
        description: assignment.description,
        type: assignment.type,
        dueAt: assignment.dueAt.toISOString(),
        allowLateSubmission: assignment.allowLateSubmission,
        maxScore: assignment.maxScore,
        attachmentUrl: assignment.attachmentUrl,
        attachmentName: assignment.attachmentName,
        acceptedFileTypes: acceptedFileTypesFromCsv(assignment.acceptedFileTypes),
        status: myAssignmentStatus(assignment, submission, now),
        mySubmission: submission
          ? {
              note: submission.note,
              fileUrl: submission.fileUrl,
              fileName: submission.fileName,
              submittedAt: submission.submittedAt.toISOString(),
              isLate: submission.isLate,
              score: submission.score,
              feedback: submission.feedback,
            }
          : null,
      };
    });

    const statusOrder = { PENDING: 0, LATE: 0, SUBMITTED: 1, GRADED: 1 } as const;
    items.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      const aTime = new Date(a.dueAt).getTime();
      const bTime = new Date(b.dueAt).getTime();
      return statusOrder[a.status] === 0 ? aTime - bTime : bTime - aTime;
    });

    return { assignments: items, serverTime: now.toISOString() };
  });

  // Öğrenci: metin ve/veya dosya ile teslim yapar (yeniden teslim üzerine yazar).
  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/v1/assignments/:id/submission',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const assignment = await prisma.assignment.findUnique({ where: { id: request.params.id } });
      if (!assignment || assignment.status !== 'PUBLISHED') {
        throw new AppError('NOT_FOUND', 'Ödev bulunamadı.', 404);
      }
      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: assignment.courseId } },
        select: { id: true },
      });
      if (!enrollment) throw new AppError('NOT_ENROLLED', 'Bu kursa kayıtlı değilsiniz.', 403);

      const now = new Date();
      if (assignment.availableFrom && now.getTime() < assignment.availableFrom.getTime()) {
        throw new AppError('NOT_AVAILABLE_YET', 'Bu ödev için teslim süresi henüz başlamadı.', 403);
      }
      const isLate = now.getTime() > assignment.dueAt.getTime();
      if (isLate && !assignment.allowLateSubmission) {
        throw new AppError('SUBMISSION_CLOSED', 'Bu ödevin teslim süresi doldu.', 403);
      }

      const body = requireBodyObject(request.body);
      let note: string | null = null;
      if (body.note !== undefined && body.note !== null) {
        if (typeof body.note !== 'string') throw validation('note metin olmalıdır.');
        const trimmed = body.note.trim();
        if (trimmed.length > ASSIGNMENT_LIMITS.note) {
          throw validation(`note en fazla ${ASSIGNMENT_LIMITS.note} karakter olabilir.`);
        }
        note = trimmed === '' ? null : trimmed;
      }
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (body.fileUrl !== undefined && body.fileUrl !== null) {
        if (typeof body.fileUrl !== 'string' || body.fileUrl === '') throw validation('fileUrl metin olmalıdır.');
        fileUrl = body.fileUrl;
        fileName =
          typeof body.fileName === 'string' && body.fileName.trim() !== '' ? body.fileName.trim() : fileUrl;

        const acceptedTypes = acceptedFileTypesFromCsv(assignment.acceptedFileTypes);
        if (acceptedTypes.length > 0) {
          const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
          if (!acceptedTypes.includes(ext)) {
            throw new AppError(
              'INVALID_FILE_TYPE',
              `Bu ödev yalnızca şu dosya türlerini kabul ediyor: ${acceptedTypes.join(', ')}.`,
              400,
            );
          }
        }
      }
      if (note === null && fileUrl === null) {
        throw validation('note veya fileUrl alanlarından en az biri gönderilmelidir.');
      }

      const data = { note, fileUrl, fileName, submittedAt: now, isLate, score: null, feedback: null, gradedAt: null, gradedById: null };
      const submission = await prisma.assignmentSubmission.upsert({
        where: { assignmentId_userId: { assignmentId: assignment.id, userId } },
        create: { assignmentId: assignment.id, userId, ...data },
        update: data,
      });

      return {
        submission: {
          note: submission.note,
          fileUrl: submission.fileUrl,
          fileName: submission.fileName,
          submittedAt: submission.submittedAt.toISOString(),
          isLate: submission.isLate,
          score: submission.score,
          feedback: submission.feedback,
        },
      };
    },
  );

  // Öğrenci: kendi teslimini geri çeker. Notlandırılmış teslim silinemez.
  app.delete<{ Params: { id: string } }>(
    '/api/v1/assignments/:id/submission',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const submission = await prisma.assignmentSubmission.findUnique({
        where: { assignmentId_userId: { assignmentId: request.params.id, userId } },
      });
      if (!submission) return { deleted: true };
      if (submission.score !== null) {
        throw new AppError('ALREADY_GRADED', 'Notlandırılmış bir teslim silinemez.', 409);
      }
      await prisma.assignmentSubmission.deleteMany({
        where: { assignmentId: request.params.id, userId },
      });
      return { deleted: true };
    },
  );
}
