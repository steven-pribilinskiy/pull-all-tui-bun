import { describe, test, expect } from 'bun:test';
import { classifyPullOutput, stripNewline, buildSummaryText } from '../parser.ts';

describe('classifyPullOutput', () => {
  const cases: Array<{ name: string; input: string; expected: 'up-to-date' | 'updated' }> = [
    {
      name: 'already up to date (canonical)',
      input: 'Already up to date.\n',
      expected: 'up-to-date',
    },
    {
      name: 'already up-to-date (hyphenated)',
      input: 'Already up-to-date.\n',
      expected: 'up-to-date',
    },
    {
      name: 'updated with fast-forward',
      input: 'Updating abc1234..def5678\nFast-forward\n src/foo.ts | 12 ++++++\n',
      expected: 'updated',
    },
    {
      name: 'empty output treated as updated',
      input: '',
      expected: 'updated',
    },
    {
      name: 'output with objects and unpacking',
      input:
        'remote: Counting objects: 12, done.\nremote: Compressing objects: 100%\nUnpacking objects: 100%\n',
      expected: 'updated',
    },
    {
      name: 'already up to date with leading whitespace',
      input: '  Already up to date.  ',
      expected: 'up-to-date',
    },
    {
      name: 'multi-line with already up to date in middle',
      input: 'Fetching origin\nAlready up to date.\nDone.',
      expected: 'up-to-date',
    },
    {
      name: 'partial match does not trigger',
      input: 'Already up to dat',
      expected: 'updated',
    },
    {
      name: 'case sensitive - lowercase does not match',
      input: 'already up to date.',
      expected: 'updated',
    },
  ];

  for (const testCase of cases) {
    test(testCase.name, () => {
      expect(classifyPullOutput(testCase.input)).toBe(testCase.expected);
    });
  }
});

describe('stripNewline', () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: 'strips trailing newline',
      input: 'main\n',
      expected: 'main',
    },
    {
      name: 'no change when no trailing newline',
      input: 'dev',
      expected: 'dev',
    },
    {
      name: 'empty string unchanged',
      input: '',
      expected: '',
    },
    {
      name: 'only strips last newline',
      input: 'feat/foo\n\n',
      expected: 'feat/foo\n',
    },
  ];

  for (const testCase of cases) {
    test(testCase.name, () => {
      expect(stripNewline(testCase.input)).toBe(testCase.expected);
    });
  }
});

describe('buildSummaryText', () => {
  test('empty repos returns no repos message', () => {
    const result = buildSummaryText([], []);
    expect(result).toContain('No git repositories found');
  });

  test('includes completion header', () => {
    const repos = [{ name: 'repo-a', branch: 'main', status: 'up-to-date' }];
    const result = buildSummaryText(repos, []);
    expect(result).toContain('🎉 Pull completed!');
  });

  test('totals line format', () => {
    const repos = [
      { name: 'repo-a', branch: 'main', status: 'updated' },
      { name: 'repo-b', branch: 'dev', status: 'up-to-date' },
      { name: 'repo-c', branch: 'main', status: 'skipped' },
      { name: 'repo-d', branch: 'feat/x', status: 'failed' },
    ];
    const result = buildSummaryText(repos, []);
    expect(result).toContain('4 total: 1 updated, 1 up-to-date, 1 skipped, 1 failed');
  });

  test('omits empty sections', () => {
    const repos = [{ name: 'repo-a', branch: 'main', status: 'updated' }];
    const result = buildSummaryText(repos, []);
    expect(result).toContain('✨ Updated repositories:');
    expect(result).not.toContain('📦 Unchanged repositories:');
    expect(result).not.toContain('⚠️');
    expect(result).not.toContain('❌');
  });

  test('includes worktrees section', () => {
    const repos = [{ name: 'repo-a', branch: 'main', status: 'up-to-date' }];
    const worktrees = [{ repo: 'repo-a', branch: 'feat/something' }];
    const result = buildSummaryText(repos, worktrees);
    expect(result).toContain('🌳 Active worktrees:');
    expect(result).toContain('feat/something');
  });

  test('omits worktrees section when no worktrees', () => {
    const repos = [{ name: 'repo-a', branch: 'main', status: 'up-to-date' }];
    const result = buildSummaryText(repos, []);
    expect(result).not.toContain('🌳 Active worktrees:');
  });

  test('padding aligns columns', () => {
    const repos = [
      { name: 'short', branch: 'main', status: 'updated' },
      { name: 'a-very-long-repo-name', branch: 'dev', status: 'up-to-date' },
    ];
    const result = buildSummaryText(repos, []);
    const lines = result.split('\n');
    const shortLine = lines.find(l => l.includes('short') && l.includes('main'));
    const longLine = lines.find(l => l.includes('a-very-long-repo-name') && l.includes('dev'));
    expect(shortLine).toBeDefined();
    expect(longLine).toBeDefined();
    // Both lines should have "  " (two spaces) before branch
    expect(shortLine).toMatch(/short\s+main/);
    expect(longLine).toMatch(/a-very-long-repo-name\s+dev/);
  });

  test('only updated total when all updated', () => {
    const repos = [
      { name: 'repo-a', branch: 'main', status: 'updated' },
      { name: 'repo-b', branch: 'main', status: 'updated' },
    ];
    const result = buildSummaryText(repos, []);
    expect(result).toContain('2 total: 2 updated');
    expect(result).not.toContain('up-to-date');
    expect(result).not.toContain('skipped');
    expect(result).not.toContain('failed');
  });
});
