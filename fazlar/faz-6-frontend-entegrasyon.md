# Faz 6 — Dashboard Panelini Gerçek Veriye Bağlama

## Amaç

`UpcomingTasks` bileşenini `dashboard.fixtures.ts`'den koparıp Faz 5'teki
`GET /api/v1/users/me/upcoming-tasks` uç noktasına bağlamak. **Yalnızca bu panel** değişir; dashboard'un
geri kalanı (`WelcomeBanner`, `KpiGrid`, `EnrolledCourses` vb.) bu fazda fixture'da kalmaya devam eder
— kullanıcının isteği "bu bölüm" ile sınırlı.

## Bağımlılık

Faz 5 tamamlanmış olmalı.

## Referans Kalıp

`web/src/features/exams/useMyExams.ts` + `examMeta.ts` ikilisi birebir örnek alınır:
ham veriyi çeken ince bir hook + sunuma çeviren saf fonksiyonlar içeren ayrı bir dosya.

## Yeni Dosyalar

### `web/src/data/useUpcomingTasks.ts`

```ts
import { useApiResource } from '../lib/useApiResource';
import type { UpcomingTaskRaw } from '../types';

/** GET /api/v1/users/me/upcoming-tasks: ödev + sınav birleşik, yaklaşan görevler. */
export function useUpcomingTasks(days = 7, limit = 5) {
  const { data, loading, error } = useApiResource<{
    tasks: UpcomingTaskRaw[];
    totalCount: number;
    serverTime: string;
  }>(`/api/v1/users/me/upcoming-tasks?days=${days}&limit=${limit}`);
  return { tasks: data?.tasks ?? [], totalCount: data?.totalCount ?? 0, loading, error };
}
```

### `web/src/features/dashboard/components/upcomingTaskMeta.ts`

`announcementMeta.ts`/`examMeta.ts` deseniyle: ham `UpcomingTaskRaw` → mevcut `UpcomingTask` sunum
tipine çeviren saf fonksiyon(lar). Mevcut `UpcomingTasks.tsx` bileşeni **değişmeden** çalışmaya devam
etsin diye hedef tip aynı (`UpcomingTask`) tutulur:

- `kind: 'ASSIGNMENT'` → `tagLabel`: `assignmentType`'a göre ("Ödev"/"Laboratuvar"/"Proje"),
  `tagTone`: yaklaşan tarihe göre (`isPastDue` veya `<48 saat` → `'error'`/"Yüksek Öncelik";
  aksi halde `'brand'`), `tagIcon`: `priority_high` / `assignment`.
- `kind: 'EXAM'` → `tagLabel: 'Çevrim İçi Sınav'`, `tagTone: 'brand'`, `tagIcon: 'quiz'`
  (mevcut `examMeta.AVAILABILITY` tonlarıyla tutarlı tutulur).
