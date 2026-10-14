import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 5;
export const MAX_FILENAME_LENGTH = 200;

/** Küresel uzantı beyaz listesi. */
export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'txt', 'md', 'csv', 'zip',
  'png', 'jpg', 'jpeg', 'gif', 'py', 'java', 'c', 'cpp', 'js', 'ts', 'ipynb', 'sql',
] as const;

const TEXT = 'text/plain';
/** Uzantı → kabul edilen MIME türleri (`application/octet-stream` her zaman kabul). */
const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf', 'application/x-pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  odt: ['application/vnd.oasis.opendocument.text'],
  txt: [TEXT],
  md: [TEXT, 'text/markdown', 'text/x-markdown'],
  csv: [TEXT, 'text/csv', 'application/csv', 'application/vnd.ms-excel'],
  zip: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip', 'application/x-zip'],
  png: ['image/png'],
  jpg: ['image/jpeg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/pjpeg'],
  gif: ['image/gif'],
  py: [TEXT, 'text/x-python', 'text/x-script.python', 'application/x-python-code'],
  java: [TEXT, 'text/x-java', 'text/x-java-source'],
  c: [TEXT, 'text/x-c', 'text/x-csrc'],
  cpp: [TEXT, 'text/x-c', 'text/x-c++', 'text/x-c++src', 'text/x-cpp'],
  js: [TEXT, 'text/javascript', 'application/javascript', 'application/x-javascript'],
  ts: [TEXT, 'text/typescript', 'text/x-typescript', 'application/typescript', 'video/mp2t'],
  ipynb: [TEXT, 'application/json', 'application/x-ipynb+json'],
  sql: [TEXT, 'application/sql', 'text/x-sql'],
};

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const SIGNATURES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff],
  jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38],
  zip: ZIP_SIGNATURE,
  docx: ZIP_SIGNATURE,
  xlsx: ZIP_SIGNATURE,
  pptx: ZIP_SIGNATURE,
  odt: ZIP_SIGNATURE,
};

const STORED_NAME_RE = /^[0-9a-f]{32}$/;

export interface SavedFile {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
}

export function uploadDir(): string {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR);
  return fileURLToPath(new URL('../../uploads', import.meta.url));
}

export function filePathFor(storedName: string): string {
  if (!STORED_NAME_RE.test(storedName)) {
    throw new AppError('NOT_FOUND', 'Dosya bulunamadı.', 404);
  }
  return path.join(uploadDir(), storedName);
}

export function fileExtension(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return ext;
}

/** Yol bileşenlerini, kontrol karakterlerini atar; en fazla 200 karakter; boşsa "dosya". */
export function sanitizeFileName(raw: string | undefined): string {
  let name = (raw ?? '').normalize('NFC').replace(/\\/g, '/');
  name = path.posix.basename(name);
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f-\u009f/\\]/g, '').trim();
  if (name === '' || name === '.' || name === '..') return 'dosya';
  if (name.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(name);
    const keep = ext.length > 0 && ext.length < 20 ? ext : '';
    name = name.slice(0, MAX_FILENAME_LENGTH - keep.length) + keep;
  }
  return name;
}

function fileTypeError() {
  return new AppError('FILE_TYPE_NOT_ALLOWED', 'Bu dosya türü bu ödev için kabul edilmiyor.', 400);
}

export function isMimeAcceptable(ext: string, mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0]!.trim();
  if (m === '' || m === 'application/octet-stream') return true;
  return (MIME_BY_EXTENSION[ext] ?? []).includes(m);
}

async function matchesSignature(file: string, ext: string): Promise<boolean> {
  const sig = SIGNATURES[ext];
  if (!sig) return true;
  const handle = await open(file, 'r');
  try {
    const buf = Buffer.alloc(sig.length);
    const { bytesRead } = await handle.read(buf, 0, sig.length, 0);
    return bytesRead === sig.length && sig.every((b, i) => buf[i] === b);
  } finally {
    await handle.close();
  }
}

