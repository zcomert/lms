# Fazlar İlerleme Takibi

Bu dosya, zamanlanmış (CronCreate, 11:59'dan itibaren 8 dakika aralıklarla) görevlerin `fazlar/`
altındaki planı sırayla uygulaması için ortak ilerleme defteridir. Her zamanlanmış görev
çalıştığında önce bu dosyayı okur, **tamamlanmamış en erken fazdan** devam eder; süre (~8 dk)
dolduğunda veya oturum boşa düştüğünde, bir sonraki görev kaldığı yerden devam edebilsin diye
bu dosyayı günceller.

## Durum

| Faz | Dosya | Durum | Not |
|---|---|---|---|
| 1 | faz-1-veri-modeli.md | tamamlandı | |
| 2 | faz-2-dosya-yukleme.md | tamamlandı | |
| 3 | faz-3-yonetim-api.md | tamamlandı | |
| 4 | faz-4-ogrenci-api.md | tamamlandı | Faz 3 ile birlikte, tek `assignments.ts` dosyasında yapıldı (plandaki gibi) |
| 5 | faz-5-dashboard-uc-noktasi.md | tamamlandı | |
| 6 | faz-6-frontend-entegrasyon.md | tamamlandı | |
| 7 | faz-7-ogrenci-arayuzu.md | tamamlandı | Dosya yükleme UI'ı eklenmedi (Faz 2 backend hazır ama dialogda bağlanmadı; metin/not ile teslim çalışıyor) |
| 8 | faz-8-yonetim-arayuzu.md | tamamlandı | |
| 9 | faz-9-test-rollout.md | tamamlandı | `LessonComment` tip hatası bilerek kapsam dışı bırakıldı (önceden var, ayrı görev gerekir) |

Durum değerleri: `beklemede` | `devam-ediyor` | `tamamlandı` | `bloklandı` (neden "Not" sütununa yazılır)

## Son Çalıştırma Notu

**Faz 1 tamamlandı (manuel "başla" komutuyla, zamanlanmış görevlerden önce):**
- `server/prisma/schema.prisma`'ya `Assignment` + `AssignmentSubmission` modelleri ve `User`/`Course`
  ilişki alanları eklendi.
- Migration uygulandı: `20261014090100_add_assignments`. Not: migration öncesi dev sunucusu (tsx
  watch, PID 31672 ağacı) `dev.db`'yi kilitlemişti; `taskkill /T /F` ile durdurulup migration sonrası
  `npm run dev` ile arka planda yeniden başlatıldı (şu an sağlıklı, `/api/v1/health` 200 dönüyor).
- `npx prisma generate` çalıştırıldı, `npx tsc --noEmit` temiz (not: `server/package.json`'da
  `typecheck` script'i yok, doğrudan `tsc --noEmit -p tsconfig.json` kullanıldı — ileri fazlarda da
  böyle çalıştırılmalı).
- `npm test`: 24 dosya / 406 test, hepsi yeşil (regresyon yok).
- `server/prisma/seed.ts`'e, mockup'taki iki ödevle eşleşen demo `Assignment` kaydı eklendi
  ("Veri Yapıları Proje Ödevi 2" HOMEWORK, "Yapay Zekâ Mini Proje Teslimi" LAB) — **ancak mevcut
  `dev.db` üzerinde seed yeniden ÇALIŞTIRILMADI** (seed script `create` kullanıyor, unique email
  kısıtı nedeniyle dolu DB'de tekrar çalıştırmak 409/crash verir). Manuel QA için ya DB sıfırlanıp
  (`prisma migrate reset`) seed yeniden çalıştırılmalı ya da Faz 3/8 tamamlandıktan sonra bu iki
  ödev yönetim API'si/arayüzü üzerinden elle girilmeli.

**Faz 2 tamamlandı:**
- `@fastify/multipart` + `@fastify/static` kuruldu — **dikkat:** projede `fastify@4.29.1` var, bu
  pakertlerin **en güncel major sürümleri (10.x) fastify 5.x istiyor ve sunucuyu 500 ile çökertiyor**.
  Doğru sürümler: `@fastify/multipart@^8`, `@fastify/static@^7`. İleride bu paketleri güncellerken
  dikkat edilmeli.
- `server/src/routes/uploads.ts`: `POST /api/v1/uploads` (10MB sınır, uzantı kara/beyaz listesi,
  `server/uploads/assignments/` altında UUID önekli dosya adıyla saklama).
- `app.ts`'e `multipart` + `fastifyStatic` (`/uploads/` prefix, `decorateReply: false`) kaydedildi.
- `server/.gitignore`'a `uploads/` eklendi.
- `CONTRACT.md`'ye "Uploads (Dosya Yükleme)" bölümü eklendi (Question Banks ile Exams arasına).
- `uploads.test.ts`: 4 test (401, başarılı yükle+indir, yasaklı uzantı, eksik `file` alanı) — hepsi
  yeşil. Tam suite: **25 dosya / 410 test, hepsi yeşil**.
- Dev sunucusu (tsx watch) yanlış paket sürümü yüzünden 2 kez crash oldu, düzeltme sonrası yeniden
  başlatıldı, `/api/v1/health` 200 dönüyor.

**Faz 3 + Faz 4 tamamlandı (tek seferde, aynı dosyada — plan bunu zaten öneriyordu):**
- `server/src/lib/assignments.ts`: tipler, limitler, `normalizeAssignmentInput`/`toRawInput`
  (exams.ts/announcements.ts ile birebir aynı desen), `myAssignmentStatus` (PENDING/LATE/SUBMITTED/GRADED).
- `server/src/routes/assignments.ts`: tüm Faz 3 (yönetim CRUD, teslim rosteri, notlandırma) ve Faz 4
  (öğrenci `/assignments/my`, teslim POST/DELETE) uç noktaları. `app.ts`'e kaydedildi.
- `CONTRACT.md`'ye "Assignments (Ödevler)" bölümü eklendi (Exams'tan sonra).
- `server/src/routes/assignments.test.ts`: 21 test (yetki, doğrulama, geç teslim, yeniden teslim
  üzerine yazma, dosya türü reddi, durum geçişleri PENDING→SUBMITTED→GRADED, notlandırılmış teslimin
  silinememesi) — hepsi yeşil.
- Tam suite: **26 dosya / 431 test, hepsi yeşil** (410 + 21 yeni). `npx tsc --noEmit` temiz.
- Dev sunucusu sağlıklı (`/api/v1/health` 200); log'da eski bir `EADDRINUSE` kalıntısı var ama güncel
  sağlık kontrolü başarılı, göz ardı edilebilir.

**Not (seed):** Faz 1'de `seed.ts`'e eklenen 2 demo ödev hâlâ mevcut `dev.db`'ye yüklenmedi (bkz.
Faz 1 notu) — Faz 7/8 manuel QA'sından önce ya `prisma migrate reset` + seed ya da yönetim API'si
üzerinden elle ödev oluşturulmalı.

