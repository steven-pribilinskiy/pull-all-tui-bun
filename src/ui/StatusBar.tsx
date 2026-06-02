import React from 'react';
import { Box, Text } from 'ink';
import type { RepoState } from '../git/types.ts';

interface Props {
  repos: RepoState[];
  jobs: number;
  elapsedMs: number;
  filterMode: boolean;
  filterText: string;
}

export function StatusBar({ repos, jobs, elapsedMs, filterMode, filterText }: Props) {
  const running = repos.filter(r => r.status === 'running').length;
  const done = repos.filter(
    r =>
      r.status === 'updated' ||
      r.status === 'up-to-date' ||
      r.status === 'skipped' ||
      r.status === 'failed',
  ).length;
  const total = repos.length;
  const elapsed = (elapsedMs / 1000).toFixed(1) + 's';

  // Row 1 — move & view, or the live filter prompt when filtering.
  const row1 = filterMode
    ? `Filter: ${filterText}█`
    : `j/k ↑/↓ move · g/G top/end · click select · wheel scroll · space result`;

  // Row 2 — act & layout, plus live run stats.
  const row2 =
    `r/R retry · / filter · [ ] / drag resize · tab focus · q quit  ·  ` +
    `${jobs} jobs · ${done}/${total} done · ${running} running · ${elapsed}`;

  return (
    <Box flexDirection="column">
      <Text dimColor>{row1}</Text>
      <Text dimColor>{row2}</Text>
    </Box>
  );
}
