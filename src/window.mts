// Decides *when* a keepalive ping should turn into a real budget check.
//
// The keepalive fires every few minutes around the clock, so almost every ping
// must be a cheap no-op. Only pings that land inside the alert window, and only
// one per CHECK_INTERVAL_MINUTES, are allowed through to the Kickbase API.

const TIMEZONE = process.env.CHECK_TIMEZONE || "Europe/Berlin";

/** Days the check runs on, e.g. "Fri" or "Fri,Sat,Sun". */
const CHECK_DAYS = (process.env.CHECK_DAYS || "Fri")
  .split(",")
  .map((day) => day.trim())
  .filter(Boolean);

/** Minutes past midnight, parsed from a "HH:MM" string. */
function parseTime(value: string, label: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`${label} must look like "17:00", got "${value}"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`${label} is not a valid time of day: "${value}"`);
  }
  return hours * 60 + minutes;
}

const WINDOW_START = parseTime(
  process.env.CHECK_WINDOW_START || "17:00",
  "CHECK_WINDOW_START"
);
const WINDOW_END = parseTime(
  process.env.CHECK_WINDOW_END || "19:30",
  "CHECK_WINDOW_END"
);
export const INTERVAL_MINUTES = Number(
  process.env.CHECK_INTERVAL_MINUTES || 30
);

/**
 * Current weekday and minute-of-day in the configured timezone. Derived from
 * Intl rather than UTC offsets, so CEST/CET switches take care of themselves.
 */
export function localNow(date: Date = new Date()): {
  weekday: string;
  minutes: number;
  label: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    weekday,
    minutes: hour * 60 + minute,
    label: `${weekday} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${TIMEZONE}`,
  };
}

/** True when the given moment falls inside the configured alert window. */
export function isInWindow(date: Date = new Date()): boolean {
  const { weekday, minutes } = localNow(date);
  if (!CHECK_DAYS.includes(weekday)) {
    return false;
  }
  return minutes >= WINDOW_START && minutes <= WINDOW_END;
}

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Human readable window, for the status endpoint and the startup log. */
export function describeWindow(): string {
  return `${CHECK_DAYS.join(",")} ${formatMinutes(WINDOW_START)}-${formatMinutes(WINDOW_END)} ${TIMEZONE}, at most every ${INTERVAL_MINUTES} min`;
}
