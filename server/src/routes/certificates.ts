import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/rbac.js';
import { AppError } from '../errors.js';
import { renderCertificatePdf, toBadgeDTO, toCertificateDTO } from '../lib/certificates.js';

export function registerCertificateRoutes(app: FastifyInstance) {
  app.get('/api/v1/me/certificates', { preHandler: [requireAuth] }, async (request) => {
    const rows = await prisma.certificate.findMany({
      where: { userId: request.user!.userId },
      orderBy: { issuedAt: 'desc' },
    });
    return { certificates: rows.map(toCertificateDTO) };
  });

  app.get('/api/v1/me/badges', { preHandler: [requireAuth] }, async (request) => {
    const rows = await prisma.userBadge.findMany({
      where: { userId: request.user!.userId },
      orderBy: { earnedAt: 'desc' },
    });
    return { badges: rows.map(toBadgeDTO) };
  });

  app.get<{ Params: { code: string } }>('/api/v1/certificates/:code', async (request) => {
    const cert = await prisma.certificate.findUnique({ where: { code: request.params.code } });
    if (!cert) throw new AppError('NOT_FOUND', 'Sertifika bulunamadı.', 404);
    return {
      certificate: {
        code: cert.code,
        studentName: cert.studentName,
        courseTitle: cert.courseTitle,
        issuedAt: cert.issuedAt.toISOString(),
      },
    };
  });

  app.get<{ Params: { code: string } }>('/api/v1/certificates/:code/pdf', async (request, reply) => {
    const cert = await prisma.certificate.findUnique({ where: { code: request.params.code } });
    if (!cert) throw new AppError('NOT_FOUND', 'Sertifika bulunamadı.', 404);
    const buffer = await renderCertificatePdf(cert);
    reply.header('Content-Disposition', `inline; filename="sertifika-${cert.code}.pdf"`);
    return reply.type('application/pdf').send(buffer);
  });

  app.get<{ Params: { userId: string } }>('/api/v1/achievements/:userId', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.params.userId },
      select: { id: true, name: true, avatarUrl: true },
    });
    if (!user) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404);
    const [certs, badges] = await Promise.all([
      prisma.certificate.findMany({ where: { userId: user.id }, orderBy: { issuedAt: 'desc' } }),
      prisma.userBadge.findMany({ where: { userId: user.id }, orderBy: { earnedAt: 'desc' } }),
    ]);
    return {
      user: { name: user.name, avatarUrl: user.avatarUrl },
      certificates: certs.map(toCertificateDTO),
      badges: badges.map(toBadgeDTO),
    };
  });
}
