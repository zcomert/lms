import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { Assignment, AssignmentPayload, CourseAssignmentsResponse } from '../../types';
import {
  createAssignment,
  deleteAssignment,
  deleteAttachment,
  updateAssignment,
  uploadAttachments,
} from './assignmentApi';

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Kurs ödev listesi ve yönetim eylemleri. Eylemler başarısızlıkta Error(message) fırlatır. */
export function useCourseAssignments(courseId: string | undefined, enabled: boolean) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    const res = await apiFetch<CourseAssignmentsResponse>(`/api/v1/courses/${courseId}/assignments`);
    setAssignments(res.assignments);
    setCanManage(res.canManage);
  }, [courseId]);

  useEffect(() => {
    setAssignments([]);
    setCanManage(false);
    setError(null);
    if (!courseId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Ödevler yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, enabled, load]);

  /**
   * Ödevi kaydeder; ardından dosya silme/yükleme yapar. Ödev kaydedilip dosya işlemi
   * başarısız olursa uyarı metni döner (liste yine tazelenir).
   */
  const save = useCallback(
    async (
      existingId: string | null,
      payload: AssignmentPayload,
      newFiles: File[],
      removedAttachmentIds: string[],
    ): Promise<string | null> => {
      if (!courseId) return null;
      let saved: Assignment;
      try {
        saved = existingId ? await updateAssignment(existingId, payload) : await createAssignment(courseId, payload);
      } catch (err) {
        throw new Error(message(err, 'Ödev kaydedilemedi. Lütfen tekrar deneyin.'));
      }
      let warning: string | null = null;
      try {
        for (const id of removedAttachmentIds) await deleteAttachment(id);
        if (newFiles.length > 0) await uploadAttachments(saved.id, newFiles);
      } catch (err) {
        warning = `Ödev kaydedildi ancak ek dosya işlemi tamamlanamadı: ${message(err, 'bilinmeyen hata')}`;
      }
      await load().catch(() => undefined);
      return warning;
    },
    [courseId, load],
  );

  const setStatus = useCallback(
    async (id: string, status: 'DRAFT' | 'PUBLISHED') => {
      try {
        await updateAssignment(id, { status });
      } catch (err) {
        throw new Error(message(err, 'Durum güncellenemedi.'));
      }
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteAssignment(id);
      } catch (err) {
        throw new Error(message(err, 'Ödev silinemedi.'));
      }
      await load();
    },
    [load],
  );

  return { assignments, canManage, loading, error, save, setStatus, remove };
}
