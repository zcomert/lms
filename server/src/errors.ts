import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
  }
}

const MULTIPART_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  FST_REQ_FILE_TOO_LARGE: { status: 413, code: 'FILE_TOO_LARGE', message: 'Dosya boyutu en fazla 10 MB olabilir.' },
  FST_FILES_LIMIT: { status: 400, code: 'TOO_MANY_FILES', message: 'En fazla 5 dosya yükleyebilirsiniz.' },
  FST_PARTS_LIMIT: { status: 400, code: 'VALIDATION_ERROR', message: 'Çok fazla alan gönderildi.' },
  FST_FIELDS_LIMIT: { status: 400, code: 'VALIDATION_ERROR', message: 'Çok fazla alan gönderildi.' },
  FST_INVALID_MULTIPART_CONTENT_TYPE: {
    status: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'İstek multipart/form-data olmalıdır.',
  },
};

export function errorHandler(
  error: FastifyError | AppError,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return;
  }
  const code = (error as FastifyError).code;
  const multipart = MULTIPART_ERRORS[code ?? ''];
  if (multipart) {
    reply.status(multipart.status).send({ error: { code: multipart.code, message: multipart.message } });
    return;
  }
  reply
    .status(500)
    .send({ error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu.' } });
}
