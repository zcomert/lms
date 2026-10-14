import { AppError } from '../errors.js';
import { prisma } from './prisma.js';
import { ALLOWED_EXTENSIONS } from './uploads.js';

export type SubmissionStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'GRADED';
export const SUBMISSION_STATUSES: SubmissionStatus[] = ['NOT_SUBMITTED', 'SUBMITTED', 'GRADED'];

export const assignmentInclude = {
  course: { select: { title: true } },
  lesson: { select: { title: true } },
  attachments: { orderBy: { createdAt: 'asc' } },
} as const;

export const submissionInclude = { files: { orderBy: { createdAt: 'asc' } } } as const;

function validation(message: string): never {
  throw new AppError('VALIDATION_ERROR', message, 400);
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    validation('Geçersiz istek gövdesi.');
  }
  return body as Record<string, unknown>;
}

export interface AssignmentInput {
  title: string;
  description: string;
  dueAt: Date;
  maxScore: number;
  allowedExtensions: string[];
  lessonId: string | null;
  status: 'DRAFT' | 'PUBLISHED';
}

function parseTitle(raw: unknown): string {
  if (typeof raw !== 'string') validation('Başlık zorunludur.');
  const v = (raw as string).trim();
  if (v.length < 1 || v.length > 200) validation('Başlık 1-200 karakter olmalıdır.');
  return v;
}

function parseDescription(raw: unknown): string {
  if (typeof raw !== 'string') validation('Açıklama bir metin olmalıdır.');
  const v = (raw as string).trim();
  if (v.length > 10000) validation('Açıklama en fazla 10000 karakter olabilir.');
  return v;
}

function parseDueAt(raw: unknown): Date {
  if (typeof raw !== 'string' || raw.trim() === '') validation('Teslim tarihi (dueAt) zorunludur.');
  const d = new Date(raw as string);
  if (Number.isNaN(d.getTime())) validation('Teslim tarihi geçerli bir ISO tarih olmalıdır.');
  return d;
}

function parseMaxScore(raw: unknown): number {
  if (!(typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 1000)) {
    validation('maxScore 1 ile 1000 arasında bir tam sayı olmalıdır.');
  }
  return raw as number;
}

export function parseExtensions(raw: unknown): string[] {
  if (!Array.isArray(raw)) validation('allowedExtensions bir dizi olmalıdır.');
  const out: string[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'string') validation('allowedExtensions yalnızca metin içermelidir.');
    const ext = (item as string).trim().toLowerCase().replace(/^\.+/, '');
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      validation(`"${ext}" uzantısı desteklenmiyor.`);
    }
    if (!out.includes(ext)) out.push(ext);
  }
  return out;
}

function parseLessonId(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string' || raw === '') validation('lessonId null ya da bir ders kimliği olmalıdır.');
  return raw as string;
}

function parseStatus(raw: unknown): 'DRAFT' | 'PUBLISHED' {
  if (raw !== 'DRAFT' && raw !== 'PUBLISHED') validation('status DRAFT veya PUBLISHED olmalıdır.');
  return raw as 'DRAFT' | 'PUBLISHED';
}

export function parseAssignmentCreate(body: unknown): AssignmentInput {
  const raw = asObject(body);
  return {
    title: parseTitle(raw.title),
    description: raw.description === undefined ? '' : parseDescription(raw.description),
    dueAt: parseDueAt(raw.dueAt),
    maxScore: raw.maxScore === undefined ? 100 : parseMaxScore(raw.maxScore),
    allowedExtensions: raw.allowedExtensions === undefined ? [] : parseExtensions(raw.allowedExtensions),
    lessonId: raw.lessonId === undefined ? null : parseLessonId(raw.lessonId),
    status: raw.status === undefined ? 'DRAFT' : parseStatus(raw.status),
  };
}

export function parseAssignmentPatch(body: unknown): Partial<AssignmentInput> {
  const raw = asObject(body);
  const patch: Partial<AssignmentInput> = {};
  if (raw.title !== undefined) patch.title = parseTitle(raw.title);
  if (raw.description !== undefined) patch.description = parseDescription(raw.description);
  if (raw.dueAt !== undefined) patch.dueAt = parseDueAt(raw.dueAt);
  if (raw.maxScore !== undefined) patch.maxScore = parseMaxScore(raw.maxScore);
  if (raw.allowedExtensions !== undefined) patch.allowedExtensions = parseExtensions(raw.allowedExtensions);
  if (raw.lessonId !== undefined) patch.lessonId = parseLessonId(raw.lessonId);
  if (raw.status !== undefined) patch.status = parseStatus(raw.status);
  if (Object.keys(patch).length === 0) validation('Güncellenecek en az bir alan gönderilmelidir.');
  return patch;
}

export function parseGrade(body: unknown, maxScore: number): { score: number; feedback: string | null } {
  const raw = asObject(body);
  const score = raw.score;
  if (!(typeof score === 'number' && Number.isInteger(score))) validation('score bir tam sayı olmalıdır.');
  if ((score as number) < 0 || (score as number) > maxScore) {
    validation(`score 0 ile ${maxScore} arasında olmalıdır.`);
  }
  let feedback: string | null = null;
  if (raw.feedback !== undefined && raw.feedback !== null) {
    if (typeof raw.feedback !== 'string') validation('feedback bir metin olmalıdır.');
    const text = (raw.feedback as string).trim();
    if (text.length > 10000) validation('feedback en fazla 10000 karakter olabilir.');
    feedback = text === '' ? null : text;
  }
  return { score: score as number, feedback };
}

