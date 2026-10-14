/**
 * Etkinliğe kalan süreyi Türkçe ifadeye çevirir: "2 gün 3 saat kaldı", "45 dakika kaldı".
 * Tüm gün etkinliklerinde saat anlamsız olduğundan yalnızca gün verilir.
 * Geçmiş bir an için "başladı" döner.
 */
export function formatCountdown(startIso: string, allDay: boolean, now: Date = new Date()): string {
  const start = new Date(allDay ? `${startIso}T00:00:00Z` : startIso);
  const diffMs = start.getTime() - now.getTime();
  if (Number.isNaN(diffMs)) return '';
  if (diffMs <= 0) return 'başladı';

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (allDay) {
    if (days === 0) return 'bugün';
    if (days === 1) return 'yarın';
    return `${days} gün kaldı`;
  }

  if (days > 0) {
    const restHours = hours - days * 24;
    return restHours > 0 ? `${days} gün ${restHours} saat kaldı` : `${days} gün kaldı`;
  }
  if (hours > 0) {
    const restMinutes = minutes - hours * 60;
    return restMinutes > 0 ? `${hours} saat ${restMinutes} dakika kaldı` : `${hours} saat kaldı`;
  }
  return `${Math.max(1, minutes)} dakika kaldı`;
}

/** Etkinlik anının okunur hâli: "16 Ekim Perşembe 14:00". */
export function formatWhen(startIso: string, allDay: boolean): string {
  const start = new Date(allDay ? `${startIso}T00:00:00Z` : startIso);
  if (Number.isNaN(start.getTime())) return '';
  const date = start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  if (allDay) return date;
  return `${date} ${start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Kalan süre 24 saatin altındaysa bildirim vurgulanır. */
export function isImminent(startIso: string, allDay: boolean, now: Date = new Date()): boolean {
  if (allDay) return false;
  const diffMs = new Date(startIso).getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
}
