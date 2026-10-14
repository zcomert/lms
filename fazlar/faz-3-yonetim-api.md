# Faz 3 — Eğitmen/Admin Yönetim API'leri

## Amaç

Eğitmen/Admin'in kursuna ödev/laboratuvar görevi tanımlayıp düzenleyip silebileceği uç noktaları
kurmak. Panelin "yönetilebilir" olma şartının backend tarafı budur.

## Bağımlılık

Faz 1 (şema) zorunlu. Faz 2 (dosya yükleme) yalnızca `attachmentUrl` alanının doldurulması için
gerekli — dosya ekleme olmadan da ödev metin açıklamasıyla oluşturulabilir, bu fazı bloklamaz.

## Yetki Modeli (mevcut kalıpla birebir aynı)

`server/src/lib/courseAccess.ts`'deki `assertCanManageCourse(user, courseId)` kullanılır:
ADMIN her kursu, aktif rolü INSTRUCTOR olan kullanıcı yalnızca **kendisine atanmış** kursu yönetebilir
(`CourseInstructor` tablosu üzerinden). Bu, `modules.ts`/`exams.ts`/`calendar.ts` route'larının
kullandığı yetki fonksiyonunun birebir tekrarıdır — yeni bir yetki mekanizması icat edilmez.

## Yeni Dosya

`server/src/routes/assignments.ts` — `registerAssignmentRoutes(app)`, mevcut route dosyalarıyla
aynı yapı: Zod/manuel doğrulama (projede Zod yok, `exams.ts`'deki gibi elle doğrulama ve `AppError`
fırlatma deseni izlenir), `prisma` import'u `./lib/prisma.js`.

## Uç Noktalar

### `POST /api/v1/courses/:courseId/assignments`
Yetki: ADMIN veya kursa atanmış INSTRUCTOR.
Body:
```json
{
  "title": "string (1-200)",
  "description": "string|null (<=5000)",
  "type": "HOMEWORK|LAB|PROJECT",
  "dueAt": "ofsetli ISO tarih-saat",
  "availableFrom": "ofsetli ISO tarih-saat|null",
  "allowLateSubmission": true,
  "latePenaltyPercent": "0-100|null",
  "maxScore": "1-1000, varsayılan 100",
  "acceptedFileTypes": "string[] (ör. [\"pdf\",\"zip\"]) — CSV'ye çevrilip saklanır",
  "attachmentUrl": "string|null",
  "attachmentName": "string|null"
}
```
Oluşturma her zaman `status: DRAFT` ile başlar (Exam/Announcement deseniyle tutarlı).
201: `{ "assignment": <ödev nesnesi> }`
400: `VALIDATION_ERROR` · 403: `FORBIDDEN` · 404: `NOT_FOUND` (kurs yok)

### `GET /api/v1/assignments/manage?courseId=&status=`
Yetki: ADMIN veya INSTRUCTOR rolü (ADMIN hepsini, INSTRUCTOR yalnızca atandığı kursların ödevlerini
görür — `announcements.ts`'teki `/manage` deseniyle birebir aynı).
200: `{ "assignments": [ <ödev nesnesi>, ... ] }` (`updatedAt` azalan)

### `GET /api/v1/assignments/:id`
Yönetim ayrıntı görünümü: ödev + teslim listesi (notlandırma ekranı için).
Yetki: ADMIN veya kursa atanmış INSTRUCTOR.
200:
```json
{
  "assignment": { ... },
  "submissions": [
    {
      "student": { "id", "name", "email", "avatarUrl" },
      "note": "string|null",
      "fileUrl": "string|null",
      "fileName": "string|null",
      "submittedAt": "ISO|null",
      "isLate": false,
      "score": null,
      "feedback": null,
      "gradedAt": null
    }
  ]
}
```
Not: `submissions`, kursa kayıtlı **her** öğrenci için bir satır döner (teslim etmemişse `submittedAt:
null` vb.) — `lessons/:id/grades` uç noktasının "her öğrenci için bir satır" deseniyle aynı mantık.
404: `NOT_FOUND`

### `PATCH /api/v1/assignments/:id`
Body: POST alanlarının kısmi hali + `status?: "DRAFT"|"PUBLISHED"` (en az bir alan).
Yetki: ADMIN veya kursa atanmış INSTRUCTOR. `courseId` değiştirilemez (farklı değer → 400, `exams.ts`
ile aynı kural).
200: `{ "assignment": <ödev nesnesi> }`
400/403/404: yukarıdaki biçimlerle.

### `DELETE /api/v1/assignments/:id`
Teslimleriyle birlikte (cascade) siler.
200: `{ "deleted": true }`

### `PUT /api/v1/assignments/:id/submissions/:userId/grade`
Yetki: ADMIN veya kursa atanmış INSTRUCTOR.
Body: `{ "score": "0-maxScore arası tam sayı", "feedback": "string|null (<=5000)" }`
- `score` zorunlu; `AssignmentSubmission` kaydı yoksa (öğrenci hiç teslim etmemiş) 400
  `SUBMISSION_NOT_FOUND` (not girmeden önce teslim şart — notlandırma teslimi "oluşturmaz").
- `gradedAt` = şimdi, `gradedById` = çağıran.
200: `{ "submission": <teslim satırı> }`
400/403/404: yukarıdaki biçimlerle.

## Ödev Nesnesi (yanıt biçimi, tüm uç noktalarda ortak)

```json
{
  "id": "string",
  "course": { "id": "string", "title": "string" },
  "title": "string",
  "description": "string|null",
  "type": "HOMEWORK",
  "status": "DRAFT",
  "dueAt": "ISO",
  "availableFrom": "ISO|null",
  "allowLateSubmission": true,
  "latePenaltyPercent": null,
  "maxScore": 100,
  "attachmentUrl": null,
  "attachmentName": null,
  "acceptedFileTypes": ["pdf", "zip"],
  "submissionCount": 0,
  "createdBy": { "id": "string", "name": "string" } ,
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

`submissionCount`: `QuestionBank.questionCount` deseniyle aynı — ilişkili kayıt sayısı, ekranda
"3 teslim" gibi özetler için.

## CONTRACT.md Güncellemesi

`server/CONTRACT.md`'ye "Exams" bölümünden hemen sonra yeni bir **"Assignments (Ödevler)"** bölümü
eklenir; mevcut bölümlerin biçimine birebir uyulur (uç nokta başlığı → istek → yanıt kodları →
hata kodları tablosu).

## Testler

`server/src/routes/assignments.test.ts` — mevcut `exams.test.ts`/`announcements.test.ts` dosyalarının
yapısı taklit edilir: her uç nokta için yetki (401/403), doğrulama (400) ve mutlu yol (happy path)
testleri.

## Kabul Kriterleri

- [ ] Eğitmen yalnızca kendi kursuna ödev ekleyebiliyor, başka kursa eklemeye çalışınca 403 alıyor.
- [ ] ADMIN her kursa ödev ekleyip silebiliyor.
- [ ] `PATCH` ile `DRAFT → PUBLISHED` geçişi çalışıyor.
- [ ] `GET /assignments/manage` INSTRUCTOR için yalnızca kendi kurslarını, ADMIN için hepsini
      döndürüyor.
- [ ] Not girme, teslim olmayan öğrenci için 400 `SUBMISSION_NOT_FOUND` veriyor.
- [ ] `npm test` (server) yeşil, `npm run typecheck` temiz.
