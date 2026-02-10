# reins-tui

TUI application for Reins built on Bun. OpenTUI dependency will be added later.

## Setup

1. Install Bun: https://bun.sh
2. Install dependencies:

```bash
bun install
```

3. Run checks:

```bash
bun run typecheck
bun test
```

## Local linking workflow

Link `@reins/core` for local development:

```bash
# in ../reins-core
bun link

# in this repo
bun link @reins/core
```
