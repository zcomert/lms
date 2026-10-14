import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/apiClient';
import type { ContentType } from '../../../../types';

export type LessonStatus = 'DRAFT' | 'PUBLISHED';

export interface ContentLesson {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  contentType: ContentType;
  contentUrl: string | null;
  order: number;
  status: LessonStatus;
}

export interface ContentModule {
  id: string;
  courseId: string;
  title: string;
  order: number;
  lessons: ContentLesson[];
}

export interface ModuleInput {
  title: string;
  order: number;
}

export interface LessonInput {
  title: string;
  order: number;
  status: LessonStatus;
  description?: string;
  contentType?: ContentType;
  contentUrl?: string;
}

interface CourseDetailResponse {
  course: {
    modules: Array<{
      id: string;
      title: string;
      order: number;
      lessons: Array<{
        id: string;
        title: string;
        description: string | null;
        contentType: ContentType;
        contentUrl: string | null;
        order: number;
        status: LessonStatus;
      }>;
    }>;
  };
}

/**
 * Bir kursun modül/ders ağacını yönetir: GET /api/v1/courses/:id ile okur
 * (ADMIN için DRAFT dahil tüm içerik döner), modül/ders CRUD işlemleri de burada.
 */
export function useCourseContent(courseId: string | undefined) {
  const [modules, setModules] = useState<ContentModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!courseId) {
      return Promise.resolve();
    }
    setLoading(true);
    setError(null);
    return apiFetch<CourseDetailResponse>(`/api/v1/courses/${courseId}`)
      .then((result) => {
        const sorted = [...result.course.modules]
          .sort((a, b) => a.order - b.order)
          .map((module) => ({
            id: module.id,
            courseId,
            title: module.title,
            order: module.order,
            lessons: [...module.lessons]
              .sort((a, b) => a.order - b.order)
              .map((lesson) => ({ ...lesson, moduleId: module.id })),
          }));
        setModules(sorted);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'İçerik yüklenemedi.'))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const createModule = useCallback(
    async (input: ModuleInput) => {
      if (!courseId) return;
      const result = await apiFetch<{ module: { id: string; courseId: string; title: string; order: number } }>(
        `/api/v1/courses/${courseId}/modules`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      setModules((prev) =>
        [...prev, { ...result.module, lessons: [] }].sort((a, b) => a.order - b.order),
      );
      return result.module;
    },
    [courseId],
  );

  const updateModule = useCallback(async (id: string, input: Partial<ModuleInput>) => {
    const result = await apiFetch<{ module: { id: string; courseId: string; title: string; order: number } }>(
      `/api/v1/modules/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
    setModules((prev) =>
      prev
        .map((module) => (module.id === id ? { ...module, ...result.module } : module))
        .sort((a, b) => a.order - b.order),
    );
    return result.module;
  }, []);

  const deleteModule = useCallback(async (id: string) => {
    await apiFetch<void>(`/api/v1/modules/${id}`, { method: 'DELETE' });
    setModules((prev) => prev.filter((module) => module.id !== id));
  }, []);

  const createLesson = useCallback(async (moduleId: string, input: LessonInput) => {
    const result = await apiFetch<{ lesson: ContentLesson }>(`/api/v1/modules/${moduleId}/lessons`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setModules((prev) =>
      prev.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              lessons: [...module.lessons, { ...result.lesson, moduleId }].sort(
                (a, b) => a.order - b.order,
              ),
            }
          : module,
      ),
    );
    return result.lesson;
  }, []);

  const updateLesson = useCallback(
    async (moduleId: string, id: string, input: Partial<LessonInput>) => {
      const result = await apiFetch<{ lesson: ContentLesson }>(`/api/v1/lessons/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      setModules((prev) =>
        prev.map((module) =>
          module.id === moduleId
            ? {
                ...module,
                lessons: module.lessons
                  .map((lesson) => (lesson.id === id ? { ...result.lesson, moduleId } : lesson))
                  .sort((a, b) => a.order - b.order),
              }
            : module,
        ),
      );
      return result.lesson;
    },
    [],
  );

  const deleteLesson = useCallback(async (moduleId: string, id: string) => {
    await apiFetch<void>(`/api/v1/lessons/${id}`, { method: 'DELETE' });
    setModules((prev) =>
      prev.map((module) =>
        module.id === moduleId
          ? { ...module, lessons: module.lessons.filter((lesson) => lesson.id !== id) }
          : module,
      ),
    );
  }, []);

  return {
    modules,
    loading,
    error,
    reload: load,
    createModule,
    updateModule,
    deleteModule,
    createLesson,
    updateLesson,
    deleteLesson,
  };
}
