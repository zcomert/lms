/**
 * Maskot / puan yardımcıları. Seri hesabı lib/activity.ts'teki tek kaynaktan gelir.
 */
import { prisma } from './prisma.js';
import { computeStreak, dayKey, getStreakDays } from './activity.js';

export const MASCOT_SLOTS = ['HAT', 'GLASSES', 'NECK', 'AURA'] as const;
export type MascotSlot = (typeof MASCOT_SLOTS)[number];

/** Seri eşiği -> bonus puan. */
export const MILESTONES: ReadonlyArray<readonly [number, number]> = [
  [3, 20],
  [7, 50],
  [14, 100],
  [30, 250],
];

export function checkinAmount(streak: number): number {
  return 10 + 5 * Math.min(Math.max(streak, 0), 10);
}

export interface MascotItemView {
  id: string;
  slot: MascotSlot;
  name: string;
  description: string;
  price: number;
  minStreak: number;
  owned: boolean;
  equipped: boolean;
  locked: boolean;
}

export interface MascotState {
  points: number;
  streakDays: number;
  checkedInToday: boolean;
  todayAward: number;
  nextCheckinAmount: number;
  equipped: Partial<Record<MascotSlot, string>>;
  items: MascotItemView[];
}

export async function getBalance(userId: string): Promise<number> {
  const agg = await prisma.pointTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

export async function getStreak(userId: string): Promise<number> {
  const today = dayKey(new Date());
  return computeStreak(await getStreakDays(userId, today), today);
}

export async function buildState(userId: string): Promise<MascotState> {
  const today = dayKey(new Date());
  const [activeDays, points, catalog, owned, checkin, milestones] = await Promise.all([
    getStreakDays(userId, today),
    getBalance(userId),
    prisma.mascotItem.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.userMascotItem.findMany({ where: { userId } }),
    prisma.pointTransaction.findUnique({
      where: { userId_reason_refKey: { userId, reason: 'DAILY_CHECKIN', refKey: today } },
    }),
    prisma.pointTransaction.findMany({ where: { userId, reason: 'STREAK_MILESTONE' } }),
  ]);
  const streakDays = computeStreak(activeDays, today);
  const ownedMap = new Map(owned.map((o) => [o.itemId, o]));

  const todayAward =
    (checkin?.amount ?? 0) +
    milestones.filter((m) => dayKey(m.createdAt) === today).reduce((sum, m) => sum + m.amount, 0);

  const equipped: Partial<Record<MascotSlot, string>> = {};
  const items: MascotItemView[] = catalog.map((item) => {
    const mine = ownedMap.get(item.id);
    const slot = item.slot as MascotSlot;
    if (mine?.equipped) equipped[slot] = item.id;
    return {
      id: item.id,
      slot,
      name: item.name,
      description: item.description,
      price: item.price,
      minStreak: item.minStreak,
      owned: Boolean(mine),
      equipped: Boolean(mine?.equipped),
      locked: streakDays < item.minStreak && !mine,
    };
  });

  return {
    points,
    streakDays,
    checkedInToday: Boolean(checkin),
    todayAward,
    nextCheckinAmount: checkinAmount(streakDays),
    equipped,
    items,
  };
}