export async function deleteStoredFiles(storedNames: string[]): Promise<void> {
  await Promise.all(
    storedNames.map(async (name) => {
      if (!STORED_NAME_RE.test(name)) return;
      try {
        await unlink(path.join(uploadDir(), name));
      } catch {
        /* zaten yok */
      }
    }),
  );
}

export interface ParsedUpload {
  fields: Record<string, string>;
  files: SavedFile[];
}

/**
 * multipart gövdeyi akış halinde ayrıştırır; dosyalar diske yazılır (bellekte tamponlanmaz).
 * `isExtensionAllowed` uzantıyı (noktasız, küçük harf) kabul edip etmediğini söyler.
 * Herhangi bir hatada bu istekte yazılan tüm dosyalar silinir ve hata yeniden fırlatılır.
 */
export async function receiveUpload(
  request: FastifyRequest,
  isExtensionAllowed: (ext: string) => boolean,
): Promise<ParsedUpload> {
  if (!request.isMultipart()) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'İstek multipart/form-data olmalıdır.', 415);
  }
  await mkdir(uploadDir(), { recursive: true });
  const fields: Record<string, string> = {};
  const files: SavedFile[] = [];
  const written: string[] = [];
  try {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if ((part as { valueTruncated?: boolean }).valueTruncated) {
          throw new AppError('VALIDATION_ERROR', 'Alan değeri çok uzun.', 400);
        }
        fields[part.fieldname] = String(part.value ?? '');
        continue;
      }
      if (part.fieldname !== 'files') {
        part.file.resume();
        throw new AppError('VALIDATION_ERROR', 'Dosyalar "files" alanıyla gönderilmelidir.', 400);
      }
      if (!part.filename) {
        // Tarayıcılar dosya seçilmediğinde boş parça gönderebilir.
        part.file.resume();
        continue;
      }
      const originalName = sanitizeFileName(part.filename);
      const ext = fileExtension(originalName);
      if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext) || !isExtensionAllowed(ext)) {
        part.file.resume();
        throw fileTypeError();
      }
      if (!isMimeAcceptable(ext, part.mimetype ?? '')) {
        part.file.resume();
        throw fileTypeError();
      }
      const storedName = randomBytes(16).toString('hex');
      const target = path.join(uploadDir(), storedName);
      written.push(storedName);
      await pipeline(part.file, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
      if (part.file.truncated) {
        throw new AppError('FILE_TOO_LARGE', 'Dosya boyutu en fazla 10 MB olabilir.', 413);
      }
      if (!(await matchesSignature(target, ext))) throw fileTypeError();
      const { size } = await stat(target);
      files.push({
        originalName,
        storedName,
        mimeType: (part.mimetype || 'application/octet-stream').slice(0, 100),
        size,
      });
    }
    return { fields, files };
  } catch (err) {
    await deleteStoredFiles(written);
    throw err;
  }
}

function asciiFallback(name: string): string {
  const cleaned = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%;]/g, '_');
  return cleaned.trim() === '' ? 'dosya' : cleaned;
}

function encodeRfc5987(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Dosyayı güvenli başlıklarla (attachment, nosniff) akıtır; diskte yoksa 404. */
export async function sendDownload(
  reply: FastifyReply,
  file: { storedName: string; originalName: string },
): Promise<FastifyReply> {
  const target = filePathFor(file.storedName);
  let size: number;
  try {
    size = (await stat(target)).size;
  } catch {
    throw new AppError('NOT_FOUND', 'Dosya bulunamadı.', 404);
  }
  reply
    .header('Content-Type', 'application/octet-stream')
    .header(
      'Content-Disposition',
      `attachment; filename="${asciiFallback(file.originalName)}"; filename*=UTF-8''${encodeRfc5987(file.originalName)}`,
    )
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Length', size);
  return reply.send(createReadStream(target));
}
