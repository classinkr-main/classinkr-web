"server-only";

import type { calendar_v3 } from "googleapis";

import { calendar as googleCalendar } from "@/lib/google";

const DEFAULT_TIMEZONE = "Asia/Seoul";

type TimedRange = {
  kind: "timed";
  startISO: string;
  endISO: string;
  timeZone?: string | null;
};

type AllDayRange = {
  kind: "all_day";
  startDate: string;
  endDate: string;
};

type GoogleCalendarRange = TimedRange | AllDayRange;

export type UpsertGoogleCalendarEventInput = {
  googleEventId?: string | null;
  title: string;
  description?: string | null;
  range: GoogleCalendarRange;
  metadata?: Record<string, string | null | undefined>;
};

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getConfiguredCalendarId() {
  return readRequiredEnv("GOOGLE_CALENDAR_ID");
}

export function isGoogleCalendarSyncConfigured() {
  return Boolean(
    readRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
      readRequiredEnv("GOOGLE_PRIVATE_KEY") &&
      getConfiguredCalendarId()
  );
}

function addDays(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount, 0, 0, 0));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate()
  ).padStart(2, "0")}`;
}

function buildEventDateTime(range: GoogleCalendarRange): {
  start: calendar_v3.Schema$EventDateTime;
  end: calendar_v3.Schema$EventDateTime;
} {
  if (range.kind === "all_day") {
    return {
      start: { date: range.startDate },
      end: { date: addDays(range.endDate, 1) },
    };
  }

  const timeZone = range.timeZone ?? DEFAULT_TIMEZONE;

  return {
    start: { dateTime: range.startISO, timeZone },
    end: { dateTime: range.endISO, timeZone },
  };
}

function buildExtendedProperties(
  metadata?: Record<string, string | null | undefined>
): NonNullable<calendar_v3.Schema$Event["extendedProperties"]> | undefined {
  if (!metadata) return undefined;

  const entries = Object.entries(metadata).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0
  );

  if (entries.length === 0) {
    return undefined;
  }

  return {
    private: Object.fromEntries(entries),
  } satisfies NonNullable<calendar_v3.Schema$Event["extendedProperties"]>;
}

function buildEventBody(input: UpsertGoogleCalendarEventInput): calendar_v3.Schema$Event {
  const dateTime = buildEventDateTime(input.range);

  return {
    summary: input.title,
    description: input.description ?? undefined,
    start: dateTime.start,
    end: dateTime.end,
    extendedProperties: buildExtendedProperties(input.metadata),
  };
}

function readGoogleErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;

  if ("code" in error && typeof error.code === "number") {
    return error.code;
  }

  if (
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return error.response.status;
  }

  return null;
}

export async function upsertGoogleCalendarEvent(input: UpsertGoogleCalendarEventInput) {
  const calendarId = getConfiguredCalendarId();

  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  }

  const requestBody = buildEventBody(input);

  if (input.googleEventId) {
    const response = await googleCalendar.events.patch({
      calendarId,
      eventId: input.googleEventId,
      sendUpdates: "none",
      requestBody,
    });

    return response.data;
  }

  const response = await googleCalendar.events.insert({
    calendarId,
    sendUpdates: "none",
    requestBody,
  });

  return response.data;
}

export async function deleteGoogleCalendarEvent(googleEventId: string) {
  const calendarId = getConfiguredCalendarId();

  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is not configured.");
  }

  try {
    await googleCalendar.events.delete({
      calendarId,
      eventId: googleEventId,
      sendUpdates: "none",
    });
  } catch (error) {
    if (readGoogleErrorStatus(error) === 404) {
      return;
    }

    throw error;
  }
}