export function parseSubmissionText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  if (text.length > 20000) validation('Metin en fazla 20000 karakter olabilir.');
  return text === '' ? null : text;
}

export function splitExtensions(stored: string): string[] {
  return stored === '' ? [] : stored.split(',');
}

/** Ders verildiyse aynı kursa ait olmalıdır. */
export async function assertLessonInCourse(lessonId: string | null, courseId: string): Promise<void> {
  if (lessonId === null) return;
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { module: { select: { courseId: true } } },
  });
  if (!lesson || lesson.module.courseId !== courseId) {
    throw new AppError('INVALID_LESSON', 'Ders bu kursa ait değil.', 400);
  }
}

interface FileRow {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: Date;
}

export function serializeFile(f: FileRow) {
  return {
    id: f.id,
    name: f.originalName,
    size: f.size,
    mimeType: f.mimeType,
    createdAt: f.createdAt.toISOString(),
  };
}

interface SubmissionRowData {
  id: string;
  assignmentId: string;
  userId: string;
  text: string | null;
  submittedAt: Date;
  isLate: boolean;
  score: number | null;
  feedback: string | null;
  gradedAt: Date | null;
  files: FileRow[];
}

export function serializeSubmission(s: SubmissionRowData) {
  return {
    id: s.id,
    assignmentId: s.assignmentId,
    userId: s.userId,
    text: s.text,
    files: s.files.map(serializeFile),
    submittedAt: s.submittedAt.toISOString(),
    isLate: s.isLate,
    score: s.score,
    feedback: s.feedback,
    gradedAt: s.gradedAt ? s.gradedAt.toISOString() : null,
  };
}

export function statusOf(s: { score: number | null } | null | undefined): SubmissionStatus {
  if (!s) return 'NOT_SUBMITTED';
  return s.score !== null ? 'GRADED' : 'SUBMITTED';
}

interface AssignmentRowData {
  id: string;
  courseId: string;
  course: { title: string };
  lessonId: string | null;
  lesson: { title: string } | null;
  title: string;
  description: string;
  dueAt: Date;
  maxScore: number;
  allowedExtensions: string;
  status: string;
  attachments: FileRow[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Ödevleri serileştirir. Yönetici görünümü `stats`, öğrenci görünümü `myStatus/mySubmission` ekler;
 * başka öğrencilerin verisi öğrenci görünümüne hiç sorgulanmaz.
 */
export async function serializeAssignments(
  rows: AssignmentRowData[],
  viewerId: string,
  manageByCourse: (courseId: string) => boolean,
) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const manageIds = rows.filter((r) => manageByCourse(r.courseId)).map((r) => r.id);
  const studentIds = ids.filter((id) => !manageIds.includes(id));

  const [mine, all, enrollments] = await Promise.all([
    studentIds.length
      ? prisma.assignmentSubmission.findMany({
          where: { assignmentId: { in: studentIds }, userId: viewerId },
          include: submissionInclude,
        })
      : [],
    manageIds.length
      ? prisma.assignmentSubmission.findMany({
          where: { assignmentId: { in: manageIds } },
          select: { assignmentId: true, score: true, isLate: true },
        })
      : [],
    manageIds.length
      ? prisma.enrollment.groupBy({
          by: ['courseId'],
          where: { courseId: { in: [...new Set(rows.filter((r) => manageIds.includes(r.id)).map((r) => r.courseId))] } },
          _count: { _all: true },
        })
      : [],
  ]);
  const mineBy = new Map(mine.map((s) => [s.assignmentId, s]));
  const enrolledBy = new Map(enrollments.map((e) => [e.courseId, e._count._all]));

  return rows.map((r) => {
    const base = {
      id: r.id,
      courseId: r.courseId,
      courseTitle: r.course.title,
      lessonId: r.lessonId,
      lessonTitle: r.lesson ? r.lesson.title : null,
      title: r.title,
      description: r.description,
      dueAt: r.dueAt.toISOString(),
      maxScore: r.maxScore,
      allowedExtensions: splitExtensions(r.allowedExtensions),
      status: r.status as 'DRAFT' | 'PUBLISHED',
      attachments: r.attachments.map(serializeFile),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
    if (manageIds.includes(r.id)) {
      const subs = all.filter((s) => s.assignmentId === r.id);
      return {
        ...base,
        stats: {
          enrolledCount: enrolledBy.get(r.courseId) ?? 0,
          submittedCount: subs.length,
          gradedCount: subs.filter((s) => s.score !== null).length,
          lateCount: subs.filter((s) => s.isLate).length,
        },
      };
    }
    const sub = mineBy.get(r.id);
    return {
      ...base,
      myStatus: statusOf(sub),
      mySubmission: sub ? serializeSubmission(sub) : null,
    };
  });
}

export async function loadAssignment(id: string) {
  const row = await prisma.assignment.findUnique({ where: { id }, include: assignmentInclude });
  if (!row) throw new AppError('NOT_FOUND', 'Ödev bulunamadı.', 404);
  return row;
}

export function notFound(): never {
  throw new AppError('NOT_FOUND', 'Ödev bulunamadı.', 404);
}