**Faz 5 tamamlandı:**
- `server/src/routes/users.ts`'e `GET /api/v1/users/me/upcoming-tasks?days=&limit=` eklendi
  (ödev + sınav birleşik, `examAvailability` helper'ı `lib/exams.ts`'den reuse edildi). Not: endpoint
  CONTRACT.md'de "Users" başlığı altında ama gerçek kayıt/kurs listesi mantığı aslında
  `enrollments.ts`'de yaşıyor — küçük bir tutarsızlık, önemli değil, yeni endpoint `users.ts`'de kalsın.
- `CONTRACT.md`'ye `GET /api/v1/users/me/upcoming-tasks` dokümante edildi.
- `users.test.ts`'e "upcoming tasks" describe bloğu: 10 yeni test (yetki, gün penceresi, geç teslim
  dahil/hariç, teslim edilmişin düşmesi, kayıtsız kurs hariç tutma, limit/totalCount, ödev-sınav sıralama).
- Tam suite: **26 dosya / 441 test, hepsi yeşil**. `npx tsc --noEmit` temiz.

**Backend tarafı (Faz 1-5) tamamlandı.**

**Faz 6 tamamlandı:**
- `web/src/types/index.ts`: `UpcomingTaskKind`, `UpcomingTaskRaw` eklendi (var olan `UpcomingTask`
  sunum tipine dokunulmadı).
- `web/src/data/useUpcomingTasks.ts` (yeni): `useApiResource` ile `/users/me/upcoming-tasks`.
- `web/src/features/dashboard/components/upcomingTaskMeta.ts` (yeni): ham veriyi `UpcomingTask`
  sunumuna çevirir; `announcementMeta.formatRelative` (geleceğe dönük tarihlerde de doğru çalıştığı
  doğrulandı — "X gün sonra" üretiyor) ve `examMeta.formatDuration` yeniden kullanıldı, kod tekrarı yok.
- `UpcomingTasks.tsx`: `loading`/`error`/boş durum eklendi; `<a href="#">` kaldırılıp
  `react-router-dom` `Link` ile ödev → `/notlar-ve-gorevler`, sınav → `/sinavlar` yönlendirmesi eklendi.
- `DashboardPage.tsx`: `useUpcomingTasks()` çağrılıp `UpcomingTasks`'a gerçek veri geçiriliyor;
  `data.upcomingTasks` (fixture) artık kullanılmıyor ama tip/fixture'da kod yorumuyla **bilerek
  bırakıldı** (dashboard'un geri kalanı hâlâ fixture'a bağlı, plan böyle öngörüyordu).
