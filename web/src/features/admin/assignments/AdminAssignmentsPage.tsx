import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, ConfirmDialog, SearchInput, Text } from '../../../components';
import { PageContainer } from '../../../layout/PageContainer';
import { useCurrentUser } from '../../../data/useCurrentUser';
import type { ManagedAssignment } from '../../../types';
import { useEventCourses } from '../../calendar/useEventCourses';
import { ASSIGNMENT_TYPES, formatDueDate } from '../../assignments/assignmentMeta';
import { searchKey } from '../question-banks/questionMeta';
import { AssignmentCreateDialog } from './components/AssignmentCreateDialog';
import { createAssignment, deleteAssignment, useManagedAssignments } from './data/assignmentApi';
import type { NewAssignmentInput } from './data/assignmentApi';
import styles from './AdminAssignmentsPage.module.css';

type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED';

export function AdminAssignmentsPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const courses = useEventCourses(user);
  const { assignments, loading, error, reload } = useManagedAssignments();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [courseFilter, setCourseFilter] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ManagedAssignment | null>(null);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) map.set(a.course.id, a.course.title);
    return [...map].sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  }, [assignments]);

  const counts = useMemo(
    () => ({
      ALL: assignments.length,
      DRAFT: assignments.filter((a) => a.status === 'DRAFT').length,
      PUBLISHED: assignments.filter((a) => a.status === 'PUBLISHED').length,
    }),
    [assignments],
  );

  const visible = assignments.filter((a) => {
    if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
    if (courseFilter && a.course.id !== courseFilter) return false;
    const term = searchKey(search.trim());
    return !term || searchKey(`${a.title} ${a.course.title}`).includes(term);
  });

  const handleCreate = async (input: NewAssignmentInput) => {
    const { assignment } = await createAssignment(input);
    navigate(`/yonetim/odevler/${assignment.id}`);
  };

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: 'Tümü' },
    { key: 'DRAFT', label: 'Taslak' },
    { key: 'PUBLISHED', label: 'Yayında' },
  ];

  return (
    <PageContainer>
      <div className={styles.header}>
        <div>
          <Text role="headline-lg" as="h1">
            Ödev Yönetimi
          </Text>
          <Text role="body-md" tone="muted" as="p">
            Kurslarınıza ödev/laboratuvar/proje teslimi tanımlayın, yayınlayın ve öğrenci teslimlerini
            notlandırın.
          </Text>
        </div>
        <div className={styles.headerActions}>
          <Button variant="primary" iconStart="add" disabled={courses.length === 0} onClick={() => setCreating(true)}>
            Yeni Ödev
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Duruma göre süz">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={styles.tab}
              aria-pressed={statusFilter === tab.key}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label} <span className={styles.count}>{counts[tab.key]}</span>
            </button>
          ))}
        </div>
        <SearchInput
          label="Ödev ara"
          placeholder="Ödev ara"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={styles.search}
        />
        <label className={styles.filter}>
          <span className={styles.srOnly}>Kurs</span>
          <select className={styles.select} value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="">Tüm kurslar</option>
            {courseOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <Text role="body-md" tone="error" as="p">
          {error}
        </Text>
      )}
      {loading && assignments.length === 0 && (
        <Text role="body-md" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}
      {!loading && !error && visible.length === 0 && (
        <Card padding="lg" elevation="1">
          <Text role="body-md" tone="muted" as="p">
            {assignments.length === 0 ? 'Henüz ödev yok. "Yeni Ödev" ile ilkini oluşturun.' : 'Süzgeçlere uyan ödev yok.'}
          </Text>
        </Card>
      )}

      {visible.length > 0 && (
        <Card padding="none" elevation="1" className={styles.tableCard}>
          <table className={styles.table}>
            <thead className="label-md">
              <tr>
                <th scope="col">Ödev</th>
                <th scope="col">Durum</th>
                <th scope="col">Teslim Tarihi</th>
                <th scope="col">Teslimler</th>
                <th scope="col">
                  <span className={styles.srOnly}>İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td data-label="Ödev">
                    <span className={styles.itemCell}>
                      <Text role="label-lg" tone="main">
                        <Link to={`/yonetim/odevler/${a.id}`} className={styles.itemLink}>
                          {a.title}
                        </Link>
                      </Text>
                      <Text role="body-sm" tone="muted">
                        {a.course.title} · {ASSIGNMENT_TYPES[a.type].label}
                      </Text>
                    </span>
                  </td>
                  <td data-label="Durum">
                    <span className={styles.badges}>
                      <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                        {a.status === 'PUBLISHED' ? 'Yayında' : 'Taslak'}
                      </Badge>
                    </span>
                  </td>
                  <td data-label="Teslim Tarihi">
                    <Text role="body-sm">{formatDueDate(a.dueAt)}</Text>
                  </td>
                  <td data-label="Teslimler">
                    <Text role="body-sm">{a.submissionCount} teslim</Text>
                  </td>
                  <td className={styles.actionsCell}>
                    <span className={styles.actions}>
                      <Button variant="ghost" size="sm" iconStart="edit" onClick={() => navigate(`/yonetim/odevler/${a.id}`)}>
                        Düzenle<span className={styles.srOnly}>: {a.title}</span>
                      </Button>
                      <Button variant="ghost" size="sm" iconStart="delete" onClick={() => setDeleting(a)}>
                        Sil<span className={styles.srOnly}>: {a.title}</span>
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {creating && (
        <AssignmentCreateDialog courses={courses} onCreate={handleCreate} onClose={() => setCreating(false)} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Ödevi sil"
          confirmLabel="Ödevi sil"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteAssignment(deleting.id);
            setDeleting(null);
            reload();
          }}
        >
          <Text role="body-md" as="p">
            “{deleting.title}” ödevi ve tüm öğrenci teslimleri kalıcı olarak silinecek.
          </Text>
        </ConfirmDialog>
      )}
    </PageContainer>
  );
}
