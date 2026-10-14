import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';

export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
const ASSIGNMENTS_DIR = path.join(UPLOADS_ROOT, 'assignments');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'zip',
  'rar',
  'txt',
  'png',
  'jpg',
  'jpeg',
]);

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base === '' ? 'dosya' : base;
}

export function registerUploadRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/uploads',
    { preHandler: [requireAuth] },
    async (request) => {
      const file = await request.file({ limits: { fileSize: MAX_FILE_SIZE } });
      if (!file) {
        throw new AppError('VALIDATION_ERROR', 'Yüklenecek dosya bulunamadı (alan adı: "file").', 400);
      }

      const safeName = sanitizeFileName(file.filename);
      const ext = path.extname(safeName).slice(1).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        // Akışı tüket ki bağlantı düzgün kapansın.
        await file.toBuffer().catch(() => undefined);
        throw new AppError(
          'INVALID_FILE_TYPE',
          `Desteklenmeyen dosya türü. İzin verilenler: ${[...ALLOWED_EXTENSIONS].join(', ')}.`,
          400,
        );
      }

      await mkdir(ASSIGNMENTS_DIR, { recursive: true });
      const storedName = `${randomUUID()}-${safeName}`;
      const destPath = path.join(ASSIGNMENTS_DIR, storedName);

      try {
        await pipeline(file.file, createWriteStream(destPath));
      } catch (err) {
        await unlink(destPath).catch(() => undefined);
        throw err;
      }

      if (file.file.truncated) {
        await unlink(destPath).catch(() => undefined);
        throw new AppError('FILE_TOO_LARGE', 'Dosya boyutu 10 MB sınırını aşıyor.', 400);
      }

      return {
        file: {
          url: `/uploads/assignments/${storedName}`,
          name: file.filename,
          size: file.file.bytesRead,
        },
      };
    },
  );
}
