import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/apiClient';
import type { AchievementBadge } from '../types';

export function useMyBadges() {
  const [badges, setBadges] = useState<AchievementBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ badges: AchievementBadge[] }>('/api/v1/me/badges')
      .then((res) => {
        if (!cancelled) setBadges(res.badges);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Rozetler yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { badges, loading, error };
}
