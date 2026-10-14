/**
 * Çalışma aktivitesi yardımcıları: gün anahtarı, takvim aritmetiği ve kategori eşlemesi.
 *
 * Gün sınırı tek bir saat dilimine göre belirlenir (ACTIVITY_TIMEZONE, varsayılan
 * Europe/Istanbul); böylece "bugün" ve "son 7 gün" hem kayıtta hem raporda aynı takvimi kullanır.
 */

import { prisma } from './prisma.js';

export const ACTIVITY_TIMEZONE = process.env.ACTIVITY_TIMEZONE ?? 'Europe/Istanbul';

/** Tek bir bildirimde kabul edilen en uzun süre; istemci ~60 sn'de bir gönderir, fazlası kırpılır. */
export const MAX_HEARTBEAT_SECONDS = 120;

/** Raporlanabilecek en uzun gün aralığı. */
export const MAX_REPORT_DAYS = 90;

/** Seri hesaplanırken geriye bakılan en uzun süre (gün). */
export const STREAK_LOOKBACK_DAYS = 365;

export type ActivityCategory = 'VIDEO' | 'QUIZ' | 'READING';

/** `date` anının verilen saat dilimindeki takvim günü: `YYYY-MM-DD`. */
export function dayKey(date: Date, timeZone: string = ACTIVITY_TIMEZONE): string {
  // en-CA biçimi doğrudan YYYY-MM-DD üretir.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** `YYYY-MM-DD` gününe `delta` gün ekler (saat diliminden bağımsız, saf takvim aritmetiği). */
export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Dersin içerik türünden raporlama kategorisi. */
export function categoryFor(contentType: string): ActivityCategory {
  if (contentType === 'VIDEO_YOUTUBE') return 'VIDEO';
  if (contentType === 'QUIZ') return 'QUIZ';
  return 'READING';
}

/**
 * Bugünden geriye kesintisiz aktif gün sayısı. Bugün henüz çalışılmadıysa seri
 * dünden itibaren sayılır (gün bitmeden seri bozulmuş sayılmaz).
 */
export function computeStreak(activeDays: Set<string>, today: string): number {
  let cursor = activeDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (activeDays.has(cursor) && streak < STREAK_LOOKBACK_DAYS) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Kullanıcının seri aralığındaki (son STREAK_LOOKBACK_DAYS gün) aktif günleri; seri tek kaynağı. */
export async function getStreakDays(userId: string, today: string = dayKey(new Date())): Promise<Set<string>> {
  const rows = await prisma.studyActivity.groupBy({
    by: ['day'],
    where: { userId, day: { gte: addDays(today, -STREAK_LOOKBACK_DAYS), lte: today }, seconds: { gt: 0 } },
  });
  return new Set(rows.map((row) => row.day));
}
