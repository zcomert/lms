import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { scheduler } from '../scheduler/index.js';

describe('Admin Scheduler API & Engine', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let studentToken: string;

  async function login(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'sifre123' },
    });
    return res.json().token as string;
  }

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    app = await buildApp({ enableScheduler: false });
  });

  beforeEach(async () => {
    await prisma.userBadge.deleteMany();
    await prisma.studyActivity.deleteMany();
    await prisma.examCandidate.deleteMany();
    await prisma.examQuestion.deleteMany();
    await prisma.exam.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('sifre123', 12);
    await prisma.user.create({
      data: { email: 'admin@example.com', passwordHash, name: 'Admin', role: 'ADMIN', roles: 'ADMIN' },
    });
    await prisma.user.create({
      data: { email: 'student@example.com', passwordHash, name: 'Öğrenci', role: 'STUDENT', roles: 'STUDENT' },
    });

    adminToken = await login('admin@example.com');
    studentToken = await login('student@example.com');
  });

  it('GET /api/v1/admin/scheduler - yetkisiz veya öğrenci erişimi engellenir', async () => {
    const resAnon = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/scheduler',
    });
    expect(resAnon.statusCode).toBe(401);

    const resStudent = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/scheduler',
      headers: auth(studentToken),
    });
    expect(resStudent.statusCode).toBe(403);
  });

  it('GET /api/v1/admin/scheduler - yönetici tüm zamanlanmış işleri listeler', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/scheduler',
      headers: auth(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('jobs');
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBeGreaterThanOrEqual(5);

    const jobNames = body.jobs.map((j: { name: string }) => j.name);
    expect(jobNames).toContain('sync-announcements-exams');
    expect(jobNames).toContain('update-streaks-and-badges');
    expect(jobNames).toContain('detect-at-risk-students');
    expect(jobNames).toContain('database-maintenance');
    expect(jobNames).toContain('upcoming-task-reminders');
  });

  it('POST /api/v1/admin/scheduler/run/:name - bilinmeyen iş için 404 döner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scheduler/run/bilinmeyen-is',
      headers: auth(adminToken),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('POST /api/v1/admin/scheduler/run/:name - tek bir işi başarıyla tetikler', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scheduler/run/database-maintenance',
      headers: auth(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.job).toBe('database-maintenance');
    expect(body.success).toBe(true);
    expect(body.result).toHaveProperty('checkpoint');
    expect(body.result).toHaveProperty('integrityCheck');

    // Görev durumunun SUCCESS olduğunu doğrula
    const state = scheduler.getStatus().find((j) => j.name === 'database-maintenance');
    expect(state?.status).toBe('SUCCESS');
    expect(state?.runCount).toBeGreaterThanOrEqual(1);
    expect(state?.lastRun).toBeDefined();
  });

  it('POST /api/v1/admin/scheduler/run-all - tüm işleri başarıyla tetikler', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scheduler/run-all',
      headers: auth(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.results).toHaveProperty('sync-announcements-exams');
    expect(body.results).toHaveProperty('update-streaks-and-badges');
    expect(body.results).toHaveProperty('detect-at-risk-students');
    expect(body.results).toHaveProperty('database-maintenance');
    expect(body.results).toHaveProperty('upcoming-task-reminders');
  });

  it('upcoming-task-reminders - SELECTED vs COURSE audience ayrımını ve devre dışı kullanıcıları doğru filtreler', async () => {
    // Kurs ve öğrenciler oluştur
    const course = await prisma.course.create({
      data: {
        title: 'Örnek Kurs',
        description: 'Açıklama',
        category: 'Yazılım',
        level: 'Başlangıç',
        status: 'PUBLISHED',
      },
    });

    const activeUser = await prisma.user.create({
      data: {
        email: 'aktif@example.com',
        passwordHash: 'hash',
        name: 'Aktif Öğrenci',
        role: 'STUDENT',
        roles: 'STUDENT',
      },
    });

    const disabledUser = await prisma.user.create({
      data: {
        email: 'pasif@example.com',
        passwordHash: 'hash',
        name: 'Pasif Öğrenci',
        role: 'STUDENT',
        roles: 'STUDENT',
        disabledAt: new Date(),
      },
    });

    // İki kullanıcıyı da kursa kaydet
    await prisma.enrollment.createMany({
      data: [
        { courseId: course.id, userId: activeUser.id, method: 'SELF' },
        { courseId: course.id, userId: disabledUser.id, method: 'SELF' },
      ],
    });

    const now = new Date();
    const closesIn2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // 1. Kurs geneli sınav (COURSE): Sadece aktif kullanıcı (1 kişi) sayılmalı
    const examCourse = await prisma.exam.create({
      data: {
        title: 'Genel Kurs Sınavı',
        courseId: course.id,
        status: 'PUBLISHED',
        audience: 'COURSE',
        endsAt: closesIn2Hours,
      },
    });

    // 2. Seçili öğrenciler sınavı (SELECTED): Sadece aktif kullanıcı aday eklenmiş
    const examSelected = await prisma.exam.create({
      data: {
        title: 'Özel Sınav',
        courseId: course.id,
        status: 'PUBLISHED',
        audience: 'SELECTED',
        endsAt: closesIn2Hours,
      },
    });
    await prisma.examCandidate.create({
      data: { examId: examSelected.id, userId: activeUser.id },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scheduler/run/upcoming-task-reminders',
      headers: auth(adminToken),
    });

    expect(res.statusCode).toBe(200);
    const result = res.json().result;
    expect(result.examsClosingIn24Hours).toBe(2);

    const courseExamSummary = result.exams.find((e: { examId: string }) => e.examId === examCourse.id);
    expect(courseExamSummary?.eligibleStudents).toBe(1); // Pasif öğrenci elenmeli

    const selectedExamSummary = result.exams.find((e: { examId: string }) => e.examId === examSelected.id);
    expect(selectedExamSummary?.eligibleStudents).toBe(1);
  });

  it('update-streaks-and-badges - rozetler mükerrer sayılmaz (idempotent metrik)', async () => {
    const student = await prisma.user.create({
      data: {
        email: 'streak_student@example.com',
        passwordHash: 'hash',
        name: 'Çalışkan Öğrenci',
        role: 'STUDENT',
        roles: 'STUDENT',
      },
    });

    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'Desc', category: 'Cat', level: 'Beg', status: 'PUBLISHED' },
    });

    // 7 gün boyunca aktivite ekle
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);
      await prisma.studyActivity.create({
        data: {
          userId: student.id,
          courseId: course.id,
          day: dayStr,
          seconds: 1200,
          category: 'LESSON_WATCH',
        },
      });
    }

    // İlk çalıştırma: 1 yeni rozet verilmeli
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scheduler/run/update-streaks-and-badges',
      headers: auth(adminToken),
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().result.badgesAwarded).toBe(1);

    // İkinci çalıştırma: Rozet zaten verilmiş olduğu için 0 yeni rozet sayılmalı
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/scheduler/run/update-streaks-and-badges',
      headers: auth(adminToken),
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().result.badgesAwarded).toBe(0);
  });
});

