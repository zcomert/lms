import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Icon, Panel, SearchInput, Text } from '../../../components';
import { PageContainer } from '../../../layout/PageContainer';
import { useCourseAnalytics } from './data/useCourseAnalytics';
import styles from './CourseAnalyticsPage.module.css';

type FilterStatus = 'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';

export function CourseAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, exporting, exportCsv } = useCourseAnalytics(id);
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [search, setSearch] = useState('');

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    return data.students.filter((student) => {
      const matchesFilter = filter === 'ALL' || student.status === filter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        student.name.toLowerCase().includes(q) ||
        student.email.toLowerCase().includes(q) ||
        (student.lastCompletedLesson && student.lastCompletedLesson.toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, search]);

  if (loading) {
    return (
      <PageContainer>
        <Text role="body-md">Analitik verileri yükleniyor…</Text>
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer>
        <Link to="/yonetim/kurslar" className={styles.backLink}>
          <Text role="label-md" as="span" tone="secondary">
            ← Kurs Yönetimine Dön
          </Text>
        </Link>
        <Text role="body-md" tone="error">
          {error ?? 'Analitik verileri bulunamadı.'}
        </Text>
      </PageContainer>
    );
  }

  const { course, summary, dropoffAnalysis } = data;

  return (
    <PageContainer>
      <div className={styles.header}>
        <div>
          <Link to="/yonetim/kurslar" className={styles.backLink}>
            <Text role="label-md" as="span" tone="secondary">
              ← Kurs Yönetimine Dön
            </Text>
          </Link>
          <Text role="headline-lg" as="h1">
            Öğrenme Analitiği: {course.title}
          </Text>
          <Text role="body-md" tone="muted" as="p">
            {course.accessMode === 'SEQUENTIAL' ? 'Sıralı Erişim Modu' : 'Serbest Erişim Modu'} ·{' '}
            {summary.totalEnrolled} kayıtlı öğrenci
          </Text>
        </div>
        <div className={styles.actions}>
          <Button
            variant="primary"
            iconStart="download"
            onClick={exportCsv}
            disabled={exporting}
          >
            {exporting ? 'İndiriliyor…' : 'CSV Olarak Dışa Aktar'}
          </Button>
        </div>
      </div>

      {/* KPI Kartları */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <Icon name="people" size="lg" />
          </div>
          <div className={styles.kpiContent}>
            <Text role="label-md" tone="muted">
              Kayıtlı Öğrenci
            </Text>
            <Text role="headline-md" as="span">
              {summary.totalEnrolled}
            </Text>
            <Text role="body-sm" tone="muted">
              {summary.completedCount} tamamladı · {summary.inProgressCount} devam ediyor
            </Text>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <Icon name="workspace_premium" size="lg" />
          </div>
          <div className={styles.kpiContent}>
            <Text role="label-md" tone="muted">
              Tamamlama Oranı
            </Text>
            <Text role="headline-md" as="span">
              %{summary.completionRate}
            </Text>
            <Text role="body-sm" tone="muted">
              {summary.completedCount} / {summary.totalEnrolled} öğrenci
            </Text>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <Icon name="trending_up" size="lg" />
          </div>
          <div className={styles.kpiContent}>
            <Text role="label-md" tone="muted">
              Ortalama İlerleme
            </Text>
            <Text role="headline-md" as="span">
              %{summary.averagePercent}
            </Text>
            <Text role="body-sm" tone="muted">
              {summary.notStartedCount} henüz başlamadı
            </Text>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <Icon name="schedule" size="lg" />
          </div>
          <div className={styles.kpiContent}>
            <Text role="label-md" tone="muted">
              Ortalama Çalışma Süresi
            </Text>
            <Text role="headline-md" as="span">
              {summary.averageStudyMinutes} dk
            </Text>
            <Text role="body-sm" tone="muted">
              Toplam {(summary.totalStudySeconds / 3600).toFixed(1)} saat
            </Text>
          </div>
        </div>
      </div>

      {/* Terk Analizi (Drop-off Analysis) */}
      <section className={styles.section} aria-labelledby="dropoff-title">
        <Panel title="Ders Terk ve Takılma Analizi (Drop-off Analysis)" icon="troubleshoot">
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <Text role="body-sm" tone="muted" as="p">
              Öğrencilerin müfredat boyunca hangi derse kadar ulaştığını ve kursu nerede bıraktığını
              gösterir. Yüksek terk sayısı görülen dersler, öğrencilerin zorlandığı veya ilgisini kaybettiği noktaları işaret eder.
            </Text>
          </div>

          {dropoffAnalysis.length === 0 ? (
            <div className={styles.emptyState}>
              <Text role="body-md">Bu kursta henüz yayınlanmış ders bulunmuyor.</Text>
            </div>
          ) : (
            <div className={styles.studentsTableWrapper}>
              <table className={styles.dropoffTable}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Ders Başlığı</th>
                    <th>Modül</th>
                    <th style={{ minWidth: '180px' }}>Tamamlanma Oranı</th>
                    <th>Terk Noktası (Bırakanlar)</th>
                  </tr>
                </thead>
                <tbody>
                  {dropoffAnalysis.map((item) => (
                    <tr key={item.lessonId}>
                      <td>
                        <Text role="label-md" tone="muted">
                          {item.order}
                        </Text>
                      </td>
                      <td>
                        <Text role="body-md" as="span" weight="semibold">
                          {item.lessonTitle}
                        </Text>
                      </td>
                      <td>
                        <Text role="body-sm" tone="muted">
                          {item.moduleTitle}
                        </Text>
                      </td>
                      <td>
                        <div className={styles.progressBarCell}>
                          <div className={styles.progressTrack}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${item.completedPercent}%` }}
                            />
                          </div>
                          <Text role="body-sm" as="span">
                            %{item.completedPercent} ({item.completedCount})
                          </Text>
                        </div>
                      </td>
                      <td>
                        {item.dropoffCount > 0 ? (
                          <span
                            className={[
                              styles.dropoffWarning,
                              item.dropoffPercent >= 20 ? styles.dropoffHigh : null,
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <Icon name="warning" size="sm" />
                            {item.dropoffCount} öğrenci (%{item.dropoffPercent}) burada takıldı
                          </span>
                        ) : (
                          <Text role="body-sm" tone="muted">
                            —
                          </Text>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      {/* Öğrenci Bazında İlerleme Raporu */}
      <section className={styles.section} aria-labelledby="students-report-title">
        <Panel title="Öğrenci İlerleme Raporu" icon="format_list_bulleted">
          <div className={styles.filterBar}>
            <div className={styles.filterTabs}>
              <button
                type="button"
                className={[styles.filterTab, filter === 'ALL' ? styles.filterTabActive : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setFilter('ALL')}
              >
                Tümü ({data.students.length})
              </button>
              <button
                type="button"
                className={[styles.filterTab, filter === 'COMPLETED' ? styles.filterTabActive : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setFilter('COMPLETED')}
              >
                Tamamlayanlar ({summary.completedCount})
              </button>
              <button
                type="button"
                className={[styles.filterTab, filter === 'IN_PROGRESS' ? styles.filterTabActive : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setFilter('IN_PROGRESS')}
              >
                Devam Edenler ({summary.inProgressCount})
              </button>
              <button
                type="button"
                className={[styles.filterTab, filter === 'NOT_STARTED' ? styles.filterTabActive : null]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setFilter('NOT_STARTED')}
              >
                Başlamayanlar ({summary.notStartedCount})
              </button>
            </div>

            <div className={styles.searchInput}>
              <SearchInput
                label="Öğrenci ara"
                placeholder="İsim, e-posta veya ders ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.studentsTableWrapper}>
            <table className={styles.studentsTable}>
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Kayıt Tarihi</th>
                  <th>Tamamlanan Ders</th>
                  <th style={{ minWidth: '160px' }}>İlerleme</th>
                  <th>Çalışma Süresi</th>
                  <th>Son Ders / Terk Noktası</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>
                      Filtreye uygun öğrenci bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.userId}>
                      <td>
                        <div className={styles.studentInfo}>
                          <span className={styles.studentName}>{student.name}</span>
                          <span className={styles.studentEmail}>{student.email}</span>
                        </div>
                      </td>
                      <td>
                        <Text role="body-sm">
                          {new Date(student.enrolledAt).toLocaleDateString('tr-TR')}
                        </Text>
                      </td>
                      <td>
                        <Text role="body-sm">
                          {student.completedCount} / {student.totalLessons}
                        </Text>
                      </td>
                      <td>
                        <div className={styles.progressBarCell}>
                          <div className={styles.progressTrack}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${student.percent}%` }}
                            />
                          </div>
                          <Text role="body-sm" as="span">
                            %{student.percent}
                          </Text>
                        </div>
                      </td>
                      <td>
                        <Text role="body-sm">{student.studyMinutes} dk</Text>
                      </td>
                      <td>
                        <Text role="body-sm" tone={student.lastCompletedLesson ? 'default' : 'muted'}>
                          {student.lastCompletedLesson ?? 'Henüz başlamadı'}
                        </Text>
                      </td>
                      <td>
                        {student.status === 'COMPLETED' && (
                          <Badge tone="success" variant="soft">
                            Tamamlandı
                          </Badge>
                        )}
                        {student.status === 'IN_PROGRESS' && (
                          <Badge tone="cyan" variant="soft">
                            Devam Ediyor
                          </Badge>
                        )}
                        {student.status === 'NOT_STARTED' && (
                          <Badge tone="neutral" variant="soft">
                            Başlamadı
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </PageContainer>
  );
}
