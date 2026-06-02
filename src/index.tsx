import React, { useState, useEffect } from 'react';
import { render } from 'ink';
import { basename } from 'node:path';
import { cpus } from 'node:os';
import { TuiApp } from './ui/TuiApp.tsx';
import {
  discoverRepos,
  discoverWorktrees,
  getBranch,
  isDirty,
  killAllPulls,
  pullRepo,
  Semaphore,
} from './git/runner.ts';
import { printRepoResult, printSummary } from './app/plainOutput.ts';
import { emitProfileReport } from './app/profile.ts';
import { buildSummaryText } from './git/parser.ts';
import type { RepoState, WorktreeEntry, CliOptions } from './git/types.ts';

// Parse CLI arguments
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const defaultJobs = cpus().length || 4;
  const envJobs = process.env.PULL_JOBS ? parseInt(process.env.PULL_JOBS, 10) : undefined;
  const envTimeout = process.env.PULL_TIMEOUT ? parseInt(process.env.PULL_TIMEOUT, 10) : undefined;

  let dir = process.cwd();
  let jobs = envJobs ?? defaultJobs;
  let noTui = false;
  let noWorktrees = false;
  let timeoutSec = envTimeout ?? 30;
  let profile = Boolean(process.env.PULL_PROFILE);
  let profileOut: string | undefined;

  for (let idx = 0; idx < args.length; idx++) {
    const arg = args[idx];
    if (arg === '--no-tui') {
      noTui = true;
    } else if (arg === '--no-worktrees') {
      noWorktrees = true;
    } else if (arg === '-j' || arg === '--jobs') {
      jobs = parseInt(args[++idx] ?? '4', 10);
    } else if (arg === '--timeout') {
      timeoutSec = parseInt(args[++idx] ?? '30', 10);
    } else if (arg === '--profile') {
      profile = true;
    } else if (arg === '--profile-out') {
      profileOut = args[++idx];
      profile = true;
    } else if (arg === '--version') {
      process.stdout.write('pull-all-tui 1.0.0\n');
      process.exit(0);
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write(
        'Usage: pull-all-tui [DIR]\n\n' +
          '  -j, --jobs N        concurrency (default: nproc)\n' +
          '  --no-tui            plain streaming output\n' +
          '  --no-worktrees      skip worktree discovery\n' +
          '  --timeout SEC       per-pull timeout (default: 30)\n' +
          '  --profile           emit per-repo timing report (slowest first)\n' +
          '  --profile-out FILE  write profile report to FILE (implies --profile)\n' +
          '  --version\n' +
          '  -h, --help\n\n' +
          '  Env: PULL_PROFILE=1 enables profiling.\n',
      );
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      dir = arg;
    }
  }

  return { dir, jobs, noTui, noWorktrees, timeoutSec, profile, profileOut };
}

/**
 * Plain (no-TTY) mode: stream output byte-identical to bash reference.
 */
