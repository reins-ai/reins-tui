import { validateCard, type ContentCard } from "./card-schemas";

const NOTE_PREVIEW_LIMIT = 280;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toIsoDate(dateLike: unknown): string | undefined {
  const asString = pickString(dateLike);
  if (!asString) {
    return undefined;
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function toTimeString(dateLike: unknown): string | undefined {
  const asString = pickString(dateLike);
  if (!asString) {
    return undefined;
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const hours = parsed.getHours().toString().padStart(2, "0");
  const minutes = parsed.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toDuration(startLike: unknown, endLike: unknown): string | undefined {
  const startIso = toIsoDate(startLike);
  const endIso = toIsoDate(endLike);
  if (!startIso || !endIso) {
    return undefined;
  }

  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return undefined;
  }

  const minutes = Math.round((end - start) / (1000 * 60));
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }

  return `${minutes}m`;
}

function toTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value
    .map((entry) => pickString(entry))
    .filter((entry): entry is string => entry !== undefined);

  return tags.length > 0 ? tags : undefined;
}

function toPriority(value: unknown): "low" | "medium" | "high" | undefined {
  const priority = pickString(value)?.toLowerCase();
  if (!priority) {
    return undefined;
  }

  if (priority === "urgent") {
    return "high";
  }

  if (priority === "low" || priority === "medium" || priority === "high") {
    return priority;
  }

  return undefined;
}

function truncatePreview(content: string): string {
  if (content.length <= NOTE_PREVIEW_LIMIT) {
    return content;
  }

  return `${content.slice(0, NOTE_PREVIEW_LIMIT - 1)}…`;
}

function stringifyForFallback(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "No structured content available.";
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function toPlainTextCard(value: unknown): ContentCard {
  return {
    type: "plain-text",
    content: stringifyForFallback(value),
  };
}

function unwrapPayload(output: unknown): unknown {
  if (!isObject(output)) {
    return output;
  }

  if ("result" in output) {
    return output.result;
  }

  return output;
}

function pickPrimaryItem(payload: unknown, collectionKey: string, singularKey: string): unknown {
  if (Array.isArray(payload)) {
    return payload[0];
  }

  if (!isObject(payload)) {
    return payload;
  }

  const collection = payload[collectionKey];
  if (Array.isArray(collection)) {
    return collection[0];
  }

  if (payload[singularKey] !== undefined) {
    return payload[singularKey];
  }

  return payload;
}

function adaptCalendar(output: unknown): ContentCard {
  const payload = pickPrimaryItem(unwrapPayload(output), "events", "event");
  if (!isObject(payload)) {
    return toPlainTextCard(output);
  }

  const card: ContentCard = {
    type: "calendar-event",
    title: pickString(payload.title) ?? "Untitled event",
    date: toIsoDate(payload.startTime ?? payload.date) ?? "",
    time: toTimeString(payload.startTime ?? payload.time),
    duration: pickString(payload.duration) ?? toDuration(payload.startTime, payload.endTime),
    location: pickString(payload.location),
    description: pickString(payload.description),
  };

  return validateCard(card) ?? toPlainTextCard(output);
}

function adaptNote(output: unknown): ContentCard {
  const payload = pickPrimaryItem(unwrapPayload(output), "notes", "note");
  if (!isObject(payload)) {
    return toPlainTextCard(output);
  }

  const rawContent = pickString(payload.content) ?? pickString(payload.description) ?? "";

  const card: ContentCard = {
    type: "note",
    title: pickString(payload.title) ?? "Untitled note",
    content: truncatePreview(rawContent),
    tags: toTags(payload.tags),
    pinned: pickBoolean(payload.isPinned) ?? pickBoolean(payload.pinned),
    folder: pickString(payload.folderName) ?? pickString(payload.folder),
  };

  return validateCard(card) ?? toPlainTextCard(output);
}

function adaptReminder(output: unknown): ContentCard {
  const payload = pickPrimaryItem(unwrapPayload(output), "reminders", "reminder");
  if (!isObject(payload)) {
    return toPlainTextCard(output);
  }

  const dueSource = payload.dueAt ?? payload.dueDate;

  const status = pickString(payload.status)?.toLowerCase();
  const card: ContentCard = {
    type: "reminder",
    title: pickString(payload.title) ?? "Untitled reminder",
    dueDate: toIsoDate(dueSource) ?? "",
    dueTime: toTimeString(dueSource ?? payload.dueTime),
    recurring: pickBoolean(payload.recurring) ?? (payload.recurrence !== undefined ? true : undefined),
    completed: pickBoolean(payload.completed) ?? (status === "completed" || status === "complete"),
    priority: toPriority(payload.priority),
  };

  return validateCard(card) ?? toPlainTextCard(output);
}

export function adaptToolOutput(toolName: string, output: unknown): ContentCard {
  const normalizedName = toolName.trim().toLowerCase();

  if (normalizedName === "calendar" || normalizedName === "calendar_events") {
    return adaptCalendar(output);
  }

  if (normalizedName === "notes" || normalizedName === "create_note" || normalizedName === "get_note") {
    return adaptNote(output);
  }

  if (normalizedName === "reminders" || normalizedName === "create_reminder") {
    return adaptReminder(output);
  }

  return toPlainTextCard(output);
}
