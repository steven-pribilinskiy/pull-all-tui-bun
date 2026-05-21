export type RepoStatus =
  | 'queued'
  | 'running'
  | 'updated'
  | 'up-to-date'
  | 'skipped'
  | 'failed';

export interface RepoState {
  name: string;
  branch: string;
  status: RepoStatus;
  pid: number | undefined;
  lines: string[];
  exitCode: number | undefined;
}

export interface WorktreeEntry {
  repo: string;
  branch: string;
}

export interface CliOptions {
  dir: string;
  jobs: number;
  noTui: boolean;
  noWorktrees: boolean;
  timeoutSec: number;
}
