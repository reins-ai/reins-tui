import { err, ok } from "../../daemon/contracts";
import type { CommandArgs, CommandError, CommandResult, MemorySettingsManager } from "../handlers/types";
import type { Result } from "../../daemon/contracts";

const VALID_FEATURES = new Set(["priming", "briefing", "nudges", "patterns"]);
const VALID_FEATURES_LIST = "priming, briefing, nudges, patterns";

export interface MemorySettingsContext {
  readonly available: boolean;
  readonly settingsManager: MemorySettingsManager;
}

interface SettingsShape {
  enabled: boolean;
  priming: {
    enabled: boolean;
    maxTokens: number;
    maxMemories: number;
    minRelevanceScore: number;
  };
  briefing: {
    enabled: boolean;
    scheduleHour: number;
    scheduleMinute: number;
    topicFilters: string[];
    maxSections: number;
  };
  nudges: {
    enabled: boolean;
    maxPerTurn: number;
    minRelevanceScore: number;
    cooldownMs: number;
  };
  patterns: {
    enabled: boolean;
    minOccurrences: number;
    promotionThreshold: number;
  };
}

type FeatureName = "priming" | "briefing" | "nudges" | "patterns";

function formatSettingsOverview(settings: SettingsShape): string {
  const sections: string[] = [];

  sections.push("# Proactive Memory Settings");
  sections.push("");
  sections.push(`Master Switch:  ${settings.enabled ? "enabled" : "disabled"}`);
  sections.push("");

  sections.push("## Priming");
  sections.push(`  enabled:           ${settings.priming.enabled}`);
  sections.push(`  maxTokens:         ${settings.priming.maxTokens}`);
  sections.push(`  maxMemories:       ${settings.priming.maxMemories}`);
  sections.push(`  minRelevanceScore: ${settings.priming.minRelevanceScore}`);
  sections.push("");

  sections.push("## Briefing");
  sections.push(`  enabled:           ${settings.briefing.enabled}`);
  sections.push(`  scheduleHour:      ${settings.briefing.scheduleHour}`);
  sections.push(`  scheduleMinute:    ${settings.briefing.scheduleMinute}`);
  sections.push(`  topicFilters:      ${settings.briefing.topicFilters.length > 0 ? settings.briefing.topicFilters.join(", ") : "(none)"}`);
  sections.push(`  maxSections:       ${settings.briefing.maxSections}`);
  sections.push("");

  sections.push("## Nudges");
  sections.push(`  enabled:           ${settings.nudges.enabled}`);
  sections.push(`  maxPerTurn:        ${settings.nudges.maxPerTurn}`);
  sections.push(`  minRelevanceScore: ${settings.nudges.minRelevanceScore}`);
  sections.push(`  cooldownMs:        ${settings.nudges.cooldownMs}`);
  sections.push("");

  sections.push("## Patterns");
  sections.push(`  enabled:           ${settings.patterns.enabled}`);
  sections.push(`  minOccurrences:    ${settings.patterns.minOccurrences}`);
  sections.push(`  promotionThreshold: ${settings.patterns.promotionThreshold}`);

  return sections.join("\n");
}

function parseSettingValue(
  currentValue: unknown,
  rawValue: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (typeof currentValue === "boolean") {
    const lower = rawValue.toLowerCase();
    if (lower === "true" || lower === "on" || lower === "1") {
      return { ok: true, value: true };
    }
    if (lower === "false" || lower === "off" || lower === "0") {
      return { ok: true, value: false };
    }
    return { ok: false, reason: "Expected a boolean value (true/false, on/off, 1/0)" };
  }

  if (typeof currentValue === "number") {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return { ok: false, reason: "Expected a finite number" };
    }
    return { ok: true, value: parsed };
  }

  if (Array.isArray(currentValue)) {
    const items = rawValue
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return { ok: true, value: items };
  }

  return { ok: false, reason: "Unsupported setting type" };
}

function getFeatureSettingValue(
  settings: SettingsShape,
  feature: FeatureName,
  key: string,
): unknown | undefined {
  const featureSettings = settings[feature] as Record<string, unknown>;
  if (key in featureSettings) {
    return featureSettings[key];
  }
  return undefined;
}

