/** Ders yorumları için saf yardımcılar. */
import { containsOffensiveLanguage } from './moderation.js';

export const COMMENT_MAX_LENGTH = 1000;

export type CommentBodyResult =
  | { ok: true; body: string }
  | { ok: false; code: 'VALIDATION_ERROR' | 'INAPPROPRIATE_CONTENT'; message: string };

/** Gövdeyi doğrular ve denetler; kabul edilirse kırpılmış metni döner. */
export function parseCommentBody(raw: unknown): CommentBodyResult {
  const value =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>).body : undefined;
  if (typeof value !== 'string') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'body alanı bir metin olmalıdır.' };
  }
  const body = value.trim();
  if (body.length === 0) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Yorum boş olamaz.' };
  }
  if (body.length > COMMENT_MAX_LENGTH) {
    return { ok: false, code: 'VALIDATION_ERROR', message: `Yorum en fazla ${COMMENT_MAX_LENGTH} karakter olabilir.` };
  }
  if (containsOffensiveLanguage(body)) {
    return {
      ok: false,
      code: 'INAPPROPRIATE_CONTENT',
      message: 'Yorumunuz saygısız ifadeler içerdiği için gönderilemedi. Lütfen hocalarınıza ve arkadaşlarınıza saygılı bir dil kullanın.',
    };
  }
  return { ok: true, body };
}
