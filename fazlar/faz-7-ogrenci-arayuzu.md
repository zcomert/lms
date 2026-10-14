# Faz 7 — Öğrenci Arayüzü: "Teslim Et" Akışı ve "Notlar & Görevler" Sayfası

## Amaç

Dashboard panelindeki "Teslim Et" aksiyonunu gerçek bir teslim akışına bağlamak ve zaten var olan
ama şu an statik mock veriyle çalışan `web/src/features/assignments/AssignmentsPage.tsx`
(`/notlar-ve-gorevler`) sayfasını gerçek veriye geçirmek.

## Bağımlılık

Faz 4 (öğrenci teslim API'leri) zorunlu. Faz 6 (dashboard entegrasyonu) ile paralel ilerleyebilir;
ikisi de aynı `useApiResource`/meta-dosya desenini kullanır.

## 7.1 — `AssignmentsPage.tsx`'i Gerçek Veriye Bağlama

Mevcut dosyadaki `Assignment` arayüzü ve `status: 'pending'|'submitted'|'graded'|'late'` tipi,
Faz 4'teki `GET /assignments/my` yanıtının `status` alanıyla (`PENDING|SUBMITTED|GRADED|LATE`)
**kasıtlı olarak** eşleşecek şekilde tasarlandı (bkz. `faz-4-ogrenci-api.md`). Bu yüzden:

- Yerel sabit `assignments: Assignment[]` dizisi kaldırılır.
- `web/src/features/assignments/useMyAssignments.ts` (yeni, `useMyExams.ts` birebir kopyası deseninde):
  ```ts
  import { useApiResource } from '../../lib/useApiResource';
  import type { MyAssignment } from '../../types';

  export function useMyAssignments() {
    const { data, loading, error } = useApiResource<{ assignments: MyAssignment[]; serverTime: string }>(
      '/api/v1/assignments/my',
    );
    return { assignments: data?.assignments ?? [], loading, error };
  }
  ```
- `web/src/features/assignments/assignmentMeta.ts` (yeni, `examMeta.ts` deseninde): `getStatusInfo`
  fonksiyonu (şu an component içinde satır içi tanımlı) buraya taşınır ve büyük harfli backend
  durumlarına (`PENDING` vb.) göre çalışacak şekilde güncellenir; `tone`/`label` eşlemesi zaten
  mevcut kodda var, yalnızca anahtar isimleri değişir.
- `AssignmentsPage.tsx`: `useMyAssignments()` çağrılır, `loading`/`error`/boş durum eklenir
  (Faz 6'daki `UpcomingTasks` ile aynı prensip). `<a href="#">` tıklanınca bir teslim diyalogu açılır
  (bkz. 7.2).
- `web/src/types/index.ts`'e `MyAssignment` arayüzü eklenir (Faz 4'teki `GET /assignments/my`
  yanıt şekliyle birebir).

## 7.2 — Teslim Diyalogu

Yeni bileşen: `web/src/features/assignments/components/SubmitAssignmentDialog.tsx`.

- Açılış tetikleyicisi: dashboard panelindeki "Teslim Et" linki **veya** `AssignmentsPage`'teki
  ödev kartı tıklanması (her ikisi de aynı diyaloğu, `assignmentId` prop'uyla açar — dashboard'dan
  tıklanırsa önce `/notlar-ve-gorevler?assignmentId=...` gibi bir query ile sayfaya yönlenip orada
  diyalog otomatik açılabilir, ya da basitçe dashboard linki doğrudan `/notlar-ve-gorevler`'e gider
  ve öğrenci oradan ilgili karta tıklar — **ilk MVP için ikinci, daha basit seçenek tercih edilir**;
  otomatik diyalog açma ayrı bir ince katman, gerekirse sonradan eklenir).
- Alanlar: çok satırlı metin (`note`), dosya seçici (`<input type="file">` → Faz 2'nin
  `POST /api/v1/uploads` uç noktasına yüklenir, dönen `url`/`name` forma yazılır) — **Faz 2 henüz
  uygulanmadıysa** bu diyalog yalnızca metin alanıyla gönderilir (dosya alanı koşullu olarak
  gizlenir/disabled gösterilir, "Dosya yükleme yakında" notu).
- Gönderim: `apiFetch(`/api/v1/assignments/${id}/submission`, { method: 'POST', body: ... })`.
- Başarılı teslim sonrası: diyalog kapanır, `AssignmentsPage` listesi `reload()` ile tazelenir
  (`useApiResource`'un döndürdüğü `reload` fonksiyonu — `useMyAssignments` bunu da dışa vermeli).
- Ödevin `acceptedFileTypes` doluysa, dosya seçicide `accept="..."` attribute'u ile tarayıcı
  seviyesinde de kısıtlama gösterilir (backend zaten Faz 4'te doğruluyor, bu yalnızca UX).

## 7.3 — Sınav "Detaylar" Linki

Dashboard panelindeki sınav kartının "Detaylar" aksiyonu zaten var olan `/sinavlar` sayfasına
yönlendirilir (Faz 6'da `react-router-dom` `Link` ile bağlandı). `ExamsPage.tsx`'in zaten bu veriyi
gösterdiği doğrulanmalı — yeni bir detay sayfası **bu fazın kapsamında değildir** (sınav alma akışı
projenin genel kapsamı dışında, bkz. `00-genel-bakis.md`).

## Değişecek/Eklenecek Dosyalar

- `web/src/features/assignments/useMyAssignments.ts` (yeni)
- `web/src/features/assignments/assignmentMeta.ts` (yeni)
- `web/src/features/assignments/components/SubmitAssignmentDialog.tsx` (yeni)
- `web/src/features/assignments/AssignmentsPage.tsx` (düzenlenir — mock veri kaldırılır)
- `web/src/types/index.ts` (`MyAssignment` eklenir)

## Kabul Kriterleri

- [ ] `/notlar-ve-gorevler` sayfası gerçek DB verisini (eğitmenin Faz 8'de oluşturduğu ödevleri)
      listeliyor, mock veri tamamen kaldırıldı.
- [ ] Öğrenci metin girerek teslim yapabiliyor; teslim sonrası durum `PENDING` → `SUBMITTED`'e
      dönüyor ve dashboard panelinden o görev kayboluyor (Faz 5'in filtresi sayesinde).
- [ ] Dosya yükleme (Faz 2 uygulandıysa) uçtan uca çalışıyor; uygulanmadıysa diyalog zarif biçimde
      yalnızca metin kabul ediyor.
- [ ] Notlandırılmış bir ödev `GRADED` rozetiyle, puan ve geri bildirimle görünüyor.
- [ ] Tarayıcıda (Chrome dev tools / `run` skill) uçtan uca akış (ödev oluştur → teslim et → notlandır
      → sayfada gör) manuel doğrulanıyor.
