import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';

describe('classify routes', () => {
  let app: FastifyInstance;
  let studentToken: string;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchMock);
    app = await buildApp();
  });

  beforeEach(async () => {
    fetchMock.mockReset();
    await prisma.user.deleteMany();
    const passwordHash = await bcrypt.hash('sifre123', 12);
    await prisma.user.create({
      data: { email: 'student@example.com', passwordHash, name: 'Öğrenci', role: 'STUDENT' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'student@example.com', password: 'sifre123' },
    });
    studentToken = login.json().token;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/classify', () => {
    it('401s without a token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/classify',
        payload: { text: 'harika' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects an empty text', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/classify',
        headers: { authorization: `Bearer ${studentToken}` },
        payload: { text: '' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('proxies the request to the classify service', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ text: 'harika', label: 'pozitif', score: 0.86 }), {
          status: 200,
        }),
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/classify',
        headers: { authorization: `Bearer ${studentToken}` },
        payload: { text: 'harika' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ text: 'harika', label: 'pozitif', score: 0.86 });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/classify',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns 502 when the classify service is unreachable', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/classify',
        headers: { authorization: `Bearer ${studentToken}` },
        payload: { text: 'harika' },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe('CLASSIFY_SERVICE_UNAVAILABLE');
    });
  });

  describe('POST /api/v1/classify/batch', () => {
    it('rejects an empty texts array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/classify/batch',
        headers: { authorization: `Bearer ${studentToken}` },
        payload: { texts: [] },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('proxies a batch request to the classify service', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ text: 'harika', label: 'pozitif', score: 0.86 }],
          }),
          { status: 200 },
        ),
      );
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/classify/batch',
        headers: { authorization: `Bearer ${studentToken}` },
        payload: { texts: ['harika'] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        results: [{ text: 'harika', label: 'pozitif', score: 0.86 }],
      });
    });
  });
});
