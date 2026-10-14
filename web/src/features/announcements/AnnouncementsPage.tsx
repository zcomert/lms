import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Icon, Text, stripMarkdown } from '../../components';
import { PageContainer } from '../../layout/PageContainer';
import { useCurrentUser } from '../../data/useCurrentUser';
import type { AnnouncementCategory } from '../../types';
import { CATEGORIES, CATEGORY_KEYS, formatRelative, sourceLabel } from './announcementMeta';
import { useAnnouncements } from './useAnnouncements';
import styles from './AnnouncementsPage.module.css';

export function AnnouncementsPage() {
  const { user } = useCurrentUser();
  const [category, setCategory] = useState<AnnouncementCategory | undefined>(undefined);
  const { announcements, loading, error } = useAnnouncements({ category });
  const canManage = user?.role === 'ADMIN' || user?.role === 'INSTRUCTOR';

  const latest = announcements.reduce<string | null>(
    (max, a) => (a.publishAt && (!max || a.publishAt > max) ? a.publishAt : max),
    null,
  );

  return (
    <PageContainer>
      <div className={styles.header}>
        <div>
          <Text role="headline-lg" as="h1">
            Duyurular
          </Text>
          <Text role="body-md" tone="muted" as="p">
            {loading
              ? 'Yükleniyor…'
              : `${announcements.length} duyuru${latest ? ` · En son ${formatRelative(latest)}` : ''}`}
          </Text>
        </div>
        {canManage && (
          <Link to="/yonetim/duyurular" className={styles.manageLink}>
            <Icon name="edit_note" size="sm" />
            Duyuruları yönet
          </Link>
        )}
      </div>

      <div className={styles.filters} role="group" aria-label="Kategoriye göre süz">
        <button
          type="button"
          className={styles.chip}
          aria-pressed={category === undefined}
          onClick={() => setCategory(undefined)}
        >
          Tümü
        </button>
        {CATEGORY_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={styles.chip}
            aria-pressed={category === key}
            onClick={() => setCategory(key)}
          >
            {CATEGORIES[key].label}
          </button>
        ))}
      </div>

      {error && (
        <Text role="body-md" tone="error" as="p" className={styles.message}>
          {error}
        </Text>
      )}
      {!loading && !error && announcements.length === 0 && (
        <Card padding="lg" elevation="1">
          <Text role="body-md" tone="muted" as="p">
            {category ? 'Bu kategoride yayında duyuru yok.' : 'Henüz yayınlanmış bir duyuru yok.'}
          </Text>
        </Card>
      )}

      <ul className={styles.list}>
        {announcements.map((ann) => {
          const meta = CATEGORIES[ann.category];
          return (
            <li key={ann.id}>
              <Card padding="lg" elevation="1">
                <Link to={`/duyurular/${ann.id}`} className={styles.announcementItem}>
                  <span className={[styles.iconSection, styles[`icon-${meta.iconTone}`]].join(' ')}>
                    <Icon name={meta.icon} size="md" filled />
                  </span>

                  <span className={styles.content}>
                    <span className={styles.titleBar}>
                      <Text role="title-md" as="h2" tone="main">
                        {ann.pinned && (
                          <span className={styles.pin}>
                            <Icon name="push_pin" size="sm" filled />
                            <span className={styles.srOnly}>Sabitlenmiş: </span>
                          </span>
                        )}
                        {ann.title}
                      </Text>
                      <Badge tone={meta.badgeTone} variant="soft">
                        {meta.label}
                      </Badge>
                    </span>

                    <Text role="body-md" tone="muted" as="p" className={styles.excerpt}>
                      {stripMarkdown(ann.body)}
                    </Text>

                    <Text role="body-sm" tone="muted">
                      {sourceLabel(ann)}
                      {ann.publishAt && ` · ${formatRelative(ann.publishAt)}`}
                    </Text>
                  </span>

                  <Icon name="arrow_forward" size="sm" />
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
