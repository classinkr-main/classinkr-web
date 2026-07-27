import { NextRequest, NextResponse } from "next/server"

import {
  INSTALL_STATUS_VALUES,
  TODO_STATUS_VALUES,
  readOptionalDateTime,
  readOptionalEnum,
  readOptionalNumber,
  readOptionalString,
  readRequestBody,
  readRequiredString,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getPartnerWorkspaceData, upsertPartnerChecklist } from "@/lib/partners-data"

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
    return adminCachedJson({ items: workspace.checklists, source, warning })
  } catch {
    return NextResponse.json({ error: "Failed to read checklists" }, { status: 500 })
  }
}

async function handleUpsert(req: NextRequest, id: string) {
  const body = await readRequestBody(req)
  const result = await upsertPartnerChecklist(id, {
    id: readOptionalString(body, "id", "체크리스트 ID"),
    dealId: readOptionalString(body, "dealId", "거래 ID"),
    parentItemId: readOptionalString(body, "parentItemId", "상위 체크리스트 ID"),
    checklistGroup: readRequiredString(body, "checklistGroup", "체크리스트 그룹"),
    title: readRequiredString(body, "title", "체크리스트 제목"),
    itemCategory: readOptionalString(body, "itemCategory", "품목 분류"),
    itemCode: readOptionalString(body, "itemCode", "품목 코드"),
    itemName: readOptionalString(body, "itemName", "품목명"),
    plannedQuantity: readOptionalNumber(body, "plannedQuantity", "계획 수량", { integer: true, min: 0 }),
    confirmedQuantity: readOptionalNumber(body, "confirmedQuantity", "확정 수량", { integer: true, min: 0 }),
    todoStatus: readOptionalEnum(body, "todoStatus", "Todo 상태", TODO_STATUS_VALUES) ?? "open",
    installStatus: readOptionalEnum(body, "installStatus", "설치 상태", INSTALL_STATUS_VALUES) ?? "planned",
    owner: readOptionalString(body, "owner", "담당자", { emptyAsUndefined: false }) ?? "",
    dueAt: readOptionalDateTime(body, "dueAt", "마감 일시"),
    completedAt: readOptionalDateTime(body, "completedAt", "완료 일시"),
    notes: readOptionalString(body, "notes", "메모", { emptyAsUndefined: false }),
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
    return toErrorResponse(error, "Failed to save checklist")
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
    return toErrorResponse(error, "Failed to update checklist")
  }
}
