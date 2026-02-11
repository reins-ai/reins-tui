import { err, ok, type Result } from "../daemon/contracts";

export interface ContextSummaryService {
  getUpcomingContext(): Promise<Result<ContextSummary, ContextError>>;
}

export interface ContextSummary {
  reminders: ReminderSummary[];
  events: EventSummary[];
  formattedSummary: string;
}

export interface ReminderSummary {
  title: string;
  dueDate: string;
  priority?: string;
}

export interface EventSummary {
  title: string;
  time: string;
  duration?: string;
}

export interface ContextError {
  code: "DAEMON_UNAVAILABLE" | "DAEMON_TIMEOUT" | "DAEMON_INVALID_RESPONSE";
  message: string;
  retryable: boolean;
}

export interface ContextSummaryServiceOptions {
  baseUrl?: string;
  remindersPath?: string;
  eventsPath?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

const DEFAULT_BASE_URL = "http://localhost:7433";
const DEFAULT_REMINDERS_PATH = "/v1/reminders/due?windowHours=24";
const DEFAULT_EVENTS_PATH = "/v1/calendar/events?range=today";
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}

function formatLocalTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReminderDueDate(dueDateRaw: string, now: Date): string {
  const parsed = new Date(dueDateRaw);
  if (Number.isNaN(parsed.getTime())) {
    return `due ${dueDateRaw}`;
  }

  if (sameLocalDate(parsed, now)) {
    return `due ${formatLocalTime(parsed)}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameLocalDate(parsed, tomorrow)) {
    return "due tomorrow";
  }

  return `due ${parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} at ${formatLocalTime(parsed)}`;
}

function formatEventTime(timeRaw: string): string {
  const parsed = new Date(timeRaw);
  if (Number.isNaN(parsed.getTime())) {
    return timeRaw;
  }

  return formatLocalTime(parsed);
}

function computeDuration(startRaw: string, endRaw: string | null): string | undefined {
  if (!endRaw) {
    return undefined;
  }

  const start = new Date(startRaw);
  const end = new Date(endRaw);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return undefined;
  }

  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }

  return `${minutes}m`;
}

function unwrapPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  if ("result" in payload) {
    return payload.result;
  }

  if ("data" in payload) {
    return payload.data;
  }

  return payload;
}

function extractCollection(payload: unknown, keys: string[]): unknown[] {
  const unwrapped = unwrapPayload(payload);

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  if (!isRecord(unwrapped)) {
    return [];
  }

  for (const key of keys) {
    const value = unwrapped[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function mapReminderSummary(payload: unknown): ReminderSummary | null {
  if (!isRecord(payload)) {
    return null;
  }

  const title = readString(payload.title);
  const dueDate = readString(payload.dueAt) ?? readString(payload.dueDate);
  if (!title || !dueDate) {
    return null;
  }

  return {
    title,
    dueDate,
    priority: readString(payload.priority) ?? undefined,
  };
}

function mapEventSummary(payload: unknown): EventSummary | null {
  if (!isRecord(payload)) {
    return null;
  }

  const title = readString(payload.title);
  const start = readString(payload.startTime) ?? readString(payload.time);
  if (!title || !start) {
    return null;
  }

  const explicitDuration = readString(payload.duration);
  const end = readString(payload.endTime);

  return {
    title,
    time: start,
    duration: explicitDuration ?? computeDuration(start, end),
  };
}

function formatSummary(reminders: ReminderSummary[], events: EventSummary[], now: Date): string {
  const reminderCount = reminders.length;
  const eventCount = events.length;

  if (reminderCount === 0 && eventCount === 0) {
    return "";
  }

  let header = "";
  if (reminderCount > 0 && eventCount > 0) {
    header = `You have ${reminderCount} reminder${reminderCount === 1 ? "" : "s"} and ${eventCount} event${eventCount === 1 ? "" : "s"} today:`;
  } else if (reminderCount > 0) {
    header = `You have ${reminderCount} reminder${reminderCount === 1 ? "" : "s"} today:`;
  } else {
    header = `You have ${eventCount} event${eventCount === 1 ? "" : "s"} today:`;
  }

  const reminderLines = reminders.map((reminder) => {
    const dueLabel = formatReminderDueDate(reminder.dueDate, now);
    const priority = reminder.priority ? `, ${reminder.priority.toLowerCase()} priority` : "";
    return `· ${reminder.title} (${dueLabel}${priority})`;
  });

  const eventLines = events.map((event) => {
    const atTime = formatEventTime(event.time);
    const duration = event.duration ? ` (${event.duration})` : "";
    return `📅 ${event.title} at ${atTime}${duration}`;
  });

  return [header, ...reminderLines, ...eventLines].join("\n");
}

export class ContextSummaryService implements ContextSummaryService {
  private readonly baseUrl: string;
  private readonly remindersPath: string;
  private readonly eventsPath: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: ContextSummaryServiceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.remindersPath = options.remindersPath ?? DEFAULT_REMINDERS_PATH;
    this.eventsPath = options.eventsPath ?? DEFAULT_EVENTS_PATH;
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  public async getUpcomingContext(): Promise<Result<ContextSummary, ContextError>> {
    const [remindersResult, eventsResult] = await Promise.all([
      this.fetchJson(this.remindersPath),
      this.fetchJson(this.eventsPath),
    ]);

    if (!remindersResult.ok) {
      return remindersResult;
    }

    if (!eventsResult.ok) {
      return eventsResult;
    }

    const reminders = extractCollection(remindersResult.value, ["reminders", "items", "results"])
      .map((entry) => mapReminderSummary(entry))
      .filter((entry): entry is ReminderSummary => entry !== null);

    const events = extractCollection(eventsResult.value, ["events", "items", "results"])
      .map((entry) => mapEventSummary(entry))
      .filter((entry): entry is EventSummary => entry !== null);

    return ok({
      reminders,
      events,
      formattedSummary: formatSummary(reminders, events, this.now()),
    });
  }

  public async getUpcomingContextOrNull(): Promise<ContextSummary | null> {
    const result = await this.getUpcomingContext();
    if (!result.ok) {
      return null;
    }

    const hasContext = result.value.reminders.length > 0 || result.value.events.length > 0;
    return hasContext ? result.value : null;
  }

  private async fetchJson(path: string): Promise<Result<unknown, ContextError>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        return err({
          code: "DAEMON_UNAVAILABLE",
          message: `Daemon request failed (${response.status}) for ${path}`,
          retryable: response.status >= 500,
        });
      }

      try {
        return ok(await response.json());
      } catch {
        return err({
          code: "DAEMON_INVALID_RESPONSE",
          message: `Daemon returned invalid JSON for ${path}`,
          retryable: false,
        });
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        return err({
          code: "DAEMON_TIMEOUT",
          message: `Daemon request timed out for ${path}`,
          retryable: true,
        });
      }

      return err({
        code: "DAEMON_UNAVAILABLE",
        message: `Daemon request failed for ${path}`,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
