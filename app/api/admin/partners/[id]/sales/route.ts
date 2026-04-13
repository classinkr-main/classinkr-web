import { NextRequest, NextResponse } from "next/server"

import {
  readOptionalNumber,
  readOptionalString,
  readRequestBody,
  readRequiredMonth,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { upsertPartnerSales } from "@/lib/partners-data"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const body = await readRequestBody(req)

    const result = await upsertPartnerSales(id, {
      id: readOptionalString(body, "id", "판매 기록 ID"),
      dealId: readOptionalString(body, "dealId", "거래 ID"),
      salesMonth: readRequiredMonth(body, "salesMonth", "판매 월"),
      unitsSold: readOptionalNumber(body, "unitsSold", "판매 대수", { defaultValue: 0, integer: true, min: 0 }) ?? 0,
      grossAmount: readOptionalNumber(body, "grossAmount", "총매출", { defaultValue: 0, min: 0 }) ?? 0,
      netAmount: readOptionalNumber(body, "netAmount", "순매출", { defaultValue: 0, min: 0 }) ?? 0,
    })

    if (!result.workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error, "Failed to save sales record")
  }
}
