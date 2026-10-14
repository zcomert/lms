export const MAX_COMMENT_LENGTH = 2000;

export type ParsedCommentBody = { ok: true; body: string } | { ok: false; message: string };

export function parseCommentBody(input: unknown): ParsedCommentBody {
  if (typeof input !== 'string') {
    return { ok: false, message: 'Yorum metni gereklidir.' };
  }
  const body = input.trim();
  if (body.length < 1) {
    return { ok: false, message: 'Yorum boş olamaz.' };
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, message: `Yorum en fazla ${MAX_COMMENT_LENGTH} karakter olabilir.` };
  }
  return { ok: true, body };
}

export interface CommentRow {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  user: { id: string; name: string; avatarUrl: string | null; role: string };
}

export interface CommentNode {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; avatarUrl: string | null; role: string };
  canEdit: boolean;
  canDelete: boolean;
  replies: CommentNode[];
}

export function toCommentNode(row: CommentRow, viewerId: string, canManage: boolean): CommentNode {
  const isAuthor = row.user.id === viewerId;
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    author: {
      id: row.user.id,
      name: row.user.name,
      avatarUrl: row.user.avatarUrl,
      role: row.user.role,
    },
    canEdit: isAuthor,
    canDelete: isAuthor || canManage,
    replies: [],
  };
}

/** Düz satırları kök + tek kademe cevap ağacına çevirir; ikisi de createdAt artan sıralı. */
export function buildCommentTree(rows: CommentRow[], viewerId: string, canManage: boolean): CommentNode[] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const roots: CommentNode[] = [];
  const byId = new Map<string, CommentNode>();
  for (const row of sorted) {
    if (row.parentId === null) {
      const node = toCommentNode(row, viewerId, canManage);
      byId.set(row.id, node);
      roots.push(node);
    }
  }
  for (const row of sorted) {
    if (row.parentId === null) continue;
    byId.get(row.parentId)?.replies.push(toCommentNode(row, viewerId, canManage));
  }
  return roots;
}
