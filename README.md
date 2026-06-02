# pull-all-tui (Bun/TypeScript)

Interactive multi-repo `git pull` dashboard built with Bun + ink TUI.

## Requirements

- [Bun](https://bun.sh) v1.1+

## Build

```bash
bun install
make build
# or: bun run build
```

Produces `bin/pull-all-tui` (single self-contained binary, no runtime deps).

## Run

```bash
# Interactive TUI (default when stderr is a TTY)
bin/pull-all-tui [DIR]

# Plain streaming output (CI-friendly, byte-identical to bash reference)
bin/pull-all-tui --no-tui [DIR]

# Options:
#   -j, --jobs N      concurrency (default: nproc)
#   --no-tui          force plain output even on TTY
#   --no-worktrees    skip worktree discovery
#   --timeout SEC     per-pull timeout (default: 30)
#   --version
#   -h, --help

# Env vars:
#   PULL_JOBS=N       same as --jobs
#   PULL_TIMEOUT=N    same as --timeout
```

## Test

```bash
make test
# or: bun test
```

## Benchmark

```bash
make bench
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | All pulls succeeded |
| 1 | At least one failed |
| 2 | User quit mid-run |
| 130 | Ctrl-C |

## TUI Keybindings

| Key | Action |
|-----|--------|
| `j`/`↓` | Next repo |
| `k`/`↑` | Previous repo |
| `g` | Jump to top |
| `G` | Jump to bottom (Result item) |
| `Space` | Toggle the Result summary in the preview without moving selection (any navigation clears it) |
| `[` / `]` | Narrow / widen the left pane |
| `r` / `Enter` | Retry selected failed repo |
| `R` | Retry all failed repos |
| `Tab` | Toggle focus: list ↔ preview |
| `PgUp`/`PgDn` | Scroll preview |
| `/` | Filter list by substring |
| `Esc` | Clear filter |
| `q` | Quit |
| `Ctrl-C` | Quit (exit 130) |

### Mouse

ink has no mouse API, so SGR mouse reporting is enabled by hand and the raw
sequences are parsed off stdin. Click a repo row to select it, scroll the wheel
over the left pane to move the selection or over the right pane to scroll the
preview, and drag the divider between the panes to resize. While running, the
app captures the mouse, so native terminal text-selection is suspended until you
quit.
