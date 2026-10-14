import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Certificate, UserBadge } from '@prisma/client';
import { prisma } from './prisma.js';
import { AppError } from '../errors.js';
import { BADGE_DEFS, type BadgeType } from './badges.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCertCode(): string {
  let out = '';
  for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `BTK-${out}`;
}

export async function issueCertificate(userId: string, courseId: string): Promise<Certificate> {
  const existing = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
  if (existing) return existing;

  const [user, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.course.findUnique({ where: { id: courseId } }),
  ]);
  if (!user || !course) throw new AppError('NOT_FOUND', 'Kullanıcı veya kurs bulunamadı.', 404);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.certificate.create({
        data: {
          code: generateCertCode(),
          userId,
          courseId,
          studentName: user.name,
          courseTitle: course.title,
        },
      });
    } catch (err) {
      // Eşzamanlı istek aynı (userId, courseId) kaydını oluşturduysa onu döndür; kod çakışmasında tekrar dene.
      const raced = await prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
      if (raced) return raced;
      if (attempt === 4) throw err;
    }
  }
  throw new Error('Sertifika oluşturulamadı.');
}

export function toCertificateDTO(cert: Certificate) {
  return {
    id: cert.id,
    code: cert.code,
    courseId: cert.courseId,
    courseTitle: cert.courseTitle,
    studentName: cert.studentName,
    issuedAt: cert.issuedAt.toISOString(),
  };
}

export function toBadgeDTO(b: UserBadge) {
  const def = BADGE_DEFS[b.type as BadgeType] ?? { name: b.label, icon: 'military_tech', description: '' };
  return {
    id: b.id,
    type: b.type,
    courseId: b.courseId,
    label: b.label,
    name: def.name,
    icon: def.icon,
    description: def.description,
    earnedAt: b.earnedAt.toISOString(),
  };
}

const FONT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts/DejaVuSans.ttf');

export async function renderCertificatePdf(cert: Certificate): Promise<Buffer> {
  const verifyUrl = `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173'}/dogrula/${cert.code}`;
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240 });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('body', FONT_PATH);
    doc.font('body');
    const w = doc.page.width;
    const h = doc.page.height;

    doc.lineWidth(3).strokeColor('#0b2a4a').rect(20, 20, w - 40, h - 40).stroke();
    doc.lineWidth(1).strokeColor('#006398').rect(30, 30, w - 60, h - 60).stroke();

    doc.fillColor('#0b2a4a').fontSize(30).text('BTK AKADEMİ', 0, 70, { width: w, align: 'center' });
    doc.fillColor('#006398').fontSize(20).text('Katılım Belgesi', 0, 112, { width: w, align: 'center' });

    doc.fillColor('#444444').fontSize(14).text('Bu belge', 0, 160, { width: w, align: 'center' });
    doc.fillColor('#0b2a4a').fontSize(34).text(cert.studentName, 40, 185, { width: w - 80, align: 'center' });
    doc.fillColor('#444444').fontSize(14).text('adlı katılımcının', 0, 240, { width: w, align: 'center' });
    doc.fillColor('#0b2a4a').fontSize(24).text(cert.courseTitle, 60, 268, { width: w - 120, align: 'center' });
    doc.fillColor('#444444').fontSize(14).text('kursunu başarıyla tamamladığını belgeler.', 0, 330, {
      width: w,
      align: 'center',
    });

    doc.fontSize(12).text(`Tarih: ${cert.issuedAt.toLocaleDateString('tr-TR')}`, 60, h - 120, { width: 300 });
    doc.text(`Sertifika Kodu: ${cert.code}`, 60, h - 100, { width: 300 });
    doc.image(qr, w - 160, h - 150, { width: 90, height: 90 });
    doc.fontSize(8).text('Doğrulamak için tarayın', w - 180, h - 56, { width: 130, align: 'center' });

    doc.end();
  });
}
