import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { listAdminUserDirectoryCached, ownerLookupKeys } from "@/lib/repositories/admin-users"
import {
  getLeadById,
  LeadVersionConflictError,
  updateLead,
  type LeadRecord,
} from "@/lib/repositories/leads"

/**
 * 리드 상세 드로어의 단건 담당자 변경.
 *
 * bulk-assign은 여러 리드를 한 번에 넘길 때 실수를 막는 경로라 "신규·연락중 + 확인됨 + 미배정 +
 * 30일 이내 + 중복 코호트 전체 선택"만 통과시킨다. 드로어는 운영자가 리드 한 건을 열어 보고 직접
 * 담당자를 고르는 행위라 그 조건을 그대로 걸면 전환·종료 리드, 이미 담당이 있는 리드(재배정),
 * 오래된 리드의 담당을 영영 바꿀 수 없었다. 여기서는 그 대신
 *   - 담당자는 검증된 CRM 담당자 명단의 정규 ownerKey로만 저장하고(명단이 불안정하면 막는다),
 *   - 그 리드 한 행에만 낙관적 잠금(expectedUpdatedAt)을 걸고,
 *   - 이전·새 담당을 감사 로그로 남긴다.
 */

function normalizeOwner(value: string) {
  return value.trim().toLowerCase()
}

function readExpectedUpdatedAt(raw: Record<string, unknown>): string | null | undefined {
  const value = raw.expectedUpdatedAt
  if (value === undefined || value === null) return value
  return typeof value === "string" ? value : undefined
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== "object" || Array.isArray(body) || !("assigned_to" in body)) {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 })
  }
  const rawOwner = body.assigned_to
  if (rawOwner !== null && typeof rawOwner !== "string") {
    return NextResponse.json({ error: "담당자를 선택해 주세요." }, { status: 400 })
  }
  const expectedUpdatedAt = readExpectedUpdatedAt(body)

  let assignedTo: string | null = null
  if (typeof rawOwner === "string" && rawOwner.trim()) {
    const requested = normalizeOwner(rawOwner)
    try {
      const directory = await listAdminUserDirectoryCached()
      if (!directory.health.ok) {
        return NextResponse.json(
          { error: directory.health.message ?? "담당자 명단 상태가 안전하지 않아 배정할 수 없습니다." },
          { status: 503 }
        )
      }
      const owner = directory.crmOwners.find((candidate) =>
        ownerLookupKeys(candidate).some((key) => normalizeOwner(key) === requested)
      )
      if (!owner) {
        return NextResponse.json(
          { error: "현재 배정 가능한 CRM 담당자가 아닙니다. 담당자 목록을 새로고침해 주세요." },
          { status: 409 }
        )
      }
      // 별칭이나 표시명이 들어와도 저장값은 CRM 정규 ownerKey 하나로 통일한다.
      assignedTo = owner.ownerKey
    } catch (error) {
      console.error(`[PATCH /api/admin/leads/${id}/assignee] owner directory`, error)
      return NextResponse.json(
        { error: "담당자 명단을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      )
    }
  }

  try {
    const current = await getLeadById(id)
    if (!current) return NextResponse.json({ error: "리드를 찾을 수 없습니다." }, { status: 404 })

    const previous = current.assigned_to?.trim() || null
    if (previous === assignedTo) {
      return NextResponse.json({ lead: current, assignedTo, changed: false })
    }

    // LeadRecord.assigned_to는 string | undefined지만 저장소는 null을 "해제"로 그대로 쓴다.
    const patch = { assigned_to: assignedTo } as unknown as Partial<LeadRecord>
    const updated = await updateLead(id, patch, { expectedUpdatedAt })
    if (!updated) return NextResponse.json({ error: "리드를 찾을 수 없습니다." }, { status: 404 })

    await logAdminAudit({
      admin,
      action: "lead.assignment.single",
      targetType: "lead",
      targetId: id,
      payload: { previousAssignedTo: previous, assignedTo, status: current.status },
    })

    return NextResponse.json({ lead: updated, assignedTo, changed: true })
  } catch (error) {
    if (error instanceof LeadVersionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error(`[PATCH /api/admin/leads/${id}/assignee]`, error)
    return NextResponse.json({ error: "담당자를 저장하지 못했습니다." }, { status: 500 })
  }
}
