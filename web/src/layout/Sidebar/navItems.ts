export interface NavItem {
  path: string;
  label: string;
  icon: string;
}

/**
 * Menü artık DB üzerinden (GET /api/v1/nav-items/me, bkz. useNavItems.ts)
 * yüklenir. Bu liste yalnızca yükleme sırasında / istek hata verdiğinde
 * gösterilecek bir yedek (fallback): öğrencilerin de erişebildiği 5 ortak
 * sayfa. Admin'e özel "Menü Yönetimi" bağlantısı Sidebar.tsx içinde
 * role === 'ADMIN' olduğunda istemci tarafında eklenir (bkz. Sidebar.tsx),
 * tıpkı daha önce "Kurs Yönetimi" girişinin eklendiği gibi.
 */
export const FALLBACK_NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Genel Bakış', icon: 'grid_view' },
  { path: '/kurslarim', label: 'Kurslarım / Dersler', icon: 'school' },
  { path: '/duyurular', label: 'Duyurular', icon: 'campaign' },
  { path: '/takvim', label: 'Takvim', icon: 'calendar_today' },
  { path: '/notlar-ve-gorevler', label: 'Notlar & Görevler', icon: 'assignment_turned_in' },
  { path: '/sinavlar', label: 'Sınavlar', icon: 'quiz' },
];

/** Yalnizca ADMIN icin kullanici yonetimi; DB'de ayni yol varsa tekrar eklenmez. */
export const USER_MANAGEMENT_ITEM: NavItem = {
  path: '/yonetim/kullanicilar',
  label: 'Kullanıcı Yönetimi',
  icon: 'manage_accounts',
};

export const ADMIN_MENU_MANAGEMENT_ITEM: NavItem = {
  path: '/yonetim/menu',
  label: 'Menü Yönetimi',
  icon: 'list_alt',
};

/** ADMIN ve INSTRUCTOR icin takvim yonetimi; DB'de ayni yol varsa tekrar eklenmez. */
export const CALENDAR_MANAGEMENT_ITEM: NavItem = {
  path: '/yonetim/takvim',
  label: 'Takvim Yönetimi',
  icon: 'edit_calendar',
};

/** ADMIN ve INSTRUCTOR icin duyuru yonetimi; DB'de ayni yol varsa tekrar eklenmez. */
export const ANNOUNCEMENT_MANAGEMENT_ITEM: NavItem = {
  path: '/yonetim/duyurular',
  label: 'Duyuru Yönetimi',
  icon: 'edit_note',
};

/** ADMIN ve INSTRUCTOR icin sinav yonetimi; DB'de ayni yol varsa tekrar eklenmez. */
export const EXAM_MANAGEMENT_ITEM: NavItem = {
  path: '/yonetim/sinavlar',
  label: 'Sınav Yönetimi',
  icon: 'fact_check',
};

/** ADMIN ve INSTRUCTOR icin soru bankasi; DB'de ayni yol varsa tekrar eklenmez. */
export const QUESTION_BANK_ITEM: NavItem = {
  path: '/yonetim/soru-bankasi',
  label: 'Soru Bankası',
  icon: 'library_books',
};

/** ADMIN ve INSTRUCTOR icin odev yonetimi; DB'de ayni yol varsa tekrar eklenmez. */
export const ASSIGNMENT_MANAGEMENT_ITEM: NavItem = {
  path: '/yonetim/odevler',
  label: 'Ödev Yönetimi',
  icon: 'assignment_turned_in',
};
