import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { CheckinResult, MascotState } from '../../types';

const BASE = '/api/v1/users/me/mascot';

/** StrictMode çift effect çalıştırmasında tek istek atılması için modül düzeyinde söz. */
let pendingCheckin: Promise<CheckinResult> | null = null;

function checkinOnce(): Promise<CheckinResult> {
  if (!pendingCheckin) {
    pendingCheckin = apiFetch<CheckinResult>(`${BASE}/checkin`, { method: 'POST' });
    const clear = () => {
      pendingCheckin = null;
    };
    pendingCheckin.then(clear, clear);
  }
  return pendingCheckin;
}

const messageOf = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Maskot durumu: açılışta günlük giriş, satın alma ve giydirme. */
export function useMascot() {
  const [state, setState] = useState<MascotState | null>(null);
  const [lastCheckin, setLastCheckin] = useState<CheckinResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkinOnce()
      .then((result) => {
        if (cancelled) return;
        setLastCheckin(result);
        setState(result.state);
      })
      .catch((err) => {
        if (!cancelled) setError(messageOf(err, 'Maskot yüklenemedi.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(async (request: () => Promise<MascotState>, fallback: string) => {
    setActionError(null);
    setBusy(true);
    try {
      setState(await request());
      return true;
    } catch (err) {
      setActionError(messageOf(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const purchase = useCallback(
    (itemId: string) =>
      run(
        () => apiFetch<MascotState>(`${BASE}/items/${encodeURIComponent(itemId)}/purchase`, { method: 'POST' }),
        'Satın alma tamamlanamadı.',
      ),
    [run],
  );

  const setEquipped = useCallback(
    (itemId: string, equipped: boolean) =>
      run(
        () => apiFetch<MascotState>(`${BASE}/equipped`, { method: 'PUT', body: JSON.stringify({ itemId, equipped }) }),
        'Eşya güncellenemedi.',
      ),
    [run],
  );

  const clearActionError = useCallback(() => setActionError(null), []);

  return { state, loading, error, actionError, busy, lastCheckin, purchase, setEquipped, clearActionError };
}

export type MascotApi = ReturnType<typeof useMascot>;
