import type { DaemonClient } from "../../daemon/client";
import type { Result } from "../../daemon/contracts";
import type { ParsedCommand } from "../parser";
import type { SlashCommandDefinition } from "../registry";

export type CommandSignalType = "OPEN_CONNECT_FLOW" | "OPEN_SETTINGS" | "QUIT_TUI";

export interface CommandSignal {
  readonly type: CommandSignalType;
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

export interface CommandHandlerContext {
  readonly catalog: readonly SlashCommandDefinition[];
  readonly model: ModelCommandContext;
  readonly theme: ThemeCommandContext;
  readonly session: SessionCommandContext;
  readonly view: ViewCommandContext;
  readonly daemonClient: DaemonClient | null;
}

export type CommandArgs = ParsedCommand["args"];

export type CommandHandler = (
  args: CommandArgs,
  context: CommandHandlerContext,
) => Result<CommandResult, CommandError>;
