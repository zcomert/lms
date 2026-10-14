import { useState } from 'react';
import { Badge, Card, Icon, Text } from '../../components';
import { PageContainer } from '../../layout/PageContainer';
import { useMyAssignments } from './useMyAssignments';
import { ASSIGNMENT_TYPES, formatDueDate, getStatusInfo } from './assignmentMeta';
import { SubmitAssignmentDialog } from './components/SubmitAssignmentDialog';
import type { MyAssignment } from '../../types';
import styles from './AssignmentsPage.module.css';

export function AssignmentsPage() {
  const { assignments, loading, error, reload } = useMyAssignments();
  const [selected, setSelected] = useState<MyAssignment | null>(null);
  const pendingCount = assignments.filter((a) => a.status === 'PENDING' || a.status === 'LATE').length;

  return (
    <PageContainer>
      <div className={styles.header}>
        <Text role="headline-lg" as="h1">
          Ödevler & Notlar
        </Text>
        <Text role="body-md" tone="muted" as="p">
          {loading ? 'Yükleniyor…' : `${pendingCount} teslim beklemede · ${assignments.length} toplam`}
        </Text>
      </div>

      {error ? (
        <Text role="body-sm" tone="error" as="p">
          Ödevler yüklenemedi.
        </Text>
      ) : !loading && assignments.length === 0 ? (
        <Text role="body-sm" tone="muted" as="p">
          Henüz bir ödeviniz bulunmuyor.
        </Text>
      ) : (
        <div className={styles.list}>
          {assignments.map((assignment) => {
            const { tone, label } = getStatusInfo(assignment.status);
            const canSubmit = assignment.status === 'PENDING';
            return (
              <Card key={assignment.id} padding="lg" elevation="1">
                <button
                  type="button"
                  className={styles.assignmentItem}
                  onClick={() => canSubmit && setSelected(assignment)}
                  disabled={!canSubmit}
                  aria-disabled={!canSubmit}
                >
                  <div className={styles.assignmentHeader}>
                    <div>
                      <Text role="label-md" tone="secondary">
                        {assignment.course.title} · {ASSIGNMENT_TYPES[assignment.type].label}
                      </Text>
                      <Text role="title-md" as="h3">
                        {assignment.title}
                      </Text>
                      <Text role="body-sm" tone="muted">
                        {assignment.description}
                        {assignment.mySubmission?.score !== null && assignment.mySubmission?.score !== undefined
                          ? ` · Puan: ${assignment.mySubmission.score}/${assignment.maxScore}`
                          : ''}
                      </Text>
                    </div>
                    <Badge tone={tone} variant="soft">
                      {label}
                    </Badge>
                  </div>

                  <div className={styles.assignmentFooter}>
                    <div className={styles.dueDate}>
                      <Icon name="schedule" size="sm" />
                      <Text role="body-sm" tone="muted">
                        {formatDueDate(assignment.dueAt)}
                      </Text>
                    </div>
                    {canSubmit && <Icon name="arrow_forward" size="sm" />}
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <SubmitAssignmentDialog
          assignment={selected}
          onClose={() => setSelected(null)}
          onSubmitted={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </PageContainer>
  );
}
