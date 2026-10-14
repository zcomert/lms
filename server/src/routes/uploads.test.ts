import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { rm } from 'node:fs/promises';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { UPLOADS_ROOT } from './uploads.js';

function buildMultipart(fieldName: string, fileName: string, contentType: string, content: Buffer) {
  const boundary = '----testBoundary123456';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, content, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('upload routes', () => {
  let app: FastifyInstance;
  let token: string;

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
    const user = await prisma.user.create({
      data: { email: 'uploader@example.com', passwordHash: 'x', name: 'Yükleyici', role: 'STUDENT' },
    });
    token = signToken({ userId: user.id, role: 'STUDENT', roles: ['STUDENT'] });
  });

  afterAll(async () => {
    await app.close();
    await rm(UPLOADS_ROOT, { recursive: true, force: true });
  });

  it('rejects an unauthenticated upload', async () => {
    const { body, headers } = buildMultipart('file', 'rapor.pdf', 'application/pdf', Buffer.from('%PDF-1.4 test'));
    const response = await app.inject({ method: 'POST', url: '/api/v1/uploads', headers, payload: body });
    expect(response.statusCode).toBe(401);
  });

  it('accepts a valid file and serves it back', async () => {
    const { body, headers } = buildMultipart('file', 'rapor.pdf', 'application/pdf', Buffer.from('%PDF-1.4 test'));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { ...headers, ...auth(token) },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.file.url).toMatch(/^\/uploads\/assignments\/.+-rapor\.pdf$/);
    expect(json.file.name).toBe('rapor.pdf');
    expect(json.file.size).toBeGreaterThan(0);

    const download = await app.inject({ method: 'GET', url: json.file.url });
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe('%PDF-1.4 test');
  });

  it('rejects a disallowed file extension', async () => {
    const { body, headers } = buildMultipart('file', 'script.exe', 'application/octet-stream', Buffer.from('MZ'));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { ...headers, ...auth(token) },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a request with no file field', async () => {
    const boundary = '----emptyBoundary';
    const body = Buffer.from(`--${boundary}--\r\n`);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, ...auth(token) },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});
