const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatMonthDay(date: Date, includeYear = false): string {
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();

  if (!includeYear) {
    return `${month} ${day}`;
  }

  return `${month} ${day}, ${date.getFullYear()}`;
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const elapsed = now.getTime() - timestamp;
  if (elapsed < MINUTE) {
    return "just now";
  }

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`;
  }

  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h ago`;
  }

  if (elapsed < 2 * DAY) {
    return "yesterday";
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  return formatMonthDay(date, !sameYear);
}
