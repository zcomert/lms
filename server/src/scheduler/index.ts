import { ALL_SCHEDULED_JOBS } from './jobs.js';
import type { JobState, ScheduledJob } from './types.js';

interface LoggerLike {
  info: (obj: Record<string, unknown> | string, msg?: string) => void;
  error: (obj: Record<string, unknown> | string, msg?: string) => void;
}

class SchedulerEngine {
  private jobs: Map<string, ScheduledJob> = new Map();
  private states: Map<string, JobState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private logger?: LoggerLike;

  constructor() {
    for (const job of ALL_SCHEDULED_JOBS) {
      this.registerJob(job);
    }
  }

  public registerJob(job: ScheduledJob) {
    this.jobs.set(job.name, job);
    if (!this.states.has(job.name)) {
      this.states.set(job.name, {
        name: job.name,
        description: job.description,
        intervalMs: job.intervalMs,
        status: 'IDLE',
        lastRun: null,
        lastDurationMs: null,
        lastError: null,
        lastResult: null,
        runCount: 0,
      });
    }
  }

  public start(logger?: LoggerLike) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger = logger;

    this.logger?.info({ jobCount: this.jobs.size }, 'LMS Background Scheduler başlatıldı.');

    for (const [name, job] of this.jobs) {
      if (job.runOnInit) {
        this.runJob(name).catch(() => {});
      }

      const timer = setInterval(() => {
        this.runJob(name).catch(() => {});
      }, job.intervalMs);

      // Node process kapanırken timer'ın açık kalmasını engeller
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.timers.set(name, timer);
    }
  }

  public stop() {
    this.isRunning = false;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.logger?.info('LMS Background Scheduler durduruldu.');
  }

  public async runJob(name: string): Promise<Record<string, unknown>> {
    const job = this.jobs.get(name);
    const state = this.states.get(name);

    if (!job || !state) {
      throw new Error(`Bilinmeyen zamanlanmış görev: ${name}`);
    }

    const timeout = job.timeoutMs ?? 60_000;

    if (state.status === 'RUNNING') {
      const runningDuration = state.runningSince ? Date.now() - new Date(state.runningSince).getTime() : 0;
      if (runningDuration < timeout) {
        return { skipped: true, reason: 'Gorev su anda calisiyor.' };
      }
      this.logger?.error(
        { jobName: name, runningDuration },
        `[Cron] "${name}" görevi zaman aşımı süresini (${timeout}ms) aştı; önceki kilit temizlendi.`,
      );
    }

    state.status = 'RUNNING';
    state.runningSince = new Date().toISOString();
    const startTime = Date.now();

    let timeoutTimer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`Görev ${timeout}ms zaman aşımına uğradı.`));
      }, timeout);
    });

    try {
      const result = await Promise.race([job.execute(), timeoutPromise]);
      if (timeoutTimer) clearTimeout(timeoutTimer);

      const duration = Date.now() - startTime;
      state.status = 'SUCCESS';
      state.runningSince = null;
      state.lastRun = new Date().toISOString();
      state.lastDurationMs = duration;
      state.lastError = null;
      state.lastResult = result;
      state.runCount += 1;

      this.logger?.info(
        { jobName: name, durationMs: duration, result },
        `[Cron] "${name}" görevi başarıyla tamamlandı.`,
      );

      return result;
    } catch (err) {
      if (timeoutTimer) clearTimeout(timeoutTimer);

      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      state.status = 'ERROR';
      state.runningSince = null;
      state.lastRun = new Date().toISOString();
      state.lastDurationMs = duration;
      state.lastError = errorMsg;
      state.runCount += 1;

      this.logger?.error(
        { jobName: name, durationMs: duration, error: errorMsg },
        `[Cron] "${name}" görevi hata verdi: ${errorMsg}`,
      );

      throw err;
    }
  }

  public async runAll(): Promise<Record<string, Record<string, unknown>>> {
    const results: Record<string, Record<string, unknown>> = {};
    for (const name of this.jobs.keys()) {
      try {
        results[name] = await this.runJob(name);
      } catch (err) {
        results[name] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return results;
  }

  public getStatus(): JobState[] {
    return Array.from(this.states.values());
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const scheduler = new SchedulerEngine();
