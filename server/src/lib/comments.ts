export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_INVALID_MESSAGE = 'Yorum 1 ile 2000 karakter arasında olmalıdır.';

export type ParsedComment = { ok: true; body: string } | { ok: false; message: string };

export function parseCommentBody(input: unknown): ParsedComment {
  const raw = input && typeof input === 'object' ? (input as { body?: unknown }).body : undefined;
  if (typeof raw !== 'string') return { ok: false, message: COMMENT_INVALID_MESSAGE };
  const body = raw.trim();
  if (body.length < 1 || body.length > COMMENT_MAX_LENGTH) {
    return { ok: false, message: COMMENT_INVALID_MESSAGE };
  }
  return { ok: true, body };
}
