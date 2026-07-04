import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { deleteLead, updateLead, type LeadStatus, type LeadRecord } from "@/lib/repositories/leads"

const LEAD_STATUSES = new Set<LeadStatus>(["new", "contacted", "converted", "closed"])
const STRING_OR_NULL_FIELDS = [
  "notes",
  "source_detail",
  "lead_magnet",
  "branch",
  "name",
  "email",
  "phone",
  "org",
  "follow_up_at",
  "assigned_to",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "landing_page",
  "current_page",
  "referrer",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function sanitizeLeadPatch(raw: unknown): { patch?: Partial<LeadRecord>; error?: string } {
  if (!isRecord(raw)) return { error: "Invalid JSON body" }

  const patch: Record<string, string | null> = {}

  if ("status" in raw) {
    if (!LEAD_STATUSES.has(raw.status as LeadStatus)) return { error: "Invalid lead status" }
    patch.status = raw.status as LeadStatus
  }

  for (const field of STRING_OR_NULL_FIELDS) {
    if (!(field in raw)) continue
    const value = raw[field]
    if (value !== null && typeof value !== "string") {
      return { error: `${field} must be a string or null` }
    }
    patch[field] = value
  }

  // "확인" 액션 — 공개 채널 리드를 CRM 리드 기본 화면으로 승격한다. 임의 타임스탬프는
  // 받지 않고 서버 시각만 사용(confirmed_at은 STRING_OR_NULL_FIELDS에 없음 — 클라이언트가
  // 직접 값을 지정할 수 없다).
  if (raw.confirmed === true) {
    patch.confirmed_at = new Date().toISOString()
  }

  // 상태가 "신규"에서 벗어나면(연락중/전환/종료) 이미 사람이 손댄 것이므로 자동 확인 처리.
  if (patch.status && patch.status !== "new" && patch.confirmed_at === undefined) {
    patch.confirmed_at = new Date().toISOString()
  }

  if (Object.keys(patch).length === 0) return { error: "No supported fields to update" }
  return { patch: patch as Partial<LeadRecord> }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await params
  const body = await req.json().catch(() => null)
  const sanitized = sanitizeLeadPatch(body)
  if (sanitized.error) return NextResponse.json({ error: sanitized.error }, { status: 400 })

  try {
    const updated = await updateLead(id, sanitized.patch ?? {})
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ lead: updated })
  } catch (error) {
    console.error(`[PATCH /api/admin/leads/${id}] error:`, error)
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const { id } = await params

  try {
    const ok = await deleteLead(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error(`[DELETE /api/admin/leads/${id}] error:`, error)
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 })
  }
}