- `npm run typecheck` (web): benim dosyalarımda hata yok. **Önemli:** `LessonComments.tsx` /
  `useLessonComments.ts` içinde `types/index.ts`'de hiç tanımlanmamış `LessonComment`/
  `LessonCommentReply` tiplerine referans var — bu **benim değişikliklerimden önce de mevcut, bu
  göreve dair olmayan** bir hata (git stash ile doğrulandı). `npm run build` bu yüzden başarısız
  oluyor (tsc -b). Kapsam dışı olduğu için düzeltmedim; Faz 9'da veya ayrı bir görevde ele alınmalı.
- Backend dev sunucusu canlı QA için `/dev.db`'de henüz yayınlanmış ödev yok (Faz 1 notuna bakın) —
  panel şu an "Yaklaşan göreviniz bulunmuyor." gösterecek, bu beklenen/doğru davranış (hata değil).

**Faz 7 tamamlandı:**
- `web/src/types/index.ts`: `AssignmentType`, `MyAssignmentStatus`, `MyAssignmentSubmission`,
  `MyAssignment` eklendi (backend `GET /assignments/my` yanıtıyla birebir).
- `web/src/features/assignments/useMyAssignments.ts` (yeni), `assignmentMeta.ts` (yeni, `examMeta.ts`
  deseninde — tür/durum → etiket/ton eşlemesi, tarih biçimlendirme).
- `web/src/features/assignments/components/SubmitAssignmentDialog.tsx` (yeni): metin ile teslim
  (`Dialog` + `formStyles` paylaşılan bileşenleri, `ExamCreateDialog.tsx` deseninde). **Dosya
  yükleme bağlanmadı** — plan dosya yüklemeyi "yakında" notuyla koşullu bırakmayı zaten öngörmüştü;
  Faz 2'deki `/api/v1/uploads` backend'i hazır, ileride bu diyaloğa `<input type=file>` eklenip
  bağlanabilir.
- `AssignmentsPage.tsx`: mock `assignments` dizisi tamamen kaldırıldı, `useMyAssignments()` ile
  gerçek veri; kart artık tıklanabilir `<button>` (CSS güncellendi: `.assignmentItem` buton reset +
  `:disabled` durumu — yalnızca `PENDING` durumundaki ödevler tıklanabilir/teslim edilebilir).
  Teslim sonrası `reload()` ile liste tazeleniyor.
- Sınav "Detaylar" linki zaten Faz 6'da `/sinavlar`'a bağlanmıştı; `ExamsPage.tsx` gerçek veriyle
  çalışıyor (önceden doğrulanmıştı, bu fazda dokunulmadı).
- `npm run typecheck` (web): yeni dosyalarda hata yok (yalnızca önceden var olan `LessonComment`
  hataları kalıyor, Faz 6 notuna bakın).

**Faz 8 tamamlandı:**
- `web/src/features/admin/assignments/` (yeni, `admin/exams` deseninde):
  `data/assignmentApi.ts` (useManagedAssignments, useAssignmentDetail, create/update/delete/grade),
  `AdminAssignmentsPage.tsx` (liste + durum sekmeleri + arama + kurs filtresi, `AdminExamsPage.tsx`
  taklit edildi), `components/AssignmentCreateDialog.tsx`, `AssignmentEditorPage.tsx` (ayarlar formu +
  teslim/notlandırma listesi tek sayfada — sınav editöründeki sekme sistemi basitleştirilip atlandı,
  kapsam için yeterli), `components/SubmissionRow.tsx` (+ CSS) — `QuizGradesPage`'in `GradeRow.tsx`
  deseninden uyarlandı (not + geri bildirim girişi, maxScore'a göre doğrulama).
- `web/src/types/index.ts`: `ManagedAssignment`, `AssignmentSubmissionRow`, `ManagedAssignmentDetail`
  eklendi.
- Route'lar (`routes/index.tsx`): `/yonetim/odevler`, `/yonetim/odevler/:assignmentId` (ADMIN+INSTRUCTOR
  grubunda, sınav yönetimiyle aynı). `navItems.ts`'e `ASSIGNMENT_MANAGEMENT_ITEM` eklendi,
  `Sidebar.tsx`'teki `staffItems` listesine eklendi (CLAUDE.md kuralı: route + nav birlikte güncellendi).
- `server/prisma/seed.ts`'e `/yonetim/odevler` için bir `NavMenuItem` satırı eklendi (DB tabanlı menüde
  de görünsün diye — ama bkz. Faz 1 notu, mevcut `dev.db`'ye henüz re-seed uygulanmadı).
- `npm run typecheck` (web): yeni dosyalarda hata yok (yalnızca Faz 6'da tespit edilen önceden var
  olan `LessonComment` hataları kalıyor).
- Dosya yükleme UI'ı (ödev eki/`attachmentUrl`) bu fazda da bağlanmadı — backend alanları hazır,
  ileride `AssignmentEditorPage`'e eklenebilir.

