# Faz 8 — Eğitmen/Admin Ödev Yönetim Arayüzü

## Amaç

Panelin "yönetilebilir" olma şartının frontend tarafını tamamlamak: eğitmen/admin'in ödev
oluşturup/düzenleyip/silebileceği ve teslimleri notlandırabileceği bir ekran.

## Bağımlılık

Faz 3 (yönetim API'leri) zorunlu.

## Referans Kalıp

`web/src/features/admin/exams/` klasörü birebir şablon alınır:
- `data/examApi.ts` → ince `useApiResource` sarmalayıcıları + `apiFetch` tabanlı mutasyon fonksiyonları.
- `AdminExamsPage.tsx` → liste + "Yeni Sınav" diyaloğu (`ExamCreateDialog.tsx`).
- `ExamEditorPage.tsx` → tek kaydın ayrıntı/düzenleme ekranı (ayarlar formu + alt paneller).

## Yeni Dosyalar

### `web/src/features/admin/assignments/data/assignmentApi.ts`

`examApi.ts` ile birebir aynı yapı:

```ts
export function useManagedAssignments(courseId?: string, status?: string) { ... } // GET /assignments/manage
export function useAssignmentDetail(id: string | undefined) { ... }              // GET /assignments/:id
export function createAssignment(input: NewAssignmentInput): Promise<...> { ... } // POST
export function updateAssignment(id, patch): Promise<...> { ... }                 // PATCH
export function deleteAssignment(id): Promise<void> { ... }                       // DELETE
export function gradeSubmission(assignmentId, userId, body): Promise<...> { ... } // PUT grade
```

### `web/src/features/admin/assignments/AdminAssignmentsPage.tsx`

`AdminExamsPage.tsx` deseninde: kurs filtresi, durum filtresi (Taslak/Yayında), tablo/kart listesi,
"Yeni Ödev" butonu → `AssignmentCreateDialog`.

### `web/src/features/admin/assignments/components/AssignmentCreateDialog.tsx`

`ExamCreateDialog.tsx` deseninde: kurs seçimi (yalnızca çağıranın yönetebildiği kurslar — bu liste
zaten `GET /api/v1/courses` veya mevcut bir "benim kurslarım" kaynağından geliyor, `ExamCreateDialog`
nasıl dolduruyorsa aynı kaynak kullanılır), başlık, tür (`HOMEWORK`/`LAB`/`PROJECT`), teslim tarihi.

### `web/src/features/admin/assignments/AssignmentEditorPage.tsx`

`ExamEditorPage.tsx` deseninde, sekmeli/bölümlü yapı:
1. **Ayarlar formu** (`AssignmentSettingsForm.tsx`): açıklama, teslim tarihi, geç teslim izni/cezası,
   maksimum puan, kabul edilen dosya tipleri, ek dosya yükleme (Faz 2 varsa), `status` (Taslak/Yayında)
   değiştirme.
2. **Teslimler paneli** (`SubmissionsPanel.tsx`): `GET /assignments/:id` yanıtındaki `submissions`
   listesi — öğrenci adı, teslim zamanı, geç mi, not girme alanı (inline veya diyalog), geri bildirim
   metni. `ExamCandidatesPanel.tsx`'teki tablo/satır düzenine benzer.

## Route Kayıtları

`web/src/routes/index.tsx`'e, `ADMIN`+`INSTRUCTOR` izinli grup içine (mevcut
`yonetim/sinavlar`/`yonetim/sinavlar/:examId` satırlarının yanına):

```tsx
{ path: 'yonetim/odevler', element: <AdminAssignmentsPage /> },
{ path: 'yonetim/odevler/:assignmentId', element: <AssignmentEditorPage /> },
```

`web/src/layout/Sidebar/navItems.ts`'e bir giriş eklenip eklenmeyeceği karar verilmeli — mevcut
yönetim menüsünde "Sınavlar" zaten var; "Ödevler" için de benzer bir giriş eklenmesi tutarlılık
açısından önerilir (CLAUDE.md: "Yollar layout/Sidebar/navItems.ts ile birebir eşleşir" kuralı
gereği route eklenirse nav item de eklenmelidir).

## Kabul Kriterleri

- [ ] INSTRUCTOR yalnızca kendi kurslarını ödev oluştururken seçebiliyor.
- [ ] Taslak ödev öğrenciye (dashboard/`/notlar-ve-gorevler`'de) görünmüyor, Yayında'ya alınca görünüyor.
- [ ] Teslimler panelinde öğrencinin notu/dosyası görüntülenip puan+geri bildirim girilebiliyor.
- [ ] Ödev silindiğinde teslimleri de siliniyor (cascade), dashboard/panel 404 vermeden güncelleniyor.
- [ ] `npm run typecheck` (web) temiz.
- [ ] Sidebar/route eşleşmesi CLAUDE.md kuralına uygun (ikisi birlikte güncellendi).
