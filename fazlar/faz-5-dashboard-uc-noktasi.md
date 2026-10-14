# Faz 5 — Dashboard "Yaklaşan Görevler" Birleşik Uç Noktası

## Amaç

Dashboard panelinin ihtiyaç duyduğu tek veri kaynağını kurmak: **ödev + sınav** karışık listesi,
FR-12'ye uygun ("teslim tarihi yaklaşan ödev ve sınavları, varsayılan 7 gün, tarih sırasıyla").

## Bağımlılık

Faz 1, Faz 3 (en azından `Assignment` şeması ve `PUBLISHED` ödevler), Faz 4 (`mySubmission` mantığı
— tamamlanmış/teslim edilmiş görevlerin listeden düşmesi için) tamamlanmış olmalı. Mevcut `Exam`
sistemine yalnızca **okuma** amaçlı erişilir, değişiklik gerekmez.

## Neden Ayrı Bir Uç Nokta (neden `assignments/my` + `exams/my` frontend'de birleştirilmiyor)

İki ayrı isteği frontend'de birleştirmek yerine sunucuda tek uç nokta tercih edildi çünkü:
- Dashboard'da yalnızca "yakın" ve "açık" olanlar gösterilir (tam liste değil) — sayfalama/filtreleme
  mantığı sunucuda tek yerde, tutarlı şekilde uygulanır.
- İki ayrı `useApiResource` çağrısının yarışması/gecikmesi yerine tek network isteği, tek yükleme
  durumu.
- `exams/my` ve `assignments/my` zaten kendi sayfalarında (Sınavlar, Notlar & Görevler) tam liste
  için ayrı ayrı kullanılacak (Faz 7) — bu yeni uç nokta onları **değiştirmez**, dashboard'a özel
  **ek bir görünüm**dür.

## Uç Nokta

### `GET /api/v1/users/me/upcoming-tasks?days=7&limit=5`
Giriş yapmış herhangi bir rol.
- `days`: 1–90, varsayılan 7 (FR-12 ile birebir — `activity` uç noktasındaki `days` parametresiyle
  aynı doğrulama deseni: `VALIDATION_ERROR`).
- `limit`: 1–20, varsayılan 5 (panelin kompakt alanına sığacak kadar).

**Dahil edilenler:**
- `Assignment`: `status=PUBLISHED`, kullanıcının kayıtlı olduğu kurslardan, `mySubmission` **yok**
  (teslim edilince panelden düşer — "yaklaşan" anlamıyla tutarlı), `dueAt` şu an ile
  `now + days gün` arasında **veya** zaten geçmiş ve hâlâ `allowLateSubmission=true` (geç teslime
  hâlâ açık olanlar da "acil" olarak gösterilir).
- `Exam`: `exams/my` ile aynı görünürlük mantığı (kayıtlı kurs, `COURSE`/seçili `SELECTED`), yalnızca
  `availability` `UPCOMING` veya `OPEN` olanlar, `startsAt` (varsa) `now + days gün` içinde **veya**
  `startsAt` boşsa (süresiz açık) ve `OPEN` ise dahil.

**Sıralama:** birleşik liste, sıralama anahtarı "etkin tarih" (`Assignment.dueAt` veya
`Exam.startsAt ?? Exam.endsAt ?? şimdi`) artan; eşitlikte ödev sınavdan önce.

**Kesme:** `limit` uygulanır; panel zaten "3 Teslim" gibi bir rozet gösteriyor — toplam eşleşen
sayısı da (limit'ten bağımsız) döner ki rozet doğru sayıyı gösterebilsin.

200:
```json
{
  "tasks": [
    {
      "kind": "ASSIGNMENT",
      "id": "string",
      "title": "Veri Yapıları Proje Ödevi 2",
      "description": "Dengeli Ağaç (AVL Tree) Gerçekleştirimi",
      "course": { "id": "string", "title": "string" },
      "dueAt": "2026-10-27T23:59:00.000Z",
      "assignmentType": "HOMEWORK",
      "isPastDue": false,
      "allowLateSubmission": true
    },
    {
      "kind": "EXAM",
      "id": "string",
      "title": "SQL Ara Sınavı (Online Quiz)",
      "description": "Modül 1-4 Kapsamı · 25 Çoktan Seçmeli Soru",
      "course": { "id": "string", "title": "string" },
      "startsAt": "2026-10-16T14:00:00.000Z",
      "endsAt": "2026-10-16T14:45:00.000Z",
      "durationMinutes": 45,
      "availability": "UPCOMING",
      "questionCount": 25
    }
  ],
  "totalCount": 3,
  "serverTime": "2026-10-14T10:00:00.000Z"
}
```

Not: Bu yanıt **kasıtlı olarak** `tagLabel`/`tagTone`/`dueLabel`/`actionLabel` gibi sunum alanları
**içermez** — mimari kurala göre (bkz. `00-genel-bakis.md` madde 5) bunlar Faz 6'da frontend'de
`upcomingTaskMeta.ts` tarafından ham `kind`/`assignmentType`/`availability`/`dueAt` alanlarından
hesaplanır.

400: `VALIDATION_ERROR` (geçersiz `days`/`limit`) · 401: `UNAUTHORIZED`

## Implementasyon Notu

Bu uç nokta `server/src/routes/users.ts` içine eklenir (mevcut `GET /users/me/courses` ile aynı dosya
— "kullanıcının kendi görünümü" uç noktaları orada toplanmış). İki prisma sorgusu (`assignment.findMany`,
`exam.findMany`) paralel (`Promise.all`) çalıştırılıp bellekte birleştirilir/sıralanır — iki ayrı
tablo arasında SQL `UNION` gerekmez, veri hacmi (kullanıcı başına birkaç kurs × birkaç ödev/sınav)
küçük.

## CONTRACT.md Güncellemesi

"Users" bölümüne, `GET /api/v1/users/me/courses`'tan sonra yeni alt başlık.

## Testler

`users.test.ts` içine: ödev+sınav karışık sıralama, `days` filtresi sınırları, teslim edilmiş ödevin
listeden düşmesi, `limit` kesmesi ama `totalCount`'un tam sayıyı vermesi.

## Kabul Kriterleri

- [ ] Teslim edilen ödev listeden kayboluyor.
- [ ] Geçmişi geçmiş + geç teslime kapalı ödev listede **görünmüyor**.
- [ ] `days=1` ile yalnızca yarın içindeki görevler dönüyor.
- [ ] Sınav ve ödev doğru sırada karışık geliyor.
- [ ] `npm test` yeşil.