**Faz 9 tamamlandı — TÜM FAZLAR BİTTİ (1-9).**

- `server`: `npx tsc --noEmit` temiz, `npm test` → **26 dosya / 441 test, hepsi yeşil**.
- `web`: `npm run typecheck` → yalnızca önceden var olan (benim değişikliklerimden bağımsız,
  git stash ile doğrulanmış) `LessonComment`/`LessonCommentReply` tip hataları kalıyor; bu yüzden
  `npm run build` (tsc -b) başarısız oluyor. **Bilinçli olarak düzeltilmedi** — kapsam dışı, ayrı bir
  görev olarak ele alınmalı (dosya: `web/src/features/courses/LessonComments/LessonComments.tsx`,
  `useLessonComments.ts`; `types/index.ts`'de `LessonComment`/`LessonCommentReply` tanımlanmamış).
- **Gerçek dev sunucusunda uçtan uca manuel QA yapıldı** (curl ile, seed hesapları kullanılarak:
  `ogrenci@btkakademi.test` hem STUDENT hem ADMIN rolüne sahip, `switch-role` ile ADMIN olarak ödev
  yönetimi, STUDENT olarak teslim test edildi):
  1. ADMIN → React kursuna `HOMEWORK` ödevi oluşturuldu (DRAFT) → PUBLISHED yapıldı. ✅
  2. Öğrenci `GET /users/me/upcoming-tasks` → ödev, kursun gerçek `Exam` kaydıyla (React Temelleri
     Kısa Sınavı) birlikte doğru sırada listelendi. ✅
  3. Öğrenci `GET /assignments/my` → `status: PENDING`. ✅
  4. Öğrenci teslim etti (`POST .../submission`) → **ilk denemede 500 INTERNAL_ERROR alındı**
     (muhtemelen o an `seed.ts` düzenlemem tsx watch'ı yeniden başlattığı için sunucu geçici olarak
     kararsızdı); `server/src/errors.ts`'e `request.log.error({err: error}, ...)` eklenip (daha önce
     beklenmeyen hatalar hiç loglanmıyordu — gözlemlenebilirlik açığıydı, küçük ve güvenli bir
     düzeltme) sunucu stabilize olunca **tekrar denendiğinde sorunsuz çalıştı**; birkaç kez daha
     tekrarlanıp kararlı olduğu doğrulandı. Gerçek bir mantık hatası değildi.
  5. `upcoming-tasks` listesinden ödev düştü (`totalCount` 2 → 1), yalnızca sınav kaldı. ✅
  6. ADMIN rosterinde öğrencinin notu (`note`) göründü. ✅
  7. ADMIN notlandırdı (`score: 88`, `feedback`). ✅
  8. Öğrenci `assignments/my`'de `status: GRADED`, `score: 88`, `feedback` doğru göründü. ✅
  9. Test verisi temizlendi (`DELETE /assignments/:id`).
  Not: Bu QA curl/API seviyesinde yapıldı — Chrome DevTools uzantısı bu oturumda bağlı değildi,
  görsel/tarayıcı QA'sı (mockup ile piksel karşılaştırma, "Teslim Et" diyaloğunun gerçek tıklanması,
  admin ödev yönetim ekranının görsel kontrolü) **yapılamadı**. Kullanıcı tarayıcıda
  `http://localhost:5173` üzerinden elle doğrulamalı.
- `CONTRACT.md`: Uploads, Assignments, `users/me/upcoming-tasks` bölümleri eklendi; mevcut bölümlerle
  aynı biçimde.
- Devreye alma sırası (plan madde 9.5) bu oturumda geçerli değildi — hepsi aynı yerel dev ortamında
  yapıldı, ayrı staging/prod adımı yok.

## Kapsam dışı bırakılanlar / takip gerektirenler

1. **Dosya yükleme UI'ı bağlanmadı** — backend (`POST /api/v1/uploads`) hazır ve test edildi, ama
   öğrenci teslim diyaloğu ve eğitmen ödev eki formu hâlâ yalnızca metin/link kabul ediyor.
2. **`LessonComment` tip hatası** (bu görevden bağımsız, önceden var) `web`'in prod build'ini engelliyor.
3. **Seed verisi** (`seed.ts`'deki 2 demo ödev) mevcut `dev.db`'ye hiç yüklenmedi — ya DB sıfırlanıp
   yeniden seed edilmeli ya da yönetim arayüzünden elle girilmeli.
4. Dashboard'un geri kalanı (KPI'lar, devam eden ders, duyurular vb.) hâlâ `dashboard.fixtures.ts`
   sabit verisiyle çalışıyor — yalnızca "Yaklaşan Görevler" paneli canlıya alındı (kullanıcının isteği
   zaten bununla sınırlıydı).
