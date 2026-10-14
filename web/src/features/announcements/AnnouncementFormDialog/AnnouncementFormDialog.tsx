import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, RichTextEditor, Text } from '../../../components';
import type { AnnouncementCategory, AnnouncementItem } from '../../../types';
import { toDateTimeInput } from '../../calendar/dateUtils';
import { CATEGORIES, CATEGORY_KEYS } from '../announcementMeta';
import type { AnnouncementPayload } from '../useAnnouncements';
import styles from './AnnouncementFormDialog.module.css';

export interface CourseOption {
  id: string;
  title: string;
}

/** draft = taslak, now = hemen (veya zaten) yayında, schedule = ileri tarihte yayın. */
type PublishMode = 'draft' | 'now' | 'schedule';

const MAX_TITLE = 200;
const MAX_BODY = 10000;

interface AnnouncementFormDialogProps {
  /** Düzenlenen duyuru; yoksa yeni duyuru oluşturulur. */
  announcement: AnnouncementItem | null;
  courses: CourseOption[];
  /** Yalnızca ADMIN genel duyuru oluşturabilir. */
  canCreateGeneral: boolean;
  defaultCourseId: string | null;
  onSave: (payload: AnnouncementPayload) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function initialMode(announcement: AnnouncementItem | null): PublishMode {
  if (!announcement || announcement.state === 'DRAFT') return 'draft';
  return announcement.state === 'SCHEDULED' ? 'schedule' : 'now';
}

export function AnnouncementFormDialog({
  announcement,
  courses,
  canCreateGeneral,
  defaultCourseId,
  onSave,
  onDelete,
  onClose,
}: AnnouncementFormDialogProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [category, setCategory] = useState<AnnouncementCategory>(
    announcement?.category ?? (defaultCourseId ? 'COURSE' : 'GENERAL'),
  );
  const [courseId, setCourseId] = useState(announcement ? (announcement.course?.id ?? '') : (defaultCourseId ?? ''));
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [mode, setMode] = useState<PublishMode>(initialMode(announcement));
  const [publishAt, setPublishAt] = useState(
    announcement?.state === 'SCHEDULED' && announcement.publishAt
      ? toDateTimeInput(new Date(announcement.publishAt))
      : '',
  );
  const [expiresAt, setExpiresAt] = useState(
    announcement?.expiresAt ? toDateTimeInput(new Date(announcement.expiresAt)) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Zaten yayınlanmış (veya süresi dolmuş) duyuru düzenlenirken "yayında" seçeneği yayın tarihini korur.
  const alreadyLive = announcement?.state === 'PUBLISHED' || announcement?.state === 'EXPIRED';

  // İlk odak başlıkta; kapanınca odak önceki öğeye döner.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const buildPayload = (): AnnouncementPayload | string => {
    if (!title.trim()) return 'Başlık zorunludur.';
    if (!body.trim()) return 'Duyuru metni zorunludur.';
    if (!canCreateGeneral && !courseId) return 'Bir kurs seçmelisiniz.';

    let publishValue: string | null = null;
    if (mode === 'schedule') {
      const date = new Date(publishAt);
      if (!publishAt || Number.isNaN(date.getTime())) return 'Yayın tarihi seçmelisiniz.';
      if (date.getTime() <= Date.now()) return 'Zamanlanmış yayın tarihi gelecekte olmalıdır.';
      publishValue = date.toISOString();
    } else if (mode === 'now' && alreadyLive) {
      publishValue = announcement?.publishAt ?? null;
    }

    let expiresValue: string | null = null;
    if (expiresAt) {
      const date = new Date(expiresAt);
      if (Number.isNaN(date.getTime())) return 'Bitiş tarihi geçersiz.';
      const effectivePublish = publishValue ? new Date(publishValue).getTime() : Date.now();
      if (mode !== 'draft' && date.getTime() <= effectivePublish) {
        return 'Yayından kalkma tarihi, yayın tarihinden sonra olmalıdır.';
      }
      expiresValue = date.toISOString();
    }

    return {
      title: title.trim(),
      body: body.trim(),
      category,
      status: mode === 'draft' ? 'DRAFT' : 'PUBLISHED',
      publishAt: publishValue,
      expiresAt: expiresValue,
      pinned,
      courseId: courseId || null,
    };
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı.');
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = buildPayload();
    if (typeof payload === 'string') {
      setError(payload);
      return;
    }
    void run(() => onSave(payload));
  };

  const submitLabel = mode === 'draft' ? 'Taslağı Kaydet' : mode === 'schedule' ? 'Zamanla' : alreadyLive ? 'Kaydet' : 'Yayınla';

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
      >
        <Text role="headline-sm" as="h2" className={styles.title}>
          <span id={headingId}>{announcement ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}</span>
        </Text>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <Text role="label-md" as="span" tone="muted">
              Başlık
            </Text>
            <input
              ref={titleRef}
              className={styles.input}
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              onChange={(event) => setTitle(event.target.value)}
              required
              aria-required="true"
            />
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <Text role="label-md" as="span" tone="muted">
                Kategori
              </Text>
              <select
                className={styles.input}
                value={category}
                onChange={(event) => setCategory(event.target.value as AnnouncementCategory)}
              >
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORIES[key].label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <Text role="label-md" as="span" tone="muted">
                Hedef kitle
              </Text>
              <select className={styles.input} value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                {canCreateGeneral && <option value="">Genel (tüm kullanıcılar)</option>}
                {!canCreateGeneral && !courseId && <option value="">Kurs seçin</option>}
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.field}>
            <Text role="label-md" as="span" tone="muted">
              Duyuru metni
            </Text>
            <RichTextEditor
              value={body}
              onChange={setBody}
              maxLength={MAX_BODY}
              aria-describedby={`${headingId}-body-hint`}
            />
            <span id={`${headingId}-body-hint`}>
              <Text role="body-sm" as="span" tone="muted">
                Paragrafları boş bir satırla ayırın. Araç çubuğu veya Markdown ile biçimlendirebilirsiniz.
              </Text>
            </span>
          </div>

