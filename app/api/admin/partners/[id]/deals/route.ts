import { NextRequest, NextResponse } from "next/server"

import {
  DEAL_STAGE_VALUES,
  ensureOrderedDates,
  readOptionalDate,
  readOptionalNumber,
  readOptionalString,
  readRequestBody,
  readRequiredEnum,
  readRequiredString,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { upsertPartnerDeal } from "@/lib/partners-data"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const contractStartAt = readOptionalDate(body, "contractStartAt", "계약 시작일")
    const contractEndAt = readOptionalDate(body, "contractEndAt", "계약 종료일")
    ensureOrderedDates(contractStartAt, contractEndAt, "계약 시작일", "계약 종료일")

    const result = await upsertPartnerDeal(id, {
      id: readOptionalString(body, "id", "거래 ID"),
      title: readRequiredString(body, "title", "거래명"),
      stage: readRequiredEnum(body, "stage", "거래 단계", DEAL_STAGE_VALUES),
      quoteAmount: readOptionalNumber(body, "quoteAmount", "견적 금액", { defaultValue: 0, min: 0 }) ?? 0,
      expectedCloseAt: readOptionalDate(body, "expectedCloseAt", "예상 마감일"),
      contractStartAt,
      contractEndAt,
      salesUnits: readOptionalNumber(body, "salesUnits", "판매 댓수", { defaultValue: 0, integer: true, min: 0 }) ?? 0,
      manager: readOptionalString(body, "manager", "담당자", { emptyAsUndefined: false }) ?? "",
    })

    if (!result.workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error, "Failed to save deal")
  }
}
