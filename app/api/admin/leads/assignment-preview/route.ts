import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { buildLeadAssignmentPolicyPreview } from "@/lib/crm/lead-assignment-policy"
import { buildLeadAssignmentSnapshotToken } from "@/lib/crm/lead-assignment-snapshot"
import { listAdminUserDirectoryCached } from "@/lib/repositories/admin-users"
import { getLeads } from "@/lib/repositories/leads"

const MAX_ASSIGNMENT_PREVIEW = 500

function parseIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter(Boolean)
        )
      )
    : []
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null
  const ids = parseIds(body?.ids)
  if (ids.length === 0) {
    return NextResponse.json({ error: "배정 안전성을 확인할 리드가 없습니다." }, { status: 400 })
  }
  if (ids.length > MAX_ASSIGNMENT_PREVIEW) {
    return NextResponse.json(
      { error: `한 번에 확인할 수 있는 리드는 최대 ${MAX_ASSIGNMENT_PREVIEW}건입니다.` },
      { status: 400 }
    )
  }

  try {
    const [allLeads, directory] = await Promise.all([getLeads(), listAdminUserDirectoryCached()])
    if (!directory.health.ok) {
      return NextResponse.json(
        {
          error: directory.health.message ?? "담당자 명단 상태가 안전하지 않아 배정을 준비할 수 없습니다.",
          rosterHealthy: false,
        },
        { status: 503 }
      )
    }

    const preview = buildLeadAssignmentPolicyPreview(allLeads, ids)
    const snapshotToken = buildLeadAssignmentSnapshotToken(allLeads, ids, {
      healthy: directory.health.ok,
      ownerKeys: directory.crmOwners.map((owner) => owner.ownerKey),
    })

    return NextResponse.json({
      ...preview,
      snapshotToken,
      rosterHealthy: true,
      rosterMessage: directory.health.message,
    })
  } catch (error) {
    console.error("[POST /api/admin/leads/assignment-preview]", error)
    return NextResponse.json(
      { error: "리드 배정 안전성을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    )
  }
}
