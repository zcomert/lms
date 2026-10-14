import { Link, useParams } from 'react-router-dom';
import { Badge, Card, Icon, Panel, Text } from '../../components';
import { PageContainer } from '../../layout/PageContainer';
import { AssignmentStatusBadge } from './AssignmentStatusBadge';
import { AttachmentList } from './AttachmentList';
import { SubmissionForm } from './SubmissionForm';
import { SubmissionView } from './SubmissionView';
import { SubmissionsPanel } from './SubmissionsPanel';
import { formatDue, isOverdue } from './assignmentMeta';
import { useAssignment } from './useAssignment';
import styles from './AssignmentDetailPage.module.css';

export function AssignmentDetailPage() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const { assignment, loading, error, submit } = useAssignment(assignmentId);

  const backTo = `/kurslarim/${courseId ?? assignment?.courseId ?? ''}`;

  if (loading) {
    return (
      <PageContainer>
        <Text role="body-md">Yükleniyor…</Text>
      </PageContainer>
    );
  }

  if (error || !assignment) {
    return (
      <PageContainer>
        <div role="alert">
          <Text role="body-md" tone="error" as="p">
            {error ?? 'Ödev bulunamadı.'}
          </Text>
        </div>
        <Link to={backTo} className={styles.backLink}>
          <Text role="label-md" as="span" tone="secondary">
            ← Kursa Dön
          </Text>
        </Link>
      </PageContainer>
    );
  }

  // Yönetici görünümü sunucunun döndürdüğü `stats` ile belirlenir (istemcide rol hesabı yok).
  const isManager = assignment.stats !== undefined;
  const overdue = isOverdue(assignment);

  return (
    <PageContainer>
      <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
        <Link to="/kurslarim" className={styles.crumb}>
          <Text role="label-md" as="span" tone="secondary">
            Kurslarım
          </Text>
        </Link>
        <Icon name="chevron_right" size="sm" />
        <Link to={`/kurslarim/${assignment.courseId}`} className={styles.crumb}>
          <Text role="label-md" as="span" tone="secondary">
            {assignment.courseTitle}
          </Text>
        </Link>
        <Icon name="chevron_right" size="sm" />
        <Text role="label-md" as="span" tone="main">
          {assignment.title}
        </Text>
      </nav>

      <div className={styles.titleRow}>
        <Text role="headline-lg" as="h1" className={styles.title}>
          {assignment.title}
        </Text>
        <div className={styles.badges}>
          {assignment.status === 'DRAFT' && (
            <Badge tone="neutral" variant="soft">
              Taslak
            </Badge>
          )}
          {!isManager && assignment.myStatus && (
            <AssignmentStatusBadge
              status={assignment.myStatus}
              overdue={overdue}
              isLate={assignment.mySubmission?.isLate}
            />
          )}
        </div>
      </div>

      <Card padding="lg" elevation="1" className={styles.infoCard}>
        <dl className={styles.facts}>
          <div>
            <dt>
              <Text role="label-md" as="span" tone="muted">
                Son teslim
              </Text>
            </dt>
            <dd>
              <Text role="body-md" as="span">
                {formatDue(assignment.dueAt)}
              </Text>
            </dd>
          </div>
          <div>
            <dt>
              <Text role="label-md" as="span" tone="muted">
                Maksimum puan
              </Text>
            </dt>
            <dd>
              <Text role="body-md" as="span">
                {assignment.maxScore}
              </Text>
            </dd>
          </div>
          <div>
            <dt>
              <Text role="label-md" as="span" tone="muted">
                Kabul edilen türler
              </Text>
            </dt>
            <dd>
              <Text role="body-md" as="span">
                {assignment.allowedExtensions.length > 0
                  ? assignment.allowedExtensions.map((ext) => `.${ext}`).join(', ')
                  : 'Yalnızca metin teslimi'}
              </Text>
            </dd>
          </div>
          {assignment.lessonId && (
            <div>
              <dt>
                <Text role="label-md" as="span" tone="muted">
                  Bağlı ders
                </Text>
              </dt>
              <dd>
                <Link
                  to={`/kurslarim/${assignment.courseId}/ders/${assignment.lessonId}`}
                  className={styles.lessonLink}
                >
                  <Text role="body-md" as="span" tone="secondary">
                    {assignment.lessonTitle ?? 'Derse git'}
                  </Text>
                </Link>
              </dd>
            </div>
          )}
        </dl>

        {assignment.description && (
          <Text role="body-md" as="p" className={styles.description}>
            {assignment.description}
          </Text>
        )}

        {assignment.attachments.length > 0 && (
          <div>
            <Text role="title-md" as="h2" tone="main" className={styles.sectionTitle}>
              Ek dosyalar
            </Text>
            <AttachmentList files={assignment.attachments} kind="attachment" />
          </div>
        )}
      </Card>

      {isManager && assignment.stats && (
        <Text role="body-md" tone="muted" as="p" className={styles.stats}>
          {assignment.stats.submittedCount} / {assignment.stats.enrolledCount} teslim ·{' '}
          {assignment.stats.gradedCount} notlandı · {assignment.stats.lateCount} geç teslim
        </Text>
      )}

      {isManager ? (
        <SubmissionsPanel assignment={assignment} />
      ) : (
        <Panel title={assignment.mySubmission ? 'Teslimim' : 'Teslim Et'} icon="upload_file">
          {assignment.mySubmission ? (
            <SubmissionView
              submission={assignment.mySubmission}
              maxScore={assignment.maxScore}
              status={assignment.myStatus}
            />
          ) : (
            <SubmissionForm assignment={assignment} onSubmit={submit} />
          )}
        </Panel>
      )}
    </PageContainer>
  );
}
