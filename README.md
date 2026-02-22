<p align="center">
  <pre align="center">
   \ //
  ( @ @ )
  --(_)--
   / \\
   REINS
  </pre>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.0+-f97316?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/OpenTUI-0.1.79-1a1b26?style=for-the-badge" alt="OpenTUI" />
  <img src="https://img.shields.io/badge/Tests-74_passing-22c55e?style=for-the-badge" alt="Tests" />
  <img src="https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge" alt="MIT License" />
</p>

# @reins/tui

The terminal interface for [Reins](https://reinsbot.com). A full-featured AI assistant running in your terminal, built with React 19 and [OpenTUI](https://github.com/opentui/opentui) (Zig-based terminal renderer).

This isn't a stripped-down CLI — it's a rich, multi-pane application with conversation management, model selection, streaming responses, command palette, plugin/skill management, memory, browser automation, and daemon integration. All rendered in your terminal.

## Quick Start

```bash
bun install
bun run start
```

That's it. The TUI launches in your terminal. On first run, you'll be guided through setup — connecting a provider, choosing a model, and optional personalization.

---

## Features

### Conversations
Multi-turn AI conversations with full streaming support. Create, switch, rename, and delete conversations. History persists across sessions via the Reins daemon. Messages render with markdown formatting, syntax highlighting for code blocks, and inline tool call results.

### Model Selection
Switch between models on the fly with `Ctrl+M`. The model selector shows all available models grouped by provider, with connection status indicators. Models are fetched from the daemon, which aggregates across all configured providers (BYOK, OAuth, local).

### Command Palette
`Ctrl+K` opens a fuzzy-search command palette — search commands, switch conversations, open panels, toggle settings. Think VS Code's command palette, but in your terminal.

### Provider Connection
Connect to AI providers directly from the TUI. The connect flow supports API key entry (BYOK) and OAuth browser-based auth. Connected providers immediately show their models in the model selector.

### Panels & Layout
A multi-pane layout with pinnable side panels:

- **Drawer** (`Ctrl+1`) — conversation list and search
- **Today** (`Ctrl+2`) — daily briefing, calendar, reminders
- **Daemon** — daemon status and management
- **Integrations** — connected services and channels
- **Skills** — installed skills with enable/disable and marketplace browsing
- **Browser** — browser automation status and control
- **Schedule** — scheduled tasks and cron jobs
- **Persona Editor** — customize assistant personality and system prompt
- **Memory Setup** — configure embedding provider for semantic memory

Panels can be pinned to stay open or dismissed. Pin state persists across sessions.

### Keyboard-Driven

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+N` | New conversation |
| `Ctrl+M` | Model selector |
| `Ctrl+T` | Cycle thinking level (none → low → medium → high) |
| `Ctrl+1` | Toggle drawer (conversation list) |
| `Ctrl+2` | Toggle today panel |
| `Ctrl+3` | Focus input |
| `Ctrl+A` | Toggle activity panel |
| `Ctrl+Z` | Zen mode (hide all panels) |
| `Ctrl+I` | Integrations panel |
| `Ctrl+L` | Skills panel |
| `Tab` | Cycle focus between panels |
| `?` | Help screen |
| `q` | Quit |

### Thinking Blocks
Toggle visibility of model thinking/reasoning blocks. Cycle through thinking levels to control how much reasoning the model shows. Preferences persist across sessions.

### Channels
Connect Discord and Telegram bots directly from the TUI. The `/channels add` command prompts for a bot token, configures the channel through the daemon, and shows connection status. Per-channel auth with `/auth` and `/deauth` commands.

### Onboarding
First-run wizard that walks through provider setup, model selection, and personality customization. Can be re-run anytime from the command palette.

---

## Architecture

```
src/
├── index.tsx              Entry point — mounts React app into OpenTUI renderer
├── app.tsx                Root component — state management, keyboard handling, daemon connection
│
├── components/
│   ├── layout.tsx         Multi-pane layout with pinnable panels
│   ├── sidebar.tsx        Conversation list sidebar
│   ├── conversation-panel.tsx   Message display with streaming
│   ├── input-area.tsx     Message input with history navigation
│   ├── status-bar.tsx     Bottom status bar (model, connection, persona)
│   ├── command-palette.tsx Fuzzy-search command palette
│   ├── model-selector.tsx  Provider-grouped model picker
│   ├── connect-flow.tsx   Provider connection wizard (BYOK + OAuth)
│   ├── message.tsx        Individual message rendering
│   ├── markdown-text.tsx  Markdown rendering in terminal
│   ├── streaming-text.tsx Streaming text display
│   ├── thinking-block.tsx Reasoning/thinking block display
│   ├── tool-inline.tsx    Inline tool call results
│   ├── help-screen.tsx    Keyboard shortcut reference
│   ├── error-boundary.tsx React error boundary
│   ├── logo-ascii.tsx     The Reins bug logo (standard + sad variants)
│   ├── persona-editor.tsx System prompt and personality editor
│   ├── memory-panel.tsx   Memory search and management
│   ├── daemon-panel.tsx   Daemon status and control
│   ├── integration-panel.tsx Channel and integration management
│   ├── BrowserPanel.tsx   Browser automation interface
│   ├── SchedulePanel.tsx  Scheduled task viewer
│   ├── onboarding/        First-run wizard components
│   ├── setup/             Embedding and memory setup wizards
│   ├── skills/            Skill list, detail view, marketplace
│   └── ...
│
├── daemon/
│   ├── client.ts          Daemon HTTP client interface
│   ├── live-daemon-client.ts  Production client implementation
│   ├── mock-daemon.ts     Mock client for testing
│   ├── ws-transport.ts    WebSocket streaming transport
│   ├── daemon-context.tsx React context for daemon state
│   ├── memory-client.ts   Memory/embedding API client
│   ├── auth-client.ts     Auth flow client
│   └── contracts.ts       Daemon API type contracts
│
├── store/
│   └── ...                App state (useReducer + Context), actions, selectors
│
├── state/
│   ├── conversation-store.ts  Conversation state machine with streaming
│   ├── streaming-state.ts     Streaming lifecycle management
│   ├── model-persistence.ts   Persist model selection across sessions
│   ├── pin-persistence.ts     Persist panel pin state
│   ├── session-persistence.ts Persist active conversation
│   └── thinking-persistence.ts Persist thinking level preferences
│
├── hooks/
│   ├── useConversations.ts  Conversation management hook
│   ├── useFocus.ts          Panel focus management
│   └── useFirstRun.ts       First-run detection
│
├── commands/
│   └── handlers/            Slash command handlers (channels, setup, proactive, tasks)
│
├── palette/
│   └── fuzzy-index.ts       Fuzzy search indexing for command palette
│
├── providers/
│   └── connect-service.ts   Provider connection orchestration
│
├── theme/
│   └── ...                  Theme tokens and provider
│
├── ui/
│   └── ...                  OpenTUI abstraction layer (Box, Text, useKeyboard, useRenderer)
│
├── personalization/
│   └── greeting-service.ts  Startup greeting and daily briefing
│
└── screens/
    ├── chat-screen.tsx      Main chat screen
    ├── AuthGate.tsx         Auth gate wrapper
    └── help-screen.tsx      Full help reference
```

### State Management

App state is managed with `useReducer` + React Context. The `AppContext` provides state and dispatch to the entire component tree. Key state slices:

- **Conversations** — list, active ID, messages
- **Streaming** — lifecycle status, thinking level, visibility
- **Panels** — open/closed and pinned state for each panel
- **Models** — available models, current selection, provider
- **UI** — command palette, model selector, connect flow, help screen

### Daemon Connection

The TUI connects to the Reins daemon over HTTP and WebSocket. The daemon handles provider management, conversation persistence, model routing, and streaming. The `DaemonProvider` context manages connection state and exposes the client to all components.

Messages are streamed via WebSocket with a conversation store that manages the full streaming lifecycle — sending, thinking, streaming, tool calls, completion, and cancellation.

### OpenTUI Abstraction

All OpenTUI imports are isolated behind `src/ui/` to decouple the rest of the app from the rendering framework. This layer exports `Box`, `Text`, `useKeyboard`, `useRenderer`, and terminal dimension utilities.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run start` | Launch the TUI |
| `bun test` | Run the full 74-test suite |
| `bun run typecheck` | TypeScript strict mode check |
| `bun run build` | Compile TypeScript |

## Local Linking

This repo depends on `@reins/core` as a file dependency:

```bash
# in ../reins-core
bun link

# in this repo
bun link @reins/core
```

## Links

- [Reins website](https://reinsbot.com)
- [GitHub organization](https://github.com/reins-ai)

## License

[MIT](./LICENSE)
