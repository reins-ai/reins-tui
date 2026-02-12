import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, win32 } from "node:path";

import { ContextSummaryService, type ContextSummary } from "./context-summary";

export interface GreetingService {
  generateGreeting(options?: GreetingOptions): string;
  getFullStartup(): Promise<StartupContent>;
}

export interface GreetingOptions {
  name?: string;
  time?: Date;
}

export interface StartupContent {
  greeting: string;
  contextSummary: string | null;
  hasReminders: boolean;
  hasEvents: boolean;
}

export interface GreetingServiceOptions {
  configPath?: string;
  contextService?: ContextSummaryService;
  configNameReader?: () => string | null;
  now?: () => Date;
}

type DayPart = "morning" | "afternoon" | "evening" | "night";

const DAY_PART_VARIANTS: Record<DayPart, ReadonlyArray<(name: string) => string>> = {
  morning: [
    (name) => `Rise and shine, ${name}`,
    (name) => `Morning, ${name}`,
    (name) => `Good morning, ${name}`,
  ],
  afternoon: [
    (name) => `Afternoon, ${name}`,
    (name) => `Good afternoon, ${name}`,
  ],
  evening: [
    (name) => `Evening, ${name}`,
    (name) => `Good evening, ${name}`,
  ],
  night: [
    (name) => `Burning the midnight oil, ${name}?`,
    (name) => `Night owl mode, ${name}`,
  ],
};

const DAY_PART_FALLBACK: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Burning the midnight oil?",
};

function resolveUserConfigPath(): string {
  const platform = process.platform;
  const configRoot = process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim().length > 0
    ? process.env.XDG_CONFIG_HOME
    : platform === "win32"
      ? win32.join(homedir(), ".config")
      : join(homedir(), ".config");

  return platform === "win32"
    ? win32.join(configRoot, "reins", "config.json")
    : join(configRoot, "reins", "config.json");
}

function parseConfiguredName(configPath: string): string | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

function getDayPart(time: Date): DayPart {
  const hour = time.getHours();

  if (hour >= 5 && hour < 12) {
    return "morning";
  }

  if (hour >= 12 && hour < 17) {
    return "afternoon";
  }

  if (hour >= 17 && hour < 21) {
    return "evening";
  }

  return "night";
}

function getDayOfYear(time: Date): number {
  const start = new Date(time.getFullYear(), 0, 1);
  const atMidnight = new Date(time.getFullYear(), time.getMonth(), time.getDate());
  return Math.floor((atMidnight.getTime() - start.getTime()) / 86_400_000) + 1;
}

function normalizeName(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class GreetingService implements GreetingService {
  private readonly configPath: string;
  private readonly contextService: ContextSummaryService;
  private readonly now: () => Date;
  private readonly configNameReader: () => string | null;

  constructor(options: GreetingServiceOptions = {}) {
    this.configPath = options.configPath ?? resolveUserConfigPath();
    this.contextService = options.contextService ?? new ContextSummaryService();
    this.now = options.now ?? (() => new Date());
    this.configNameReader = options.configNameReader ?? (() => parseConfiguredName(this.configPath));
  }

  public generateGreeting(options: GreetingOptions = {}): string {
    const time = options.time ?? this.now();
    const dayPart = getDayPart(time);
    const name = normalizeName(options.name) ?? normalizeName(this.configNameReader());

    if (!name) {
      return DAY_PART_FALLBACK[dayPart];
    }

    const variants = DAY_PART_VARIANTS[dayPart];
    const dayOfYear = getDayOfYear(time);
    const variant = variants[(dayOfYear - 1) % variants.length];
    return variant(name);
  }

  public async getFullStartup(): Promise<StartupContent> {
    const greeting = this.generateGreeting();
    const context = await this.loadContextSummary();

    return {
      greeting,
      contextSummary: context?.formattedSummary ?? null,
      hasReminders: (context?.reminders.length ?? 0) > 0,
      hasEvents: (context?.events.length ?? 0) > 0,
    };
  }

  private async loadContextSummary(): Promise<ContextSummary | null> {
    if (typeof this.contextService.getUpcomingContextOrNull === "function") {
      return this.contextService.getUpcomingContextOrNull();
    }

    const result = await this.contextService.getUpcomingContext();
    if (!result.ok) {
      return null;
    }

    const hasContext = result.value.reminders.length > 0 || result.value.events.length > 0;
    return hasContext ? result.value : null;
  }
}
