import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/apiClient';
import type { Certificate } from '../types';

export function useMyCertificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ certificates: Certificate[] }>('/api/v1/me/certificates')
      .then((res) => {
        if (!cancelled) setCertificates(res.certificates);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Sertifikalar yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { certificates, loading, error };
}
