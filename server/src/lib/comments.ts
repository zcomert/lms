/** Ders yorumları için saf yardımcılar (gövde doğrulama + yanıt gruplama). */

export interface ParsedCommentBody {
  body: string;
  parentId: string | null;
}

/** Gövdeyi doğrular; geçersizse hata mesajı döner. */
export function parseCommentBody(
  body: unknown,
): { ok: true; parsed: ParsedCommentBody } | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'body alanı gereklidir.' };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.body !== 'string') {
    return { ok: false, message: 'body alanı gereklidir.' };
  }
  const trimmed = raw.body.trim();
  if (trimmed.length < 1) {
    return { ok: false, message: 'Yorum boş olamaz.' };
  }
  if (trimmed.length > 2000) {
    return { ok: false, message: 'Yorum en fazla 2000 karakter olabilir.' };
  }
  let parentId: string | null = null;
  if (raw.parentId !== undefined) {
    if (typeof raw.parentId !== 'string' || raw.parentId.length === 0) {
      return { ok: false, message: 'parentId bir metin olmalıdır.' };
    }
    parentId = raw.parentId;
  }
  return { ok: true, parsed: { body: trimmed, parentId } };
}

export interface CommentAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface FlatComment {
  id: string;
  body: string;
  author: CommentAuthor;
  createdAt: Date;
  parentId: string | null;
}

export interface GroupedComment {
  id: string;
  body: string;
  author: CommentAuthor;
  createdAt: Date;
  replies: Omit<GroupedComment, 'replies'>[];
}

/** Düz, createdAt ARTAN sıralı yorum listesini kök + iç içe yanıt yapısına gruplar. */
export function groupComments(rows: FlatComment[]): GroupedComment[] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const roots: GroupedComment[] = [];
  const byId = new Map<string, GroupedComment>();
  for (const row of sorted) {
    if (row.parentId === null) {
      const node: GroupedComment = {
        id: row.id,
        body: row.body,
        author: row.author,
        createdAt: row.createdAt,
        replies: [],
      };
      byId.set(row.id, node);
      roots.push(node);
    }
  }
  for (const row of sorted) {
    if (row.parentId !== null) {
      const parent = byId.get(row.parentId);
      if (parent) {
        parent.replies.push({ id: row.id, body: row.body, author: row.author, createdAt: row.createdAt });
      }
    }
  }
  return roots;
}
