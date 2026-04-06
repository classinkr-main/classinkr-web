import { NextRequest, NextResponse } from "next/server"

import {
  ACTIVITY_LOG_STATUS_VALUES,
  readOptionalDateTime,
  readOptionalEnum,
  readOptionalString,
  readRequestBody,
  readRequiredDateTime,
  readRequiredString,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { getPartnerWorkspaceData, upsertPartnerActivityLog } from "@/lib/partners-data"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const { workspace, source, warning } = await getPartnerWorkspaceData(id)
    if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ items: workspace.activityLogs, source, warning })
  } catch {
    return NextResponse.json({ error: "Failed to read activity logs" }, { status: 500 })
  }
}

async function handleUpsert(req: NextRequest, id: string) {
  const body = await readRequestBody(req)
  const result = await upsertPartnerActivityLog(id, {
    id: readOptionalString(body, "id", "활동 로그 ID"),
    dealId: readOptionalString(body, "dealId", "거래 ID"),
    documentId: readOptionalString(body, "documentId", "문서 ID"),
    scheduleItemId: readOptionalString(body, "scheduleItemId", "일정 ID"),
    checklistItemId: readOptionalString(body, "checklistItemId", "체크리스트 ID"),
    issueId: readOptionalString(body, "issueId", "이슈 ID"),
    subjectType: readOptionalString(body, "subjectType", "주체 유형", { emptyAsUndefined: false }) ?? "partner",
    subjectId: readOptionalString(body, "subjectId", "주체 ID"),
    logCategory: readRequiredString(body, "logCategory", "로그 분류"),
    status: readOptionalEnum(body, "status", "로그 상태", ACTIVITY_LOG_STATUS_VALUES) ?? "recorded",
    actor: readOptionalString(body, "actor", "작성자", { emptyAsUndefined: false }),
    action: readRequiredString(body, "action", "액션"),
    summary: readRequiredString(body, "summary", "요약"),
    details: readOptionalString(body, "details", "상세", { emptyAsUndefined: false }),
    nextAction: readOptionalString(body, "nextAction", "다음 액션", { emptyAsUndefined: false }),
    dueAt: readOptionalDateTime(body, "dueAt", "마감 일시"),
    occurredAt: readRequiredDateTime(body, "occurredAt", "발생 일시"),
  })

  if (!result.workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(result)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    return await handleUpsert(req, id)
  } catch (error) {
    return toErrorResponse(error, "Failed to save activity log")
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    return await handleUpsert(req, id)
  } catch (error) {
    return toErrorResponse(error, "Failed to update activity log")
  }
}
