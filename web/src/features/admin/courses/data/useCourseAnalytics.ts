import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/apiClient';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export interface CourseAnalyticsSummary {
  totalEnrolled: number;
  notStartedCount: number;
  inProgressCount: number;
  completedCount: number;
  completionRate: number;
  averagePercent: number;
  totalStudySeconds: number;
  averageStudyMinutes: number;
}

export interface DropoffLesson {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  order: number;
  completedCount: number;
  completedPercent: number;
  dropoffCount: number;
  dropoffPercent: number;
}

export interface StudentAnalyticsItem {
  userId: string;
  name: string;
  email: string;
  enrolledAt: string;
  completedCount: number;
  totalLessons: number;
  percent: number;
  studySeconds: number;
  studyMinutes: number;
  lastCompletedLesson: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface CourseAnalyticsData {
  course: { id: string; title: string; accessMode: string };
  summary: CourseAnalyticsSummary;
  dropoffAnalysis: DropoffLesson[];
  students: StudentAnalyticsItem[];
}

export function useCourseAnalytics(courseId: string | undefined) {
  const [data, setData] = useState<CourseAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<CourseAnalyticsData>(`/api/v1/courses/${courseId}/analytics`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analitik verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = useCallback(async () => {
    if (!courseId) return;
    setExporting(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${BASE_URL}/api/v1/courses/${courseId}/analytics/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error('CSV dosyası indirilemedi.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kurs-analitik-${courseId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV dışa aktarma hatası oluştu.');
    } finally {
      setExporting(false);
    }
  }, [courseId]);

  return {
    data,
    loading,
    error,
    exporting,
    reload: load,
    exportCsv,
  };
}
