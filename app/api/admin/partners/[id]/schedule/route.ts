import { NextRequest, NextResponse } from "next/server"

import {
  SCHEDULE_KIND_VALUES,
  SCHEDULE_STATUS_VALUES,
  ensureOrderedDates,
  readOptionalDateTime,
  readOptionalString,
  readRequestBody,
  readRequiredDateTime,
  readRequiredEnum,
  readRequiredString,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { upsertPartnerSchedule } from "@/lib/partners-data"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const startsAt = readRequiredDateTime(body, "startsAt", "시작 일시")
    const endsAt = readOptionalDateTime(body, "endsAt", "종료 일시")
    ensureOrderedDates(startsAt, endsAt, "시작 일시", "종료 일시")

    const result = await upsertPartnerSchedule(id, {
      id: readOptionalString(body, "id", "일정 ID"),
      dealId: readOptionalString(body, "dealId", "거래 ID"),
      kind: readRequiredEnum(body, "kind", "일정 유형", SCHEDULE_KIND_VALUES),
      status: readRequiredEnum(body, "status", "일정 상태", SCHEDULE_STATUS_VALUES),
      title: readRequiredString(body, "title", "일정 제목"),
      startsAt,
      endsAt,
      owner: readOptionalString(body, "owner", "담당자", { emptyAsUndefined: false }) ?? "",
    })

    if (!result.workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error, "Failed to save schedule")
  }
}
