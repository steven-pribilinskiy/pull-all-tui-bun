import { basename } from 'node:path';
import type { RepoState, WorktreeEntry } from '../git/types.ts';
import { buildSummaryText } from '../git/parser.ts';

/**
 * Print per-repo result in plain streaming mode (byte-identical to bash reference).
 */
export function printRepoResult(repo: RepoState): void {
  if (repo.status === 'skipped') {
    process.stdout.write(`⚠️  Skipping ${repo.name} (has uncommitted changes)\n`);
    return;
  }
  if (repo.status === 'updated') {
    process.stdout.write(`✅ ${repo.name}\n`);
    // Print diff stat lines (appended after pull output by runner)
    // Diff stat starts at the empty line separator the runner inserts
    const emptyIdx = repo.lines.lastIndexOf('');
    if (emptyIdx >= 0 && emptyIdx < repo.lines.length - 1) {
      const diffLines = repo.lines.slice(emptyIdx + 1);
      if (diffLines.length > 0) {
        for (const line of diffLines) {
          process.stdout.write(`${line}\n`);
        }
        process.stdout.write('\n');
      }
    }
    return;
  }
  if (repo.status === 'up-to-date') {
    process.stdout.write(`✅ ${repo.name}\n`);
    return;
  }
  if (repo.status === 'failed') {
    process.stdout.write(`❌ Failed: ${repo.name}\n`);
    for (const line of repo.lines) {
      process.stdout.write(`   ${line}\n`);
    }
    process.stdout.write('\n');
  }
}

/**
 * Print final summary block in plain mode.
 */
export function printSummary(
  dir: string,
  repos: RepoState[],
  worktrees: WorktreeEntry[],
): void {
  const total = repos.length;
  if (total === 0) {
    process.stdout.write('\n');
    process.stdout.write(`   No git repositories found in ${basename(dir)}.\n`);
    return;
  }

  process.stdout.write('\n');
  const summaryText = buildSummaryText(
    repos.map(r => ({ name: r.name, branch: r.branch, status: r.status })),
    worktrees,
  );
  process.stdout.write(summaryText + '\n');
}
