import { readdir, stat, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { classifyPullOutput, stripNewline } from './parser.ts';
import type { RepoState, WorktreeEntry } from './types.ts';

const RING_BUFFER_CAP = 10_000;

// Every in-flight `git pull` child is tracked here so the quit path can kill
// them. Without this, pressing `q` while a slow repo is still pulling leaves
// Bun's event loop alive (awaiting proc.exited) for up to the full timeout —
// the "hangs after q" bug.
const activePulls = new Set<Bun.Subprocess>();

/** Kill every in-flight git pull (SIGTERM). Called from the quit path. */
export function killAllPulls(): void {
  for (const proc of activePulls) {
    try {
      proc.kill();
    } catch {
      // already exited
    }
  }
  activePulls.clear();
}

export function appendLines(existing: string[], newText: string): string[] {
  if (!newText) return existing;
  const incoming = newText.split('\n');
  // Remove trailing empty element from trailing newline
  if (incoming.at(-1) === '') incoming.pop();
  const combined = [...existing, ...incoming];
  if (combined.length > RING_BUFFER_CAP) {
    return combined.slice(combined.length - RING_BUFFER_CAP);
  }
  return combined;
}

/**
 * Discover immediate git repo directories (sorted alphabetically).
 * Returns array of absolute paths.
 */
export async function discoverRepos(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names = entries
    .filter(entry => entry.isDirectory() && !entry.name.includes('.worktrees'))
    .map(entry => entry.name)
    .sort();

  const repos: string[] = [];
  for (const name of names) {
    try {
      await stat(join(dir, name, '.git'));
      repos.push(name);
    } catch {
      // Not a git repo
    }
  }
  return repos;
}

/**
 * Get current branch for a repo directory.
 */
export async function getBranch(dir: string, repoName: string): Promise<string> {
  const proc = Bun.spawn(
    ['git', '-C', join(dir, repoName), 'rev-parse', '--abbrev-ref', 'HEAD'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return stripNewline(text) || '?';
}

/**
 * Check if repo is dirty (has uncommitted changes).
 */
export async function isDirty(dir: string, repoName: string): Promise<boolean> {
  const proc = Bun.spawn(
    ['git', '-C', join(dir, repoName), 'status', '--porcelain'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim().length > 0;
}

/**
 * Discover worktrees in parallel with pulls.
 * Globs dir/NAME.worktrees/BRANCH/.git (fixed 3-level depth)
 */
export async function discoverWorktrees(dir: string): Promise<WorktreeEntry[]> {
  const result: WorktreeEntry[] = [];
  let entries: string[] = [];
  try {
    const dirEntries = await readdir(dir, { withFileTypes: true });
    entries = dirEntries
      .filter(e => e.isDirectory() && e.name.endsWith('.worktrees'))
      .map(e => e.name);
  } catch {
    return result;
  }

  for (const worktreeDir of entries) {
    const repoName = worktreeDir.replace(/\.worktrees$/, '');
    const fullPath = join(dir, worktreeDir);
    let branches: string[] = [];
    try {
      const branchEntries = await readdir(fullPath, { withFileTypes: true });
      branches = branchEntries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      continue;
    }

    for (const branch of branches) {
      const gitPath = join(fullPath, branch, '.git');
      try {
        await stat(gitPath);
        const proc = Bun.spawn(
          ['git', '-C', join(fullPath, branch), 'rev-parse', '--abbrev-ref', 'HEAD'],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        const branchName = stripNewline(await new Response(proc.stdout).text());
        await proc.exited;
        result.push({ repo: repoName, branch: branchName || branch });
      } catch {
        // Not a valid worktree
      }
    }
  }

  return result;
}

export type OnUpdate = (name: string, patch: Partial<RepoState>) => void;

/**
 * Run git pull for a single repo. Calls onUpdate as output streams in.
 */
export async function pullRepo(
  dir: string,
  repoName: string,
  timeoutSec: number,
  onUpdate: OnUpdate,
): Promise<void> {
  const repoPath = join(dir, repoName);

  const proc = Bun.spawn(
    ['timeout', String(timeoutSec), 'git', 'pull', '--ff-only'],
    {
      cwd: repoPath,
      stdin: Bun.file('/dev/null'),
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  activePulls.add(proc);

  onUpdate(repoName, { status: 'running', pid: proc.pid });

  const collectedLines: string[] = [];

  // Read stdout and stderr concurrently
  const drainStream = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Emit complete lines
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        collectedLines.push(line);
        onUpdate(repoName, { lines: [...collectedLines] });
      }
    }
    if (buffer.length > 0) {
      collectedLines.push(buffer);
      onUpdate(repoName, { lines: [...collectedLines] });
    }
  };

  await Promise.all([drainStream(proc.stdout), drainStream(proc.stderr)]);
  const exitCode = await proc.exited;
  activePulls.delete(proc);

  if (exitCode === 0) {
    const fullOutput = collectedLines.join('\n');
    const classification = classifyPullOutput(fullOutput);

    if (classification === 'updated') {
      // Append diff stat
      const diffProc = Bun.spawn(
        ['git', 'diff', '--stat', '--color=always', 'HEAD@{1}', 'HEAD'],
        {
          cwd: repoPath,
          stdin: Bun.file('/dev/null'),
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const diffText = await new Response(diffProc.stdout).text();
      await diffProc.exited;
      if (diffText.trim()) {
        collectedLines.push('');
        for (const line of diffText.split('\n')) {
          if (line !== '' || collectedLines.at(-1) !== '') {
            collectedLines.push(line);
          }
        }
      }
    }

    onUpdate(repoName, {
      status: classification,
      exitCode,
      lines: [...collectedLines],
      pid: undefined,
    });
  } else {
    onUpdate(repoName, {
      status: 'failed',
      exitCode,
      lines: [...collectedLines],
      pid: undefined,
    });
  }
}

/**
 * Simple promise-based semaphore.
 */
export class Semaphore {
  private _count: number;
  private _queue: Array<() => void> = [];

  constructor(count: number) {
    this._count = count;
  }

  async acquire(): Promise<void> {
    if (this._count > 0) {
      this._count--;
      return;
    }
    await new Promise<void>(resolve => {
      this._queue.push(resolve);
    });
  }

  release(): void {
    if (this._queue.length > 0) {
      const next = this._queue.shift()!;
      next();
    } else {
      this._count++;
    }
  }
}