export function handleMemorySettingsCommand(
  args: CommandArgs,
  settingsContext: MemorySettingsContext,
): Result<CommandResult, CommandError> {
  if (!settingsContext.available) {
    return err({
      code: "UNSUPPORTED",
      message: "Memory service is not available. Is the daemon running?",
    });
  }

  const manager = settingsContext.settingsManager;

  // positional[0] is "settings", so subAction starts at [1]
  const subAction = args.positional[1]?.trim().toLowerCase();

  if (!subAction) {
    const settings = manager.getSettings() as SettingsShape;
    return ok({
      statusMessage: "Proactive memory settings",
      responseText: formatSettingsOverview(settings),
    });
  }

  if (subAction === "set") {
    return handleSettingsSet(args, manager);
  }

  if (subAction === "enable") {
    return handleSettingsToggle(args, manager, true);
  }

  if (subAction === "disable") {
    return handleSettingsToggle(args, manager, false);
  }

  if (subAction === "reset") {
    const settings = manager.resetToDefaults() as SettingsShape;
    return ok({
      statusMessage: "Settings reset to defaults",
      responseText: formatSettingsOverview(settings),
    });
  }

  return err({
    code: "INVALID_ARGUMENT",
    message: `Unknown settings action '${subAction}'. Usage: /memory settings [set|enable|disable|reset]`,
  });
}

function handleSettingsSet(
  args: CommandArgs,
  manager: MemorySettingsManager,
): Result<CommandResult, CommandError> {
  // positional: ["settings", "set", feature, key, ...value]
  const feature = args.positional[2]?.trim().toLowerCase();
  const key = args.positional[3]?.trim();
  const rawValue = args.positional.slice(4).join(" ").trim();

  if (!feature) {
    return err({
      code: "INVALID_ARGUMENT",
      message: "Missing feature name. Usage: /memory settings set <feature> <key> <value>",
    });
  }

  if (!VALID_FEATURES.has(feature)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Invalid feature '${feature}'. Valid features: ${VALID_FEATURES_LIST}`,
    });
  }

  if (!key) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Missing setting key. Usage: /memory settings set ${feature} <key> <value>`,
    });
  }

  if (rawValue.length === 0) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Missing value. Usage: /memory settings set ${feature} ${key} <value>`,
    });
  }

  const currentSettings = manager.getSettings() as SettingsShape;
  const currentValue = getFeatureSettingValue(currentSettings, feature as FeatureName, key);

  if (currentValue === undefined) {
    const featureSettings = currentSettings[feature as FeatureName] as Record<string, unknown>;
    const validKeys = Object.keys(featureSettings).join(", ");
    return err({
      code: "INVALID_ARGUMENT",
      message: `Invalid setting '${key}' for feature '${feature}'. Valid keys: ${validKeys}`,
    });
  }

  const parsed = parseSettingValue(currentValue, rawValue);
  if (!parsed.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Invalid value for '${feature}.${key}': ${parsed.reason}`,
    });
  }

  const result = manager.setFeatureSetting(feature, key, parsed.value);
  if (!result.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: result.error.message,
    });
  }

  return ok({
    statusMessage: `Updated ${feature}.${key}`,
    responseText: `Set ${feature}.${key} = ${JSON.stringify(parsed.value)}`,
  });
}

function handleSettingsToggle(
  args: CommandArgs,
  manager: MemorySettingsManager,
  enable: boolean,
): Result<CommandResult, CommandError> {
  // positional: ["settings", "enable"|"disable", feature]
  const feature = args.positional[2]?.trim().toLowerCase();

  if (!feature) {
    const result = manager.updateSettings({ enabled: enable });
    if (!result.ok) {
      return err({
        code: "INVALID_ARGUMENT",
        message: result.error.message,
      });
    }

    const action = enable ? "enabled" : "disabled";
    return ok({
      statusMessage: `Proactive memory ${action}`,
      responseText: `All proactive memory features are now ${action}.`,
    });
  }

  if (!VALID_FEATURES.has(feature)) {
    return err({
      code: "INVALID_ARGUMENT",
      message: `Invalid feature '${feature}'. Valid features: ${VALID_FEATURES_LIST}`,
    });
  }

  const result = enable
    ? manager.enableFeature(feature)
    : manager.disableFeature(feature);

  if (!result.ok) {
    return err({
      code: "INVALID_ARGUMENT",
      message: result.error.message,
    });
  }

  const action = enable ? "enabled" : "disabled";
  return ok({
    statusMessage: `${feature} ${action}`,
    responseText: `Proactive memory feature '${feature}' is now ${action}.`,
  });
}
