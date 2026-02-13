import type {
  DaemonHistoryBlock,
  DaemonHistoryNormalizationContext,
  DaemonHistoryNormalizationResult,
  DaemonHistoryPayloadNormalizer,
  DaemonHydratedHistoryMessage,
  DaemonHydratedHistoryPayload,
  DaemonMessageRole,
  DaemonRawHistoryMessage,
  DaemonRawHistoryPayload,
} from "../daemon/contracts";
import type { DisplayContentBlock, DisplayMessage, DisplayToolCall } from "./types";
import type {
  ApplyHydratedHistoryChunkInput,
  ApplyHydratedHistoryChunkResult,
  HistoryHydrationState,
} from "./index";

// ---------------------------------------------------------------------------
// Text decoding — unescape common control sequences from serialized payloads
// ---------------------------------------------------------------------------

const ESCAPE_MAP: Record<string, string> = {
  "\\n": "\n",
  "\\t": "\t",
  "\\r": "\r",
  "\\\\": "\\",
  '\\"': '"',
};

const ESCAPE_PATTERN = /\\n|\\t|\\r|\\\\|\\"/g;

/**
 * Decode escaped control sequences commonly found in serialized history
 * payloads. Only replaces well-known escape tokens to avoid over-decoding.
 */
export function decodeEscapedText(input: string): string {
  if (!input.includes("\\")) {
    return input;
  }
  return input.replace(ESCAPE_PATTERN, (match) => ESCAPE_MAP[match] ?? match);
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Parse a createdAt string into epoch milliseconds.
 * Returns NaN for unparseable values so callers can detect and reject.
 */
export function parseTimestampMs(createdAt: string): number {
  const ms = new Date(createdAt).getTime();
  return ms;
}

// ---------------------------------------------------------------------------
// Dedupe key generation
// ---------------------------------------------------------------------------

/**
 * Produce a stable deduplication key for a raw history message.
 * Uses the message id as primary key since daemon guarantees uniqueness.
 */
export function buildDedupeKey(id: string, role: DaemonMessageRole): string {
  return `${role}:${id}`;
}

// ---------------------------------------------------------------------------
// Raw payload normalization — structured and serialized variants
// ---------------------------------------------------------------------------

function normalizeToolResultOutput(
  block: { output?: string; result?: string; isError?: boolean; error?: boolean },
): { output: string; isError: boolean } {
  const output = block.output ?? block.result ?? "";
  const isError = block.isError ?? block.error ?? false;
  return { output: decodeEscapedText(output), isError };
}

function normalizeStructuredBlocks(
  rawBlocks: NonNullable<Extract<DaemonRawHistoryPayload, { kind: "structured" }>["value"]["blocks"]>,
): DaemonHistoryBlock[] {
  const blocks: DaemonHistoryBlock[] = [];

  for (const raw of rawBlocks) {
    switch (raw.type) {
      case "text":
        blocks.push({ type: "text", text: decodeEscapedText(raw.text) });
        break;
      case "tool-use":
        blocks.push({
          type: "tool-use",
          toolCallId: raw.toolCallId,
          name: raw.name,
          args: raw.args ?? {},
        });
        break;
      case "tool-result": {
        const { output, isError } = normalizeToolResultOutput(raw);
        blocks.push({
          type: "tool-result",
          toolCallId: raw.toolCallId,
          output,
          isError,
        });
        break;
      }
    }
  }

  return blocks;
}

function normalizeStructuredPayload(
  value: Extract<DaemonRawHistoryPayload, { kind: "structured" }>["value"],
): DaemonHydratedHistoryPayload {
  const text = decodeEscapedText(value.text ?? "");
  const blocks = value.blocks ? normalizeStructuredBlocks(value.blocks) : [];

  // If there are no explicit text blocks but text is present, synthesize one
  if (text.length > 0 && !blocks.some((b) => b.type === "text")) {
    blocks.unshift({ type: "text", text });
  }

  return { text, blocks };
}

/**
 * Attempt to parse a serialized payload string into a structured shape.
 * Handles JSON-encoded objects, JSON-escaped strings, and plain text.
 */
function normalizeSerializedPayload(
  raw: Extract<DaemonRawHistoryPayload, { kind: "serialized" }>,
): DaemonHydratedHistoryPayload | null {
  const { value, encoding } = raw;

  if (encoding === "plain-text") {
    const text = decodeEscapedText(value);
    return {
      text,
      blocks: text.length > 0 ? [{ type: "text", text }] : [],
    };
  }

  if (encoding === "json-escaped") {
    // The value is a JSON-escaped string — decode escape sequences
    const text = decodeEscapedText(value);
    return {
      text,
      blocks: text.length > 0 ? [{ type: "text", text }] : [],
    };
  }

  // encoding === "json" — try to parse as structured object
  try {
    const parsed: unknown = JSON.parse(value);

    if (typeof parsed === "string") {
      // Double-encoded string — decode it
      const text = decodeEscapedText(parsed);
      return {
        text,
        blocks: text.length > 0 ? [{ type: "text", text }] : [],
      };
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const text = typeof record.text === "string" ? decodeEscapedText(record.text) : "";
      const rawBlocks = Array.isArray(record.blocks) ? record.blocks : [];

      // Validate and normalize blocks
      const blocks: DaemonHistoryBlock[] = [];
      for (const item of rawBlocks) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const block = item as Record<string, unknown>;
        if (typeof block.type !== "string") continue;

        if (block.type === "text" && typeof block.text === "string") {
          blocks.push({ type: "text", text: decodeEscapedText(block.text) });
        } else if (
          block.type === "tool-use" &&
          typeof block.toolCallId === "string" &&
          typeof block.name === "string"
        ) {
          blocks.push({
            type: "tool-use",
            toolCallId: block.toolCallId,
            name: block.name,
            args: (block.args && typeof block.args === "object" && !Array.isArray(block.args))
              ? block.args as Record<string, unknown>
              : {},
          });
        } else if (block.type === "tool-result" && typeof block.toolCallId === "string") {
          const { output, isError } = normalizeToolResultOutput(
            block as { output?: string; result?: string; isError?: boolean; error?: boolean },
          );
          blocks.push({ type: "tool-result", toolCallId: block.toolCallId, output, isError });
        }
      }

      if (text.length > 0 && !blocks.some((b) => b.type === "text")) {
        blocks.unshift({ type: "text", text });
      }

      return { text, blocks };
    }

    // Fallback: stringify whatever we got
    const fallbackText = decodeEscapedText(String(parsed));
    return {
      text: fallbackText,
      blocks: fallbackText.length > 0 ? [{ type: "text", text: fallbackText }] : [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Single normalizer implementation
// ---------------------------------------------------------------------------

function normalizePayload(raw: DaemonRawHistoryPayload): DaemonHydratedHistoryPayload | null {
  if (raw.kind === "structured") {
    return normalizeStructuredPayload(raw.value);
  }
  return normalizeSerializedPayload(raw);
}

/**
 * Normalize a single raw history message into the canonical hydrated shape.
 * Implements the DaemonHistoryPayloadNormalizer interface contract.
 */
export function normalizeHistoryMessage(
  rawMessage: DaemonRawHistoryMessage,
  context: DaemonHistoryNormalizationContext,
): DaemonHistoryNormalizationResult {
  // Idempotency: skip already-seen messages
  const dedupeKey = buildDedupeKey(rawMessage.id, rawMessage.role);
  if (context.seenMessageIds.has(rawMessage.id)) {
    return { status: "duplicate", dedupeKey };
  }

  // Validate createdAt
  const timestampMs = parseTimestampMs(rawMessage.createdAt);
  if (Number.isNaN(timestampMs)) {
    return { status: "dropped", reason: "invalid-created-at" };
  }

  // Normalize payload
  const payload = normalizePayload(rawMessage.payload);
  if (!payload) {
    return { status: "dropped", reason: "decode-failed" };
  }

  return {
    status: "accepted",
    message: {
      id: rawMessage.id,
      role: rawMessage.role,
      createdAt: rawMessage.createdAt,
      payload,
      ordering: {
        timestampMs,
        fallbackIndex: context.fallbackIndex,
      },
      dedupeKey,
    },
  };
}

/**
 * Concrete normalizer instance implementing the DaemonHistoryPayloadNormalizer
 * interface. Delegates to normalizeHistoryMessage for the actual work.
 */
export const historyPayloadNormalizer: DaemonHistoryPayloadNormalizer = {
  normalize: normalizeHistoryMessage,
};

// ---------------------------------------------------------------------------
// Deterministic sorting
// ---------------------------------------------------------------------------

/**
 * Sort hydrated history messages by timestamp (ascending), breaking ties
 * with fallbackIndex. Returns a new array — does not mutate input.
 */
export function sortHydratedHistoryMessages(
  messages: readonly DaemonHydratedHistoryMessage[],
): DaemonHydratedHistoryMessage[] {
  return [...messages].sort((a, b) => {
    const timeDiff = a.ordering.timestampMs - b.ordering.timestampMs;
    if (timeDiff !== 0) return timeDiff;
    return a.ordering.fallbackIndex - b.ordering.fallbackIndex;
  });
}

// ---------------------------------------------------------------------------
// Hydrated message → DisplayMessage conversion
// ---------------------------------------------------------------------------

function hydratedBlocksToDisplayToolCalls(
  blocks: readonly DaemonHistoryBlock[],
): DisplayToolCall[] {
  const toolCalls: DisplayToolCall[] = [];
  const toolUseMap = new Map<string, DisplayToolCall>();

  // First pass: collect tool-use blocks
  for (const block of blocks) {
    if (block.type === "tool-use") {
      const tc: DisplayToolCall = {
        id: block.toolCallId,
        name: block.name,
        status: "complete",
        args: block.args,
      };
      toolUseMap.set(block.toolCallId, tc);
      toolCalls.push(tc);
    }
  }

  // Second pass: attach results
  for (const block of blocks) {
    if (block.type === "tool-result") {
      const existing = toolUseMap.get(block.toolCallId);
      if (existing) {
        existing.result = block.output;
        existing.isError = block.isError;
        existing.status = block.isError ? "error" : "complete";
      }
    }
  }

  return toolCalls;
}

function hydratedBlocksToDisplayContentBlocks(
  blocks: readonly DaemonHistoryBlock[],
): DisplayContentBlock[] {
  return blocks.map((block): DisplayContentBlock => {
    if (block.type === "text") {
      return { type: "text", text: block.text };
    }
    if (block.type === "tool-use") {
      return { type: "tool-call", toolCallId: block.toolCallId };
    }
    // tool-result blocks don't have a direct content block representation;
    // they are consumed via toolCalls. Map as tool-call for ordering.
    return { type: "tool-call", toolCallId: block.toolCallId };
  });
}

/**
 * Map a role from daemon history (DaemonMessageRole) to the display role
 * used by the store (MessageRole from @reins/core). Daemon roles are a
 * subset of display roles — no "tool" role in daemon history.
 */
function mapDaemonRoleToDisplayRole(
  role: DaemonMessageRole,
): "user" | "assistant" | "system" {
  return role;
}

/**
 * Convert a hydrated history message into the DisplayMessage shape
 * consumed by the store and rendering components.
 */
export function hydratedMessageToDisplayMessage(
  hydrated: DaemonHydratedHistoryMessage,
): DisplayMessage {
  const role = mapDaemonRoleToDisplayRole(hydrated.role);
  const toolCalls = hydratedBlocksToDisplayToolCalls(hydrated.payload.blocks);
  const contentBlocks = hydratedBlocksToDisplayContentBlocks(hydrated.payload.blocks);

  return {
    id: hydrated.id,
    role,
    content: hydrated.payload.text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
    isStreaming: false,
    createdAt: new Date(hydrated.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Chunk hydration — the main entry point for reconnect history
// ---------------------------------------------------------------------------

/**
 * Create a fresh hydration state for a new reconnect session.
 */
export function createHydrationState(): HistoryHydrationState {
  return {
    seenMessageIds: new Set<string>(),
    nextFallbackIndex: 0,
  };
}

/**
 * Apply a chunk of raw history messages to the existing display state.
 *
 * This is the single hydration entry point for reconnect history. It:
 * 1. Normalizes each raw message through the normalizer
 * 2. Tracks duplicates and dropped entries
 * 3. Converts accepted messages to DisplayMessage
 * 4. Merges with existing messages preserving deterministic order
 * 5. Updates hydration state for idempotent subsequent chunks
 *
 * Pure function — does not mutate inputs.
 */
export function applyHydratedHistoryChunk(
  input: ApplyHydratedHistoryChunkInput,
): ApplyHydratedHistoryChunkResult {
  const { existingMessages, incomingRawMessages, hydrationState, normalizer } = input;

  // Clone mutable hydration state
  const nextSeenIds = new Set(hydrationState.seenMessageIds);
  let nextFallbackIndex = hydrationState.nextFallbackIndex;

  const accepted: DaemonHydratedHistoryMessage[] = [];
  const dropped: Extract<DaemonHistoryNormalizationResult, { status: "dropped" }>[] = [];
  const duplicates: Extract<DaemonHistoryNormalizationResult, { status: "duplicate" }>[] = [];

  for (const rawMessage of incomingRawMessages) {
    const context: DaemonHistoryNormalizationContext = {
      source: "reload",
      fallbackIndex: nextFallbackIndex,
      seenMessageIds: nextSeenIds,
    };

    const result = normalizer.normalize(rawMessage, context);

    switch (result.status) {
      case "accepted":
        accepted.push(result.message);
        nextSeenIds.add(rawMessage.id);
        nextFallbackIndex += 1;
        break;
      case "duplicate":
        duplicates.push(result);
        break;
      case "dropped":
        dropped.push(result);
        nextFallbackIndex += 1;
        break;
    }
  }

  // Sort accepted messages deterministically
  const sortedAccepted = sortHydratedHistoryMessages(accepted);

  // Convert to display messages
  const newDisplayMessages = sortedAccepted.map(hydratedMessageToDisplayMessage);

  // Merge: existing messages first (preserving live-session order),
  // then append new hydrated messages that aren't already present
  const existingIds = new Set(existingMessages.map((m) => m.id));
  const deduplicatedNew = newDisplayMessages.filter((m) => !existingIds.has(m.id));

  // If there are no existing messages, the hydrated set IS the full state
  const mergedMessages = existingMessages.length === 0
    ? deduplicatedNew
    : [...existingMessages, ...deduplicatedNew];

  return {
    messages: mergedMessages,
    hydrationState: {
      seenMessageIds: nextSeenIds,
      nextFallbackIndex,
    },
    accepted,
    dropped,
    duplicates,
  };
}
