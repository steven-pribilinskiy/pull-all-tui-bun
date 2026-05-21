/**
 * Parse git pull output to determine classification.
 * Returns 'up-to-date' if the log contains "Already up to date.",
 * otherwise 'updated' (for exit 0 cases).
 */
export function classifyPullOutput(output: string): 'up-to-date' | 'updated' {
  if (output.includes('Already up to date.') || output.includes('Already up-to-date.')) {
    return 'up-to-date';
  }
  return 'updated';
}

/**
 * Strip trailing newline from a string (used for branch name capture).
 */
export function stripNewline(str: string): string {
  return str.replace(/\n$/, '');
}

/**
 * Build the summary text block matching bash reference output.
 */
export function buildSummaryText(
  repos: Array<{ name: string; branch: string; status: string }>,
  worktrees: Array<{ repo: string; branch: string }>,
): string {
  const updated = repos.filter(r => r.status === 'updated');
  const upToDate = repos.filter(r => r.status === 'up-to-date');
  const skipped = repos.filter(r => r.status === 'skipped');
  const failed = repos.filter(r => r.status === 'failed');

  const total = updated.length + upToDate.length + skipped.length + failed.length;
  if (total === 0) {
    return '   No git repositories found.';
  }

  // Compute padding width across all repo names and worktree repo names
  let pad = 0;
  for (const r of repos) {
    if (r.name.length > pad) pad = r.name.length;
  }
  for (const wt of worktrees) {
    if (wt.repo.length > pad) pad = wt.repo.length;
  }

  const parts: string[] = [];
  if (updated.length > 0) parts.push(`${updated.length} updated`);
  if (upToDate.length > 0) parts.push(`${upToDate.length} up-to-date`);
  if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
  if (failed.length > 0) parts.push(`${failed.length} failed`);

  const lines: string[] = [];
  lines.push('🎉 Pull completed!');
  lines.push('');
  lines.push(`   ${total} total: ${parts.join(', ')}`);

  const printSection = (
    header: string,
    items: Array<{ name: string; branch: string }>,
  ) => {
    if (items.length === 0) return;
    lines.push('');
    lines.push(header);
    for (const item of items) {
      lines.push(`   - ${item.name.padEnd(pad)}  ${item.branch}`);
    }
  };

  printSection('✨ Updated repositories:', updated.map(r => ({ name: r.name, branch: r.branch })));
  printSection('📦 Unchanged repositories:', upToDate.map(r => ({ name: r.name, branch: r.branch })));
  printSection('⚠️  Skipped repositories (uncommitted changes):', skipped.map(r => ({ name: r.name, branch: r.branch })));
  printSection('❌ Failed repositories:', failed.map(r => ({ name: r.name, branch: r.branch })));

  if (worktrees.length > 0) {
    lines.push('');
    lines.push('🌳 Active worktrees:');
    for (const wt of worktrees) {
      lines.push(`   - ${wt.repo.padEnd(pad)}  ${wt.branch}`);
    }
  }

  return lines.join('\n');
}
