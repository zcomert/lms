import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedExamData } from './examSeedData';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('sifre123', 12);

  const instructor = await prisma.user.create({
    data: {
      email: 'egitmen@btkakademi.test',
      passwordHash,
      name: 'Ayşe Yılmaz',
      role: 'INSTRUCTOR',
      roles: 'INSTRUCTOR',
      avatarUrl: 'https://i.pravatar.cc/150?u=egitmen@btkakademi.test',
      locale: 'tr',
    },
  });

  const instructor2 = await prisma.user.create({
    data: {
      email: 'egitmen2@btkakademi.test',
      passwordHash,
      name: 'Mehmet Demir',
      role: 'INSTRUCTOR',
      roles: 'INSTRUCTOR',
      avatarUrl: 'https://i.pravatar.cc/150?u=egitmen2@btkakademi.test',
      locale: 'tr',
    },
  });

  const course = await prisma.course.create({
    data: {
      title: 'React ile Modern Web Geliştirme',
      description: 'React, TypeScript ve modern araçlarla uçtan uca web uygulaması geliştirin.',
      category: 'Yazılım Geliştirme',
      level: 'Orta',
      tags: 'react,typescript,frontend',
      accessMode: 'SEQUENTIAL',
      status: 'PUBLISHED',
      instructors: { create: [{ userId: instructor.id, position: 1 }, { userId: instructor2.id, position: 2 }] },
      modules: {
        create: [
          {
            title: 'Giriş ve Kurulum',
            order: 1,
            lessons: {
              create: [
                {
                  title: 'React Nedir?',
                  order: 1,
                  status: 'PUBLISHED',
                  description: 'React kütüphanesine giriş ve temel kavramlar.',
                  contentType: 'VIDEO_YOUTUBE',
                  contentUrl: 'https://www.youtube.com/watch?v=Tn6-PIqc4UM',
                },
                {
                  title: 'Geliştirme Ortamının Kurulumu',
                  order: 2,
                  status: 'PUBLISHED',
                  description: 'Node.js, npm ve Vite ile React geliştirme ortamının kurulumu.',
                  contentType: 'VIDEO_YOUTUBE',
                  contentUrl: 'https://www.youtube.com/watch?v=O6P86uwfdR0',
                },
                {
                  title: 'Giriş Değerlendirme Sınavı',
                  order: 3,
                  status: 'PUBLISHED',
                  description: 'Bu modülde öğrendiklerinizi ölçen kısa bir sınav.',
                  contentType: 'QUIZ',
                },
              ],
            },
          },
        ],
      },
    },
  });

  const oopCourse = await prisma.course.create({
    data: {
      title: 'Nesne Yönelimli Programlama',
      description:
        'Sınıflar, nesneler, kalıtım, kapsülleme, polimorfizm ve soyutlama gibi temel OOP kavramlarını örneklerle öğrenin.',
      category: 'Yazılım Geliştirme',
      level: 'Başlangıç',
      tags: 'oop,java,yazilim-tasarimi',
      accessMode: 'SEQUENTIAL',
      status: 'PUBLISHED',
      instructors: { create: [{ userId: instructor.id, position: 1 }] },
      modules: {
        create: [],
      },
    },
  });

  const v = (id: string) => `https://www.youtube.com/watch?v=${id}`;
  const lesson = (order: number, title: string, id: string, description: string) => ({
    title,
    order,
    status: 'PUBLISHED',
    description,
    contentType: 'VIDEO_YOUTUBE',
    contentUrl: v(id),
  });

  await prisma.course.create({
    data: {
      title: 'ASP.NET Core Minimal API',
      description:
        'ASP.NET Core Minimal API ile baştan sona REST servisi geliştirin: yönlendirme, parametre bağlama, hata yönetimi, Swagger, Dependency Injection, EF Core, AutoMapper, Identity ve JWT ile kimlik doğrulama.',
      category: 'Yazılım Geliştirme',
      level: 'Orta',
      tags: 'aspnet-core,minimal-api,csharp,rest,jwt,backend',
      accessMode: 'SEQUENTIAL',
      status: 'PUBLISHED',
      modules: {
        create: [
          {
            title: 'Temeller ve Yönlendirme',
            order: 1,
            lessons: {
              create: [
                lesson(1, 'Minimal APIs Giriş', '5Op71vTjJ6Q', 'Minimal API yaklaşımına giriş ve ilk uç nokta.'),
                lesson(2, 'HTTP Verbs', 'WI2YG7W8Pbk', 'GET, POST, PUT, DELETE gibi HTTP fiilleri.'),
                lesson(3, 'Route Handlers', 'YzbWu9Wa4MM', 'Route handler tanımlama biçimleri.'),
                lesson(4, 'Route Parameters', '1BcalNN-Uf4', 'Route parametreleri ve kısıtlamaları.'),
              ],
            },
          },
          {
            title: 'İstek Bağlama ve Yanıtlar',
            order: 2,
            lessons: {
              create: [
                lesson(1, 'Parameter Binding', 'mN0yhn4KZCw', 'Parametrelerin istekten bağlanması.'),
                lesson(2, 'Results', 'bD9JLpXzkAw', 'Results sınıfı ile tipli yanıtlar döndürme.'),
              ],
            },
          },
          {
            title: 'Hata Yönetimi, CORS, Swagger ve Doğrulama',
            order: 3,
            lessons: {
              create: [
                lesson(1, 'Global Error Handler', 'nBD-lFf1dxs', 'Merkezi hata yakalama.'),
                lesson(2, 'CORS', 'nAT7xXN_BNk', 'Cross-Origin Resource Sharing yapılandırması.'),
                lesson(3, 'Swagger', 'MbprGtGP8Qs', 'Swagger ile API dokümantasyonu.'),
                lesson(4, 'Validation', 'S77PdaOfdEk', 'İstek verisi doğrulama.'),
              ],
            },
          },
          {
            title: 'Dependency Injection',
            order: 4,
            lessons: {
              create: [
                lesson(1, 'Dependency Injection', '5daGbCPOEVA', 'Bağımlılık enjeksiyonu temelleri.'),
                lesson(2, 'Dependency Injection and Interfaces', 'ARbZ1_klwnA', 'Arayüzler ile gevşek bağlı tasarım.'),
              ],
            },
          },
          {
            title: 'Veri Erişimi ve Yapılandırma',
            order: 5,
            lessons: {
              create: [
                lesson(1, 'Repository Management', 'e3NX3Bm-fNc', 'Repository deseni ile veri erişimi.'),
                lesson(2, 'ORM', 'LNa4rOQEhuc', 'ORM ile veritabanı işlemleri.'),
                lesson(3, 'AutoMapper', 'm-G4VKqeATE', 'Nesne eşleme için AutoMapper.'),
                lesson(4, 'Configuration and Extensions', 'l6QSCKbjLYY', 'Yapılandırma ve extension method kullanımı.'),
                lesson(5, 'Relations', 'deZ9sU2KGbU', 'Varlıklar arası ilişkiler.'),
              ],
            },
          },
          {
            title: 'Kimlik Doğrulama ve Yetkilendirme',
            order: 6,
            lessons: {
              create: [
                lesson(1, 'Identity', 'bltAkFyQPQs', 'ASP.NET Core Identity ile kullanıcı yönetimi.'),
                lesson(2, 'JSON Web Token', 'vHZOo_ubzaY', 'JWT ile kimlik doğrulama.'),
                lesson(3, 'Refresh Token', 'ImzlwTTLx8w', 'Refresh token ile oturum yenileme.'),
              ],
            },
          },
        ],
      },
    },
  });

  const student = await prisma.user.create({
    data: {
      email: 'ogrenci@btkakademi.test',
      passwordHash,
      name: 'Mehmet Demir',
      role: 'STUDENT',
      roles: 'STUDENT,ADMIN',
      avatarUrl: 'https://i.pravatar.cc/150?u=ogrenci@btkakademi.test',
      locale: 'tr',
    },
  });

  await prisma.enrollment.create({
    data: { userId: student.id, courseId: course.id, method: 'OPEN' },
  });

  await prisma.enrollment.create({
    data: { userId: student.id, courseId: oopCourse.id, method: 'OPEN' },
  });

  await prisma.navMenuItem.createMany({
    data: [
      { path: '/', label: 'Genel Bakış', icon: 'grid_view', order: 1, roles: 'STUDENT,INSTRUCTOR,ADMIN' },
      { path: '/kurslarim', label: 'Kurslarım / Dersler', icon: 'school', order: 2, roles: 'STUDENT,INSTRUCTOR,ADMIN' },
      { path: '/duyurular', label: 'Duyurular', icon: 'campaign', order: 3, roles: 'STUDENT,INSTRUCTOR,ADMIN' },
      { path: '/takvim', label: 'Takvim', icon: 'calendar_today', order: 4, roles: 'STUDENT,INSTRUCTOR,ADMIN' },
      { path: '/notlar-ve-gorevler', label: 'Notlar & Görevler', icon: 'assignment_turned_in', order: 5, roles: 'STUDENT,INSTRUCTOR,ADMIN' },
      { path: '/sinavlar', label: 'Sınavlar', icon: 'quiz', order: 6, roles: 'STUDENT,INSTRUCTOR,ADMIN' },
      { path: '/yonetim/kurslar', label: 'Kurs Yönetimi', icon: 'admin_panel_settings', order: 7, roles: 'ADMIN' },
      { path: '/yonetim/takvim', label: 'Takvim Yönetimi', icon: 'edit_calendar', order: 8, roles: 'ADMIN,INSTRUCTOR' },
      { path: '/yonetim/duyurular', label: 'Duyuru Yönetimi', icon: 'edit_note', order: 9, roles: 'ADMIN,INSTRUCTOR' },
      { path: '/yonetim/kullanicilar', label: 'Kullanıcı Yönetimi', icon: 'manage_accounts', order: 10, roles: 'ADMIN' },
      { path: '/yonetim/sinavlar', label: 'Sınav Yönetimi', icon: 'fact_check', order: 11, roles: 'ADMIN,INSTRUCTOR' },
      { path: '/yonetim/odevler', label: 'Ödev Yönetimi', icon: 'assignment_turned_in', order: 11, roles: 'ADMIN,INSTRUCTOR' },
      { path: '/yonetim/soru-bankasi', label: 'Soru Bankası', icon: 'library_books', order: 12, roles: 'ADMIN,INSTRUCTOR' },
    ],
  });

  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
  await prisma.announcement.createMany({
    data: [
      {
        title: 'Güz Dönemi Ara Sınav Takvimi Yayınlandı',
        body: 'Güz dönemi ara sınav takvimi kesinleşmiştir. Sınav tarih ve saatlerini Takvim sayfasından takip edebilirsiniz.\n\nMazeret sınavı başvuruları sınavdan sonraki 3 iş günü içinde yapılmalıdır.',
        category: 'ACADEMIC',
        status: 'PUBLISHED',
        publishAt: hoursAgo(3),
        pinned: true,
        authorId: student.id,
      },
      {
        title: 'Canlı Soru-Cevap Oturumu: Perşembe 19:00',
        body: 'React ile Modern Web Geliştirme kursu için haftalık canlı soru-cevap oturumu Perşembe 19:00\'da yapılacaktır. Sorularınızı önceden ders forumuna iletebilirsiniz.',
        category: 'COURSE',
        status: 'PUBLISHED',
        publishAt: hoursAgo(26),
        courseId: course.id,
        authorId: instructor.id,
      },
      {
        title: 'Kampüs Kütüphanesi Dijital Veritabanı Bakımı Tamamlandı',
        body: 'Kütüphane dijital veritabanlarına erişim yeniden sağlanmıştır. Erişim sorunu yaşarsanız Bilgi İşlem destek hattına başvurunuz.',
        category: 'IT',
        status: 'PUBLISHED',
        publishAt: hoursAgo(50),
        authorId: student.id,
      },
      {
        title: 'Bahar Dönemi Ders Seçim Takvimi (Taslak)',
        body: 'Bahar dönemi ders seçim tarihleri kesinleştiğinde bu duyuru yayınlanacaktır.',
        category: 'ACADEMIC',
        status: 'DRAFT',
        authorId: student.id,
      },
    ],
  });

  // Öğrenci hesabı aynı zamanda yönetici (roles: STUDENT,ADMIN); genel bankanın sahibi olarak kullanılır.
  await seedExamData(prisma, { courseId: course.id, instructorId: instructor.id, adminId: student.id });

  const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.assignment.createMany({
    data: [
      {
        courseId: course.id,
        title: 'Veri Yapıları Proje Ödevi 2',
        description: 'Dengeli Ağaç (AVL Tree) Gerçekleştirimi',
        type: 'HOMEWORK',
        status: 'PUBLISHED',
        dueAt: daysFromNow(2),
        allowLateSubmission: true,
        latePenaltyPercent: 10,
        createdById: instructor.id,
      },
      {
        courseId: course.id,
        title: 'Yapay Zekâ Mini Proje Teslimi',
        description: 'Lineer Regresyon ile Tahminleme Notebook’u',
        type: 'LAB',
        status: 'PUBLISHED',
        dueAt: daysFromNow(5),
        allowLateSubmission: false,
        createdById: instructor.id,
      },
    ],
  });

  console.log('Seed tamamlandı.');
}

main().finally(() => prisma.$disconnect());
