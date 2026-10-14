import { Text } from '../../../components';
import type { Submission, SubmissionStatus } from '../../../types';
import { AssignmentStatusBadge } from '../AssignmentStatusBadge';
import { AttachmentList } from '../AttachmentList';
import { formatDue } from '../assignmentMeta';
import styles from './SubmissionView.module.css';

interface SubmissionViewProps {
  submission: Submission;
  maxScore: number;
  status?: SubmissionStatus;
  /** Notlama bilgisi (puan/geri bildirim) gösterilsin mi. */
  showGrade?: boolean;
}

export function SubmissionView({ submission, maxScore, status, showGrade = true }: SubmissionViewProps) {
  const currentStatus: SubmissionStatus = status ?? (submission.score !== null ? 'GRADED' : 'SUBMITTED');
  return (
    <div className={styles.root}>
      <div className={styles.badges}>
        <AssignmentStatusBadge status={currentStatus} isLate={submission.isLate} />
      </div>
      <Text role="body-sm" tone="muted" as="p">
        Teslim zamanı: {formatDue(submission.submittedAt)}
      </Text>

      {submission.text && (
        <div>
          <Text role="label-md" tone="muted" as="h4">
            Teslim metni
          </Text>
          <Text role="body-md" as="p" className={styles.text}>
            {submission.text}
          </Text>
        </div>
      )}

      {submission.files.length > 0 && (
        <div>
          <Text role="label-md" tone="muted" as="h4" className={styles.label}>
            Dosyalar
          </Text>
          <AttachmentList files={submission.files} kind="submission" />
        </div>
      )}

      {showGrade && submission.score !== null && (
        <div className={styles.grade}>
          <Text role="title-md" as="p" tone="main">
            Puan: {submission.score} / {maxScore}
          </Text>
          {submission.feedback && (
            <>
              <Text role="label-md" tone="muted" as="h4" className={styles.label}>
                Geri bildirim
              </Text>
              <Text role="body-md" as="p" className={styles.text}>
                {submission.feedback}
              </Text>
            </>
          )}
        </div>
      )}
    </div>
  );
}
