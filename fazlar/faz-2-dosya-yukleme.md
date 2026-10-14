# Faz 2 — Dosya Yükleme Altyapısı

## Amaç

NFR-72 ("Yüklenen dosyalar yerel dosya sisteminde, veritabanı dışında saklanmalıdır; veritabanı
yalnızca meta veri ve dosya yolunu tutmalıdır") uyarınca genel amaçlı, yeniden kullanılabilir bir
dosya yükleme uç noktası kurmak. Hem eğitmenin ödev eki (`Assignment.attachmentUrl`) hem öğrencinin
teslim dosyası (`AssignmentSubmission.fileUrl`) bunu kullanır.

## Bağımlılık

Faz 1 (şema) ile paralel geliştirilebilir; Faz 3/4'ün dosya alanlarını kullanabilmesi için ondan
**önce bitmiş olması** gerekir. İstenirse MVP'de Faz 3-4-5-6 **dosyasız** (yalnızca metin/link teslimi
ile) devreye alınıp bu faz sonradan eklenebilir — `fileUrl`/`attachmentUrl` alanları zaten nullable.

## Kapsam

Şu an projede **hiç** multipart/form-data işleyen bir uç nokta yok (`server/src/app.ts`'de
`@fastify/multipart` kayıtlı değil). Tüm medya `contentUrl` gibi düz string URL alanlarıyla yönetiliyor.
Bu faz, minimum ve genel bir "dosya yükle → URL al" akışı kurar; her özelliğe özel ayrı upload
endpoint'i **yazılmaz**.

## Teknik Tasarım

### Bağımlılık ekleme

```bash
cd server
npm install @fastify/multipart
```

### Depolama

- `server/uploads/` klasörü (gitignore'a eklenir), alt klasörler: `uploads/assignments/`.
- Dosya adı çakışmasını önlemek için `${cuid()}-${sanitizedOriginalName}` biçiminde saklanır.
- Yalnızca meta veri (`fileUrl`, `fileName`) DB'de tutulur; ikilik veri asla DB'ye yazılmaz.

### Uç Nokta

`server/src/routes/uploads.ts` (yeni dosya):

```
POST /api/v1/uploads
Header: Authorization: Bearer <token> (giriş yapmış herhangi bir rol)
Content-Type: multipart/form-data, alan adı: "file"
```

- Boyut sınırı: 10 MB (Fastify multipart `limits.fileSize`); aşılırsa 400 `FILE_TOO_LARGE`.
- İzin verilen uzantılar: `pdf, doc, docx, xls, xlsx, ppt, pptx, zip, rar, txt, png, jpg, jpeg`
  (genel amaçlı liste — ödeve özgü `acceptedFileTypes` kısıtlaması **Faz 4**'te teslim sırasında
  ayrıca kontrol edilir, bu uç nokta yalnızca genel bir kara/beyaz liste uygular).
- Dosya adı yoksa veya `file` alanı eksikse 400 `VALIDATION_ERROR`.
- 201: `{ "file": { "url": "/uploads/assignments/xxxxx-rapor.pdf", "name": "rapor.pdf", "size": 123456 } }`

### Statik Sunum

`app.ts` içine `@fastify/static` ile `/uploads` prefix'i `server/uploads/` klasörüne bağlanır
(salt okunur, dizin listeleme kapalı). Böylece `fileUrl` doğrudan `<a href>` ile indirilebilir.

```bash
npm install @fastify/static
```

### Güvenlik Notları

- Yüklenen dosya adı path traversal'a karşı temizlenir (`../` vb. reddedilir).
- MIME/uzantı kontrolü hem uzantıya hem (mümkünse) içerik tipine bakar; yürütülebilir uzantılar
  (`exe, sh, bat, js, php`) her koşulda reddedilir.
- Uç nokta kimlik doğrulama gerektirir; anonim yükleme kapalı.

## Değişecek/Eklenecek Dosyalar

- `server/src/routes/uploads.ts` (yeni) — route + testler (`uploads.test.ts`)
- `server/src/app.ts` — `registerUploadRoutes(app)` + `@fastify/static` kaydı
- `server/.gitignore` — `uploads/` eklenir
- `server/CONTRACT.md` — yeni "Uploads (Dosya Yükleme)" bölümü

## Kabul Kriterleri

- [ ] `curl -F file=@test.pdf http://localhost:4000/api/v1/uploads -H "Authorization: Bearer <token>"`
      201 ile `{ file: { url, name, size } }` döner.
- [ ] Dönen `url` tarayıcıda doğrudan açılıp dosya indirilebiliyor.
- [ ] 10MB üstü dosya 400 `FILE_TOO_LARGE` ile reddediliyor.
- [ ] `.exe` gibi izin verilmeyen uzantı 400 ile reddediliyor.
- [ ] Token olmadan istek 401 dönüyor.
