import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CalendarEvent } from '../../types';

interface UpcomingResponse {
  events: CalendarEvent[];
  count: number;
}

/** Girişte gösterilen "yaklaşan eğitim" bildirimleri (GET /notifications/upcoming). */
export function useUpcomingNotifications() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UpcomingResponse>('/api/v1/notifications/upcoming')
      .then((res) => {
        if (!cancelled) setEvents(res.events);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Bildirimler yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { events, loading, error };
}
