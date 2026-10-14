---
name: ders-olustur
description: Bir YouTube video linkini BTK Akademi LMS'teki bir kursa ders (VIDEO_YOUTUBE içerik) olarak ekler ve yayınlar. Kullanıcı bir YouTube linki ve kurs adı verip "ders olarak ekle", "kursa ekle" dediğinde veya /ders-olustur çalıştırdığında kullan. İki parametre alır: kurs adı ve YouTube URL'si; eksik olanı sor. Geri kalan her şeyi (modül seçimi, sıra numarası, video başlığı, yayınlama) otomatik yap.
---

# Ders Oluştur

Bu skill, bir YouTube video linkini, kullanıcının belirttiği kursa gerçek bir ders (lesson) olarak
ekler. İki parametre alır: **kurs adı** ve **YouTube URL'si**. Gerisi (modül, sıra, başlık, yayın
durumu) otomatik belirlenir.

## Parametreler

Skill `/ders-olustur <kurs adı> <youtube url>` biçiminde çağrılabilir (args string'i hem kurs adını
hem URL'yi içerebilir, sırası önemli değil — URL'yi bir `youtube.com/` veya `youtu.be/` deseninden,
kurs adını kalan metinden ayır). Kullanıcı skill'i argümansız çağırırsa veya bu iki parametreden biri
eksikse (ör. konuşmada daha önce paylaşılmış bir link var ama kurs adı yok, ya da tam tersi):

- Yalnızca **eksik olan** parametreyi sor (ikisi de eksikse önce URL'yi, sonra kurs adını sor — aynı
  anda iki şey sorma).
- Konuşma bağlamında zaten bir YouTube linki paylaşılmışsa ve kullanıcı yeni bir URL vermemişse, onu
  kullan (yeniden sormaya gerek yok).

### 1. İki parametreyi netleştir

Elinde hem **kurs adı** hem **YouTube URL'si** olmadan sonraki adımlara geçme. Başka hiçbir alanı
(modül, sıra, başlık, durum) sorma — hepsi aşağıdaki adımlarda otomatik belirlenir.

### 2. Dev sunucularının ayakta olduğunu doğrula

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/v1/health
```

200 değilse, kullanıcıya backend dev sunucusunun (`cd server && npm run dev`) çalışmadığını söyle ve
nasıl devam etmek istediğini sor (`run` skill'i ile başlatmayı teklif edebilirsin).

### 3. Admin oturumu aç

Bu proje yerel geliştirme ortamında `server/prisma/seed.ts` ile oluşturulan ve hem `STUDENT` hem
`ADMIN` rolüne sahip seed hesabını kullanır (`ogrenci@btkakademi.test`, şifre `sifre123` — seed
dosyasında tanımlı, gizli değil). Giriş yapıp aktif rolü `ADMIN`'e çevir:

```bash
BASE=http://localhost:4000/api/v1
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ogrenci@btkakademi.test","password":"sifre123"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
ADMIN_TOKEN=$(curl -s -X POST "$BASE/auth/switch-role" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"role":"ADMIN"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
```

Not: `switch-role` çağrısı bu hesabın DB'deki aktif rolünü kalıcı olarak `ADMIN` yapar. İşlem
bitince (adım 7) hesabı tekrar `STUDENT`'a çevir ki başka bir test/QA akışını bozmasın.

### 4. Kursu bul

```bash
curl -s "$BASE/courses" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
q='<KULLANICININ VERDİĞİ KURS ADI>'.lower()
matches=[c for c in d['courses'] if q in c['title'].lower()]
for c in matches: print(c['id'], '|', c['title'])
"
```

- Tam bir eşleşme yoksa veya birden fazla eşleşme varsa, eşleşen kursları kullanıcıya listele ve
  hangisini kastettiğini sor (bu, "yalnızca kurs adı" kuralını bozmaz — zaten verdiği ada göre netleştirme).
- Hiç eşleşme yoksa, kurs adını kontrol etmesini iste.

### 5. Hedef modülü belirle (soru sorma, otomatik karar ver)

```bash
curl -s "$BASE/courses/<COURSE_ID>" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['course']
for m in d['modules']:
    print(m['id'], '|', m['title'], '| order=', m['order'], '| lessons=', len(m['lessons']))
"
```

- **Modül varsa:** en yüksek `order` değerine sahip modülü (listenin sonuncusu) hedef al — bu
  genelde "güncel/son" modüldür ve bu skill'in önceki kullanımlarında izlenen davranıştır.
- **Hiç modül yoksa:** otomatik olarak yeni bir modül oluştur (kullanıcıya sormadan):
  ```bash
  curl -s -X POST "$BASE/courses/<COURSE_ID>/modules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"title": "<KURS ADI>", "order": 1}'
  ```

### 6. Ders sırasını (order) hesapla

Hedef modüldeki mevcut derslerin en yüksek `order` değeri + 1 (hiç ders yoksa `1`).

### 7. Video başlığını al

`WebFetch` ile videonun başlığını çek (yalnızca başlık — açıklama/altyazı/şarkı sözü gibi telif
içerikli metinleri **asla** tam olarak kopyalama, yalnızca kısa başlığı kullan):

```
WebFetch(url: "<VIDEO_URL>", prompt: "What is the title of this video?")
```

### 8. Dersi oluştur ve doğrudan yayınla

```bash
curl -s -X POST "$BASE/modules/<MODULE_ID>/lessons" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "title": "<VIDEO BAŞLIĞI>",
    "order": <HESAPLANAN SIRA>,
    "status": "PUBLISHED",
    "contentType": "VIDEO_YOUTUBE",
    "contentUrl": "<KULLANICININ VERDİĞİ URL — list=/index= gibi parametreler dahil, AYNEN>"
  }'
```

`contentUrl` olarak kullanıcının verdiği linki **hiç değiştirmeden** (playlist/index parametreleri
dahil) kullan — `youtube.com/watch?v=ID` deseni regex ile ID'yi doğru ayıklıyor, ekstra parametreler
sorun çıkarmıyor.

### 9. Hesabı eski rolüne döndür ve doğrula

```bash
curl -s -X POST "$BASE/auth/switch-role" -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"role":"STUDENT"}' > /dev/null

STUDENT_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"ogrenci@btkakademi.test","password":"sifre123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "$BASE/courses/<COURSE_ID>" -H "Authorization: Bearer $STUDENT_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)['course']
for m in d['modules']:
    for l in m['lessons']:
        print(l['order'], l['title'], l['status'])
"
```

Yeni dersin listede, `PUBLISHED` durumuyla göründüğünü doğrula.

### 10. Kullanıcıya kısa özet raporla

Kurs, modül, ders başlığı, sıra ve durumu içeren kısa bir tablo/özetle bildir — tüm curl çıktılarını
dökme, yalnızca sonucu özetle.

## Kapsam dışı / dikkat

- Bu skill tek bir videoyu işler. Aynı playlist'ten birden fazla video eklenecekse, skill her video
  için ayrı ayrı çalıştırılmalı (her seferinde yeni URL + aynı kurs adı).
- Taslak (`DRAFT`) olarak eklemek isteniyorsa kullanıcı açıkça belirtmeli; varsayılan davranış
  doğrudan `PUBLISHED`'dir (bu skill'in önceki kullanımlarında kurulan davranış).
- Kurs adı eşleşmesi birden fazla sonuç veriyorsa modülü/kursu otomatik tahmin etme — kullanıcıya
  net seçenekleri göster ve seçmesini iste.
