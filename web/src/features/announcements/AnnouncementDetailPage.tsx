import { Link, useParams } from 'react-router-dom';
import { Badge, Card, Icon, RichText, Text } from '../../components';
import { PageContainer } from '../../layout/PageContainer';
import { CATEGORIES, STATES, formatDateTime } from './announcementMeta';
import { useAnnouncement } from './useAnnouncements';
import styles from './AnnouncementDetailPage.module.css';

export function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { announcement, loading, error } = useAnnouncement(id);

  return (
    <PageContainer>
      <Link to="/duyurular" className={styles.back}>
        <Icon name="arrow_back" size="sm" />
        Tüm duyurular
      </Link>

      {loading && (
        <Text role="body-md" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}
      {!loading && (error || !announcement) && (
        <Card padding="lg" elevation="1">
          <Text role="body-md" tone="error" as="p">
            {error ?? 'Duyuru bulunamadı.'}
          </Text>
        </Card>
      )}

      {!loading && announcement && (
        <Card as="article" padding="lg" elevation="1" className={styles.article}>
          <div className={styles.badges}>
            <Badge tone={CATEGORIES[announcement.category].badgeTone} icon={CATEGORIES[announcement.category].icon}>
              {CATEGORIES[announcement.category].label}
            </Badge>
            {announcement.course && <Badge tone="cyan">{announcement.course.title}</Badge>}
            {announcement.pinned && (
              <Badge tone="secondary" icon="push_pin">
                Sabitlenmiş
              </Badge>
            )}
            {/* Okuyucu yalnızca yayındakileri görür; diğer durumlar yalnızca yöneticilere gösterilir. */}
            {announcement.state !== 'PUBLISHED' && (
              <Badge tone={STATES[announcement.state].tone} icon={STATES[announcement.state].icon}>
                {STATES[announcement.state].label}
              </Badge>
            )}
          </div>

          <Text role="headline-md" as="h1" className={styles.title}>
            {announcement.title}
          </Text>

          <Text role="body-sm" tone="muted" as="p" className={styles.meta}>
            {announcement.author?.name ?? 'BTK Akademi'}
            {announcement.publishAt && (
              <>
                {' · '}
                <time dateTime={announcement.publishAt}>{formatDateTime(announcement.publishAt)}</time>
              </>
            )}
          </Text>

          <RichText body={announcement.body} />

          {announcement.canEdit && (
            <Link to={`/yonetim/duyurular?duzenle=${announcement.id}`} className={styles.editLink}>
              <Icon name="edit" size="sm" />
              Düzenle
            </Link>
          )}
        </Card>
      )}
    </PageContainer>
  );
}