async function runPlain(options: CliOptions): Promise<number> {
  const { dir, jobs, noWorktrees, timeoutSec, profile, profileOut } = options;

  process.stdout.write(`🔄 Pulling all repositories in ${basename(dir)}...\n`);

  const repoNames = await discoverRepos(dir);

  if (repoNames.length === 0) {
    process.stdout.write('\n');
    process.stdout.write(`   No git repositories found in ${basename(dir)}.\n`);
    return 0;
  }

  // Get branches and dirty status
  const [branchResults, dirtyResults] = await Promise.all([
    Promise.all(repoNames.map(name => getBranch(dir, name))),
    Promise.all(repoNames.map(name => isDirty(dir, name))),
  ]);

  const branches: Record<string, string> = {};
  for (let idx = 0; idx < repoNames.length; idx++) {
    branches[repoNames[idx]] = branchResults[idx];
  }

  // Start worktree discovery in parallel
  const worktreePromise = noWorktrees ? Promise.resolve([]) : discoverWorktrees(dir);

  // Run pulls with semaphore, buffering output per repo
  const repoStates: Map<string, RepoState> = new Map();
  for (const name of repoNames) {
    repoStates.set(name, {
      name,
      branch: branches[name] ?? '?',
      status: dirtyResults[repoNames.indexOf(name)] ? 'skipped' : 'queued',
      pid: undefined,
      lines: [],
      exitCode: undefined,
    });
  }

  const semaphore = new Semaphore(jobs);
  const completionOrder: string[] = [];

  const pullTasks = repoNames.map(name => async () => {
    const state = repoStates.get(name)!;
    if (state.status === 'skipped') {
      repoStates.set(name, { ...state, startMs: Date.now(), elapsedMs: 0 });
      completionOrder.push(name);
      return;
    }

    const startMs = Date.now();
    await semaphore.acquire();
    try {
      await pullRepo(dir, name, timeoutSec, (repoName, patch) => {
        const current = repoStates.get(repoName)!;
        repoStates.set(repoName, { ...current, ...patch });
      });
    } finally {
      const current = repoStates.get(name)!;
      repoStates.set(name, { ...current, startMs, elapsedMs: Date.now() - startMs });
      semaphore.release();
      completionOrder.push(name);
    }
  });

  // Run all pulls in parallel, then flush output in alphabetical order
  await Promise.all(pullTasks.map(task => task()));

  // Print in alphabetical order (same as bash reference)
  for (const name of repoNames) {
    const state = repoStates.get(name)!;
    printRepoResult(state);
  }

  const worktrees = await worktreePromise;
  printSummary(dir, Array.from(repoStates.values()), worktrees);

  if (profile) {
    await emitProfileReport(Array.from(repoStates.values()), profileOut);
  }

  const hasFailed = Array.from(repoStates.values()).some(r => r.status === 'failed');
  return hasFailed ? 1 : 0;
}

/**
 * TUI mode: interactive ink app.
 */
