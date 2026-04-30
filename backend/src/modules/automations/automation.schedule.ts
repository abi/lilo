import type { AutomationSchedule } from "./automation.types.js";

const CRON_PARTS = 5;
const NEXT_SEARCH_LIMIT_MINUTES = 366 * 24 * 60;

const parseCronPart = (
  part: string,
  min: number,
  max: number,
): Set<number> | null => {
  const values = new Set<number>();

  for (const rawSegment of part.split(",")) {
    const segment = rawSegment.trim();
    if (!segment) return null;

    const [rangePart, stepPart] = segment.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) return null;

    let start: number;
    let end: number;
    if (rangePart === "*") {
      start = min;
      end = max;
    } else if (rangePart?.includes("-")) {
      const [startRaw, endRaw] = rangePart.split("-");
      start = Number(startRaw);
      end = Number(endRaw);
    } else {
      start = Number(rangePart);
      end = start;
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      return null;
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }

  return values;
};

const getTimeZoneParts = (
  date: Date,
  timeZone?: string,
): {
  minute: number;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
} | null => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      minute: "numeric",
      hour: "numeric",
      day: "numeric",
      month: "numeric",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes): number | null => {
      const raw = parts.find((part) => part.type === type)?.value;
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isInteger(parsed) ? parsed : null;
    };
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const dayByName: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const minute = value("minute");
    const hour = value("hour");
    const dayOfMonth = value("day");
    const month = value("month");
    const dayOfWeek = weekday ? dayByName[weekday] : undefined;
    if (
      minute === null ||
      hour === null ||
      dayOfMonth === null ||
      month === null ||
      typeof dayOfWeek !== "number"
    ) {
      return null;
    }

    return { minute, hour, dayOfMonth, month, dayOfWeek };
  } catch {
    return null;
  }
};

export const getNextRunAt = (
  schedule: AutomationSchedule,
  from = new Date(),
): string | null => {
  if (schedule.type === "at") {
    const at = new Date(schedule.at);
    return Number.isNaN(at.getTime()) || at <= from ? null : at.toISOString();
  }

  const parts = schedule.expression.trim().split(/\s+/);
  if (parts.length !== CRON_PARTS) {
    return null;
  }

  const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;
  const minuteValues = parseCronPart(minutePart ?? "", 0, 59);
  const hourValues = parseCronPart(hourPart ?? "", 0, 23);
  const dayOfMonthValues = parseCronPart(dayOfMonthPart ?? "", 1, 31);
  const monthValues = parseCronPart(monthPart ?? "", 1, 12);
  const dayOfWeekValues = parseCronPart(dayOfWeekPart ?? "", 0, 7);
  if (
    !minuteValues ||
    !hourValues ||
    !dayOfMonthValues ||
    !monthValues ||
    !dayOfWeekValues
  ) {
    return null;
  }

  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  for (let index = 0; index < NEXT_SEARCH_LIMIT_MINUTES; index += 1) {
    const local = getTimeZoneParts(candidate, schedule.timezone);
    if (!local) return null;
    const normalizedDayOfWeek = local.dayOfWeek === 0 ? [0, 7] : [local.dayOfWeek];
    if (
      minuteValues.has(local.minute) &&
      hourValues.has(local.hour) &&
      dayOfMonthValues.has(local.dayOfMonth) &&
      monthValues.has(local.month) &&
      normalizedDayOfWeek.some((day) => dayOfWeekValues.has(day))
    ) {
      return candidate.toISOString();
    }

    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  return null;
};

export const describeSchedule = (schedule: AutomationSchedule): string => {
  if (schedule.type === "at") {
    return `At ${schedule.at}`;
  }

  return `Cron ${schedule.expression}${schedule.timezone ? ` (${schedule.timezone})` : ""}`;
};
