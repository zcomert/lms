import { PageContainer } from '../../layout/PageContainer';
import { useDashboardData } from '../../data/useDashboardData';
import { useCurrentUser } from '../../data/useCurrentUser';
import { useCourses } from '../courses/useCourses';
import { useStudyActivity } from './useStudyActivity';
import { useMascot } from './useMascot';
import { useMyGrades } from './useMyGrades';
import { useAnnouncements } from '../announcements/useAnnouncements';
import { formatRelative, sourceLabel } from '../announcements/announcementMeta';
import type { Announcement, AnnouncementItem, GradeSummary, KpiMetric } from '../../types';
import {
  AiGuideCard,
  AnnouncementsFeed,
  ContinueLearningCard,
  EnrolledCourses,
  KpiGrid,
  UpcomingTasks,
  WeeklyActivityChart,
  WelcomeBanner,
} from './components';
import styles from './DashboardPage.module.css';

const formatHours = (hours: number) => hours.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

type AverageTile = Pick<KpiMetric, 'value' | 'unit' | 'footnote' | 'footnoteIcon'>;

/** "Ortalama Başarı" kartının değer, birim ve dipnot metinleri (GET /users/me/grades özetinden). */
function describeAverage(summary: GradeSummary): AverageTile {
  if (summary.averageScore === null || summary.gradeCount === 0) {
    return { value: '—', unit: '', footnote: 'Henüz quiz notu yok', footnoteIcon: 'info' };
  }

  const value = `%${summary.averageScore}`;
  const unit = [summary.letterGrade, summary.level].filter(Boolean).join(' / ');
  const { trend } = summary;

  if (trend === null) {
    return { value, unit, footnote: `${summary.gradeCount} quiz notu`, footnoteIcon: 'quiz' };
  }
  if (trend > 0) {
    return { value, unit, footnote: `Son quizde +%${trend}`, footnoteIcon: 'trending_up' };
  }
  if (trend < 0) {
    return { value, unit, footnote: `Son quizde -%${Math.abs(trend)}`, footnoteIcon: 'trending_down' };
  }
  return { value, unit, footnote: 'Son quizde değişim yok', footnoteIcon: 'trending_flat' };
}

/** API duyurusunu panel akışı satırına çevirir: sabitlenen vurgulu, kurs duyurusu camgöbeği. */
function toFeedItem(item: AnnouncementItem): Announcement {
  return {
    id: item.id,
    title: item.title,
    source: sourceLabel(item),
    timeAgo: item.publishAt ? formatRelative(item.publishAt) : '',
    tone: item.pinned ? 'secondary' : item.course ? 'cyan' : 'muted',
  };
}

export function DashboardPage() {
  const data = useDashboardData();
  const { user } = useCurrentUser();
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();
  const study = useStudyActivity();
  const mascot = useMascot();
  const myGrades = useMyGrades();
  const feed = useAnnouncements({ limit: 3 });
  const greeting = user ? `Hoş geldin, ${user.name} 👋` : 'Hoş geldin 👋';
  const studyReady = !study.loading && !study.error;
  const coursesReady = !coursesLoading && !coursesError;
  const gradeSummary = !myGrades.loading && !myGrades.error ? myGrades.summary : null;

  const completedCourses = courses.filter((course) => course.progress?.percent === 100).length;
  const completedLessons = courses.reduce((sum, course) => sum + (course.progress?.completedCount ?? 0), 0);
  const totalLessons = courses.reduce((sum, course) => sum + (course.progress?.totalLessons ?? 0), 0);
  const completedPercent = totalLessons ? Math.round((100 * completedLessons) / totalLessons) : 0;

  const kpis: KpiMetric[] = data.kpis.map((metric) => {
    switch (metric.id) {
      case 'enrolled':
        return {
          ...metric,
          value: coursesReady ? String(courses.length) : '—',
          unit: 'Kurs',
          footnote: coursesReady ? `${completedCourses} kurs tamamlandı` : undefined,
          footnoteIcon: 'check_circle',
        };
      case 'completed':
        // Yüklenirken/hatada `progress` verilmez; böylece sahte bir ilerleme çubuğu çizilmez.
        return {
          ...metric,
          value: coursesReady ? String(completedLessons) : '—',
          unit: coursesReady ? `/${totalLessons}  %${completedPercent}` : undefined,
          progress: coursesReady ? completedPercent : undefined,
        };
      case 'average':
        return {
          ...metric,
          ...(gradeSummary
            ? describeAverage(gradeSummary)
            : { value: '—', unit: undefined, footnote: undefined, footnoteIcon: undefined }),
        };
      case 'studytime':
        return {
          ...metric,
          value: studyReady && study.monthHours !== null ? formatHours(study.monthHours) : '—',
          unit: 'Saat / Bu Ay',
          footnote:
            studyReady && study.weekHours !== null ? `Son 7 gün: ${formatHours(study.weekHours)} saat` : undefined,
          footnoteIcon: 'schedule',
        };
      default:
        return metric;
    }
  });
  // Seri ve bugünkü süre gerçek aktiviteden; haftalık hedef henüz sunucuda yok, fixture'dan gelir.
  const term = {
    ...data.term,
    streakDays: study.streakDays ?? 0,
    minutesCompletedToday: study.todayMinutes ?? 0,
  };

  return (
    <PageContainer>
      <WelcomeBanner
        greeting={greeting}
        summary={data.weeklyGoalSummary}
        term={term}
        activity={study.activity}
        mascot={{
          state: mascot.state,
          loading: mascot.loading,
          error: mascot.error,
          actionError: mascot.actionError,
          busy: mascot.busy,
          lastCheckin: mascot.lastCheckin,
          onPurchase: (id) => void mascot.purchase(id),
          onToggleEquipped: (id, equipped) => void mascot.setEquipped(id, equipped),
          onWardrobeClose: mascot.clearActionError,
        }}
      />

      <KpiGrid metrics={kpis} />

      <div className={styles.columns}>
        <div className={styles.primary}>
          <ContinueLearningCard />
          <EnrolledCourses />
          <WeeklyActivityChart activity={study.activity} loading={study.loading} error={study.error} />
        </div>

        <div className={styles.secondary}>
          <UpcomingTasks tasks={data.upcomingTasks} />
          <AiGuideCard guide={data.aiGuide} />
          <AnnouncementsFeed announcements={feed.announcements.map(toFeedItem)} />
        </div>
      </div>
    </PageContainer>
  );
}
