# Yaklaşan Görevler — Dinamikleştirme Planı: Genel Bakış

## Hedef

Dashboard'daki **"Yaklaşan Görevler"** paneli (`web/src/features/dashboard/components/UpcomingTasks.tsx`)
şu an `dashboard.fixtures.ts` içindeki sabit 3 kayıttan (ödev, sınav, laboratuvar) besleniyor.
Bu paneli uçtan uca **gerçek veriye dayalı ve yönetilebilir** hale getirmek istiyoruz:

- Eğitmen/Admin bir kursa ödev/laboratuvar görevi tanımlayabilmeli, düzenleyebilmeli, silebilmeli.
- Öğrenci dashboard'da teslim tarihi yaklaşan **gerçek** görevlerini (ödev + sınav) görmeli.
- Öğrenci "Teslim Et" diyerek gerçekten teslim yapabilmeli; teslim sonrası görev panelden düşmeli.
- Sınav türü görevler zaten var olan `Exam` sistemine bağlanmalı (tekrar icat edilmemeli).

## Mevcut Durum Tespiti (araştırma bulguları)

1. **`Exam` modeli ve `/api/v1/exams/my` uç noktası zaten tam çalışıyor** (CONTRACT.md § Exams).
   Dashboard'daki "sınav" tipi görevler bu veriden türetilebilir — yeniden yazılmayacak.
2. **"Ödev" (assignment) kavramı backend'de hiç yok.** `server/prisma/schema.prisma` içinde
   `Assignment`/`Submission` benzeri bir model yok. `docs/gereksinimler.md` FR-60–66 bunu tam olarak
   tanımlıyor (açıklama, ek dosya, teslim tarihi, puan ağırlığı, dosya/metin teslimi, geç teslim cezası,
   geri bildirim, durum filtresi) ama **hiç inşa edilmemiş**.
3. **`web/src/features/assignments/AssignmentsPage.tsx` (rota: `/notlar-ve-gorevler`) zaten var** ve
   dashboard'daki birebir aynı mock görevlerle (Veri Yapıları, SQL, Yapay Zekâ Mini Proje) dolu —
   `status: 'pending'|'submitted'|'graded'|'late'` alanına sahip statik bir bileşen. Bu sayfa, planladığımız
   backend modeliyle **doğrudan örtüşüyor**; bu yüzden plana dahil edildi (Faz 7).
4. **`web/src/features/exams/` zaten gerçek veriyle çalışıyor** (`useMyExams.ts` → `useApiResource` →
   `/api/v1/exams/my`) ve `examMeta.ts` adında sunum-eşleme (tone/icon/label) dosyası var. Bu, izlenecek
   referans kalıp.
5. Mimari kural: **backend ham veri döner, frontend `*Meta.ts` dosyalarında sunuma çevirir**
   (bkz. `announcementMeta.ts`, `examMeta.ts`). `UpcomingTask` tipindeki `tagTone`, `tagIcon`, `dueLabel`
   gibi alanlar bu yüzden backend'den gelmeyecek; ham `kind`/`dueAt`/`status` gelecek, frontend'de
   `upcomingTaskMeta.ts` bunları `tagLabel`/`tagTone`/`dueLabel`'e çevirecek.
6. Dosya yükleme altyapısı (multipart, local filesystem) **hiç yok** — `NFR-72` bunu şart koşuyor.
   FR-61 "dosya yükleyerek **veya** metin girerek" dediği için metin/link ile teslim MVP'de yeterli;
   dosya yükleme ayrı, bağımsız bir faz olarak eklendi (Faz 2) ve erken fazları bloklamaz.

## Kapsam Dışı (bilinçli olarak bu planın dışında bırakıldı)

- Grup ödevi (FR-65, öncelik "Olabilir").
- Revizyon talebi / versiyonlu teslim geçmişi (FR-66, öncelik "Olmalı") — ileride ayrı faz olabilir.
- Otomatik hatırlatma bildirimleri (FR-91) — bildirim altyapısı bu projede henüz yok, ayrı bir çalışma.
- Sınav alma/cevaplama akışı — zaten bu projenin kapsamı dışında, `Exam` sistemi şu an yalnızca
  tanım/yönetim seviyesinde (öğrenci tarafı "yakında" niteliğinde); bu plan ona dokunmuyor.

## Faz Listesi

| # | Dosya | Konu | Katman |
|---|---|---|---|
| 1 | `faz-1-veri-modeli.md` | `Assignment` + `AssignmentSubmission` Prisma modelleri, migration | Backend/DB |
| 2 | `faz-2-dosya-yukleme.md` | Genel amaçlı dosya yükleme altyapısı (multipart, local fs) | Backend |
| 3 | `faz-3-yonetim-api.md` | Eğitmen/Admin: ödev tanımlama CRUD uç noktaları | Backend |
| 4 | `faz-4-ogrenci-api.md` | Öğrenci: ödevlerim listesi, teslim, durum | Backend |
| 5 | `faz-5-dashboard-uc-noktasi.md` | Ödev + sınavı birleştiren `GET /users/me/upcoming-tasks` | Backend |
| 6 | `faz-6-frontend-entegrasyon.md` | `UpcomingTasks` bileşenini gerçek veriye bağlama | Frontend |
| 7 | `faz-7-ogrenci-arayuzu.md` | "Teslim Et" akışı + `/notlar-ve-gorevler` sayfasının gerçekleşmesi | Frontend |
| 8 | `faz-8-yonetim-arayuzu.md` | Eğitmen/Admin ödev yönetim ekranı | Frontend |
| 9 | `faz-9-test-rollout.md` | Testler, CONTRACT.md son hali, manuel QA, devreye alma | Her ikisi |

Fazlar sırayla uygulanmak üzere tasarlandı; her faz bir öncekinin üstüne inşa edilir. Faz 2 (dosya
yükleme) istenirse Faz 5'ten sonra herhangi bir noktada araya alınabilir — erken fazları bloklamaz.

## Veri Akışı (hedef mimari)

```
Eğitmen/Admin → POST/PATCH /api/v1/courses/:courseId/assignments  (Faz 3)
                        │
                        ▼
                  Assignment (DB)
                        │
Öğrenci → GET /api/v1/users/me/upcoming-tasks  (Faz 5, Assignment + Exam birleşimi)
                        │
                        ▼
          useUpcomingTasks() hook (Faz 6) → upcomingTaskMeta.ts → <UpcomingTasks />
                        │
Öğrenci → "Teslim Et" → POST /api/v1/assignments/:id/submission  (Faz 4, Faz 7)
                        │
                        ▼
          AssignmentSubmission (DB) → görev panelden düşer
```
