import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllEvents, getEventsByMonth, createEvent } from "@/lib/calendar-data"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  const { searchParams } = req.nextUrl
  const year = searchParams.get("year")
  const month = searchParams.get("month")

  if (year && month) {
    return NextResponse.json(getEventsByMonth(parseInt(year), parseInt(month)))
  }
  return NextResponse.json(getAllEvents())
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
