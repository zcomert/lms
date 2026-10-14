# Faz 9 — Test, Son Kontrol ve Devreye Alma

## Amaç

Önceki 8 fazın birlikte doğru çalıştığını doğrulamak, dokümantasyonu tamamlamak ve değişikliği
güvenle devreye almak.

## Bağımlılık

Faz 1–8'in tamamı (ya da Faz 2 hariç bırakılmışsa, dosyasız sürümün tamamı).

## 9.1 — Otomatik Testler

```bash
cd server
npm run typecheck
npm test            # vitest run — assignments.test.ts, users.test.ts (upcoming-tasks) dahil tümü yeşil

cd ../web
npm run typecheck
npm run build        # prod build hatasız tamamlanmalı
```

Yeni route dosyalarının (`assignments.ts`, `uploads.ts` varsa) her dalı (401/403/404/400/happy path)
test kapsamında olmalı — mevcut `exams.test.ts`/`announcements.test.ts` kapsam derinliği referans
alınır.

## 9.2 — CONTRACT.md Bütünlük Kontrolü

- "Assignments" ve (varsa) "Uploads" bölümlerinin, mevcut bölümlerle **aynı üslup ve biçimde**
  (başlık → istek → yanıt kodu → hata tablosu) yazıldığı gözden geçirilir.
- `server/CONTRACT.md` başındaki genel kurallar (hata biçimi, `Authorization` header) yeni
  bölümlerde de tutarlı uygulanmış mı kontrol edilir.

## 9.3 — Manuel QA Senaryosu (tarayıcıda, `run` skill veya Chrome DevTools ile)

1. ADMIN olarak giriş yap → `/yonetim/odevler` → bir kursa "Veri Yapıları Proje Ödevi 2" adında,
   2 gün sonrasına teslim tarihli bir `HOMEWORK` oluştur → Yayında'ya al.
2. Aynı kursa bir `LAB` ödevi daha oluştur (ekran görüntüsündeki "Yapay Zekâ Mini Proje Teslimi").
3. O kursa kayıtlı bir öğrenci hesabıyla giriş yap → Dashboard'da **iki ödevin de** (ve varsa yayındaki
   bir sınavın) "Yaklaşan Görevler" panelinde göründüğünü doğrula → ekran görüntüsüyle görsel
   karşılaştırma yap.
4. `/notlar-ve-gorevler`'e git, aynı listeyi gör, bir ödeve metin ile teslim yap.
5. Dashboard'a dön → teslim edilen ödevin panelden **kaybolduğunu** doğrula.
6. Eğitmen/ADMIN hesabına dön → teslime puan + geri bildirim gir.
7. Öğrenci hesabına dön → `/notlar-ve-gorevler`'de ödevin `GRADED` rozetiyle puanla göründüğünü
   doğrula.
8. (Faz 2 uygulandıysa) adım 4'ü dosya yükleyerek de tekrarla; indirme linkinin çalıştığını doğrula.
9. Teslim tarihi geçmiş + geç teslime kapalı bir ödev senaryosunu (tarihi geçmişe alarak) test et →
   panelde görünmemeli, `/notlar-ve-gorevler`'de `LATE` rozetiyle görünmeli.

## 9.4 — Geriye Dönük Uyumluluk

- `dashboard.fixtures.ts` içindeki `upcomingTasks` alanı artık `UpcomingTasks` bileşeni tarafından
  kullanılmıyor olsa da, `DashboardData` tipinin bir parçası olarak dursun mu yoksa kaldırılsın mı
  kararı burada verilir. Öneri: **kaldırılmaz** (tip + fixture dursun) çünkü dashboard'un geri kalanı
  hâlâ fixture'a bağlı (bkz. `00-genel-bakis.md` kapsam notu) ve `DashboardData` tipinin tutarlılığı
  gelecekteki "dashboard'un tamamını canlı veriye taşıma" çalışmasını kolaylaştırır. Yalnızca
  `DashboardPage.tsx`'in artık bu alanı `UpcomingTasks`'a geçirmediği (Faz 6) kod yorumuyla belirtilir.
- `web/src/data/useDashboardData.ts` üstündeki "BACKEND GEÇİŞ NOKTASI" yorumu, artık kısmen doğru
  olmayacak (bir alt-özellik zaten backend'e taşındı) — yorum küçük bir notla güncellenir.

## 9.5 — Devreye Alma Sırası

1. Faz 1 migration'ı **önce** prod/staging DB'de çalıştırılır (boş tablo, veri kaybı riski yok).
2. Backend (Faz 1–5, Faz 2 dahil) deploy edilir; bu noktada hiçbir eski davranış bozulmaz (yeni uç
   noktalar henüz frontend tarafından çağrılmıyor).
3. Frontend (Faz 6–8) deploy edilir.
4. Demo/seed veri (Faz 1'deki opsiyonel seed) yalnızca staging/demo ortamında çalıştırılır, prod'da
   gerçek eğitmenler kendi ödevlerini girer.

## Kabul Kriterleri

- [ ] `server` ve `web` için `typecheck` ve testler yeşil.
- [ ] `web` prod build hatasız.
- [ ] Manuel QA senaryosunun 9 adımı da başarıyla tamamlandı.
- [ ] CONTRACT.md güncel ve tutarlı.
- [ ] CLAUDE.md'deki "Next Steps" bölümü gerekiyorsa güncellenir (örn. "Notlar & Görevler" artık
      placeholder değil).
