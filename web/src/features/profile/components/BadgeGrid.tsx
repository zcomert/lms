import { Icon, Text } from '../../../components';
import { formatDate } from '../../../lib/certificates';
import type { AchievementBadge } from '../../../types';
import styles from './BadgeGrid.module.css';

interface BadgeGridProps {
  badges: AchievementBadge[];
  emptyText?: string;
}

export function BadgeGrid({ badges, emptyText = 'Henüz rozet kazanmadın.' }: BadgeGridProps) {
  if (badges.length === 0) {
    return (
      <Text role="body-md" tone="muted" as="p">
        {emptyText}
      </Text>
    );
  }
  return (
    <ul className={styles.grid}>
      {badges.map((b) => (
        <li key={b.id} className={styles.item} title={b.description}>
          <span className={styles.iconWrap} aria-hidden="true">
            <Icon name={b.icon} size="lg" filled />
          </span>
          <Text role="title-md" as="p" tone="main">
            {b.name}
          </Text>
          <Text role="body-sm" as="p" tone="muted">
            {b.label}
          </Text>
          <Text role="body-sm" as="p" tone="muted">
            {formatDate(b.earnedAt)}
          </Text>
        </li>
      ))}
    </ul>
  );
}
