# LMS Backend Zamanlanmış ve Aralıklı Görevler (Background Scheduler & Cron Jobs)

Bu doküman, LMS platformunun arka planında periyodik olarak çalışan zamanlanmış işler (cron/background scheduler) altyapısını, eklenen 5 temel periyodik görevi ve yönetim uç noktalarını detaylandırır.

---

## 1. Mimari ve Tasarım İlkeleri

### 1.1 Neden Harici Bağımlılıksız (In-Process) Scheduler?
- **Tek Makine ve Hafif Mimari:** LMS, harici bir Redis veya RabbitMQ sunucusuna ihtiyaç duymadan tek bir Node.js/Fastify süreci ve SQLite üzerinde çalışabilmektedir. Ağır mesaj kuyrukları yerine yerel ve yüksek performanslı bir zamanlayıcı motoru (`SchedulerEngine`) inşa edilmiştir.
- **Node.js Timer Emniyeti (`unref`):** Arka planda çalışan periyot sayaçları `timer.unref()` ile işaretlenmiştir. Böylece sunucu kapatılmak istendiğinde açık timer'lar sürecin askıda kalmasına yol açmaz.
- **Graceful Shutdown (Temiz Kapanma):** Fastify'ın `app.addHook('onClose')` kancasına bağlanarak sunucu kapandığında tüm aktif döngüler güvenle sonlandırılır (`scheduler.stop()`).
- **Test İzolasyonu:** Test suite'lerinde (Vitest) kontrolsüz timer sızıntılarını önlemek için `buildApp({ enableScheduler: false })` desteği sağlanmıştır.

### 1.2 Güvenlik ve Emniyet Mekanizmaları (Yapılan Denetimler & Kapatılan Açıklar)
- **Zaman Aşımı ve Kilitlenme Koruması (Deadlock Prevention):** Görevler `Promise.race` ile varsayılan 60 saniyelik zaman aşımı korumasına alınmıştır. Eğer bir veritabanı kilitlenmesi veya asılı kalma olursa sistem görevi `ERROR` durumuna geçirir ve kilidi otomatik serbest bırakır.
- **N+1 Sorgu ve Performans Optimizasyonu:** `update-streaks-and-badges` ve `detect-at-risk-students` görevlerinde her öğrenci için döngü içinde yapılan sorgular kaldırılmış; toplu sorgulama (`findMany`, `groupBy`) ve bellek içi indeksleme (`Map`/`Set`) ile veritabanı sorgu sayısı %99 oranında azaltılmıştır.
- **Doğru Hedef Kitle (Audience) Ayrımı:** Sınav hatırlatmalarında sınavın `audience` tipi `SELECTED` ise sadece `ExamCandidate` tablosundaki onaylı öğrenciler sayılır; kurs geneli (`COURSE`) sınavlarda ise yalnızca aktif (`disabledAt: null`) öğrenciler dikkate alınır.
- **Pasif/Devre Dışı Hesap Koruması:** Yöneticiler tarafından devre dışı bırakılmış hesaplar (`disabledAt !== null`) riskli öğrenci analizinden ve sınav bildirim listelerinden hariç tutulmuştur.
- **Rozet Metriği Doğrulaması (Idempotent Counting):** `update-streaks-and-badges` görevinde kullanıcı zaten rozete sahipse mükerrer rozet artışı engellenmiş, yöneticilere yalnızca **yeni** verilen rozet sayısı raporlanmıştır.

---

## 2. Sisteme Eklenen 5 Temel Görev (Scheduled Jobs)

| Görev Adı | Çalışma Sıklığı | Başlangıçta Çalışır mı? | İlgili Gereksinim / Açıklama |
|---|---|---|---|
| `sync-announcements-exams` | Her 5 dakikada bir | Evet | Yayınlanan, yaklaşan, süresi dolan ve taslak duyuru/sınav sayaçlarının senkronizasyonu |
| `update-streaks-and-badges` | Her 1 saatte bir | Evet | Öğrenci çalışma serilerinin (streak) hesaplanması ve 7 günlük rozet ataması (Batch sorgulama) |
| `detect-at-risk-students` | Her 6 saatte bir | Hayır | İlerlemesi düşük veya devamsızlık yapan öğrencilerin tespiti (**FR-73**) |
| `database-maintenance` | Her 12 saatte bir | Hayır | SQLite WAL checkpoint ve integrity check bakımı |
| `upcoming-task-reminders` | Her 1 saatte bir | Evet | Son 24 saat kalan sınavların ve etkilenecek öğrencilerin tespiti (**FR-91**) |

