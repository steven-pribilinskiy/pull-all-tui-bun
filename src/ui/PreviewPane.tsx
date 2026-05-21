import React from 'react';
import { Box, Text } from 'ink';
import type { RepoState } from '../git/types.ts';
import { buildSummaryText } from '../git/parser.ts';
import type { WorktreeEntry } from '../git/types.ts';

interface Props {
  selectedRepo: RepoState | null;
  isResultItem: boolean;
  repos: RepoState[];
  worktrees: WorktreeEntry[];
  previewScrollOffset: number;
  visibleHeight: number;
  width: number;
}

export function PreviewPane({
  selectedRepo,
  isResultItem,
  repos,
  worktrees,
  previewScrollOffset,
  visibleHeight,
  width,
}: Props) {
  let header = '';
  let bodyLines: string[] = [];

  if (isResultItem) {
    header = `📋 Result · — · pid —`;
    const summaryText = buildSummaryText(
      repos.map(r => ({ name: r.name, branch: r.branch, status: r.status })),
      worktrees,
    );
    bodyLines = summaryText.split('\n');
  } else if (selectedRepo) {
    const pidStr = selectedRepo.pid !== undefined ? `pid ${selectedRepo.pid}` : 'pid —';
    header = `${selectedRepo.name} · ${selectedRepo.status} · ${pidStr}`;
    bodyLines = selectedRepo.lines;
  } else {
    header = '— · — · pid —';
    bodyLines = [];
  }

  // Apply scroll
  const visibleLines = bodyLines.slice(
    previewScrollOffset,
    previewScrollOffset + visibleHeight,
  );

  // Word-wrap long lines to width
  const wrappedLines: string[] = [];
  for (const line of visibleLines) {
    // Strip ANSI for length measurement, but preserve original for output
    const stripped = stripAnsi(line);
    if (stripped.length <= width) {
      wrappedLines.push(line);
    } else {
      // Simple wrap at width boundaries
      let remaining = line;
      while (stripAnsi(remaining).length > width) {
        wrappedLines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      if (remaining) wrappedLines.push(remaining);
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Text bold>{header}</Text>
      <Box flexDirection="column" overflow="hidden">
        {wrappedLines.map((line, idx) => (
          <Text key={idx}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
}

// Simple ANSI strip for length calculation
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '');
}
