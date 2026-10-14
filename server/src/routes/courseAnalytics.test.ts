import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

describe('courseAnalytics routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let instructorToken: string;
  let otherInstructorToken: string;
  let studentToken: string;
  let courseId: string;
  let lesson1Id: string;
  let lesson2Id: string;
  let lesson3Id: string;
  let student1Id: string;
  let student2Id: string;

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
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.studyActivity.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('sifre123', 12);
    const admin = await prisma.user.create({
      data: { email: 'admin@example.com', passwordHash, name: 'Yönetici', role: 'ADMIN', roles: 'ADMIN' },
    });
    const instructor = await prisma.user.create({
      data: { email: 'inst@example.com', passwordHash, name: 'Eğitmen', role: 'INSTRUCTOR', roles: 'INSTRUCTOR' },
    });
    const otherInstructor = await prisma.user.create({
      data: { email: 'other_inst@example.com', passwordHash, name: 'Başka Eğitmen', role: 'INSTRUCTOR', roles: 'INSTRUCTOR' },
    });
    const student1 = await prisma.user.create({
      data: { email: 'student1@example.com', passwordHash, name: 'Ali Veli', role: 'STUDENT', roles: 'STUDENT' },
    });
    const student2 = await prisma.user.create({
      data: { email: 'student2@example.com', passwordHash, name: 'Ayşe Fatma', role: 'STUDENT', roles: 'STUDENT' },
    });
    student1Id = student1.id;
    student2Id = student2.id;

    adminToken = await login('admin@example.com');
    instructorToken = await login('inst@example.com');
    otherInstructorToken = await login('other_inst@example.com');
    studentToken = await login('student1@example.com');

    // Kurs oluştur
    const course = await prisma.course.create({
      data: {
        title: 'Algoritma ve Veri Yapıları',
        description: 'Test Kursu',
        category: 'Yazılım',
        level: 'Orta',
        accessMode: 'SEQUENTIAL',
        status: 'PUBLISHED',
        instructors: { create: [{ userId: instructor.id, position: 1 }] },
      },
    });
    courseId = course.id;

    const mod1 = await prisma.module.create({
      data: { courseId, title: 'Modül 1', order: 1 },
    });
    const mod2 = await prisma.module.create({
      data: { courseId, title: 'Modül 2', order: 2 },
    });

    const l1 = await prisma.lesson.create({
      data: { moduleId: mod1.id, title: 'Ders 1: Giriş', order: 1, status: 'PUBLISHED', contentType: 'VIDEO_YOUTUBE' },
    });
    const l2 = await prisma.lesson.create({
      data: { moduleId: mod1.id, title: 'Ders 2: Ağaçlar', order: 2, status: 'PUBLISHED', contentType: 'DOCUMENT' },
    });
    const l3 = await prisma.lesson.create({
      data: { moduleId: mod2.id, title: 'Ders 3: Graflar', order: 1, status: 'PUBLISHED', contentType: 'QUIZ' },
    });
    lesson1Id = l1.id;
    lesson2Id = l2.id;
    lesson3Id = l3.id;

    // Öğrencileri kaydet
    await prisma.enrollment.createMany({
      data: [
        { userId: student1Id, courseId, method: 'OPEN' },
        { userId: student2Id, courseId, method: 'OPEN' },
      ],
    });

    // Student 1: Ders 1 ve 2'yi tamamladı (Ders 2'de kaldı / terk etti)
    await prisma.lessonProgress.createMany({
      data: [
        { userId: student1Id, lessonId: lesson1Id },
        { userId: student1Id, lessonId: lesson2Id },
      ],
    });

    // Student 2: Tüm dersleri tamamladı (100%)
    await prisma.lessonProgress.createMany({
      data: [
        { userId: student2Id, lessonId: lesson1Id },
        { userId: student2Id, lessonId: lesson2Id },
        { userId: student2Id, lessonId: lesson3Id },
      ],
    });

    // Çalışma aktiviteleri
    await prisma.studyActivity.createMany({
      data: [
        { userId: student1Id, courseId, day: '2026-10-14', category: 'VIDEO', seconds: 1200 },
        { userId: student2Id, courseId, day: '2026-10-14', category: 'VIDEO', seconds: 2400 },
      ],
    });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/courses/${courseId}/analytics`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects students with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/courses/${courseId}/analytics`,
      headers: auth(studentToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects unassigned instructors with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/courses/${courseId}/analytics`,
      headers: auth(otherInstructorToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns course analytics for assigned instructor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/courses/${courseId}/analytics`,
      headers: auth(instructorToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.course.title).toBe('Algoritma ve Veri Yapıları');
    expect(body.summary.totalEnrolled).toBe(2);
    expect(body.summary.completedCount).toBe(1);
    expect(body.summary.inProgressCount).toBe(1);
    expect(body.summary.completionRate).toBe(50);
    expect(body.summary.averagePercent).toBe(84); // (67 + 100) / 2 = 83.5 -> 84

    // Dropoff analizi kontrolü:
    // Ders 1: 2 kişi tamamladı (%100)
    // Ders 2: 2 kişi tamamladı (%100), student 1 burada bıraktı (dropoffCount: 1)
    // Ders 3: 1 kişi tamamladı (%50)
    expect(body.dropoffAnalysis).toHaveLength(3);
    expect(body.dropoffAnalysis[0].lessonTitle).toBe('Ders 1: Giriş');
    expect(body.dropoffAnalysis[0].completedCount).toBe(2);

    expect(body.dropoffAnalysis[1].lessonTitle).toBe('Ders 2: Ağaçlar');
    expect(body.dropoffAnalysis[1].dropoffCount).toBe(1);

    expect(body.dropoffAnalysis[2].lessonTitle).toBe('Ders 3: Graflar');
    expect(body.dropoffAnalysis[2].completedCount).toBe(1);

    // Öğrenciler listesi
    expect(body.students).toHaveLength(2);
    const s1 = body.students.find((s: any) => s.userId === student1Id);
    expect(s1.percent).toBe(67);
    expect(s1.status).toBe('IN_PROGRESS');
    expect(s1.lastCompletedLesson).toBe('Ders 2: Ağaçlar');
    expect(s1.studyMinutes).toBe(20);

    const s2 = body.students.find((s: any) => s.userId === student2Id);
    expect(s2.percent).toBe(100);
    expect(s2.status).toBe('COMPLETED');
  });

  it('exports analytics report as CSV with UTF-8 BOM', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/courses/${courseId}/analytics/export`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`attachment; filename="kurs-analitik-${courseId}.csv"`);

    const payload = res.payload;
    expect(payload.startsWith('\uFEFF')).toBe(true);
    expect(payload).toContain('Öğrenci Adı;E-posta;Kayıt Tarihi');
    expect(payload).toContain('Ali Veli');
    expect(payload).toContain('Ayşe Fatma');
    expect(payload).toContain('Tamamlandı');
    expect(payload).toContain('Devam Ediyor');
  });
});
