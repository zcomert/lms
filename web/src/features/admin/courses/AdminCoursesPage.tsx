import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, IconButton, Text } from '../../../components';
import { PageContainer } from '../../../layout/PageContainer';
import { useAdminCourses } from './data/useAdminCourses';
import type { AdminCourse, CourseInput } from './data/useAdminCourses';
import { CourseForm } from './components/CourseForm';
import styles from './AdminCoursesPage.module.css';

export function AdminCoursesPage() {
  const { courses, loading, error, createCourse, updateCourse, deleteCourse } =
    useAdminCourses();
  const [mode, setMode] = useState<'none' | 'create' | string>('none');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async (input: CourseInput) => {
    setSaving(true);
    setActionError(null);
    try {
      await createCourse(input);
      setMode('none');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kurs oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, input: CourseInput) => {
    setSaving(true);
    setActionError(null);
    try {
      await updateCourse(id, input);
      setMode('none');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kurs güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (course: AdminCourse) => {
    const confirmed = window.confirm(
      `"${course.title}" kursunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
    );
    if (!confirmed) return;

    setActionError(null);
    try {
      await deleteCourse(course.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kurs silinemedi.');
    }
  };

  return (
    <PageContainer>
      <div className={styles.header}>
        <div>
          <Text role="headline-lg" as="h1">
            Kurs Yönetimi
          </Text>
          <Text role="body-md" tone="muted" as="p">
            {courses.length} kurs
          </Text>
        </div>
        <Button
          variant="primary"
          iconStart="add"
          onClick={() => setMode(mode === 'create' ? 'none' : 'create')}
        >
          Yeni Kurs
        </Button>
      </div>

      {actionError && (
        <Text role="body-md" tone="error" as="p">
          {actionError}
        </Text>
      )}

      {mode === 'create' && (
        <Card padding="lg" elevation="1" className={styles.formCard}>
          <Text role="title-md" as="h2" tone="main">
            Yeni Kurs Oluştur
          </Text>
          <CourseForm saving={saving} onCancel={() => setMode('none')} onSubmit={handleCreate} />
        </Card>
      )}

      {loading && <Text role="body-md">Yükleniyor…</Text>}
      {!loading && error && (
        <Text role="body-md" tone="error">
          {error}
        </Text>
      )}
      {!loading && !error && courses.length === 0 && (
        <Text role="body-md">Henüz kurs bulunmuyor.</Text>
      )}

      {!loading && !error && courses.length > 0 && (
        <div className={styles.list}>
          {courses.map((course) => (
            <Card key={course.id} padding="lg" elevation="1">
              <div className={styles.row}>
                <div className={styles.info}>
                  <div className={styles.titleLine}>
                    <Text role="title-md" as="h2" tone="main">
                      {course.title}
                    </Text>
                    <Badge tone={course.status === 'PUBLISHED' ? 'success' : 'neutral'} variant="soft">
                      {course.status === 'PUBLISHED' ? 'Yayınlandı' : 'Taslak'}
                    </Badge>
                  </div>
                  <Text role="body-sm" tone="muted">
                    {course.category} · {course.level} ·{' '}
                    {course.accessMode === 'SEQUENTIAL' ? 'Sıralı Erişim' : 'Serbest Erişim'}
                  </Text>
                </div>
                <div className={styles.actions}>
                  <Link to={`/yonetim/kurslar/${course.id}/ogrenciler`}>
                    <IconButton icon="group" label="Kayıtlı Öğrenciler" />
                  </Link>
                  <Link to={`/yonetim/kurslar/${course.id}/icerik`}>
                    <Button variant="secondary" size="sm" iconStart="list_alt">
                      Ders Ekle
                    </Button>
                  </Link>
                  <IconButton
                    icon="edit"
                    label="Kursu Düzenle"
                    onClick={() => setMode(mode === course.id ? 'none' : course.id)}
                  />
                  <IconButton
                    icon="delete"
                    label="Kursu Sil"
                    onClick={() => handleDelete(course)}
                  />
                </div>
              </div>

              {mode === course.id && (
                <div className={styles.editPanel}>
                  <CourseForm
                    course={course}
                    saving={saving}
                    onCancel={() => setMode('none')}
                    onSubmit={(input) => handleUpdate(course.id, input)}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
