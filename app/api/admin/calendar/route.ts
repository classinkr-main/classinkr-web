import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { createEvent, getAllEvents, getEventsByMonth, getEventsByRange } from "@/lib/calendar-data"
import { validateCalendarEventPayload } from "@/lib/calendar-event-validation"
import { daysBetween, isDateString } from "@/lib/admin-calendar/range"

/** 한 번에 끌어올 수 있는 최대 기간. 8주 타임라인(56일)에 여유를 둔 상한. */
const MAX_RANGE_DAYS = 120

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { searchParams } = req.nextUrl
    const year = searchParams.get("year")
    const month = searchParams.get("month")
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    // 임의 기간(주간·타임라인 뷰). year/month 보다 먼저 본다.
    if (from || to) {
      if (!isDateString(from) || !isDateString(to)) {
        return NextResponse.json(
          { error: "from/to 는 YYYY-MM-DD 형식이어야 합니다." },
          { status: 400 }
        )
      }
      const span = daysBetween(from, to)
      if (span < 0) {
        return NextResponse.json({ error: "from 이 to 보다 뒤일 수 없습니다." }, { status: 400 })
      }
      if (span > MAX_RANGE_DAYS) {
        return NextResponse.json(
          { error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.` },
          { status: 400 }
        )
      }
      return adminCachedJson(await getEventsByRange(from, to))
    }

    if (year && month) {
      const parsedYear = Number.parseInt(year, 10)
      const parsedMonth = Number.parseInt(month, 10)

      if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return NextResponse.json({ error: "year/month 파라미터가 올바르지 않습니다." }, { status: 400 })
      }

      return adminCachedJson(await getEventsByMonth(parsedYear, parsedMonth))
    }

    return adminCachedJson(await getAllEvents())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캘린더 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const body = await req.json()
  const validationError = validateCalendarEventPayload(body, { requireRequiredFields: true })
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const event = await createEvent({
    title: body.title,
    date: body.date,
    endDate: body.endDate,
    time: body.time,
    endTime: body.endTime,
    type: body.type,
    description: body.description,
    assignees: body.assignees ?? [],
    allDay: body.allDay ?? false,
  })
  return NextResponse.json(event, { status: 201 })
}
