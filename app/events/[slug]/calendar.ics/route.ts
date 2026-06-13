import { getCachedPublicEventBySlug } from "@/lib/repositories/public-events"
import { toAbsoluteUrl } from "@/lib/seo"

export const revalidate = 3600

// ICS 텍스트 필드 이스케이프 (RFC 5545)
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

// ISO → ICS UTC 포맷 (YYYYMMDDTHHMMSSZ)
function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params
  let slug = rawSlug
  try {
    slug = decodeURIComponent(rawSlug)
  } catch {
    // 그대로 사용
  }

  const event = await getCachedPublicEventBySlug(slug)
  if (!event) {
    return new Response("Not found", { status: 404 })
  }

  const eventUrl = toAbsoluteUrl(`/events/${event.slug ?? slug}`)
  const dtStart = toIcsUtc(event.startsAt)
  // 종료 시각이 없으면 2시간 행사로 가정
  const dtEnd = event.endsAt
    ? toIcsUtc(event.endsAt)
    : toIcsUtc(new Date(new Date(event.startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString())

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Classin//Events//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:classin-event-${event.id}@classin.ai.kr`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcsText(`${event.description}\n${eventUrl}`)}` : `DESCRIPTION:${escapeIcsText(eventUrl)}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : undefined,
    `URL:${eventUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean)

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="classin-event.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  })
}
