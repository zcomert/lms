import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';

const CLASSIFY_SERVICE_URL = process.env.CLASSIFY_SERVICE_URL ?? 'http://127.0.0.1:8000';

interface ClassifyResponse {
  text: string;
  label: string;
  score: number;
}

async function callClassifyService(path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${CLASSIFY_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppError(
      'CLASSIFY_SERVICE_UNAVAILABLE',
      'Duygu sınıflandırma servisine bağlanılamadı.',
      502,
    );
  }
  if (!response.ok) {
    throw new AppError(
      'CLASSIFY_SERVICE_ERROR',
      'Duygu sınıflandırma servisi bir hata döndürdü.',
      502,
    );
  }
  return response.json();
}

export function registerClassifyRoutes(app: FastifyInstance) {
  app.post<{ Body: { text?: string } }>(
    '/api/v1/classify',
    { preHandler: [requireAuth] },
    async (request) => {
      const text = request.body?.text;
      if (typeof text !== 'string' || text.trim() === '') {
        throw new AppError('VALIDATION_ERROR', 'text alanı zorunludur.', 400);
      }
      return callClassifyService('/classify', { text }) as Promise<ClassifyResponse>;
    },
  );

  app.post<{ Body: { texts?: string[] } }>(
    '/api/v1/classify/batch',
    { preHandler: [requireAuth] },
    async (request) => {
      const texts = request.body?.texts;
      if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t) => typeof t === 'string')) {
        throw new AppError('VALIDATION_ERROR', 'texts alanı dolu bir string dizisi olmalıdır.', 400);
      }
      return callClassifyService('/classify/batch', { texts }) as Promise<{
        results: ClassifyResponse[];
      }>;
    },
  );
}
