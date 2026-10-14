import { NavLink } from 'react-router-dom';
import { Icon, Text } from '../../components';
import type { UserProfile } from '../../types';
import { useNavItems } from '../../data/useNavItems';
import {
  ADMIN_MENU_MANAGEMENT_ITEM,
  ANNOUNCEMENT_MANAGEMENT_ITEM,
  ASSIGNMENT_MANAGEMENT_ITEM,
  CALENDAR_MANAGEMENT_ITEM,
  EXAM_MANAGEMENT_ITEM,
  FALLBACK_NAV_ITEMS,
  QUESTION_BANK_ITEM,
  USER_MANAGEMENT_ITEM,
} from './navItems';
import styles from './Sidebar.module.css';

interface SidebarProps {
  user: UserProfile | null;
  /** Mobil çekmecenin açık olup olmadığı. Masaüstünde yok sayılır. */
  isOpen: boolean;
  onNavigate: () => void;
}

export function Sidebar({ user, isOpen, onNavigate }: SidebarProps) {
  const { items, loading } = useNavItems(user?.role);
  const baseItems = loading || items.length === 0 ? FALLBACK_NAV_ITEMS : items;
  const isStaff = user?.role === 'ADMIN' || user?.role === 'INSTRUCTOR';
  const staffItems = isStaff
    ? [
        CALENDAR_MANAGEMENT_ITEM,
        ANNOUNCEMENT_MANAGEMENT_ITEM,
        EXAM_MANAGEMENT_ITEM,
        ASSIGNMENT_MANAGEMENT_ITEM,
        QUESTION_BANK_ITEM,
      ].filter(
        (extra) => !baseItems.some((item) => item.path === extra.path),
      )
    : [];
  const withStaff = [...baseItems, ...staffItems];
  const adminItems = [USER_MANAGEMENT_ITEM, ADMIN_MENU_MANAGEMENT_ITEM].filter(
    (extra) => !withStaff.some((item) => item.path === extra.path),
  );
  const navItems = user?.role === 'ADMIN' ? [...withStaff, ...adminItems] : withStaff;

  return (
    <aside
      className={[styles.sidebar, isOpen ? styles.open : null].filter(Boolean).join(' ')}
      aria-label="Ana gezinme"
    >
      <div>
        <div className={styles.brand}>
          <img src="/logo.png" alt="" className={styles.logo} />
          <span className={styles.brandText}>
            <Text role="title-md" tone="primary">
              Akademi LMS
            </Text>
            <Text role="label-md" tone="secondary">
              Öğrenci Portalı
            </Text>
          </span>
        </div>

        <p className={[styles.sectionLabel, 'label-md'].join(' ')}>Menü</p>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                [styles.navItem, isActive ? styles.navItemActive : null]
                  .filter(Boolean)
                  .join(' ')
              }
            >
              <Icon name={item.icon} size="lg" />
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className={styles.assistantCard}>
        <Icon name="auto_awesome" size="md" className={styles.assistantIcon} />
        <span className={styles.assistantText}>
          <Text role="label-lg" tone="main">
            Akıllı Asistan
          </Text>
          <Text role="body-sm" tone="muted">
            Ders özetleri ve sınav hazırlığı aktif
          </Text>
        </span>
      </div>
    </aside>
  );
}
