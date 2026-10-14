import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { addDays, dayKey } from '../lib/activity.js';
import { checkinAmount } from '../lib/mascot.js';

describe('checkinAmount', () => {
  it('scales with streak and caps at 10', () => {
    expect(checkinAmount(0)).toBe(10);
    expect(checkinAmount(3)).toBe(25);
    expect(checkinAmount(10)).toBe(60);
    expect(checkinAmount(25)).toBe(60);
  });
});

describe('mascot routes', () => {
  let app: FastifyInstance;
  let userId: string;
  let courseId: string;
  let token: string;

  const auth = () => ({ authorization: `Bearer ${token}` });
  const state = async () => (await app.inject({ method: 'GET', url: '/api/v1/users/me/mascot', headers: auth() })).json();
  const checkin = () => app.inject({ method: 'POST', url: '/api/v1/users/me/mascot/checkin', headers: auth() });
  const buy = (id: string) =>
    app.inject({ method: 'POST', url: `/api/v1/users/me/mascot/items/${id}/purchase`, headers: auth() });
  const equip = (itemId: unknown, equipped: unknown = true) =>
    app.inject({ method: 'PUT', url: '/api/v1/users/me/mascot/equipped', headers: auth(), payload: { itemId, equipped } as never });
  const giveStreak = async (days: number) => {
    const today = dayKey(new Date());
    for (let i = 0; i < days; i += 1) {
      await prisma.studyActivity.create({
        data: { userId, courseId, day: addDays(today, -i), category: 'READING', seconds: 60 },
      });
    }
  };
  const givePoints = (amount: number) =>
    prisma.pointTransaction.create({ data: { userId, amount, reason: 'TEST', refKey: String(Math.random()) } });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.userMascotItem.deleteMany();
    await prisma.pointTransaction.deleteMany();
    await prisma.studyActivity.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();
    const user = await prisma.user.create({
      data: { email: 'mascot@example.com', passwordHash: 'x', name: 'M', role: 'STUDENT' },
    });
    userId = user.id;
    token = signToken({ userId, role: 'STUDENT', roles: ['STUDENT'] });
    courseId = (
      await prisma.course.create({
        data: { title: 'K', description: 'A', category: 'T', level: 'B', status: 'PUBLISHED' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    for (const [method, url] of [
      ['GET', '/api/v1/users/me/mascot'],
      ['POST', '/api/v1/users/me/mascot/checkin'],
      ['POST', '/api/v1/users/me/mascot/items/hat-beret/purchase'],
      ['PUT', '/api/v1/users/me/mascot/equipped'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
    }
  });

  it('returns the catalog state', async () => {
    const s = await state();
    expect(s).toMatchObject({ points: 0, streakDays: 0, checkedInToday: false, todayAward: 0, nextCheckinAmount: 10 });
    expect(s.items).toHaveLength(8);
    expect(s.items.find((i: { id: string }) => i.id === 'hat-graduation').locked).toBe(true);
    expect(s.items.find((i: { id: string }) => i.id === 'hat-beret').locked).toBe(false);
  });

  it('check-in is idempotent per day', async () => {
    const first = (await checkin()).json();
    expect(first).toMatchObject({ awarded: true, amount: 10, milestoneBonus: 0 });
    expect(first.state).toMatchObject({ points: 10, checkedInToday: true, todayAward: 10 });
    const second = (await checkin()).json();
    expect(second).toMatchObject({ awarded: false, amount: 0, milestoneBonus: 0 });
    expect(second.state.points).toBe(10);
  });

  it('scales the amount with streak and grants the 3-day milestone once', async () => {
    await giveStreak(3);
    const res = (await checkin()).json();
    expect(res).toMatchObject({ awarded: true, amount: 25 + 20, milestoneBonus: 20 });
    expect(res.state).toMatchObject({ points: 45, streakDays: 3, todayAward: 45 });
    expect((await checkin()).json().state.points).toBe(45);
    expect(await prisma.pointTransaction.count({ where: { userId, reason: 'STREAK_MILESTONE' } })).toBe(1);
  });

  describe('purchase', () => {
    it('succeeds and debits the balance', async () => {
      await givePoints(100);
      const res = await buy('hat-beret');
      expect(res.statusCode).toBe(200);
      const s = res.json();
      expect(s.points).toBe(60);
      expect(s.items.find((i: { id: string }) => i.id === 'hat-beret')).toMatchObject({ owned: true, equipped: false });
    });

    it('rejects insufficient points', async () => {
      await givePoints(10);
      const res = await buy('hat-beret');
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('INSUFFICIENT_POINTS');
    });

    it('rejects an already owned item', async () => {
      await givePoints(200);
      expect((await buy('hat-beret')).statusCode).toBe(200);
      const res = await buy('hat-beret');
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ALREADY_OWNED');
      expect((await state()).points).toBe(160);
    });

    it('rejects a locked item and unknown items', async () => {
      await givePoints(500);
      const res = await buy('hat-graduation');
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('ITEM_LOCKED');
      expect((await buy('nope')).statusCode).toBe(404);
    });
  });

  describe('equip', () => {
    it('rejects items that are not owned', async () => {
      const res = await equip('hat-beret');
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('NOT_OWNED');
    });

    it('validates input and unknown items', async () => {
      expect((await equip(5)).statusCode).toBe(400);
      expect((await equip('hat-beret', 'yes')).statusCode).toBe(400);
      expect((await equip('nope')).statusCode).toBe(404);
    });

    it('keeps one equipped item per slot', async () => {
      await givePoints(500);
      await buy('neck-scarf');
      await buy('neck-bowtie');
      await buy('glasses-round');
      let s = (await equip('neck-scarf')).json();
      expect(s.equipped).toEqual({ NECK: 'neck-scarf' });
      await equip('glasses-round');
      s = (await equip('neck-bowtie')).json();
      expect(s.equipped).toEqual({ NECK: 'neck-bowtie', GLASSES: 'glasses-round' });
      expect(s.items.find((i: { id: string }) => i.id === 'neck-scarf').equipped).toBe(false);
      s = (await equip('neck-bowtie', false)).json();
      expect(s.equipped).toEqual({ GLASSES: 'glasses-round' });
    });
  });
});
