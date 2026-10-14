import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';

describe('notification routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let instructorToken: string;
  let studentToken: string;
  let courseA: string; // öğrenci kayıtlı, eğitmen atanmış
  let courseB: string; // kimse yok

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const upcoming = (token: string) =>
    app.inject({ method: 'GET', url: '/api/v1/notifications/upcoming', headers: auth(token) });
  const titles = (res: { json: () => { events: { title: string }[] } }) => res.json().events.map((e) => e.title);

  /** Şu andan `hours` saat sonrasına (negatifse öncesine) düşen bir an. */
  const at = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);

  function seed(title: string, start: Date, courseId: string | null = null) {
    return prisma.calendarEvent.create({
      data: { title, start, end: null, allDay: false, courseId, type: 'lecture' },
    });
  }

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.calendarEvent.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    const makeUser = (email: string, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') =>
      prisma.user.create({ data: { email, passwordHash: 'x', name: email, role } });
    const admin = await makeUser('admin@example.com', 'ADMIN');
    const instructor = await makeUser('instructor@example.com', 'INSTRUCTOR');
    const student = await makeUser('student@example.com', 'STUDENT');
    const tokenFor = (userId: string, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') =>
      signToken({ userId, role, roles: [role] });
    adminToken = tokenFor(admin.id, 'ADMIN');
    instructorToken = tokenFor(instructor.id, 'INSTRUCTOR');
    studentToken = tokenFor(student.id, 'STUDENT');

    const makeCourse = (title: string) =>
      prisma.course.create({
        data: { title, description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
      });
    courseA = (await makeCourse('Kurs A')).id;
    courseB = (await makeCourse('Kurs B')).id;
    await prisma.enrollment.create({ data: { userId: student.id, courseId: courseA, method: 'OPEN' } });
    await prisma.courseInstructor.create({ data: { courseId: courseA, userId: instructor.id, position: 1 } });
  });

  it('kimliksiz istek 401 döner', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/notifications/upcoming' });
    expect(res.statusCode).toBe(401);
  });

  it('öğrenci yalnızca kayıtlı olduğu kursun ve genel etkinlikleri görür', async () => {
    await seed('Kayıtlı kurs dersi', at(24), courseA);
    await seed('Yabancı kurs dersi', at(25), courseB);
    await seed('Genel etkinlik', at(26), null);

    const res = await upcoming(studentToken);
    expect(res.statusCode).toBe(200);
    expect(titles(res)).toEqual(['Kayıtlı kurs dersi', 'Genel etkinlik']);
    expect(res.json().count).toBe(2);
  });

  it('geçmiş etkinlikleri ve 7 günden uzaktakileri listelemez', async () => {
    await seed('Dün olan', at(-24), courseA);
    await seed('Bir saat sonra', at(1), courseA);
    await seed('Altı gün sonra', at(24 * 6), courseA);
    await seed('Sekiz gün sonra', at(24 * 8), courseA);

    const res = await upcoming(studentToken);
    expect(titles(res)).toEqual(['Bir saat sonra', 'Altı gün sonra']);
  });

  it('en yakın etkinlik başta olacak şekilde sıralar', async () => {
    await seed('Üçüncü', at(72), courseA);
    await seed('Birinci', at(2), courseA);
    await seed('İkinci', at(30), courseA);

    expect(titles(await upcoming(studentToken))).toEqual(['Birinci', 'İkinci', 'Üçüncü']);
  });

  it('eğitmen atandığı kursun etkinliğini görür', async () => {
    await seed('Atandığı kurs', at(5), courseA);
    await seed('Atanmadığı kurs', at(6), courseB);

    expect(titles(await upcoming(instructorToken))).toEqual(['Atandığı kurs']);
  });

  it('yönetici tüm kursların etkinliklerini görür', async () => {
    await seed('Kurs A dersi', at(5), courseA);
    await seed('Kurs B dersi', at(6), courseB);

    expect(titles(await upcoming(adminToken))).toEqual(['Kurs A dersi', 'Kurs B dersi']);
  });

  it('yaklaşan etkinlik yoksa boş liste döner', async () => {
    const res = await upcoming(studentToken);
    expect(res.json()).toEqual({ events: [], count: 0 });
  });

  it('etkinlikle birlikte kurs bilgisini de döner', async () => {
    await seed('Kurs dersi', at(10), courseA);

    const event = (await upcoming(studentToken)).json().events[0];
    expect(event.course).toEqual({ id: courseA, title: 'Kurs A' });
    expect(event.type).toBe('lecture');
    expect(typeof event.start).toBe('string');
  });
});
