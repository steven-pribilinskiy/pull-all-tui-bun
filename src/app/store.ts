import { useState, useCallback, useRef } from 'react';
import type { RepoState, WorktreeEntry, RepoStatus } from '../git/types.ts';

export interface AppState {
  repos: RepoState[];
  worktrees: WorktreeEntry[];
  startTime: number;
  allDone: boolean;
}

export function useAppState(initialRepos: string[]) {
  const [repos, setRepos] = useState<RepoState[]>(() =>
    initialRepos.map(name => ({
      name,
      branch: '—',
      status: 'queued' as RepoStatus,
      pid: undefined,
      lines: [],
      exitCode: undefined,
    })),
  );
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([]);
  const startTime = useRef(Date.now());

  const updateRepo = useCallback((name: string, patch: Partial<RepoState>) => {
    setRepos(prev => prev.map(repo => (repo.name === name ? { ...repo, ...patch } : repo)));
  }, []);

  const setWorktreeData = useCallback((entries: WorktreeEntry[]) => {
    setWorktrees(entries);
  }, []);

  const allDone = repos.every(
    repo =>
      repo.status === 'updated' ||
      repo.status === 'up-to-date' ||
      repo.status === 'skipped' ||
      repo.status === 'failed',
  );

  return {
    repos,
    worktrees,
    startTime: startTime.current,
    allDone,
    updateRepo,
    setWorktreeData,
    setRepos,
  };
}
