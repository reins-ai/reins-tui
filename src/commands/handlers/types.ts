import type { DaemonClient } from "../../daemon/client";
import type { Result } from "../../daemon/contracts";
import type { ParsedCommand } from "../parser";
import type { SlashCommandDefinition } from "../registry";

export type CommandSignalType = "OPEN_CONNECT_FLOW" | "OPEN_EMBEDDING_SETUP" | "OPEN_SETTINGS" | "OPEN_SEARCH_SETTINGS" | "OPEN_DAEMON_PANEL" | "RELAUNCH_ONBOARDING" | "QUIT_TUI" | "ENVIRONMENT_SWITCHED";

export interface CommandSignal {
  readonly type: CommandSignalType;
  readonly payload?: string;
}

export interface CommandResult {
  readonly statusMessage: string;
  readonly responseText?: string;
  readonly signals?: readonly CommandSignal[];
}

export type CommandErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "UNSUPPORTED"
  | "UNKNOWN_HANDLER";

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}

export interface MessageSnapshot {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly createdAt: Date;
}

export interface ModelCommandContext {
  readonly availableModels: readonly string[];
  readonly currentModel: string;
  setModel(model: string): void;
}

export interface ThemeCommandContext {
  readonly activeTheme: string;
  listThemes(): readonly string[];
  setTheme(name: string): boolean;
}

export interface SessionCommandContext {
  readonly activeConversationId: string | null;
  readonly messages: readonly MessageSnapshot[];
  createConversation(title?: string): string;
  clearConversation(): void;
}

export interface ViewCommandContext {
  readonly compactMode: boolean;
  setCompactMode(compactMode: boolean): void;
}

export type MemoryType = "fact" | "preference" | "decision" | "episode" | "skill" | "entity" | "document_chunk";
export type MemoryLayer = "stm" | "ltm";

export interface MemoryEntry {
  readonly id: string;
  readonly content: string;
  readonly type: MemoryType;
  readonly layer: MemoryLayer;
  readonly importance: number;
  readonly confidence: number;
  readonly tags: readonly string[];
  readonly entities: readonly string[];
  readonly source: {
    readonly type: string;
    readonly conversationId?: string;
  };
  readonly supersedes?: string;
  readonly supersededBy?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly accessedAt: string;
}

export interface MemorySettingsManager {
  getSettings(): unknown;
  updateSettings(partial: unknown): Result<unknown, { message: string }>;
  resetToDefaults(): unknown;
  enableFeature(feature: string): Result<unknown, { message: string }>;
  disableFeature(feature: string): Result<unknown, { message: string }>;
  setFeatureSetting(feature: string, key: string, value: unknown): Result<unknown, { message: string }>;
  serialize(): string;
}

export interface MemoryReindexProgress {
  readonly phase: "reindex" | "validation";
  readonly totalRecords: number;
  readonly processed: number;
  readonly reindexed: number;
  readonly failed: number;
  readonly currentRecordId?: string;
}

export interface MemoryReindexResult {
  readonly totalRecords: number;
  readonly reindexed: number;
  readonly failed: number;
  readonly durationMs: number;
  readonly failedRecordIds: readonly string[];
  readonly provider: string;
  readonly model?: string;
  readonly validation?: {
    readonly performed: boolean;
    readonly passed: boolean;
  };
}

export interface MemoryCommandContext {
  readonly available: boolean;
  readonly settingsManager?: MemorySettingsManager;
  remember(input: {
    content: string;
    type?: MemoryType;
    tags?: string[];
    conversationId?: string;
  }): Promise<Result<MemoryEntry, CommandError>>;
  list(options?: {
    type?: MemoryType;
    layer?: MemoryLayer;
    limit?: number;
  }): Promise<Result<readonly MemoryEntry[], CommandError>>;
  show(id: string): Promise<Result<MemoryEntry | null, CommandError>>;
  search?(input: {
    query: string;
    type?: MemoryType;
    layer?: MemoryLayer;
    limit?: number;
  }): Promise<Result<readonly MemoryEntry[], CommandError>>;
  reindex?(input: {
    provider: string;
    onProgress?: (progress: MemoryReindexProgress) => void;
  }): Result<MemoryReindexResult, CommandError>;
}

export interface EnvironmentCommandContext {
  readonly activeEnvironment: string;
  readonly availableEnvironments: readonly string[];
  switchEnvironment(name: string): Promise<Result<{ activeEnvironment: string; previousEnvironment: string }, CommandError>>;
}

export interface CommandHandlerContext {
  readonly catalog: readonly SlashCommandDefinition[];
  readonly model: ModelCommandContext;
  readonly theme: ThemeCommandContext;
  readonly session: SessionCommandContext;
  readonly view: ViewCommandContext;
  readonly environment: EnvironmentCommandContext | null;
  readonly memory: MemoryCommandContext | null;
  readonly daemonClient: DaemonClient | null;
}

export type CommandArgs = ParsedCommand["args"];

export type CommandHandlerResult = Result<CommandResult, CommandError> | Promise<Result<CommandResult, CommandError>>;

export type CommandHandler = (
  args: CommandArgs,
  context: CommandHandlerContext,
) => CommandHandlerResult;
