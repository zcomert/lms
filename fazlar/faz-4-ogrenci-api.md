# Faz 4 — Öğrenci Teslim API'leri

## Amaç

Öğrencinin kendi ödevlerini listeleyebileceği, teslim yapabileceği ve durumunu görebileceği uç
noktaları kurmak (FR-61, FR-66). Bu faz, `/notlar-ve-gorevler` sayfasının (Faz 7) ve dashboard
panelinin (Faz 5) veri kaynağıdır.

## Bağımlılık

Faz 1 (şema) zorunlu. Faz 3 (yönetim API) mantıksal olarak önce gelmeli (ödev olmadan teslim
edilecek bir şey yok) ama kod olarak bağımsız bir route dosyasıdır, paralel yazılabilir.

## Yeni Dosya

`server/src/routes/assignments.ts` içine eklenir (Faz 3 ile aynı dosya/route grubu — ayrı dosya
açmaya gerek yok, `exams.ts` de hem yönetim hem `exams/my` uç noktasını tek dosyada barındırıyor).

## Uç Noktalar

### `GET /api/v1/assignments/my?status=`
Giriş yapmış herhangi bir rol. Kullanıcının **kayıtlı olduğu kursların** `PUBLISHED` ödevlerini,
kendi teslim durumuyla birlikte döner.

`status` filtresi (FR-66 — "teslim edilmedi, değerlendiriliyor, notlandı"), türetilmiş alan:
- `PENDING`: teslim yok, `dueAt` gelecekte (veya geçmiş ama `allowLateSubmission=true`).
- `LATE`: teslim yok ve `dueAt` geçmiş ve `allowLateSubmission=false` (artık teslim edilemez).
- `SUBMITTED`: teslim var, `score` boş.
- `GRADED`: teslim var, `score` dolu.

Bu dört durum, `web/src/features/assignments/AssignmentsPage.tsx` içindeki mevcut (şu an mock)
`Assignment['status']` tipiyle (`'pending'|'submitted'|'graded'|'late'`) **birebir eşleşecek şekilde**
tasarlandı — Faz 7'de o sayfa gerçek veriye bağlanırken tip dönüşümü gerekmeyecek.

200:
```json
{
  "assignments": [
    {
      "id": "string",
      "course": { "id": "string", "title": "string" },
      "title": "string",
      "description": "string|null",
      "type": "HOMEWORK",
      "dueAt": "ISO",
      "allowLateSubmission": true,
      "maxScore": 100,
      "attachmentUrl": null,
      "attachmentName": null,
      "acceptedFileTypes": ["pdf"],
      "status": "PENDING",
      "mySubmission": {
        "note": "string|null",
        "fileUrl": "string|null",
        "fileName": "string|null",
        "submittedAt": "ISO",
        "isLate": false,
        "score": null,
        "feedback": null
      } 
    }
  ],
  "serverTime": "ISO"
}
```
`mySubmission`: teslim yoksa `null`. `serverTime`, `exams/my` ile aynı gerekçeyle döner (istemci
saat kaymasına karşı sunucu zamanını referans alır).

Sıra: `PENDING`/`LATE` önce (`dueAt` artan), sonra `SUBMITTED`/`GRADED` (`dueAt` azalan) —
`exams/my`'deki "açık olanlar önce" mantığının ödev karşılığı.

401: `UNAUTHORIZED`

### `POST /api/v1/assignments/:id/submission`
Giriş yapmış herhangi bir rol; **kursa kayıtlı olmak şart** (`NOT_ENROLLED` — `lessons/:id/completion`
ile aynı yetki kalıbı).
Body: `{ "note"?: string (<=5000), "fileUrl"?: string|null, "fileName"?: string|null }`
- En az `note` veya `fileUrl`'den biri dolu olmalı; ikisi de boşsa 400 `VALIDATION_ERROR`.
- Ödev `status !== PUBLISHED` ise 404 `NOT_FOUND`.
- `availableFrom` gelecekte ise 403 `NOT_AVAILABLE_YET`.
- `dueAt` geçmiş ve `allowLateSubmission=false` ise 403 `SUBMISSION_CLOSED`.
- `fileUrl` verilmişse ve ödevin `acceptedFileTypes` doluysa, dosya uzantısı listede olmalı; değilse
  400 `INVALID_FILE_TYPE`.
- Var olan teslim varsa **üzerine yazılır** (yeniden teslim = güncelleme, `QuizGrade` upsert deseni);
  `score`/`feedback`/`gradedAt` sıfırlanır (yeniden değerlendirme gerekir — zaten notlandırılmış bir
  teslimin üzerine öğrenci yeniden teslim ederse eski not geçersizleşir, bu beklenen davranış).
- `isLate` = `now() > dueAt` sunucu tarafında hesaplanıp kaydedilir.
200: `{ "submission": <teslim nesnesi, isLate dahil> }`
400/401/403/404: yukarıdaki kodlarla.

### `DELETE /api/v1/assignments/:id/submission`
Öğrenci kendi teslimini geri çekebilir (yanlış dosya yükleme durumunda yeniden teslime izin vermek
için pratik bir kaçış kapısı). Yalnızca henüz notlandırılmamışsa (`score == null`) izinli; notlandırılmış
teslim silinemez → 409 `ALREADY_GRADED`.
200: `{ "deleted": true }`

## Kontrol Sırası (diğer route'larla tutarlı)

401 (token) → 404 (ödev yok/taslak) → 403 (kayıt/zamanlama) → 400 (gövde doğrulama).

## CONTRACT.md Güncellemesi

Faz 3'te açılan "Assignments" bölümüne bu uç noktalar eklenir.

## Testler

`assignments.test.ts` içine: kayıtsız kullanıcının teslim edememesi, geç teslimin doğru işaretlenmesi,
`acceptedFileTypes` doğrulaması, notlandırılmış teslimin silinememesi, durum filtresinin (`PENDING` vb.)
doğru hesaplanması.

## Kabul Kriterleri

- [ ] Kayıtlı olmayan kurs için `GET /assignments/my` o kursun ödevlerini listelemiyor.
- [ ] Süre geçmiş + `allowLateSubmission=false` ödeve teslim denemesi 403 `SUBMISSION_CLOSED`.
- [ ] İkinci kez teslim, ilk teslimin üzerine yazıyor (yeni satır oluşmuyor — `@@unique` garantisi).
- [ ] `status` hesaplaması dört durumda da doğru (manuel test: tarihleri ileri/geri alarak).
- [ ] `npm test` yeşil.
