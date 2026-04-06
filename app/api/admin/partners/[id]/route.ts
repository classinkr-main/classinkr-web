import { NextRequest, NextResponse } from "next/server"

import {
  PARTNER_CHANNEL_VALUES,
  PARTNER_STATUS_VALUES,
  hasField,
  readOptionalEnum,
  readOptionalString,
  readRequestBody,
  readRequiredEmail,
  readRequiredString,
  readStringArray,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getPartnerWorkspaceData,
  getPartnerWorkspaceShellData,
  updatePartnerSummary,
} from "@/lib/partners-data"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const view = req.nextUrl.searchParams.get("view")

    if (view === "shell") {
      const { shell, source, warning } = await getPartnerWorkspaceShellData(id)
      if (!shell) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      return NextResponse.json({ shell, source, warning })
    }

    const { workspace, source, warning } = await getPartnerWorkspaceData(id)

    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ workspace, source, warning })
  } catch {
    return NextResponse.json({ error: "Failed to read partner workspace" }, { status: 500 })
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
    const body = await readRequestBody(req)
    const nextSummary = {
      name: hasField(body, "name") ? readRequiredString(body, "name", "파트너명") : undefined,
      status: readOptionalEnum(body, "status", "상태", PARTNER_STATUS_VALUES),
      channel: readOptionalEnum(body, "channel", "채널", PARTNER_CHANNEL_VALUES),
      region: hasField(body, "region")
        ? readOptionalString(body, "region", "지역", { emptyAsUndefined: false }) ?? ""
        : undefined,
      ownerName: hasField(body, "ownerName")
        ? readRequiredString(body, "ownerName", "대표 연락처명")
        : undefined,
      ownerEmail: hasField(body, "ownerEmail")
        ? readRequiredEmail(body, "ownerEmail", "대표 이메일")
        : undefined,
      accountManager: hasField(body, "accountManager")
        ? readOptionalString(body, "accountManager", "담당자", { emptyAsUndefined: false }) ?? ""
        : undefined,
      tags: hasField(body, "tags") ? readStringArray(body, "tags", "태그") : undefined,
      notes: hasField(body, "notes")
        ? readOptionalString(body, "notes", "메모", { emptyAsUndefined: false }) ?? ""
        : undefined,
    }

    if (Object.values(nextSummary).every((value) => value === undefined)) {
      return NextResponse.json({ error: "수정할 항목이 없습니다." }, { status: 400 })
    }

    const result = await updatePartnerSummary(id, {
      name: nextSummary.name,
      status: nextSummary.status,
      channel: nextSummary.channel,
      region: nextSummary.region,
      ownerName: nextSummary.ownerName,
      ownerEmail: nextSummary.ownerEmail,
      accountManager: nextSummary.accountManager,
      tags: nextSummary.tags,
      notes: nextSummary.notes,
    })

    if (!result.workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error, "Failed to update partner workspace")
  }
}
