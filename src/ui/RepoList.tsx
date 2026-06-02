import React from 'react';
import { Box, Text } from 'ink';
import type { RepoState } from '../git/types.ts';
import { statusGlyph, statusColor } from './glyphs.ts';

interface Props {
  repos: RepoState[];
  selectedIndex: number;
  spinFrame: number;
  allDone: boolean;
  /** How many characters to reserve for repo name column */
  repoColWidth: number;
  /** How many characters are available for the branch column */
  branchColWidth: number;
  /** Visible height of the list pane */
  visibleHeight: number;
  scrollOffset: number;
  showResult: boolean;
  resultGlyph: string;
}

export function RepoList({
  repos,
  selectedIndex,
  spinFrame,
  repoColWidth,
  branchColWidth,
  visibleHeight,
  scrollOffset,
  showResult,
  resultGlyph,
}: Props) {
  // Items = repos + synthetic Result item
  const totalItems = repos.length + (showResult ? 1 : 0);
  const visibleItems = repos.slice(scrollOffset, scrollOffset + visibleHeight);
  const resultVisible =
    showResult &&
    scrollOffset + visibleHeight > repos.length &&
    repos.length >= scrollOffset;

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {visibleItems.map((repo, visIdx) => {
        const absIdx = scrollOffset + visIdx;
        const isSelected = absIdx === selectedIndex;
        const glyph = statusGlyph(repo.status, spinFrame);
        const color = statusColor(repo.status);

        // Truncate branch to the real available branch-column width.
        const branch = repo.branch.length > branchColWidth
          ? repo.branch.slice(0, Math.max(1, branchColWidth - 1)) + '…'
          : repo.branch;

        const nameStr = repo.name.padEnd(repoColWidth);

        return (
          <Box key={repo.name} flexDirection="row">
            <Text
              inverse={isSelected}
              color={isSelected ? undefined : color}
            >
              {glyph}{' '}
              {nameStr}{' '}
              {branch}
              {isSelected ? ' ←' : ''}
            </Text>
          </Box>
        );
      })}

      {/* Separator before Result */}
      {resultVisible && (
        <Box flexDirection="column">
          <Text dimColor>{'─'.repeat(repoColWidth + 10)}</Text>
          <Box flexDirection="row">
            <Text inverse={selectedIndex === totalItems - 1}>
              {resultGlyph === '✓'
                ? '✓'
                : resultGlyph === '✗'
                  ? '✗'
                  : '—'}{' '}
              📋 Result (—)
              {selectedIndex === totalItems - 1 ? ' ←' : ''}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
