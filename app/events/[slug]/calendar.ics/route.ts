import { getCachedPublicEventBySlug } from "@/lib/repositories/public-events"
import { getPublicEventSessionRanges } from "@/lib/public-event-dates"
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
  const dtStamp = toIcsUtc(new Date().toISOString())
  const description = event.description
    ? `DESCRIPTION:${escapeIcsText(`${event.description}\n${eventUrl}`)}`
    : `DESCRIPTION:${escapeIcsText(eventUrl)}`

  // 띄엄띄엄 열리는 회차 행사는 회차마다 VEVENT를 따로 내보낸다.
  // 단일 기간 행사는 구간이 하나뿐이라 기존과 동일한 결과가 나온다.
  const ranges = getPublicEventSessionRanges(event.startsAt, event.endsAt, event.sessionDates)
  const isMultiSession = ranges.length > 1

  const vevents = ranges.flatMap((range, index) => [
    "BEGIN:VEVENT",
    // 회차별 UID가 달라야 캘린더 앱이 하나로 덮어쓰지 않는다
    `UID:classin-event-${event.id}${isMultiSession ? `-${range.date}` : ""}@classin.ai.kr`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${toIcsUtc(range.startIso)}`,
    `DTEND:${toIcsUtc(range.endIso)}`,
    `SUMMARY:${escapeIcsText(
      isMultiSession ? `${event.title} (${index + 1}/${ranges.length}회차)` : event.title
    )}`,
    description,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : undefined,
    `URL:${eventUrl}`,
    "END:VEVENT",
  ])

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Classin//Events//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...vevents,
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
