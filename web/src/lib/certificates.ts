import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export function certificatePdfUrl(code: string): string {
  return `${API_BASE}/api/v1/certificates/${encodeURIComponent(code)}/pdf`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR');
}

/** Panoya kopyalar ve kısa süre "kopyalandı" durumunu döndürür. */
export function useCopy(duration = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopiedKey(null), duration);
      } catch {
        setCopiedKey(null);
      }
    },
    [duration],
  );

  return { copiedKey, copy };
}
