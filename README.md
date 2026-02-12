# @reins/tui

Terminal UI for Reins, built with Bun + OpenTUI.

## Architecture Overview

```text
src/
  app.tsx           -> root app composition
  components/       -> layout, messages, command palette, sidebar
  hooks/            -> conversation and focus behavior
  store/            -> local UI/conversation state
  ui/               -> rendering primitives and adapters
```

## Setup

```bash
bun install
```

## Scripts

- `bun run start` - Run TUI app
- `bun run typecheck` - TypeScript checks
- `bun test` - Test suite
- `bun run build` - TypeScript build output

## Test Commands

- Full suite: `bun test`
- Typecheck: `bun run typecheck`

## Local Linking Workflow

```bash
# in ../reins-core
bun link

# in this repo
bun link @reins/core
```
