import { NextRequest, NextResponse } from "next/server"

import {
  ISSUE_SEVERITY_VALUES,
  ISSUE_STATUS_VALUES,
  readOptionalDateTime,
  readOptionalEnum,
  readOptionalString,
  readRequestBody,
  readRequiredString,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { getPartnerWorkspaceData, upsertPartnerIssue } from "@/lib/partners-data"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const { workspace, source, warning } = await getPartnerWorkspaceData(id)
    if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ items: workspace.issues, source, warning })
  } catch {
    return NextResponse.json({ error: "Failed to read issues" }, { status: 500 })
  }
}

async function handleUpsert(req: NextRequest, id: string) {
  const body = await readRequestBody(req)
  const result = await upsertPartnerIssue(id, {
    id: readOptionalString(body, "id", "이슈 ID"),
    dealId: readOptionalString(body, "dealId", "거래 ID"),
    relatedDocumentId: readOptionalString(body, "relatedDocumentId", "연결 문서 ID"),
    relatedChecklistItemId: readOptionalString(body, "relatedChecklistItemId", "연결 체크리스트 ID"),
    title: readRequiredString(body, "title", "이슈 제목"),
    category: readRequiredString(body, "category", "이슈 분류"),
    severity: readOptionalEnum(body, "severity", "이슈 심각도", ISSUE_SEVERITY_VALUES) ?? "medium",
    status: readOptionalEnum(body, "status", "이슈 상태", ISSUE_STATUS_VALUES) ?? "open",
    facts: readOptionalString(body, "facts", "사실 관계", { emptyAsUndefined: false }),
    unresolvedPoints: readOptionalString(body, "unresolvedPoints", "미해결 포인트", { emptyAsUndefined: false }),
    currentAssumption: readOptionalString(body, "currentAssumption", "현재 가정", { emptyAsUndefined: false }),
    verifyWith: readOptionalString(body, "verifyWith", "확인 대상", { emptyAsUndefined: false }),
    owner: readOptionalString(body, "owner", "담당자", { emptyAsUndefined: false }),
    nextCheckAt: readOptionalDateTime(body, "nextCheckAt", "다음 확인 일시"),
    dueAt: readOptionalDateTime(body, "dueAt", "마감 일시"),
    resolvedAt: readOptionalDateTime(body, "resolvedAt", "해결 일시"),
    resolutionSummary: readOptionalString(body, "resolutionSummary", "해결 요약", { emptyAsUndefined: false }),
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
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    return await handleUpsert(req, id)
  } catch (error) {
    return toErrorResponse(error, "Failed to save issue")
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    return await handleUpsert(req, id)
  } catch (error) {
    return toErrorResponse(error, "Failed to update issue")
  }
}
