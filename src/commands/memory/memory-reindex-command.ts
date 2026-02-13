import { err, ok } from "../../daemon/contracts";
import type {
  CommandArgs,
  CommandError,
  CommandResult,
  MemoryReindexProgress,
  MemoryReindexResult,
} from "../handlers/types";
import type { Result } from "../../daemon/contracts";

export interface MemoryReindexCommandContext {
  readonly available: boolean;
  readonly reindex?: (input: {
    provider: string;
    onProgress?: (progress: MemoryReindexProgress) => void;
  }) => Result<MemoryReindexResult, CommandError>;
}

function getProviderFlag(args: CommandArgs): string | undefined {
  const providerFlag = args.flags.provider;

  if (typeof providerFlag === "string") {
    const provider = providerFlag.trim();
    return provider.length > 0 ? provider : undefined;
  }

  if (providerFlag === true) {
    const provider = args.positional[2]?.trim();
    return provider && provider.length > 0 ? provider : undefined;
  }

  return undefined;
}

export function handleMemoryReindexCommand(
  args: CommandArgs,
  reindexContext: MemoryReindexCommandContext,
): Result<CommandResult, CommandError> {
  if (!reindexContext.available) {
    return err({
      code: "UNSUPPORTED",
      message: "Memory service is not available. Is the daemon running?",
    });
  }

  if (!reindexContext.reindex) {
    return err({
      code: "UNSUPPORTED",
      message: "Memory reindex is not available.",
    });
  }

  const provider = getProviderFlag(args);
  if (!provider) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing provider. Usage: /memory reindex --provider <name>",
    });
  }

  const progressLines: string[] = [];
  const reindexResult = reindexContext.reindex({
    provider,
    onProgress(progress) {
      if (progress.phase === "validation") {
        progressLines.push(`Validation ${progress.processed}/${progress.totalRecords}`);
        return;
      }

      progressLines.push(
        `Reindex ${progress.processed}/${progress.totalRecords} (ok: ${progress.reindexed}, failed: ${progress.failed})`,
      );
    },
  });

  if (!reindexResult.ok) {
    return reindexResult;
  }

  const summary = reindexResult.value;
  const modelSuffix = summary.model ? `/${summary.model}` : "";
  const validationStatus = summary.validation
    ? summary.validation.passed
      ? "passed"
      : "failed"
    : "skipped";

  const body = [
    `Provider switch reindex complete for ${summary.provider}${modelSuffix}.`,
    `Reindexed: ${summary.reindexed}/${summary.totalRecords}`,
    `Failed: ${summary.failed}`,
    `Validation: ${validationStatus}`,
    `Duration: ${summary.durationMs}ms`,
    summary.failedRecordIds.length > 0
      ? `Failed IDs: ${summary.failedRecordIds.slice(0, 5).join(", ")}${summary.failedRecordIds.length > 5 ? "..." : ""}`
      : "",
    progressLines.length > 0 ? "" : "",
    progressLines.length > 0 ? "Progress:" : "",
    ...progressLines,
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return ok({
    statusMessage: `Memory reindex complete (${summary.reindexed}/${summary.totalRecords})`,
    responseText: body,
  });
}
