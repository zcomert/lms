import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { dayKey } from '../lib/activity.js';
import { MILESTONES, buildState, checkinAmount, getStreak } from '../lib/mascot.js';

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export function registerMascotRoutes(app: FastifyInstance) {
  app.get('/api/v1/users/me/mascot', { preHandler: [requireAuth] }, async (request) => {
    return buildState(request.user!.userId);
  });

  app.post('/api/v1/users/me/mascot/checkin', { preHandler: [requireAuth] }, async (request) => {
    const userId = request.user!.userId;
    const today = dayKey(new Date());
    const streak = await getStreak(userId);
    const base = checkinAmount(streak);

    let awarded = false;
    let amount = 0;
    let milestoneBonus = 0;
    try {
      await prisma.pointTransaction.create({
        data: { userId, amount: base, reason: 'DAILY_CHECKIN', refKey: today },
      });
      awarded = true;
      amount = base;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }

    if (awarded) {
      for (const [threshold, bonus] of MILESTONES) {
        if (streak < threshold) continue;
        try {
          await prisma.pointTransaction.create({
            data: { userId, amount: bonus, reason: 'STREAK_MILESTONE', refKey: String(threshold) },
          });
          milestoneBonus += bonus;
          amount += bonus;
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
    }

    return { awarded, amount, milestoneBonus, state: await buildState(userId) };
  });

  app.post<{ Params: { itemId: string } }>(
    '/api/v1/users/me/mascot/items/:itemId/purchase',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const { itemId } = request.params;
      const streak = await getStreak(userId);

      try {
        await prisma.$transaction(async (tx) => {
          const item = await tx.mascotItem.findUnique({ where: { id: itemId } });
          if (!item || !item.active) throw new AppError('NOT_FOUND', 'Eşya bulunamadı.', 404);
          const owned = await tx.userMascotItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
          if (owned) throw new AppError('ALREADY_OWNED', 'Bu eşyaya zaten sahipsin.', 409);
          if (streak < item.minStreak) {
            throw new AppError('ITEM_LOCKED', `Bu eşya için en az ${item.minStreak} günlük seri gerekir.`, 403);
          }
          const sum = await tx.pointTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
          if ((sum._sum.amount ?? 0) < item.price) {
            throw new AppError('INSUFFICIENT_POINTS', 'Yeterli puanın yok.', 409);
          }
          await tx.userMascotItem.create({ data: { userId, itemId } });
          await tx.pointTransaction.create({
            data: { userId, amount: -item.price, reason: 'PURCHASE', refKey: itemId },
          });
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError('ALREADY_OWNED', 'Bu eşyaya zaten sahipsin.', 409);
        throw err;
      }

      return buildState(userId);
    },
  );

  app.put<{ Body: { itemId?: unknown; equipped?: unknown } }>(
    '/api/v1/users/me/mascot/equipped',
    { preHandler: [requireAuth] },
    async (request) => {
      const userId = request.user!.userId;
      const { itemId, equipped } = request.body ?? {};
      if (typeof itemId !== 'string' || itemId === '') {
        throw new AppError('VALIDATION_ERROR', 'itemId zorunludur.', 400);
      }
      if (typeof equipped !== 'boolean') {
        throw new AppError('VALIDATION_ERROR', 'equipped bir boolean olmalıdır.', 400);
      }
      const item = await prisma.mascotItem.findUnique({ where: { id: itemId } });
      if (!item || !item.active) throw new AppError('NOT_FOUND', 'Eşya bulunamadı.', 404);

      await prisma.$transaction(async (tx) => {
        const owned = await tx.userMascotItem.findUnique({ where: { userId_itemId: { userId, itemId } } });
        if (!owned) throw new AppError('NOT_OWNED', 'Bu eşyaya sahip değilsin.', 403);
        if (equipped) {
          await tx.userMascotItem.updateMany({
            where: { userId, equipped: true, itemId: { not: itemId }, item: { slot: item.slot } },
            data: { equipped: false },
          });
        }
        await tx.userMascotItem.update({ where: { id: owned.id }, data: { equipped } });
      });

      return buildState(userId);
    },
  );
}
