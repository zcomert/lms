import { Link } from 'react-router-dom';
import { Icon, Text } from '../../../components';
import { useCourseAssignments } from '../useCourseAssignments';
import { formatDueShort } from '../assignmentMeta';
import styles from './LessonAssignments.module.css';

interface LessonAssignmentsProps {
  courseId: string;
  lessonId: string;
}

/** Derse bağlı ödevlerin bağlantı listesi; ödev yoksa hiçbir şey render etmez. */
export function LessonAssignments({ courseId, lessonId }: LessonAssignmentsProps) {
  const { assignments } = useCourseAssignments(courseId, true);
  const linked = assignments.filter((assignment) => assignment.lessonId === lessonId);
  if (linked.length === 0) return null;

  return (
    <section className={styles.root} aria-labelledby={`lesson-assignments-${lessonId}`}>
      <Text role="title-md" as="h2" tone="main">
        <span id={`lesson-assignments-${lessonId}`}>Bu derse bağlı ödevler</span>
      </Text>
      <ul className={styles.list}>
        {linked.map((assignment) => (
          <li key={assignment.id}>
            <Link to={`/kurslarim/${courseId}/odevler/${assignment.id}`} className={styles.link}>
              <Icon name="assignment" size="sm" />
              <Text role="body-md" as="span" tone="secondary">
                {assignment.title}
              </Text>
              <Text role="body-sm" as="span" tone="muted">
                · Son teslim: {formatDueShort(assignment.dueAt)}
              </Text>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
