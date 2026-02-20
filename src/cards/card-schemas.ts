export type CardType =
  | "calendar-event"
  | "note"
  | "reminder"
  | "plain-text"
  | "browser-nav"
  | "browser-snapshot"
  | "browser-action";

export interface CalendarEventCard {
  type: "calendar-event";
  title: string;
  date: string;
  time?: string;
  duration?: string;
  location?: string;
  description?: string;
}

export interface NoteCard {
  type: "note";
  title: string;
  content: string;
  tags?: string[];
  pinned?: boolean;
  folder?: string;
}

export interface ReminderCard {
  type: "reminder";
  title: string;
  dueDate: string;
  dueTime?: string;
  recurring?: boolean;
  completed?: boolean;
  priority?: "low" | "medium" | "high";
}

export interface PlainTextCard {
  type: "plain-text";
  content: string;
}

export interface BrowserNavCard {
  type: "browser-nav";
  action: string;
  url?: string;
  title?: string;
  tabCount?: number;
  message?: string;
}

export interface BrowserSnapshotCard {
  type: "browser-snapshot";
  url?: string;
  format: string;
  content: string;
  elementCount?: number;
  truncated: boolean;
}

export interface BrowserActionCard {
  type: "browser-action";
  action: string;
  ref?: string;
  message?: string;
  screenshotPath?: string;
  hasScreenshotData: boolean;
}

export type ContentCard =
  | CalendarEventCard
  | NoteCard
  | ReminderCard
  | PlainTextCard
  | BrowserNavCard
  | BrowserSnapshotCard
  | BrowserActionCard;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isIsoDateLike(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function validateCalendarEventCard(data: Record<string, unknown>): CalendarEventCard | null {
  if (data.type !== "calendar-event") {
    return null;
  }

  if (!isNonEmptyString(data.title) || !isIsoDateLike(data.date)) {
    return null;
  }

  if (!isOptionalString(data.time)) {
    return null;
  }

  if (!isOptionalString(data.duration)) {
    return null;
  }

  if (!isOptionalString(data.location)) {
    return null;
  }

  if (!isOptionalString(data.description)) {
    return null;
  }

  return {
    type: "calendar-event",
    title: data.title,
    date: data.date,
    time: data.time,
    duration: data.duration,
    location: data.location,
    description: data.description,
  };
}

function validateNoteCard(data: Record<string, unknown>): NoteCard | null {
  if (data.type !== "note") {
    return null;
  }

  if (!isNonEmptyString(data.title) || !isNonEmptyString(data.content)) {
    return null;
  }

  if (data.tags !== undefined && !isStringArray(data.tags)) {
    return null;
  }

  if (data.pinned !== undefined && typeof data.pinned !== "boolean") {
    return null;
  }

  if (!isOptionalString(data.folder)) {
    return null;
  }

  return {
    type: "note",
    title: data.title,
    content: data.content,
    tags: data.tags,
    pinned: data.pinned,
    folder: data.folder,
  };
}

function validateReminderCard(data: Record<string, unknown>): ReminderCard | null {
  if (data.type !== "reminder") {
    return null;
  }

  if (!isNonEmptyString(data.title) || !isIsoDateLike(data.dueDate)) {
    return null;
  }

  if (!isOptionalString(data.dueTime)) {
    return null;
  }

  if (data.recurring !== undefined && typeof data.recurring !== "boolean") {
    return null;
  }

  if (data.completed !== undefined && typeof data.completed !== "boolean") {
    return null;
  }

  if (
    data.priority !== undefined &&
    data.priority !== "low" &&
    data.priority !== "medium" &&
    data.priority !== "high"
  ) {
    return null;
  }

  return {
    type: "reminder",
    title: data.title,
    dueDate: data.dueDate,
    dueTime: data.dueTime,
    recurring: data.recurring,
    completed: data.completed,
    priority: data.priority,
  };
}

function validatePlainTextCard(data: Record<string, unknown>): PlainTextCard | null {
  if (data.type !== "plain-text") {
    return null;
  }

  if (!isNonEmptyString(data.content)) {
    return null;
  }

  return {
    type: "plain-text",
    content: data.content,
  };
}

function validateBrowserNavCard(data: Record<string, unknown>): BrowserNavCard | null {
  if (data.type !== "browser-nav") {
    return null;
  }

  if (!isNonEmptyString(data.action)) {
    return null;
  }

  if (!isOptionalString(data.url)) {
    return null;
  }

  if (!isOptionalString(data.title)) {
    return null;
  }

  if (data.tabCount !== undefined && typeof data.tabCount !== "number") {
    return null;
  }

  if (!isOptionalString(data.message)) {
    return null;
  }

  return {
    type: "browser-nav",
    action: data.action,
    url: data.url,
    title: data.title,
    tabCount: data.tabCount as number | undefined,
    message: data.message,
  };
}

function validateBrowserSnapshotCard(data: Record<string, unknown>): BrowserSnapshotCard | null {
  if (data.type !== "browser-snapshot") {
    return null;
  }

  if (!isNonEmptyString(data.format)) {
    return null;
  }

  if (typeof data.content !== "string") {
    return null;
  }

  if (!isOptionalString(data.url)) {
    return null;
  }

  if (data.elementCount !== undefined && typeof data.elementCount !== "number") {
    return null;
  }

  if (typeof data.truncated !== "boolean") {
    return null;
  }

  return {
    type: "browser-snapshot",
    url: data.url,
    format: data.format,
    content: data.content,
    elementCount: data.elementCount as number | undefined,
    truncated: data.truncated,
  };
}

function validateBrowserActionCard(data: Record<string, unknown>): BrowserActionCard | null {
  if (data.type !== "browser-action") {
    return null;
  }

  if (!isNonEmptyString(data.action)) {
    return null;
  }

  if (!isOptionalString(data.ref)) {
    return null;
  }

  if (!isOptionalString(data.message)) {
    return null;
  }

  if (!isOptionalString(data.screenshotPath)) {
    return null;
  }

  if (typeof data.hasScreenshotData !== "boolean") {
    return null;
  }

  return {
    type: "browser-action",
    action: data.action,
    ref: data.ref,
    message: data.message,
    screenshotPath: data.screenshotPath,
    hasScreenshotData: data.hasScreenshotData,
  };
}

export function validateCard(data: unknown): ContentCard | null {
  if (!isObject(data) || typeof data.type !== "string") {
    return null;
  }

  switch (data.type) {
    case "calendar-event":
      return validateCalendarEventCard(data);
    case "note":
      return validateNoteCard(data);
    case "reminder":
      return validateReminderCard(data);
    case "plain-text":
      return validatePlainTextCard(data);
    case "browser-nav":
      return validateBrowserNavCard(data);
    case "browser-snapshot":
      return validateBrowserSnapshotCard(data);
    case "browser-action":
      return validateBrowserActionCard(data);
    default:
      return null;
  }
}
