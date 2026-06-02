import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { RepoList } from './RepoList.tsx';
import { PreviewPane } from './PreviewPane.tsx';
import { StatusBar } from './StatusBar.tsx';
import { overallResultGlyph } from './glyphs.ts';
import type { RepoState, WorktreeEntry } from '../git/types.ts';
import { buildSummaryText } from '../git/parser.ts';

interface Props {
  repos: RepoState[];
  worktrees: WorktreeEntry[];
  allDone: boolean;
  startTime: number;
  jobs: number;
  onRetry: (name: string) => void;
  onRetryAll: () => void;
  onQuit: (code: number) => void;
}

const PREVIEW_SCROLL_PAGE = 10;

export function TuiApp({
  repos,
  worktrees,
  allDone,
  startTime,
  jobs,
  onRetry,
  onRetryAll,
  onQuit,
}: Props) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewScrollOffset, setPreviewScrollOffset] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [spinFrame, setSpinFrame] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [filterMode, setFilterMode] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [listScrollOffset, setListScrollOffset] = useState(0);
  const [userNavigated, setUserNavigated] = useState(false);
  const [previewFocused, setPreviewFocused] = useState(false);
  const prevAllDoneRef = useRef(false);

  // Filtered repos
  const filteredRepos = filterText
    ? repos.filter(r => r.name.toLowerCase().includes(filterText.toLowerCase()))
    : repos;

  const totalItems = filteredRepos.length + 1; // +1 for Result item
  const resultIndex = filteredRepos.length; // last item index

  // Layout computation
  const leftPaneWidth = Math.floor(columns * 0.4);
  const rightPaneWidth = columns - leftPaneWidth - 1; // -1 for divider
  const headerHeight = 2; // title + separator
  const statusBarHeight = 1;
  const listHeight = rows - headerHeight - statusBarHeight - 2;
  const previewHeight = rows - headerHeight - statusBarHeight - 2;

  // Repo column width
  const maxNameLen = Math.max(
    ...filteredRepos.map(r => r.name.length),
    26,
  );
  const repoColWidth = maxNameLen;

  // Branch column = whatever's left in the left pane after the border (2) +
  // padding (2) chrome, the status glyph + space (2), the padded name column,
  // the name/branch separator space (1), and the reserved selection arrow (2).
  // Derived from the real pane width — the old formula used the name column,
  // which truncated long-named repos' branches to ~4 chars.
  const branchColWidth = Math.max(3, leftPaneWidth - 4 - 2 - repoColWidth - 1 - 2);

  // Auto-select first running repo on launch
  useEffect(() => {
    if (!userNavigated) {
      const firstRunning = filteredRepos.findIndex(r => r.status === 'running');
      if (firstRunning >= 0) {
        setSelectedIndex(firstRunning);
        ensureVisible(firstRunning, listHeight);
      }
    }
  });

  // Auto-select Result when all done
  useEffect(() => {
    if (allDone && !prevAllDoneRef.current) {
      prevAllDoneRef.current = true;
      setSelectedIndex(resultIndex);
      setAutoScroll(true);
      setUserNavigated(false);
    }
  }, [allDone, resultIndex]);

  // Auto-advance selection to first running if current is done (and user hasn't navigated)
  useEffect(() => {
    if (!userNavigated && !allDone) {
      const currentIsRunning = selectedIndex < filteredRepos.length &&
        filteredRepos[selectedIndex]?.status === 'running';
      if (!currentIsRunning) {
        const firstRunning = filteredRepos.findIndex(r => r.status === 'running');
        if (firstRunning >= 0) {
          setSelectedIndex(firstRunning);
          ensureVisible(firstRunning, listHeight);
        }
      }
    }
  });

  // Spinner animation
  useEffect(() => {
    const interval = setInterval(() => {
      setSpinFrame(prev => prev + 1);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 200);
    return () => clearInterval(interval);
  }, [startTime]);

  // Auto-scroll preview when selected repo updates
  const selectedRepo = selectedIndex < filteredRepos.length ? filteredRepos[selectedIndex] : null;
  const isResultItem = selectedIndex === resultIndex;

  const previewLines = isResultItem
    ? buildSummaryText(
        repos.map(r => ({ name: r.name, branch: r.branch, status: r.status })),
        worktrees,
      ).split('\n')
    : (selectedRepo?.lines ?? []);

  useEffect(() => {
    if (autoScroll && previewLines.length > previewHeight) {
      setPreviewScrollOffset(Math.max(0, previewLines.length - previewHeight));
    }
  });

  function ensureVisible(index: number, height: number) {
    setListScrollOffset(prev => {
      if (index < prev) return index;
      if (index >= prev + height) return index - height + 1;
      return prev;
    });
  }

  const moveSelection = useCallback(
    (delta: number) => {
      setUserNavigated(true);
      setSelectedIndex(prev => {
        const next = Math.max(0, Math.min(totalItems - 1, prev + delta));
        ensureVisible(next, listHeight);
        return next;
      });
      setAutoScroll(true);
      setPreviewScrollOffset(0);
    },
    [totalItems, listHeight],
  );

  useInput((input, key) => {
    // Filter mode input handling
    if (filterMode) {
      if (key.escape) {
        setFilterMode(false);
        setFilterText('');
        return;
      }
      if (key.backspace || key.delete) {
        setFilterText(prev => prev.slice(0, -1));
        return;
      }
      if (key.return) {
        setFilterMode(false);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setFilterText(prev => prev + input);
        return;
      }
      return;
    }

    // Navigation
    if (input === 'j' || key.downArrow) {
      moveSelection(1);
      return;
    }
    if (input === 'k' || key.upArrow) {
      moveSelection(-1);
      return;
    }
    if (input === 'g') {
      setUserNavigated(true);
      setSelectedIndex(0);
      setListScrollOffset(0);
      setPreviewScrollOffset(0);
      return;
    }
    if (input === 'G') {
      setUserNavigated(true);
      setSelectedIndex(resultIndex);
      ensureVisible(resultIndex, listHeight);
      setPreviewScrollOffset(0);
      return;
    }

    // Tab: toggle preview focus
    if (key.tab) {
      setPreviewFocused(prev => !prev);
      return;
    }

    // Preview scrolling (when preview focused or pgup/pgdn)
    if (key.pageUp || (previewFocused && key.upArrow)) {
      setAutoScroll(false);
      setPreviewScrollOffset(prev => Math.max(0, prev - PREVIEW_SCROLL_PAGE));
      return;
    }
    if (key.pageDown || (previewFocused && key.downArrow)) {
      setPreviewScrollOffset(prev => {
        const maxOffset = Math.max(0, previewLines.length - previewHeight);
        const next = Math.min(maxOffset, prev + PREVIEW_SCROLL_PAGE);
        if (next >= maxOffset) setAutoScroll(true);
        return next;
      });
      return;
    }
    if (key.end) {
      setAutoScroll(true);
      setPreviewScrollOffset(Math.max(0, previewLines.length - previewHeight));
      return;
    }

    // Clear log
    if (input === 'c') {
      // Handled by parent via callback if needed; log clear is cosmetic
      return;
    }

    // Filter
    if (input === '/') {
      setFilterMode(true);
      setFilterText('');
      return;
    }

    // Retry
    if ((input === 'r' || key.return) && allDone) {
      if (selectedRepo?.status === 'failed') {
        onRetry(selectedRepo.name);
        setUserNavigated(false);
      }
      return;
    }
    if (input === 'R' && allDone) {
      onRetryAll();
      setUserNavigated(false);
      return;
    }

    // Quit
    if (input === 'q' || key.escape) {
      const code = allDone ? (repos.some(r => r.status === 'failed') ? 1 : 0) : 2;
      onQuit(code);
      exit();
      return;
    }
    if (key.ctrl && input === 'c') {
      onQuit(130);
      exit();
      return;
    }
  });

  const resultGlyph = overallResultGlyph(filteredRepos, allDone);
  const titleRunning = filteredRepos.filter(r => r.status === 'running').length;
  const titleDone = filteredRepos.filter(
    r => r.status !== 'queued' && r.status !== 'running',
  ).length;

  return (
    <Box flexDirection="column" height={rows}>
      {/* Title bar */}
      <Box flexDirection="row" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold>pull-all-tui</Text>
        <Text> · </Text>
        <Text>{titleDone}/{filteredRepos.length}</Text>
        <Text> · </Text>
        <Text>{(elapsedMs / 1000).toFixed(1)}s</Text>
        {previewFocused && <Text dimColor> · [preview]</Text>}
      </Box>

      {/* Main content area */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Left pane */}
        <Box
          flexDirection="column"
          width={leftPaneWidth}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          overflow="hidden"
        >
          <RepoList
            repos={filteredRepos}
            selectedIndex={selectedIndex}
            spinFrame={spinFrame}
            allDone={allDone}
            repoColWidth={repoColWidth}
            branchColWidth={branchColWidth}
            visibleHeight={listHeight}
            scrollOffset={listScrollOffset}
            showResult={!filterText}
            resultGlyph={resultGlyph}
          />
        </Box>

        {/* Divider */}
        <Box flexDirection="column" width={1}>
          <Text>│</Text>
        </Box>

        {/* Right pane */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          overflow="hidden"
        >
          <PreviewPane
            selectedRepo={selectedRepo}
            isResultItem={isResultItem && !filterText}
            repos={repos}
            worktrees={worktrees}
            previewScrollOffset={previewScrollOffset}
            visibleHeight={previewHeight}
            width={rightPaneWidth - 4}
          />
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        repos={repos}
        jobs={jobs}
        elapsedMs={elapsedMs}
        filterMode={filterMode}
        filterText={filterText}
      />
    </Box>
  );
}