          <fieldset className={styles.fieldset}>
            <legend>
              <Text role="label-md" as="span" tone="muted">
                Yayın
              </Text>
            </legend>
            <div className={styles.modes}>
              <label className={styles.radio}>
                <input type="radio" name="mode" checked={mode === 'draft'} onChange={() => setMode('draft')} />
                <Text role="body-md" as="span">
                  Taslak
                </Text>
              </label>
              <label className={styles.radio}>
                <input type="radio" name="mode" checked={mode === 'now'} onChange={() => setMode('now')} />
                <Text role="body-md" as="span">
                  {alreadyLive ? 'Yayında' : 'Hemen yayınla'}
                </Text>
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'schedule'}
                  onChange={() => setMode('schedule')}
                />
                <Text role="body-md" as="span">
                  İleri tarihte yayınla
                </Text>
              </label>
            </div>

            <div className={styles.row}>
              {mode === 'schedule' && (
                <label className={styles.field}>
                  <Text role="label-md" as="span" tone="muted">
                    Yayın tarihi
                  </Text>
                  <input
                    className={styles.input}
                    type="datetime-local"
                    value={publishAt}
                    min={toDateTimeInput(new Date())}
                    onChange={(event) => setPublishAt(event.target.value)}
                    required
                    aria-required="true"
                  />
                </label>
              )}
              <label className={styles.field}>
                <Text role="label-md" as="span" tone="muted">
                  Yayından kalkma (isteğe bağlı)
                </Text>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={expiresAt}
                  min={publishAt || undefined}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <label className={styles.checkbox}>
            <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            <Text role="body-md" as="span">
              Listenin başına sabitle
            </Text>
          </label>

          {error && (
            <div className={styles.error} role="alert">
              <Text role="body-sm" tone="error" as="p">
                {error}
              </Text>
            </div>
          )}

          {confirmingDelete ? (
            <div className={styles.actions} role="group" aria-label="Silme onayı">
              <Text role="body-md" as="p" className={styles.spacer}>
                Bu duyuru kalıcı olarak silinsin mi?
              </Text>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                Vazgeç
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => onDelete && void run(onDelete)}>
                Evet, Sil
              </Button>
            </div>
          ) : (
            <div className={styles.actions}>
              {announcement && onDelete && (
                <Button
                  variant="destructive"
                  iconStart="delete"
                  className={styles.spacer}
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Sil
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={onClose}>
                İptal
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Kaydediliyor…' : submitLabel}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}