- `dueLabel`: `announcementMeta.formatRelative` ile **aynı** `Intl.RelativeTimeFormat('tr')` mantığı
  yeniden kullanılır (kopyalanmaz — `announcementMeta.ts`'den import edilip paylaşılması ya da ortak
  bir `web/src/lib/dateFormat.ts`'e taşınması değerlendirilmeli; kod tekrarından kaçınmak öncelik).
- `actionLabel`: ödev → `"Teslim Et"`, sınav → `"Detaylar"`.
- `durationLabel`: yalnızca sınavda, `examMeta.formatDuration(durationMinutes)`.

> Not: `announcementMeta.formatRelative` şu an "3 saat önce" gibi **geçmişe dönük** ifadeler üretiyor;
> burada **geleceğe dönük** ("2 gün kaldı") gerekiyor. Fonksiyon zaten `Intl.RelativeTimeFormat`
> kullandığından pozitif/negatif fark otomatik doğru yöne çeviriyor olabilir — Faz 6 uygulamasında
> gerçek verilerle doğrulanmalı; gerekirse ortak `formatRelative`'e bir `future: boolean` ayrımı
> eklemek yerine, çıktısı zaten iki yönü de destekliyorsa aynen kullanılmalı (yeni fonksiyon yazmadan
> önce mevcut olanı dene).

## Değişecek Dosyalar

### `web/src/types/index.ts`
Yeni ham tip eklenir (var olan `UpcomingTask` sunum tipine **dokunulmaz**, o `UpcomingTasks.tsx`
bileşeninin props'u olarak kalır):

```ts
export type UpcomingTaskKind = 'ASSIGNMENT' | 'EXAM';

export interface UpcomingTaskRaw {
  kind: UpcomingTaskKind;
  id: string;
  title: string;
  description: string | null;
  course: { id: string; title: string };
  // ASSIGNMENT alanları
  dueAt?: string;
  assignmentType?: 'HOMEWORK' | 'LAB' | 'PROJECT';
  isPastDue?: boolean;
  allowLateSubmission?: boolean;
  // EXAM alanları
  startsAt?: string | null;
  endsAt?: string | null;
  durationMinutes?: number | null;
  availability?: ExamAvailability;
  questionCount?: number;
}
```

### `web/src/features/dashboard/DashboardPage.tsx`
`useDashboardData()`'dan gelen `data.upcomingTasks` yerine, `useUpcomingTasks()` hook'u ayrıca
çağrılır ve `<UpcomingTasks tasks={mappedTasks} />`'a geçirilir. `useDashboardData.ts`'in dönüş
tipi (`DashboardData`) ve diğer alanları **değişmez** — yalnızca `UpcomingTasks`'a geçen prop'un
kaynağı değişir. (İleride dashboard'un tamamı canlı veriye geçerse `upcomingTasks` alanı
`DashboardData`'dan tamamen çıkarılabilir; bu faz o kapsamda değil.)

### `web/src/features/dashboard/components/UpcomingTasks.tsx`
`loading`/`error` durumları eklenir:
- `loading`: iskelet/placeholder 3 satır (`Card` + boş `Text` — mevcut `Panel` bileşeninin içine basit
  bir "Yükleniyor…" `Text` yeterli, aşırı mühendislik yapılmaz).
- `error`: `Text role="body-sm" tone="error"` ile kısa mesaj ("Görevler yüklenemedi.").
- `tasks.length === 0`: boş durum metni ("Yaklaşan göreviniz yok 🎉" gibi — emoji kullanılmayacaksa
  sade "Yaklaşan göreviniz bulunmuyor.").

### `UpcomingTasks.tsx` içindeki `<a href="#">` (satır 56)
Gerçek yönlendirme eklenir: ödev → `/notlar-ve-gorevler` (Faz 7'de o sayfa gerçek olunca ödeve
özel bir detay/teslim adımı da düşünülebilir, bu fazda liste sayfasına yönlendirmek yeterli), sınav →
`/sinavlar`. `react-router-dom`'un `Link` bileşeni kullanılır (`<a href="#">` kaldırılır — mevcut
kod tabanında href="#" yalnızca bu bileşende var, diğerleri `Link to=`).

## Kabul Kriterleri

- [ ] Dashboard açıldığında panel gerçek backend verisiyle doluyor (fixture'daki 3 sabit kayıt
      **artık görünmüyor**, DB'deki gerçek ödev/sınavlar görünüyor).
- [ ] Hiç yaklaşan görev yoksa panel boş durumu düzgün gösteriyor (hata fırlatmıyor).
- [ ] API hatasında panel çökmeden hata mesajı gösteriyor.
- [ ] "Teslim Et"/"Detaylar" linkleri doğru sayfalara gidiyor.
- [ ] `npm run typecheck` (web) temiz.
- [ ] Tarayıcıda (Chrome dev tools / `run` skill) görsel olarak mockup'a (ekran görüntüsü) benzer
      şekilde render olduğu doğrulanıyor.
