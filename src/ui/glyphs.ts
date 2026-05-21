import type { RepoStatus } from '../git/types.ts';

export function statusGlyph(status: RepoStatus, spinFrame?: number): string {
  switch (status) {
    case 'queued':
      return '◯';
    case 'running': {
      const frames = ['◐', '◓', '◑', '◒'];
      return frames[(spinFrame ?? 0) % frames.length];
    }
    case 'updated':
      return '✓';
    case 'up-to-date':
      return '◌';
    case 'skipped':
      return '⊘';
    case 'failed':
      return '✗';
  }
}

export function statusColor(status: RepoStatus): string {
  switch (status) {
    case 'queued':
      return 'gray';
    case 'running':
      return 'cyan';
    case 'updated':
      return 'green';
    case 'up-to-date':
      return 'white';
    case 'skipped':
      return 'yellow';
    case 'failed':
      return 'red';
  }
}

export function overallResultGlyph(
  repos: Array<{ status: string }>,
  allDone: boolean,
): string {
  if (!allDone) return '—';
  if (repos.some(r => r.status === 'failed')) return '✗';
  return '✓';
}
