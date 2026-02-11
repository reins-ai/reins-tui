import { type SlashCommandDefinition, getSlashCommandByNameOrAlias } from "./registry";

type ParsedFlagValue = string | boolean;

export interface ParsedCommand {
  readonly rawInput: string;
  readonly command: SlashCommandDefinition;
  readonly rawCommand: string;
  readonly args: {
    readonly positional: readonly string[];
    readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  };
}

export type ParseCommandErrorCode =
  | "EMPTY_INPUT"
  | "NOT_A_COMMAND"
  | "MISSING_COMMAND"
  | "UNKNOWN_COMMAND"
  | "UNTERMINATED_QUOTE"
  | "INVALID_FLAG";

export interface ParseCommandError {
  readonly code: ParseCommandErrorCode;
  readonly message: string;
}

export type ParseCommandResult =
  | { ok: true; value: ParsedCommand }
  | { ok: false; error: ParseCommandError };

type ParseTokensResult =
  | { ok: true; value: string[] }
  | { ok: false; error: ParseCommandError };

type ParseFlagTokenResult =
  | { ok: true; value: Record<string, ParsedFlagValue> }
  | { ok: false; error: ParseCommandError };

function parseTokens(input: string): ParseTokensResult {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote !== null) {
    return {
      ok: false,
      error: {
        code: "UNTERMINATED_QUOTE",
        message: "Command input contains an unterminated quote.",
      },
    };
  }

  if (escaping) {
    current += "\\";
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return { ok: true, value: tokens };
}

function parseFlagToken(token: string): ParseFlagTokenResult {
  const output: Record<string, ParsedFlagValue> = {};

  if (token.startsWith("--")) {
    const longBody = token.slice(2);
    if (longBody.length === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_FLAG",
          message: "Long flag cannot be empty.",
        },
      };
    }

    const separatorIndex = longBody.indexOf("=");
    if (separatorIndex === 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_FLAG",
          message: `Invalid flag token '${token}'.`,
        },
      };
    }

    if (separatorIndex > -1) {
      const key = longBody.slice(0, separatorIndex).trim().toLowerCase();
      const value = longBody.slice(separatorIndex + 1);
      if (key.length === 0) {
        return {
          ok: false,
          error: {
            code: "INVALID_FLAG",
            message: `Invalid flag token '${token}'.`,
          },
        };
      }
      output[key] = value;
      return { ok: true, value: output };
    }

    output[longBody.toLowerCase()] = true;
    return { ok: true, value: output };
  }

  const shortBody = token.slice(1);
  if (shortBody.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG",
        message: "Short flag cannot be empty.",
      },
    };
  }

  const shortSeparatorIndex = shortBody.indexOf("=");
  if (shortSeparatorIndex === 1) {
    output[shortBody[0].toLowerCase()] = shortBody.slice(shortSeparatorIndex + 1);
    return { ok: true, value: output };
  }

  if (shortSeparatorIndex > -1) {
    return {
      ok: false,
      error: {
        code: "INVALID_FLAG",
        message: `Invalid short flag token '${token}'.`,
      },
    };
  }

  for (const key of shortBody) {
    output[key.toLowerCase()] = true;
  }

  return { ok: true, value: output };
}

function mergeFlags(target: Record<string, ParsedFlagValue>, parsed: Record<string, ParsedFlagValue>): void {
  for (const [key, value] of Object.entries(parsed)) {
    target[key] = value;
  }
}

export function parseSlashCommand(input: string): ParseCommandResult {
  const rawInput = input;
  const trimmedStart = input.trimStart();

  if (trimmedStart.length === 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_INPUT",
        message: "Input is empty.",
      },
    };
  }

  if (!trimmedStart.startsWith("/")) {
    return {
      ok: false,
      error: {
        code: "NOT_A_COMMAND",
        message: "Input does not start with '/'.",
      },
    };
  }

  const parseResult = parseTokens(trimmedStart);
  if (!parseResult.ok) {
    return parseResult;
  }

  const tokens = parseResult.value;
  const commandToken = tokens[0] ?? "/";
  const normalizedCommandToken = commandToken.slice(1).trim();

  if (normalizedCommandToken.length === 0) {
    return {
      ok: false,
      error: {
        code: "MISSING_COMMAND",
        message: "Missing command name after '/'.",
      },
    };
  }

  const command = getSlashCommandByNameOrAlias(normalizedCommandToken);
  if (command === null) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_COMMAND",
        message: `Unknown command '/${normalizedCommandToken.toLowerCase()}'.`,
      },
    };
  }

  const positional: string[] = [];
  const flags: Record<string, ParsedFlagValue> = {};

  for (const token of tokens.slice(1)) {
    if (token.startsWith("-") && token.length > 1) {
      const flagResult = parseFlagToken(token);
      if (!flagResult.ok) {
        return flagResult;
      }

      mergeFlags(flags, flagResult.value);
      continue;
    }

    positional.push(token);
  }

  return {
    ok: true,
    value: {
      rawInput,
      rawCommand: normalizedCommandToken,
      command,
      args: {
        positional,
        flags,
      },
    },
  };
}
