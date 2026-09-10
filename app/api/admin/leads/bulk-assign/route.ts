import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { buildLeadAssignmentPolicyPreview, hasLeadAssignmentBlockers } from "@/lib/crm/lead-assignment-policy"
import {
  buildLeadAssignmentExpectedVersions,
  buildLeadAssignmentSnapshotToken,
} from "@/lib/crm/lead-assignment-snapshot"
import { ownerLookupKeys, listAdminUserDirectoryCached } from "@/lib/repositories/admin-users"
import { assignLeads, assignLeadsGuarded, getLeads } from "@/lib/repositories/leads"

const MAX_BULK_ASSIGN = 500

function normalizeOwner(value: string) {
  return value.trim().toLowerCase()
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as {
    ids?: unknown
    assigned_to?: unknown
    snapshotToken?: unknown
    mode?: unknown
    reasonCode?: unknown
  } | null
  const ids = Array.isArray(body?.ids)
    ? Array.from(
        new Set(
          body.ids
            .filter((id): id is string => typeof id === "string")
            .map((id) => id.trim())
            .filter(Boolean)
        )
      )
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: "담당자를 배정할 리드가 없습니다." }, { status: 400 })
  }
  if (ids.length > MAX_BULK_ASSIGN) {
    return NextResponse.json(
      { error: `한 번에 배정할 수 있는 리드는 최대 ${MAX_BULK_ASSIGN}건입니다.`, limit: MAX_BULK_ASSIGN },
      { status: 400 }
    )
  }
  if (body?.assigned_to !== null && typeof body?.assigned_to !== "string") {
    return NextResponse.json({ error: "담당자를 선택해 주세요." }, { status: 400 })
  }

  let assignedTo: string | null = null
  let allLeads
  try {
    allLeads = await getLeads()
  } catch (error) {
    console.error("[PATCH /api/admin/leads/bulk-assign] leads", error)
    return NextResponse.json(
      { error: "현재 리드 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503 }
    )
  }

  const allLeadIds = new Set(allLeads.map((lead) => lead.id))
  const missingIds = ids.filter((id) => !allLeadIds.has(id))
  if (missingIds.length > 0) {
    return NextResponse.json(
      { error: "일부 리드가 사라졌습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.", missingIds },
      { status: 409 }
    )
  }

  if (typeof body?.assigned_to === "string") {
    if (body?.mode !== "manual_reviewed") {
      return NextResponse.json(
        { error: "현재 데이터에는 자동 배정 근거가 없습니다. 안전 미리보기 후 수동 검토 배정만 가능합니다." },
        { status: 409 }
      )
    }
    const reasonCode = typeof body?.reasonCode === "string" ? body.reasonCode.trim() : ""
    const snapshotToken = typeof body?.snapshotToken === "string" ? body.snapshotToken.trim() : ""
    if (!reasonCode || !snapshotToken) {
      return NextResponse.json(
        { error: "배정 안전 미리보기가 만료됐습니다. 다시 확인해 주세요." },
        { status: 409 }
      )
    }

    const requestedOwner = normalizeOwner(body.assigned_to)
    if (!requestedOwner) {
      return NextResponse.json({ error: "담당자를 선택해 주세요." }, { status: 400 })
    }

    try {
      const directory = await listAdminUserDirectoryCached()
      if (!directory.health.ok) {
        return NextResponse.json(
          { error: directory.health.message ?? "담당자 명단 상태가 안전하지 않아 배정할 수 없습니다." },
          { status: 503 }
        )
      }
      const owner = directory.crmOwners.find((candidate) =>
        ownerLookupKeys(candidate).some((key) => normalizeOwner(key) === requestedOwner)
      )
      if (!owner) {
        return NextResponse.json(
          { error: "현재 배정 가능한 CRM 담당자가 아닙니다. 담당자 목록을 새로고침해 주세요." },
          { status: 409 }
        )
      }
      // 별칭이나 표시명이 들어와도 저장값은 CRM 정규 ownerKey 하나로 통일한다.
      assignedTo = owner.ownerKey

      const preview = buildLeadAssignmentPolicyPreview(allLeads, ids)
      const currentSnapshotToken = buildLeadAssignmentSnapshotToken(allLeads, ids, {
        healthy: directory.health.ok,
        ownerKeys: directory.crmOwners.map((candidate) => candidate.ownerKey),
      })
      if (snapshotToken !== currentSnapshotToken) {
        return NextResponse.json(
          { error: "미리보기 이후 리드 또는 담당자 명단이 변경됐습니다. 다시 확인해 주세요." },
          { status: 409 }
        )
      }
      if (hasLeadAssignmentBlockers(preview)) {
        return NextResponse.json(
          { error: "안전 조건을 충족하지 않은 리드가 포함되어 배정을 중단했습니다.", preview },
          { status: 409 }
        )
      }

      try {
        const leads = await assignLeadsGuarded({
          ids,
          assignedTo,
          expectedVersions: buildLeadAssignmentExpectedVersions(allLeads),
          actor: {
            userId: admin.userId ?? null,
            displayName: admin.name ?? null,
            role: admin.role ?? null,
          },
          reasonCode,
        })
        return NextResponse.json({
          requested: ids.length,
          updated: leads.length,
          missing: 0,
          missingIds: [],
          assignedTo,
          leads,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (/snapshot changed|precondition changed|count mismatch/i.test(message)) {
          return NextResponse.json(
            { error: "저장 직전에 리드 상태가 변경되어 배정을 취소했습니다. 다시 확인해 주세요." },
            { status: 409 }
          )
        }
        throw error
      }
    } catch (error) {
      console.error("[PATCH /api/admin/leads/bulk-assign] owner directory", error)
      return NextResponse.json(
        { error: "담당자 명단을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      )
    }
  }

  try {
    // 배정 해제는 값 제거만 수행하는 가역 작업이다. 존재 검사는 위에서 먼저 끝냈다.
    const leads = await assignLeads(ids, assignedTo)
    if (leads.length !== ids.length) {
      return NextResponse.json(
        { error: "저장 직전에 일부 리드가 변경됐습니다. 목록을 새로고침해 주세요." },
        { status: 409 }
      )
    }
    return NextResponse.json({
      requested: ids.length,
      updated: leads.length,
      missing: 0,
      missingIds: [],
      assignedTo,
      leads,
    })
  } catch (error) {
    console.error("[PATCH /api/admin/leads/bulk-assign]", error)
    return NextResponse.json({ error: "리드 담당자를 일괄 배정하지 못했습니다." }, { status: 500 })
  }
}
