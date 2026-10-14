import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { containsOffensiveLanguage } from '../lib/moderation.js';
import { COMMENT_MAX_LENGTH, parseCommentBody } from '../lib/comments.js';

describe('moderation', () => {
  it('rejects disrespectful Turkish phrases, including common evasions', () => {
    const offensive = [
      'Hoca çok salak',
      'SALAKSIN hocam',
      'aptallar gibi anlatıyor',
      'geri zekalı mısınız',
      'Şerefsiz',
      'şeref siz',
      'namussuz adam',
      's a l a k',
      's.a.l.a.k',
      's4l4k',
      'salaaaaak',
      'amk bu ders',
      'siktir git',
      'defol',
      'terbiyesiz hoca',
      // "mal" ve çekimleri
      'Hoca mal',
      'MAL mısın',
      'malsın',
      'malsınız hocam',
      'm a l',
      'm4l',
      'maaaal',
      // "gerizekalı" yazım türleri
      'gerizekalı',
      'GERİZEKALI',
      'geri zekalı',
      'geri zekâlı',
      'geri-zekalı',
      'geri_zekali',
      'g3r1z3k4l1',
      'gerizekalii',
      'gerizkalı',
      'gerizakalı',
      'ge ri zekalı',
      'g e r i z e k a l ı',
      // Diğer hakaretler
      'serefsz',
      'beyin siz',
      'cahil hoca',
      'hayvan oğlu',
      'eşşoğlu',
      'manyak mısın',
      'öküz',
      'psikopat',
    ];
    for (const text of offensive) {
      expect(containsOffensiveLanguage(text), text).toBe(true);
    }
  });

  it('accepts ordinary and critical-but-respectful comments', () => {
    const clean = [
      'Hocam ders çok güzeldi, teşekkürler!',
      'Bu konuyu anlamadım, tekrar anlatabilir misiniz?',
      'Anlatım biraz hızlıydı ama örnekler faydalıydı.',
      'Hesap makinesi kullanabilir miyiz?',
      'Sıkıştım, ikinci soruda yardım lazım.',
      'Dersi biraz sıktım açıkçası, daha kısa olabilir.',
      'Öç almak gibi bir konu değil bu.',
      'Defolu bir örnek kullanılmış gibi.',
      'Ya rakamlar yanlışsa?',
      'Eşekarısı örneği ilginçti.',
      'Amaç ve hedefler net.',
      'Aminoasitler konusu çok iyiydi.',
      '1. soruda 3 değil 4 olmalı.',
      'Malzeme listesi nerede?',
      'Mali tablolar konusu çok iyiydi.',
      'Bu malı kim üretiyor sorusu güzeldi.',
      'Alçak basınç alanları konusunu anlamadım.',
      'IT departmanı ve LAN kurulumu anlatılsın.',
      'Kes yapıştır yerine kendimiz yazalım.',
      'Hocama sorarım, olmazsa silerim.',
      'Bunu sileyim mi?',
      'Terbiyesi ve zekası çok yüksek bir karakter.',
      'Kafası karışan arkadaşlar için tekrar anlatılabilir.',
      'Namusu ve şerefi için savaşan karakter.',
      'Beyin sizin en önemli organınız.',
      'Geri dönüş ve zeka testleri konusu.',
      'Hayvanlar alemi ve sınıflandırma.',
      'Psikopatoloji dersi ne zaman?',
      'Edebiyat dersindeki şiir çok güzeldi.',
      'Şikayetim yok, her şey güzel.',
      'Yarın sınav var mı?',
      'Ananas örneği komikti.',
      'Karakterin gelişimi iyi anlatılmış.',
    ];
    for (const text of clean) {
      expect(containsOffensiveLanguage(text), text).toBe(false);
    }
  });

  it('validates comment bodies', () => {
    expect(parseCommentBody(undefined)).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(parseCommentBody({ body: 5 })).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(parseCommentBody({ body: '   ' })).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(parseCommentBody({ body: 'a'.repeat(COMMENT_MAX_LENGTH + 1) })).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
    });
    expect(parseCommentBody({ body: 'salak' })).toMatchObject({ ok: false, code: 'INAPPROPRIATE_CONTENT' });
    expect(parseCommentBody({ body: '  Güzel ders  ' })).toEqual({ ok: true, body: 'Güzel ders' });
  });
});

