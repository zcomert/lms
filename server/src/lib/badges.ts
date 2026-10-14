import { prisma } from './prisma.js';

export const BADGE_DEFS = {
  course_complete: { name: 'Kurs Bitirme', icon: 'workspace_premium', description: 'Bir kursu %100 tamamladın.' },
  streak_7: { name: '7 Gün Seri', icon: 'local_fire_department', description: '7 gün üst üste çalıştın.' },
} as const;
export type BadgeType = keyof typeof BADGE_DEFS;

/** Idempotent rozet verme; mevcut ya da yeni kaydı döndürür. */
export async function awardBadge(userId: string, type: BadgeType, courseId: string | null, label: string) {
  if (courseId === null) {
    // SQLite unique indekslerinde NULL değerler birbirinden farklı sayılır; önce kontrol et.
    const existing = await prisma.userBadge.findFirst({ where: { userId, type, courseId: null } });
    if (existing) return existing;
    return prisma.userBadge.create({ data: { userId, type, courseId: null, label } });
  }
  return prisma.userBadge.upsert({
    where: { userId_type_courseId: { userId, type, courseId } },
    create: { userId, type, courseId, label },
    update: {},
  });
}
