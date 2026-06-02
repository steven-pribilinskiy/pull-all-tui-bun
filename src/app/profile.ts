import type { RepoState, RepoStatus } from '../git/types.ts';

const STATUS_LABEL: Record<RepoStatus, string> = {
  queued: 'queued',
  running: 'running',
  updated: 'updated',
  'up-to-date': 'uptodate',
  skipped: 'skipped',
  failed: 'failed',
};

function lastLogLine(repo: RepoState): string {
  if (repo.status === 'skipped') return 'uncommitted changes';
  for (let idx = repo.lines.length - 1; idx >= 0; idx--) {
    const line = (repo.lines[idx] ?? '').trim();
    if (line) return line.length > 100 ? line.slice(0, 100) : line;
  }
  return '';
}

/**
 * Build the profiling report — repos sorted by elapsed DESCENDING so the
 * slowest straggler is the first data row.
 */
export function buildProfileReport(repos: RepoState[]): string {
  const sorted = [...repos].sort((left, right) => (right.elapsedMs ?? 0) - (left.elapsedMs ?? 0));
  const maxNameLen = repos.reduce((max, repo) => Math.max(max, repo.name.length), 0);

  const rows = sorted.map(repo => {
    const elapsed = `${((repo.elapsedMs ?? 0) / 1000).toFixed(2)}s`.padStart(8);
    const status = STATUS_LABEL[repo.status].padEnd(10);
    const name = repo.name.padEnd(maxNameLen);
    return `  ${elapsed}  ${status}  ${name}  (${repo.branch})  ${lastLogLine(repo)}`;
  });

  return [`pull-all-tui profile — ${repos.length} repos, slowest first`, ...rows].join('\n');
}

/**
 * Emit the profiling report to the profile-out file (if given) or process.stderr.
 */
export async function emitProfileReport(repos: RepoState[], profileOut?: string): Promise<void> {
  const report = buildProfileReport(repos);
  if (profileOut) {
    await Bun.write(profileOut, report + '\n');
  } else {
    process.stderr.write(report + '\n');
  }
}