describe('comment routes', () => {
  let app: FastifyInstance;
  let courseId: string;
  let lessonId: string;
  let draftLessonId: string;
  let ids: Record<'s1' | 's2' | 'outsider' | 'admin' | 'instructor' | 'otherInstructor', string>;
  const tokens = {} as Record<keyof typeof ids, string>;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const url = (id = lessonId) => `/api/v1/lessons/${id}/comments`;
  const list = (token: string, id = lessonId) => app.inject({ method: 'GET', url: url(id), headers: auth(token) });
  const post = (body: unknown, token = tokens.s1, id = lessonId) =>
    app.inject({ method: 'POST', url: url(id), headers: auth(token), payload: { body } });
  const remove = (commentId: string, token: string) =>
    app.inject({ method: 'DELETE', url: `${url()}/${commentId}`, headers: auth(token) });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.lessonComment.deleteMany();
    await prisma.courseInstructor.deleteMany();
    await prisma.enrollment.deleteMany();
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
    ids = {} as typeof ids;
    for (const [key, role] of Object.entries(roles) as [keyof typeof ids, 'STUDENT' | 'ADMIN' | 'INSTRUCTOR'][]) {
      const user = await prisma.user.create({
        data: { email: `${key}@example.com`, passwordHash: 'x', name: key, role },
      });
      ids[key] = user.id;
      tokens[key] = signToken({ userId: user.id, role, roles: [role] });
    }

    const course = await prisma.course.create({
      data: { title: 'Kurs', description: 'Açıklama', category: 'Test', level: 'Başlangıç', status: 'PUBLISHED' },
    });
    courseId = course.id;
    const mod = await prisma.module.create({ data: { courseId, title: 'Modül', order: 1 } });
    const lesson = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Ders', order: 1, status: 'PUBLISHED', contentType: 'TEXT' },
    });
    const draft = await prisma.lesson.create({
      data: { moduleId: mod.id, title: 'Taslak', order: 2, status: 'DRAFT', contentType: 'TEXT' },
    });
    lessonId = lesson.id;
    draftLessonId = draft.id;

    for (const key of ['s1', 's2'] as const) {
      await prisma.enrollment.create({ data: { userId: ids[key], courseId, method: 'OPEN' } });
    }
    await prisma.courseInstructor.create({ data: { courseId, userId: ids.instructor, position: 1 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    expect((await app.inject({ method: 'GET', url: url() })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: url(), payload: { body: 'x' } })).statusCode).toBe(401);
  });

  it('returns 404 for draft lessons and 403 for unenrolled students', async () => {
    expect((await list(tokens.s1, draftLessonId)).statusCode).toBe(404);
    expect((await list(tokens.outsider)).statusCode).toBe(403);
    expect((await post('Merhaba', tokens.outsider)).statusCode).toBe(403);
    expect((await list(tokens.otherInstructor)).statusCode).toBe(403);
  });

  it('lets an enrolled student post a comment that everyone in the course sees', async () => {
    const res = await post('  Hocam çok güzel anlattınız.  ');
    expect(res.statusCode).toBe(201);
    expect(res.json().comment).toMatchObject({
      body: 'Hocam çok güzel anlattınız.',
      author: { id: ids.s1, name: 's1' },
      canDelete: true,
    });

    const forS2 = (await list(tokens.s2)).json().comments;
    expect(forS2).toHaveLength(1);
    expect(forS2[0].canDelete).toBe(false);
    expect((await list(tokens.instructor)).json().comments[0].canDelete).toBe(true);
  });

  it('rejects disrespectful comments with 422 and stores nothing', async () => {
    const res = await post('Hoca tam bir salak');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('INAPPROPRIATE_CONTENT');
    expect(await prisma.lessonComment.count()).toBe(0);
  });

  it('rejects empty and too long comments with 400', async () => {
    expect((await post('   ')).statusCode).toBe(400);
    expect((await post('a'.repeat(COMMENT_MAX_LENGTH + 1))).statusCode).toBe(400);
  });

  it('lets authors and course managers delete, but not other students', async () => {
    const first = (await post('Birinci')).json().comment.id;
    const second = (await post('İkinci')).json().comment.id;
    const third = (await post('Üçüncü')).json().comment.id;

    const denied = await remove(first, tokens.s2);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
    expect((await remove(first, tokens.otherInstructor)).statusCode).toBe(403);

    expect((await remove(first, tokens.s1)).json()).toEqual({ deleted: true });
    expect((await remove(second, tokens.instructor)).statusCode).toBe(200);
    expect((await remove(third, tokens.admin)).statusCode).toBe(200);
    expect(await prisma.lessonComment.count()).toBe(0);
    expect((await remove(third, tokens.admin)).statusCode).toBe(404);
  });
});
