import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  createManualBranchRevLinkCandidate,
  type CrmManualLinkTargetType,
} from "@/lib/repositories/crm-source-links"

function isManualTargetType(value: unknown): value is CrmManualLinkTargetType {
  return value === "customer" || value === "deal"
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const body = (await req.json().catch(() => null)) as {
    sourceRecordKey?: unknown
    targetType?: unknown
    targetId?: unknown
  } | null

  if (
    typeof body?.sourceRecordKey !== "string" ||
    !body.sourceRecordKey.trim() ||
    !isManualTargetType(body.targetType) ||
    typeof body.targetId !== "string" ||
    !body.targetId.trim()
  ) {
    return NextResponse.json({ error: "Invalid manual CRM source link payload" }, { status: 400 })
  }

  try {
    const link = await createManualBranchRevLinkCandidate({
      sourceRecordKey: body.sourceRecordKey.trim(),
      targetType: body.targetType,
      targetId: body.targetId.trim(),
    })

    return NextResponse.json({ ok: true, link })
  } catch (error) {
    console.error("[POST /api/admin/crm/source-links/manual]", error)
    const message = error instanceof Error ? error.message : "Failed to create manual CRM source link"
    const status = message.includes("not found") ? 404 : message.includes("confirmed") ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
