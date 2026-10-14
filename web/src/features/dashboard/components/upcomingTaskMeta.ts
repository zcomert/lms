import { formatRelative } from '../../announcements/announcementMeta';
import { formatDuration } from '../../exams/examMeta';
import type { UpcomingTask, UpcomingTaskRaw } from '../../../types';

const HOUR = 60 * 60 * 1000;

const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Ham `upcoming-tasks` öğesini `<UpcomingTasks>` bileşeninin beklediği sunum biçimine çevirir. */
export function toUpcomingTask(raw: UpcomingTaskRaw, now = Date.now()): UpcomingTask {
  if (raw.kind === 'EXAM') {
    const metaDate = raw.startsAt ?? raw.endsAt;
    return {
      id: raw.id,
      kind: 'exam',
      tagLabel: 'Çevrim İçi Sınav',
      tagTone: 'brand',
      tagIcon: 'quiz',
      dueLabel: raw.startsAt ? formatRelative(raw.startsAt, now) : 'Şu an açık',
      title: raw.title,
      description: raw.description ?? '',
      metaIcon: 'timelapse',
      metaLabel: metaDate ? dateTimeFormat.format(new Date(metaDate)) : 'Zaman sınırı yok',
      durationLabel: formatDuration(raw.durationMinutes ?? null),
      actionLabel: 'Detaylar',
    };
  }

  const isLab = raw.assignmentType === 'LAB';
  const isUrgent = raw.isPastDue || (raw.dueAt && new Date(raw.dueAt).getTime() - now < 48 * HOUR);

  return {
    id: raw.id,
    kind: isLab ? 'lab' : 'assignment',
    tagLabel: isLab ? 'Laboratuvar' : raw.assignmentType === 'PROJECT' ? 'Proje' : isUrgent ? 'Yüksek Öncelik' : 'Ödev',
    tagTone: isUrgent ? 'error' : isLab ? 'neutral' : 'brand',
    tagIcon: isUrgent ? 'priority_high' : isLab ? undefined : 'assignment',
    dueLabel: raw.dueAt ? formatRelative(raw.dueAt, now) : '',
    title: raw.title,
    description: raw.description ?? '',
    metaIcon: 'schedule',
    metaLabel: raw.dueAt ? dateTimeFormat.format(new Date(raw.dueAt)) : '',
    actionLabel: 'Teslim Et',
  };
}
