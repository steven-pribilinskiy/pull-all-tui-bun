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

  const filterStr = filterMode ? ` · filter: ${filterText}█` : '';

  return (
    <Box>
      <Text dimColor>
        {filterMode
          ? `Filter: ${filterText}█ (Esc to clear)`
          : `j/k nav · r retry · R retry-failed · q quit · ${jobs} jobs · ${done}/${total} done · ${running} running · ${elapsed}${filterStr}`}
      </Text>
    </Box>
  );
}
