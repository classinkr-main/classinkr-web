import { NextRequest, NextResponse } from "next/server"

import {
  PARTNER_CHANNEL_VALUES,
  PARTNER_STATUS_VALUES,
  readOptionalEnum,
  readOptionalString,
  readRequestBody,
  readRequiredEmail,
  readRequiredString,
  readStringArray,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { createPartnerWorkspace, listPartnerWorkspacesData } from "@/lib/partners-data"

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const { workspaces, source, warning } = await listPartnerWorkspacesData()
    return NextResponse.json({ workspaces, source, warning })
  } catch {
    return NextResponse.json({ error: "Failed to read partner workspaces" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req)
  if (err) return err

  try {
    const body = await readRequestBody(req)

    const result = await createPartnerWorkspace({
      name: readRequiredString(body, "name", "파트너명"),
      status: readOptionalEnum(body, "status", "상태", PARTNER_STATUS_VALUES) ?? "lead",
      channel: readOptionalEnum(body, "channel", "채널", PARTNER_CHANNEL_VALUES) ?? "direct",
      region: readOptionalString(body, "region", "지역", { emptyAsUndefined: false }) ?? "",
      ownerName: readRequiredString(body, "ownerName", "대표 연락처명"),
      ownerEmail: readRequiredEmail(body, "ownerEmail", "대표 이메일"),
      accountManager: readOptionalString(body, "accountManager", "담당자", { emptyAsUndefined: false }) ?? "",
      tags: readStringArray(body, "tags", "태그"),
      notes: readOptionalString(body, "notes", "메모", { emptyAsUndefined: false }),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return toErrorResponse(error, "Failed to create partner workspace")
  }
}