async function runTui(options: CliOptions): Promise<number> {
  const { dir, jobs, noWorktrees, timeoutSec, profile, profileOut } = options;

  // Discover repos first (fast)
  const repoNames = await discoverRepos(dir);

  if (repoNames.length === 0) {
    process.stdout.write(`No git repositories found in ${basename(dir)}.\n`);
    return 0;
  }

  // Get branches and dirty status concurrently
  const [branchResults, dirtyResults] = await Promise.all([
    Promise.all(repoNames.map(name => getBranch(dir, name))),
    Promise.all(repoNames.map(name => isDirty(dir, name))),
  ]);

  const branches: Record<string, string> = {};
  for (let idx = 0; idx < repoNames.length; idx++) {
    branches[repoNames[idx]] = branchResults[idx];
  }

  // Shared mutable state (updated from pull callbacks, triggers re-render)
  const initialRepos: RepoState[] = repoNames.map((name, idx) => ({
    name,
    branch: branches[name] ?? '?',
    status: dirtyResults[idx] ? 'skipped' : 'queued',
    pid: undefined,
    lines: [],
    exitCode: undefined,
    elapsedMs: dirtyResults[idx] ? 0 : undefined,
  }));

  return new Promise<number>(resolve => {
    let currentRepos = [...initialRepos];
    let currentWorktrees: WorktreeEntry[] = [];
    let exitCode = 0;
    let inkInstance: ReturnType<typeof render> | null = null;
    let renderCallback: ((repos: RepoState[], worktrees: WorktreeEntry[]) => void) | null = null;
    let finished = false;

    // Single exit path. Kills any in-flight pulls so the event loop can drain,
    // waits for ink to restore the terminal (leave alt-screen, show cursor),
    // then resolves. Idempotent — safe to call from quit and from the
    // all-pulls-settled handler.
    function finish(code: number) {
      if (finished) return;
      finished = true;
      exitCode = code;
      killAllPulls();
      const hasFailed = currentRepos.some(r => r.status === 'failed');
      if (exitCode === 0 && hasFailed) exitCode = 1;
      const emitReport = async () => {
        if (profile) {
          await emitProfileReport(currentRepos, profileOut);
        }
      };
      if (inkInstance) {
        inkInstance
          .waitUntilExit()
          .then(emitReport)
          .then(() => resolve(exitCode));
      } else {
        emitReport().then(() => resolve(exitCode));
      }
    }

    function updateRepo(name: string, patch: Partial<RepoState>) {
      const idx = currentRepos.findIndex(r => r.name === name);
      if (idx >= 0) {
        currentRepos = [
          ...currentRepos.slice(0, idx),
          { ...currentRepos[idx], ...patch },
          ...currentRepos.slice(idx + 1),
        ];
        renderCallback?.(currentRepos, currentWorktrees);
      }
    }

    function updateWorktrees(entries: WorktreeEntry[]) {
      currentWorktrees = entries;
      renderCallback?.(currentRepos, currentWorktrees);
    }

    function handleQuit(code: number) {
      finish(code);
    }

    function handleRetry(name: string) {
      const startMs = Date.now();
      updateRepo(name, {
        status: 'queued',
        lines: [],
        pid: undefined,
        exitCode: undefined,
        startMs,
        elapsedMs: undefined,
      });
      // Re-run pull for this repo
      const semaphore = new Semaphore(1);
      semaphore.acquire().then(() => {
        pullRepo(dir, name, timeoutSec, updateRepo).finally(() => {
          updateRepo(name, { elapsedMs: Date.now() - startMs });
          semaphore.release();
        });
      });
    }

    function handleRetryAll() {
      const failedRepos = currentRepos.filter(r => r.status === 'failed');
      for (const repo of failedRepos) {
        updateRepo(repo.name, {
          status: 'queued',
          lines: [],
          pid: undefined,
          exitCode: undefined,
          startMs: Date.now(),
          elapsedMs: undefined,
        });
      }
      const semaphore = new Semaphore(jobs);
      for (const repo of failedRepos) {
        const startMs = Date.now();
        semaphore.acquire().then(() => {
          pullRepo(dir, repo.name, timeoutSec, updateRepo).finally(() => {
            updateRepo(repo.name, { elapsedMs: Date.now() - startMs });
            semaphore.release();
          });
        });
      }
    }

    const appStartTime = Date.now();

    // Root component that holds state and subscribes to pull updates
    function App() {
      const [repos, setRepos] = useState<RepoState[]>(currentRepos);
      const [worktrees, setWorktrees] = useState<WorktreeEntry[]>(currentWorktrees);

      useEffect(() => {
        // Register the render callback so pull updates trigger re-renders
        renderCallback = (updatedRepos, updatedWorktrees) => {
          setRepos([...updatedRepos]);
          setWorktrees([...updatedWorktrees]);
        };
        return () => {
          renderCallback = null;
        };
      }, []);

      const allDone = repos.every(
        repo =>
          repo.status === 'updated' ||
          repo.status === 'up-to-date' ||
          repo.status === 'skipped' ||
          repo.status === 'failed',
      );

      return (
        <TuiApp
          repos={repos}
          worktrees={worktrees}
          allDone={allDone}
          startTime={appStartTime}
          jobs={jobs}
          onRetry={handleRetry}
          onRetryAll={handleRetryAll}
          onQuit={handleQuit}
        />
      );
    }

    inkInstance = render(<App />, {
      exitOnCtrlC: false,
      alternateScreen: true,
      incrementalRendering: true,
    });

    // Start pulls after rendering
    const semaphore = new Semaphore(jobs);
    const pullTasks = repoNames
      .filter((_, idx) => !dirtyResults[idx])
      .map(name => async () => {
        const startMs = Date.now();
        updateRepo(name, { startMs });
        await semaphore.acquire();
        try {
          await pullRepo(dir, name, timeoutSec, updateRepo);
        } finally {
          updateRepo(name, { elapsedMs: Date.now() - startMs });
          semaphore.release();
        }
      });

    // Worktree discovery
    const worktreeTask = noWorktrees
      ? Promise.resolve()
      : discoverWorktrees(dir).then(updateWorktrees);

    // Run pulls + worktree discovery in the background. They update state via
    // updateRepo/updateWorktrees; exit is driven solely by finish() (the quit
    // path), so quitting mid-pull no longer waits for stragglers.
    void Promise.all([...pullTasks.map(task => task()), worktreeTask]);
  });
}

async function main() {
  const options = parseArgs();

  // Use plain mode if --no-tui or stderr is not a TTY
  const usePlain = options.noTui || !process.stderr.isTTY;

  let exitCode: number;
  try {
    if (usePlain) {
      exitCode = await runPlain(options);
    } else {
      exitCode = await runTui(options);
    }
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    exitCode = 1;
  }

  process.exit(exitCode);
}

main();
