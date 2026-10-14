import { createWriteStream, mkdirSync } from 'node:fs';
import { Writable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Varsayılan günlük klasörü: depo kökündeki `logs/` (`LOG_DIR` ile değiştirilebilir). */
export function resolveLogDir(): string {
  if (process.env.LOG_DIR) return path.resolve(process.env.LOG_DIR);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../logs');
}

/**
 * Pino çıktısını hem konsola hem `logs/server-YYYY-AA-GG.log` dosyasına yazar.
 * Testlerde (VITEST) ve `LOG_TO_FILE=false` iken dosya açılmaz.
 */
export function createLogStream(): NodeJS.WritableStream {
  if (process.env.VITEST || process.env.LOG_TO_FILE === 'false') return process.stdout;
  const dir = resolveLogDir();
  mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = createWriteStream(path.join(dir, `server-${day}.log`), { flags: 'a' });
  file.on('error', (err) => console.error('Günlük dosyasına yazılamadı:', err));
  return new Writable({
    write(chunk, _encoding, callback) {
      process.stdout.write(chunk);
      file.write(chunk, callback);
    },
    final(callback) {
      file.end(callback);
    },
  });
}
