import type { DashboardData } from '../types';
import { dashboardFixture } from './dashboard.fixtures';

/**
 * Dashboard verisinin tek giriş noktası.
 *
 * BACKEND GEÇİŞ NOKTASI: Node/SQLite API hazır olduğunda yalnızca bu fonksiyonun
 * gövdesi değişir (ör. fetch + yükleniyor/hata durumu). Dönüş tipi aynı kaldığı
 * sürece hiçbir bileşene dokunulması gerekmez.
 *
 * Not: `upcomingTasks` alanı artık `DashboardPage`'de kullanılmıyor — "Yaklaşan Görevler" paneli
 * `useUpcomingTasks()` (gerçek API) üzerinden besleniyor. Alan tip tutarlılığı için burada kaldı.
 */
export function useDashboardData(): DashboardData {
  return dashboardFixture;
}
