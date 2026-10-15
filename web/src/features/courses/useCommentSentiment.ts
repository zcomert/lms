import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';

export type SentimentStatus = 'idle' | 'analyzing' | 'pozitif' | 'negatif' | 'error';

interface ClassifyResponse {
  label: string;
  score: number;
}

const MIN_CHARS = 6;
const DEBOUNCE_MS = 500;

/**
 * Metin yazılırken duygu analizini debounce'lu şekilde çalıştırır. Yarışan istekler
 * requestId ile elenir; metin MIN_CHARS altına düşerse 'idle'a döner.
 */
export function useCommentSentiment(text: string): SentimentStatus {
  const [status, setStatus] = useState<SentimentStatus>('idle');
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      requestId.current += 1;
      setStatus('idle');
      return;
    }

    const id = ++requestId.current;
    setStatus('analyzing');

    const timer = setTimeout(() => {
      apiFetch<ClassifyResponse>('/api/v1/classify', {
        method: 'POST',
        body: JSON.stringify({ text: trimmed }),
      })
        .then((res) => {
          if (requestId.current !== id) return;
          setStatus(res.label === 'pozitif' ? 'pozitif' : 'negatif');
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setStatus('error');
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text]);

  return status;
}
