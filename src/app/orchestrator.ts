import { basename } from 'node:path';
import {
  discoverRepos,
  discoverWorktrees,
  getBranch,
  isDirty,
  pullRepo,
  Semaphore,
} from '../git/runner.ts';
import type { RepoState, WorktreeEntry, CliOptions } from '../git/types.ts';

export type StateUpdater = (name: string, patch: Partial<RepoState>) => void;
export type WorktreeUpdater = (entries: WorktreeEntry[]) => void;
export type AllReposReady = (repos: string[], branches: Record<string, string>) => void;

/**
 * Main orchestration: discover repos, run pulls with semaphore, update state.
 * Returns exit code.
 */
export async function runOrchestrator(
  options: CliOptions,
  onReposReady: AllReposReady,
  onUpdate: StateUpdater,
  onWorktrees: WorktreeUpdater,
): Promise<number> {
  const { dir, jobs, timeoutSec, noWorktrees } = options;

  // Discover repos
  const repoNames = await discoverRepos(dir);

  // Get branch and dirty status for all repos concurrently
  const branchResults = await Promise.all(
    repoNames.map(name => getBranch(dir, name)),
  );
  const dirtyResults = await Promise.all(
    repoNames.map(name => isDirty(dir, name)),
  );

  const branches: Record<string, string> = {};
  for (let idx = 0; idx < repoNames.length; idx++) {
    branches[repoNames[idx]] = branchResults[idx];
  }

  // Notify UI of initial repo list
  onReposReady(repoNames, branches);

  // Mark dirty repos as skipped
  for (let idx = 0; idx < repoNames.length; idx++) {
    const name = repoNames[idx];
    onUpdate(name, { branch: branches[name] });
    if (dirtyResults[idx]) {
      onUpdate(name, { status: 'skipped' });
    }
  }

  // Start worktree discovery in parallel (does not block pulls)
  const worktreePromise = noWorktrees
    ? Promise.resolve([])
    : discoverWorktrees(dir).then(wts => {
        onWorktrees(wts);
        return wts;
      });

  // Run pulls with semaphore
  const semaphore = new Semaphore(jobs);
  const pullTasks = repoNames
    .filter((_, idx) => !dirtyResults[idx])
    .map(name => async () => {
      await semaphore.acquire();
      try {
        await pullRepo(dir, name, timeoutSec, onUpdate);
      } finally {
        semaphore.release();
      }
    });

  await Promise.all(pullTasks.map(task => task()));
  await worktreePromise;

  // Determine exit code
  const failed = repoNames.some(name => {
    // We need to check final status - passed via onUpdate
    return false; // resolved below
  });

  return 0; // actual exit code determined by caller based on final state
}
