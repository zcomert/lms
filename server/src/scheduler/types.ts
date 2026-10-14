export type JobStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'ERROR';

export interface ScheduledJob {
  name: string;
  description: string;
  intervalMs: number;
  runOnInit?: boolean;
  timeoutMs?: number;
  execute: () => Promise<Record<string, unknown>>;
}

export interface JobState {
  name: string;
  description: string;
  intervalMs: number;
  status: JobStatus;
  lastRun: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  lastResult: Record<string, unknown> | null;
  runCount: number;
  runningSince?: string | null;
}

