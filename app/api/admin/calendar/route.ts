import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllEvents, getEventsByMonth, createEvent } from "@/lib/calendar-data"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { searchParams } = req.nextUrl
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    if (year && month) {
      const parsedYear = Number.parseInt(year, 10)
      const parsedMonth = Number.parseInt(month, 10)

      if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return NextResponse.json({ error: "year/month 파라미터가 올바르지 않습니다." }, { status: 400 })
      }

      return NextResponse.json(await getEventsByMonth(parsedYear, parsedMonth))
    }

    return NextResponse.json(await getAllEvents())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캘린더 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  const body = await req.json()
  if (!body.title || !body.date || !body.type) {
    return NextResponse.json({ error: "title, date, type은 필수입니다." }, { status: 400 })
  }

  const event = createEvent({
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
