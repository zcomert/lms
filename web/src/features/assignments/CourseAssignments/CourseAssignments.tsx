import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, ConfirmDialog, Icon, Panel, Text } from '../../../components';
import type { Assignment, CourseModuleSummary } from '../../../types';
import { AssignmentFormDialog } from '../AssignmentFormDialog';
import type { LessonOption } from '../AssignmentFormDialog';
import { AssignmentStatusBadge } from '../AssignmentStatusBadge';
import { formatDueShort, isOverdue } from '../assignmentMeta';
import { useCourseAssignments } from '../useCourseAssignments';
import styles from './CourseAssignments.module.css';

interface CourseAssignmentsProps {
  courseId: string;
  modules: CourseModuleSummary[];
}

export function CourseAssignments({ courseId, modules }: CourseAssignmentsProps) {
  const { assignments, canManage, loading, error, save, setStatus, remove } = useCourseAssignments(courseId, true);
  const [editing, setEditing] = useState<Assignment | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Assignment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const lessons: LessonOption[] = modules
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((module) =>
      module.lessons
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((lesson) => ({ id: lesson.id, title: lesson.title, moduleTitle: module.title })),
    );

  const toggleStatus = async (assignment: Assignment) => {
    setActionError(null);
    try {
      await setStatus(assignment.id, assignment.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Durum güncellenemedi.');
    }
  };

  return (
    <Panel
      title="Ödevler"
      icon="assignment"
      action={
        canManage ? (
          <Button size="sm" variant="primary" iconStart="add" onClick={() => setEditing('new')}>
            Yeni ödev
          </Button>
        ) : undefined
      }
    >
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
      {actionError && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {actionError}
          </Text>
        </div>
      )}
      {notice && (
        <div role="status">
          <Text role="body-sm" tone="main" as="p">
            {notice}
          </Text>
        </div>
      )}
      {!loading && !error && assignments.length === 0 && (
        <Text role="body-md" tone="muted" as="p">
          Bu kurs için henüz ödev yok.
        </Text>
      )}

      <ul className={styles.list}>
        {assignments.map((assignment) => (
          <li key={assignment.id} className={styles.item}>
            <div className={styles.main}>
              <Link to={`/kurslarim/${courseId}/odevler/${assignment.id}`} className={styles.link}>
                <Text role="title-md" as="span" tone="main">
                  {assignment.title}
                </Text>
              </Link>
              <div className={styles.meta}>
                <Icon name="schedule" size="sm" />
                <Text role="body-sm" as="span" tone="muted">
                  Son teslim: {formatDueShort(assignment.dueAt)} · {assignment.maxScore} puan
                </Text>
              </div>
              <div className={styles.badges}>
                {assignment.status === 'DRAFT' && (
                  <Badge tone="neutral" variant="soft">
                    Taslak
                  </Badge>
                )}
                {assignment.myStatus && (
                  <AssignmentStatusBadge
                    status={assignment.myStatus}
                    overdue={isOverdue(assignment)}
                    isLate={assignment.mySubmission?.isLate}
                  />
                )}
              </div>
              {assignment.stats && (
                <Text role="body-sm" as="p" tone="muted">
                  {assignment.stats.submittedCount} / {assignment.stats.enrolledCount} teslim ·{' '}
                  {assignment.stats.gradedCount} notlandı · {assignment.stats.lateCount} geç teslim
                </Text>
              )}
            </div>
            {canManage && (
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" onClick={() => void toggleStatus(assignment)}>
                  {assignment.status === 'PUBLISHED' ? 'Taslağa al' : 'Yayınla'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  iconStart="edit"
                  onClick={() => setEditing(assignment)}
                  aria-label={`Düzenle: ${assignment.title}`}
                >
                  Düzenle
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  iconStart="delete"
                  onClick={() => setDeleting(assignment)}
                  aria-label={`Sil: ${assignment.title}`}
                >
                  Sil
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <AssignmentFormDialog
          assignment={editing === 'new' ? null : editing}
          lessons={lessons}
          onClose={() => setEditing(null)}
          onSave={async (payload, files, removed) => {
            const warning = await save(editing === 'new' ? null : editing.id, payload, files, removed);
            setNotice(warning);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Ödevi sil"
          confirmLabel="Sil"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove(deleting.id);
            setDeleting(null);
          }}
        >
          <Text role="body-md" as="p">
            “{deleting.title}” ödevi, tüm teslimleri ve dosyalarıyla birlikte kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </Text>
        </ConfirmDialog>
      )}
    </Panel>
  );
}
