import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/rbac.js';
import { scheduler } from '../scheduler/index.js';
import { AppError } from '../errors.js';

export function registerAdminSchedulerRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: [requireAuth, requireRole('ADMIN')] };

  // Tüm zamanlanmış işlerin durumunu ve son çalıştırma loglarını listele
  app.get('/api/v1/admin/scheduler', adminOnly, async () => {
    return {
      isRunning: scheduler.getIsRunning(),
      jobs: scheduler.getStatus(),
    };
  });

  // Belirli bir zamanlanmış görevi manuel/hemen tetikle
  app.post<{ Params: { name: string } }>(
    '/api/v1/admin/scheduler/run/:name',
    adminOnly,
    async (request) => {
      const { name } = request.params;
      const jobState = scheduler.getStatus().find((j) => j.name === name);
      if (!jobState) {
        throw new AppError('NOT_FOUND', `"${name}" adında bir zamanlanmış görev bulunamadı.`, 404);
      }

      try {
        const result = await scheduler.runJob(name);
        return {
          job: name,
          success: true,
          result,
        };
      } catch (err) {
        throw new AppError(
          'JOB_EXECUTION_FAILED',
          `Görev çalıştırılırken hata oluştu: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
    },
  );

  // Tüm zamanlanmış görevleri sırayla hemen tetikle
  app.post('/api/v1/admin/scheduler/run-all', adminOnly, async () => {
    const results = await scheduler.runAll();
    return {
      success: true,
      results,
    };
  });
}
