import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Icon, Text } from '../../../../components';
import type { CalendarEvent, CalendarEventType } from '../../../../types';
import { useUpcomingNotifications } from '../../useUpcomingNotifications';
import { formatCountdown, formatWhen, isImminent } from './countdown';
import styles from './UpcomingAlerts.module.css';

/** Panelde aynı anda gösterilen en fazla bildirim sayısı. */
const VISIBLE_LIMIT = 3;

const TYPE_ICONS: Record<CalendarEventType, string> = {
  lecture: 'co_present',
  lab: 'science',
  exam: 'quiz',
  deadline: 'schedule',
  holiday: 'beach_access',
  event: 'event',
};

function AlertRow({ event }: { event: CalendarEvent }) {
  const urgent = isImminent(event.start, event.allDay);

  return (
    <li className={styles.row}>
      <span className={styles.iconWrap} aria-hidden="true">
        <Icon name={TYPE_ICONS[event.type] ?? 'event'} size="sm" />
      </span>

      <span className={styles.body}>
        <Text role="label-lg" as="span" tone="main" className={styles.title}>
          {event.title}
        </Text>
        <Text role="body-sm" as="span" tone="muted">
          {[event.course?.title, formatWhen(event.start, event.allDay)].filter(Boolean).join(' · ')}
        </Text>
      </span>

      <Badge tone={urgent ? 'warning' : 'info'} variant="soft" shape="pill">
        {formatCountdown(event.start, event.allDay)}
      </Badge>
    </li>
  );
}

/**
 * Panelin en üstünde, girişte görünen yaklaşan eğitim bildirimleri.
 * Yaklaşan etkinlik yoksa veya kullanıcı kapattıysa hiç render edilmez.
 */
export function UpcomingAlerts() {
  const { events, loading, error } = useUpcomingNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(
    () => (expanded ? events : events.slice(0, VISIBLE_LIMIT)),
    [events, expanded],
  );

  // Sessiz başarısızlık: bildirim ikincil bilgidir, panelin önüne hata basmayız.
  if (loading || error || dismissed || events.length === 0) return null;

  const hidden = events.length - visible.length;

  return (
    <section className={styles.wrapper} aria-label="Yaklaşan eğitimler">
      <div className={styles.header}>
        <Icon name="notifications_active" size="sm" />
        <Text role="title-md" as="h2" tone="main">
          Yaklaşan eğitimler
        </Text>
        <button type="button" className={styles.dismiss} onClick={() => setDismissed(true)} aria-label="Bildirimleri kapat">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <ul className={styles.list}>
        {visible.map((event) => (
          <AlertRow key={event.id} event={event} />
        ))}
      </ul>

      <div className={styles.footer}>
        {hidden > 0 && (
          <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
            <Text role="label-md" as="span" tone="secondary">
              {`${hidden} eğitim daha`}
            </Text>
          </button>
        )}
        <Link to="/takvim" className={styles.calendarLink}>
          <Text role="label-md" as="span" tone="secondary">
            Takvimi aç
          </Text>
          <Icon name="chevron_right" size="sm" />
        </Link>
      </div>
    </section>
  );
}
