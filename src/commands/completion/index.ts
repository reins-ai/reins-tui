export { resolveCompletion, applySuggestion } from "./engine";
export type {
  CompletionSuggestion,
  CompletionResult,
  CompletionContextKind,
} from "./engine";
export type { CompletionProviderContext } from "./providers";
export type { CommandSpec, CommandNode, FlagSpec, ArgSpec } from "./schema";
export { COMMAND_SPECS, getCommandSpec } from "./specs";
