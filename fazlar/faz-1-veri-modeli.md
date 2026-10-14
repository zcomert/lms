# Faz 1 — Veri Modeli (Prisma Şeması)

## Amaç

Ödev/laboratuvar görevlerini ve öğrenci teslimlerini saklayacak kalıcı veri modelini kurmak.
Bu faz yalnızca şema + migration içerir; API/route katmanına dokunmaz.

## Bağımlılık

Yok (ilk faz).

## Tasarım Kararları

- Mevcut `Exam` modeliyle **çakışmaz**; "sınav" tipi görevler zaten `Exam`'den geliyor. Yeni model
  yalnızca ödev/laboratuvar/proje gibi "eğitmen tanımlı, öğrenci teslimi gereken" görevleri kapsar.
- Kod tabanının kuralına uyarak **enum yerine String + izinli literal yorum satırı** kullanılır
  (bkz. `schema.prisma` başındaki not — SQLite + Prisma native enum desteklemiyor).
- Tek teslim/üzerine yazma modeli: `AssignmentSubmission` için `@@unique([assignmentId, userId])`.
  Versiyonlu teslim geçmişi (FR-64) kapsam dışı (bkz. `00-genel-bakis.md`); yeniden teslim mevcut
  satırı günceller (`QuizGrade`'in `userId_lessonId` upsert deseniyle birebir aynı yaklaşım).
- `type` alanı dashboard'daki üç görünür kategoriye karşılık gelir: `HOMEWORK` (ödev), `LAB`
  (laboratuvar), `PROJECT` (proje). Varsayılan `HOMEWORK`.
- `status: DRAFT | PUBLISHED` — `Announcement`/`Exam` ile aynı desen: taslak ödevler öğrenciye
  görünmez, yalnızca yöneten görür.
- Puanlama 0–100 ölçeğinde tutulur (`QuizGrade.score` ile tutarlı); `maxScore`/ağırlık hesaplaması
  kurs bazlı ortalamaya dahil edilmesi gerekiyorsa ileride ayrı bir faz konusu (not sistemine entegrasyon
  bu planın kapsamı dışında — yalnızca dashboard ve ödev sayfası için gerekli alanlar eklendi).
- `isLate` teslim anında hesaplanıp **donduruluyor**: ödevin `allowLateSubmission`/`latePenaltyPercent`
  ayarları sonradan değişse bile geçmiş teslimlerin geç/zamanında durumu bozulmaz.

## Şema Değişikliği

`server/prisma/schema.prisma` dosyasına, `Exam` modellerinin altına eklenecek:

```prisma
/// Eğitmen tanımlı ödev/laboratuvar/proje görevi (FR-60). Her ödev bir kursa aittir.
model Assignment {
  id                  String               @id @default(cuid())
  courseId            String
  course              Course               @relation(fields: [courseId], references: [id], onDelete: Cascade)
  title               String
  description         String?
  /// Allowed literals: "HOMEWORK" | "LAB" | "PROJECT"
  type                String               @default("HOMEWORK")
  /// Allowed literals: "DRAFT" | "PUBLISHED"
  status              String               @default("DRAFT")
  /// Teslim son tarihi (UTC).
  dueAt               DateTime
  /// Doluysa bu andan önce teslim kabul edilmez; boşsa hemen açıktır.
  availableFrom       DateTime?
  allowLateSubmission Boolean              @default(true)
  /// 0-100: geç teslimde puandan düşülecek yüzde. allowLateSubmission=false ise anlamsızdır.
  latePenaltyPercent  Int?
  maxScore            Int                  @default(100)
  /// Eğitmenin ödev eki (Faz 2 dosya yükleme altyapısıyla doldurulur).
  attachmentUrl        String?
  attachmentName        String?
  /// CSV, örn. "pdf,docx,zip"; boşsa kısıtlama yok.
  acceptedFileTypes    String               @default("")
  createdById         String?
  createdBy           User?                @relation("AssignmentsCreated", fields: [createdById], references: [id], onDelete: SetNull)
  submissions         AssignmentSubmission[]
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  @@index([courseId])
  @@index([status, dueAt])
}

/// Öğrencinin bir ödeve tek teslimi (yeniden teslim üzerine yazar — QuizGrade ile aynı desen).
model AssignmentSubmission {
  id              String     @id @default(cuid())
  assignmentId    String
  assignment      Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  userId          String
  user            User       @relation("AssignmentSubmissions", fields: [userId], references: [id], onDelete: Cascade)
  /// Metin teslimi (FR-61 "metin girerek").
  note            String?
  /// Dosya teslimi (Faz 2 altyapısıyla doldurulur).
  fileUrl         String?
  fileName        String?
  submittedAt     DateTime   @default(now())
  /// Teslim anında dueAt'e göre hesaplanıp dondurulur.
  isLate          Boolean    @default(false)
  /// 0-100; notlandırılmadıysa null.
  score           Int?
  feedback        String?
  gradedAt        DateTime?
  gradedById      String?
  gradedBy        User?      @relation("AssignmentSubmissionsGraded", fields: [gradedById], references: [id], onDelete: SetNull)

  @@unique([assignmentId, userId])
  @@index([assignmentId])
  @@index([userId])
}
```

`User` modeline karşılık gelen ilişki alanları eklenecek (diğer `@relation` isimli alanların yanına):

```prisma
assignmentsCreated       Assignment[]           @relation("AssignmentsCreated")
assignmentSubmissions    AssignmentSubmission[]  @relation("AssignmentSubmissions")
assignmentSubmissionsGraded AssignmentSubmission[] @relation("AssignmentSubmissionsGraded")
```

`Course` modeline:

```prisma
assignments Assignment[]
```

## Migration

```bash
cd server
npx prisma migrate dev --name add_assignments
npx prisma generate
```

- Mevcut `.env`'deki `DATABASE_URL` (dev SQLite dosyası) kullanılır; `pretest` script'i zaten
  `test.db` üzerinde ayrı migrate çalıştırıyor, bu yüzden test veritabanı otomatik güncellenecek.
- Migration adı önerisi: `add_assignments` (repo'daki `prisma/migrations/` klasöründeki mevcut
  isimlendirme biçimine bakılıp uyumlu hale getirilmeli).

## Seed (opsiyonel ama önerilir)

`server/prisma/seed.ts` içine, dashboard ekran görüntüsündeki örneklerle birebir eşleşen 2-3 demo
ödev eklenmesi, Faz 6-7'de manuel test ederken ekranın mockup'a benzemesini sağlar:

- "Veri Yapıları Proje Ödevi 2" — `type: HOMEWORK`, yakın `dueAt`.
- "Yapay Zekâ Mini Proje Teslimi" — `type: LAB`.

## Kabul Kriterleri

- [ ] `npx prisma migrate dev` hatasız tamamlanıyor.
- [ ] `npx prisma generate` sonrası `AssignmentSubmission`/`Assignment` tipleri `@prisma/client`'tan
      import edilebiliyor.
- [ ] `npm run typecheck` (server) temiz.
- [ ] Var olan testler (`npm test`) regresyon göstermiyor.
