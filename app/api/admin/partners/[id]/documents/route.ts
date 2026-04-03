import { NextRequest, NextResponse } from "next/server"

import {
  DOCUMENT_KIND_VALUES,
  DOCUMENT_STATUS_VALUES,
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
import { upsertPartnerDocument } from "@/lib/partners-data"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const issuedAt = readOptionalDate(body, "issuedAt", "발행일")
    const dueAt = readOptionalDate(body, "dueAt", "마감일")
    ensureOrderedDates(issuedAt, dueAt, "발행일", "마감일")

    const result = await upsertPartnerDocument(id, {
      id: readOptionalString(body, "id", "문서 ID"),
      dealId: readOptionalString(body, "dealId", "거래 ID"),
      kind: readRequiredEnum(body, "kind", "문서 유형", DOCUMENT_KIND_VALUES),
      status: readRequiredEnum(body, "status", "문서 상태", DOCUMENT_STATUS_VALUES),
      title: readRequiredString(body, "title", "문서 제목"),
      amount: readOptionalNumber(body, "amount", "금액", { min: 0 }),
      issuedAt,
      dueAt,
      fileLabel: readOptionalString(body, "fileLabel", "첨부 문서명", { emptyAsUndefined: false }) ?? "첨부 문서",
    })

    if (!result.workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error, "Failed to save document")
  }
}
