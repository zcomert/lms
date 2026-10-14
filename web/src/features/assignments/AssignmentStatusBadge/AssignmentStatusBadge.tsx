import { Badge } from '../../../components';
import type { SubmissionStatus } from '../../../types';
import { STATUS_LABELS, STATUS_TONES } from '../assignmentMeta';

interface AssignmentStatusBadgeProps {
  status: SubmissionStatus;
  /** Teslim edilmemiş ve süresi geçmişse ek bilgi rozeti gösterilir. */
  overdue?: boolean;
  isLate?: boolean;
}

export function AssignmentStatusBadge({ status, overdue = false, isLate = false }: AssignmentStatusBadgeProps) {
  return (
    <>
      <Badge tone={STATUS_TONES[status]} variant="soft">
        {STATUS_LABELS[status]}
      </Badge>
      {status === 'NOT_SUBMITTED' && overdue && (
        <Badge tone="error" variant="soft">
          Süresi geçti
        </Badge>
      )}
      {isLate && (
        <Badge tone="error" variant="soft" icon="schedule">
          Geç teslim
        </Badge>
      )}
    </>
  );
}
