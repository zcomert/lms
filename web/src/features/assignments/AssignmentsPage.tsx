import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Icon, Text } from '../../components';
import { PageContainer } from '../../layout/PageContainer';
import type { SubmissionStatus } from '../../types';
import { AssignmentStatusBadge } from './AssignmentStatusBadge';
import { STATUS_LABELS, formatDueShort, isOverdue } from './assignmentMeta';
import { useMyAssignments } from './useMyAssignments';
import styles from './AssignmentsPage.module.css';

type Filter = 'ALL' | SubmissionStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Tümü' },
  { value: 'NOT_SUBMITTED', label: STATUS_LABELS.NOT_SUBMITTED },
  { value: 'SUBMITTED', label: STATUS_LABELS.SUBMITTED },
  { value: 'GRADED', label: STATUS_LABELS.GRADED },
];

export function AssignmentsPage() {
  const { assignments, loading, error } = useMyAssignments();
  const [filter, setFilter] = useState<Filter>('ALL');

  const pending = assignments.filter((a) => (a.myStatus ?? 'NOT_SUBMITTED') === 'NOT_SUBMITTED').length;
  const visible = filter === 'ALL' ? assignments : assignments.filter((a) => (a.myStatus ?? 'NOT_SUBMITTED') === filter);

  return (
    <PageContainer>
      <div className={styles.header}>
        <Text role="headline-lg" as="h1">
          Ödevler & Notlar
        </Text>
        {!loading && !error && (
          <Text role="body-md" tone="muted" as="p">
            {pending} teslim beklemede · {assignments.length} toplam
          </Text>
        )}
      </div>

      <div className={styles.filters} role="group" aria-label="Ödev durumu filtresi">
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={filter === item.value ? 'navy' : 'secondary'}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {loading && (
        <Text role="body-md" tone="muted" as="p">
          Ödevler yükleniyor…
        </Text>
      )}
      {error && (
        <div role="alert">
          <Text role="body-md" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <Text role="body-md" tone="muted" as="p">
          {assignments.length === 0
            ? 'Kayıtlı olduğunuz kurslarda henüz ödev yok.'
            : 'Bu filtreye uyan ödev bulunamadı.'}
        </Text>
      )}

      <div className={styles.list}>
        {visible.map((assign) => {
          const status = assign.myStatus ?? 'NOT_SUBMITTED';
          const sub = assign.mySubmission;
          return (
            <Card key={assign.id} padding="lg" elevation="1">
              <Link to={`/kurslarim/${assign.courseId}/odevler/${assign.id}`} className={styles.assignmentItem}>
                <div className={styles.assignmentHeader}>
                  <div>
                    <Text role="label-md" tone="secondary">
                      {assign.courseTitle}
                    </Text>
                    <Text role="title-md" as="h3">
                      {assign.title}
                    </Text>
                    {status === 'GRADED' && sub && sub.score !== null && (
                      <Text role="body-sm" tone="muted">
                        Puan: {sub.score} / {assign.maxScore}
                      </Text>
                    )}
                  </div>
                  <div className={styles.badges}>
                    <AssignmentStatusBadge status={status} overdue={isOverdue(assign)} isLate={sub?.isLate} />
                  </div>
                </div>

                <div className={styles.assignmentFooter}>
                  <div className={styles.dueDate}>
                    <Icon name="schedule" size="sm" />
                    <Text role="body-sm" tone="muted">
                      Son teslim: {formatDueShort(assign.dueAt)}
                    </Text>
                  </div>
                  <Icon name="arrow_forward" size="sm" />
                </div>
              </Link>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
