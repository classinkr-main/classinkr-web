import { NextRequest, NextResponse } from "next/server"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  getLeads,
  getDashboardLeads,
  getCampaignLeads,
  saveLead,
  type LeadRecord,
} from "@/lib/repositories/leads"

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    // 스코프별로 화면에 쓰는 컬럼만 가져와 페이로드를 줄인다.
    // - dashboard: overview/analytics 집계용(id·source·name·org·email·status·branch·created_at·confirmed_at)
    // - campaigns: 행사↔리드 귀속용(id·source·status·notes·created_at) — 귀속 해시가 notes를 요구한다
    // - 기본(무스코프): 전체 컬럼 — LeadsBoard(검색이 utm_* 필요)는 불변
    const scope = new URL(req.url).searchParams.get("scope")
    const leads =
      scope === "dashboard"
        ? await getDashboardLeads()
        : scope === "campaigns"
          ? await getCampaignLeads()
          : await getLeads()
    return adminCachedJson({ leads })
  } catch (error) {
    console.error("[GET /api/admin/leads] error:", error)
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 })
  }
}

type LeadCreateInput = Omit<LeadRecord, "id" | "status">

function leadStr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

// 단건/벌크 리드 등록 입력을 정규화한다. 식별자(학원명·이름·전화·이메일) 하나는 있어야 한다.
function normalizeLeadInput(raw: unknown): LeadCreateInput | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const name = leadStr(r.name)
  const org = leadStr(r.org) ?? leadStr(r.organization) ?? leadStr(r.organizationName)
  const phone = leadStr(r.phone)
  const email = leadStr(r.email)
  if (!name && !org && !phone && !email) return null
  return {
    source: leadStr(r.source) ?? "admin_manual",
    timestamp: new Date().toISOString(),
    name,
    org,
    role: leadStr(r.role),
    size: leadStr(r.size),
    email,
    phone,
    message: leadStr(r.message) ?? leadStr(r.memo),
    branch: leadStr(r.branch) ?? leadStr(r.region),
    notes: leadStr(r.notes),
    source_detail: leadStr(r.source_detail) ?? "어드민 수기 등록",
    // 어드민이 직접 입력한 리드는 이미 검토된 것 — 공개 폼 확인 게이트 대상이 아니다.
    confirmed_at: new Date().toISOString(),
  }
}

// 리드 등록 — 단건(객체) 또는 벌크({ leads: [...] }). 부분 실패는 전체 실패로 만들지 않는다.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const body = await req.json().catch(() => null)
    const rawList = Array.isArray((body as { leads?: unknown[] } | null)?.leads)
      ? (body as { leads: unknown[] }).leads
      : [body]
    const inputs = rawList.map(normalizeLeadInput).filter((lead): lead is LeadCreateInput => lead !== null)
    if (inputs.length === 0) {
      return NextResponse.json(
        { error: "유효한 리드가 없습니다 (학원명·이름·전화·이메일 중 하나는 필요)." },
        { status: 400 }
      )
    }
    const results = await Promise.allSettled(inputs.map((lead) => saveLead(lead)))
    const createdLeads = results
      .filter((result): result is PromiseFulfilledResult<LeadRecord> => result.status === "fulfilled")
      .map((result) => result.value)
    const created = createdLeads.length
    return NextResponse.json({
      created,
      failed: results.length - created,
      total: inputs.length,
      ids: createdLeads.map((lead) => lead.id),
      firstId: createdLeads[0]?.id ?? null,
    })
  } catch (error) {
    console.error("[POST /api/admin/leads] error:", error)
    return NextResponse.json({ error: "리드 등록에 실패했습니다." }, { status: 500 })
  }
}