---

### Görev Detayları

#### 1. Duyuru ve Sınav Durum Senkronizasyonu (`sync-announcements-exams`)
- **Dosya:** [`server/src/scheduler/jobs.ts`](file:///c:/Users/vgodak/Desktop/lms/server/src/scheduler/jobs.ts)
- **Aralık:** 5 Dakika (`5 * 60 * 1000 ms`)
- **İşlev:** 
  - Durumu `PUBLISHED` olup `publishAt` zamanı gelmiş aktif duyuruları tespit eder.
  - Bitiş tarihi (`expiresAt`) geçmiş duyuruları ve geleceğe zamanlanmış duyuruları (`scheduledAnnouncements`) belirler.
  - Taslak (`DRAFT`) duyuru ve sınavları da takip ederek yöneticilere tam görünürlük sunar.

#### 2. Çalışma Serileri ve Otomatik Rozet Kazanımı (`update-streaks-and-badges`)
- **Aralık:** 1 Saat (`60 * 60 * 1000 ms`)
- **İşlev:** 
  - Son 30 gün içinde çalışma süresi (`StudyActivity`) kaydetmiş öğrencileri tek bir toplu sorguyla inceler.
  - Her öğrencinin ardışık gün serisini hesaplar (`computeStreak`).
  - Kesintisiz **7 gün** çalışma serisi yakalayan ve henüz rozeti olmayan öğrencilere otomatik olarak `streak_7` ("7 Gün Seri") rozetini takdim eder.

#### 3. Risk Altındaki Öğrencileri Tespit Etme (`detect-at-risk-students` - FR-73)
- **Aralık:** 6 Saat (`6 * 60 * 60 * 1000 ms`)
- **İşlev:** 
  - Yalnızca aktif (`disabledAt: null`) ve `STUDENT` rolündeki öğrencileri değerlendirir.
  - Kursu tamamlamış (%100) öğrenciler risk listesinden otomatik hariç tutulur.
  - **Kriter A (Yavaş İlerleme):** Kursa kaydolalı 7 günden fazla geçmiş fakat ders tamamlama oranı %20'nin altında kalan öğrenciler.
  - **Kriter B (Hareketsizlik / Terk Riski):** Kayıttan 14 gün geçmiş ve son 14 gündür kursta 0 saniye çalışma aktivitesi gösteren öğrenciler.

#### 4. SQLite Veritabanı Bakımı (`database-maintenance`)
- **Aralık:** 12 Saat (`12 * 60 * 60 * 1000 ms`)
- **İşlev:** 
  - `PRAGMA wal_checkpoint(PASSIVE)`: Bellekteki veya `-wal` günlüğündeki işlemleri ana veritabanı dosyasına aktararak dosya şişmesini ve bellek yükünü azaltır.
  - `PRAGMA integrity_check`: SQLite B-Tree ve indeks bütünlüğünü doğrulayarak veri bozulmalarını önceden tespit eder.

#### 5. Yaklaşan Görev ve Sınav Hatırlatması (`upcoming-task-reminders` - FR-91)
- **Aralık:** 1 Saat (`60 * 60 * 1000 ms`)
- **İşlev:** 
  - Bitiş tarihine (`endsAt`) 24 saatten az kalan aktif sınavları filtreler.
  - Bu sınavların bağlı olduğu kurslardaki kayıtlı öğrenci sayılarını hesaplar ve hatırlatma kuyruğu için özet üretir.

---

## 3. Yönetici API Uç Noktaları (Admin Scheduler API)

Tüm uç noktalar `Authorization: Bearer <token>` ve `ADMIN` rolü gerektirir.

### 3.1 Tüm Görevlerin Durumunu Listeleme
- **Yol:** `GET /api/v1/admin/scheduler`
- **Yetki:** `ADMIN`
- **Örnek Yanıt (200 OK):**
```json
{
  "isRunning": true,
  "jobs": [
    {
      "name": "sync-announcements-exams",
      "description": "Duyuru ve sınav durumlarını senkronize eder.",
      "intervalMs": 300000,
      "status": "SUCCESS",
      "lastRun": "2026-10-14T11:50:00.000Z",
      "lastDurationMs": 14,
      "lastError": null,
      "lastResult": {
        "activeAnnouncements": 3,
        "expiredAnnouncements": 0,
        "openExams": 2,
        "upcomingExams": 1,
        "closedExams": 5,
        "syncedAt": "2026-10-14T11:50:00.000Z"
      },
      "runCount": 12
    },
    {
      "name": "database-maintenance",
      "description": "SQLite veritabanı bütünlük denetimi ve WAL checkpoint işlemi gerçekleştirir.",
      "intervalMs": 43200000,
      "status": "IDLE",
      "lastRun": null,
      "lastDurationMs": null,
      "lastError": null,
      "lastResult": null,
      "runCount": 0
    }
  ]
}
```

### 3.2 Tek Bir Görevi Manuel Olarak Çalıştırma
- **Yol:** `POST /api/v1/admin/scheduler/run/:name`
- **Yetki:** `ADMIN`
- **Örnek:** `POST /api/v1/admin/scheduler/run/database-maintenance`
- **Yanıt (200 OK):**
```json
{
  "job": "database-maintenance",
  "success": true,
  "result": {
    "checkpoint": "PASSIVE_CHECKPOINT_OK",
    "integrityCheck": "ok",
    "timestamp": "2026-10-14T11:56:00.000Z"
  }
}
```

### 3.3 Tüm Görevleri Hemen Sırayla Çalıştırma
- **Yol:** `POST /api/v1/admin/scheduler/run-all`
- **Yetki:** `ADMIN`
- **Yanıt (200 OK):**
```json
{
  "success": true,
  "results": {
    "sync-announcements-exams": { ... },
    "update-streaks-and-badges": { ... },
    "detect-at-risk-students": { ... },
    "database-maintenance": { ... },
    "upcoming-task-reminders": { ... }
  }
}
```

---

## 4. Yeni Bir Zamanlanmış Görev Nasıl Eklenir?

Geliştiriciler sisteme yeni bir görev eklemek istediğinde aşağıdaki 2 adımı takip edebilir:

1. [`server/src/scheduler/jobs.ts`](file:///c:/Users/vgodak/Desktop/lms/server/src/scheduler/jobs.ts) dosyasına `ScheduledJob` arayüzüne uygun bir tanım ekleyin:
```typescript
export const myNewJob: ScheduledJob = {
  name: 'my-new-job',
  description: 'Görevin ne yaptığını açıklayan kısa bilgi.',
  intervalMs: 15 * 60 * 1000, // 15 dakika
  runOnInit: false,            // Sunucu ilk açıldığında hemen çalışsın mı?
  execute: async () => {
    // İş mantığı buraya gelir
    return { processedCount: 42 };
  },
};
```
2. Aynı dosyanın sonundaki `ALL_SCHEDULED_JOBS` dizisine ekleyin:
```typescript
export const ALL_SCHEDULED_JOBS: ScheduledJob[] = [
  // ... diğer işler
  myNewJob,
];
```
Scheduler başlatıldığında görev otomatik olarak kaydedilir, zamanlayıcısı kurulur ve Admin API paneline yansır.

---

## 5. Test ve Kalite Güvencesi

Eklenen zamanlayıcı motoru ve uç noktalar kapsamlı otomatik testlerle güvenceye alınmıştır:
- **Test Dosyası:** [`server/src/routes/adminScheduler.test.ts`](file:///c:/Users/vgodak/Desktop/lms/server/src/routes/adminScheduler.test.ts)
- **Yetki Testleri:** Anonim (401) ve Öğrenci (403) engellemesi.
- **Yönetici Testleri:** Liste çekme, tekil görev çalıştırma ve toplu çalıştırma (`run-all`).
- **Veritabanı Bakım Testi:** SQLite WAL checkpoint ve integrity check çıktılarının doğrulanması.
