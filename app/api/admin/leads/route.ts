import { NextRequest, NextResponse } from "next/server"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  getLeads,
  getDashboardLeads,
  getCampaignLeads,
  getMarketingLeads,
  findLeadsByContacts,
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
    // - marketing: 캠페인 허브 "광고 리드"용(트래킹 축·연락처·전환 상태) — campaigns의 상위집합
    // - 기본(무스코프): 전체 컬럼 — LeadsBoard(검색이 utm_* 필요)는 불변
    const scope = new URL(req.url).searchParams.get("scope")
    const leads =
      scope === "dashboard"
        ? await getDashboardLeads()
        : scope === "campaigns"
          ? await getCampaignLeads()
          : scope === "marketing"
            ? await getMarketingLeads()
            : await getLeads()
    return adminCachedJson({ leads })
  } catch (error) {
    console.error("[GET /api/admin/leads] error:", error)
    return NextResponse.json({ error: "리드를 불러오지 못했습니다." }, { status: 500 })
  }
}

type LeadCreateInput = Omit<LeadRecord, "id" | "status">

// 클라이언트(LeadRegisterModal)와 같은 기준 — 서버만 느슨하면 우회 등록으로 불량 연락처가 쌓인다.
const LEAD_PHONE_PATTERN = /^[\d()+\-\s]{8,}$/
const LEAD_EMAIL_PATTERN = /^\S+@\S+\.\S+$/
const LEAD_EMAIL_MAX_LENGTH = 254
// 벌크 상한 — 실수로 시트 전체를 붙여넣는 사고가 단일 요청을 폭주시키지 않게 막는다.
const MAX_BULK_LEADS = 500

// 전화 비교용 정규화 — 하이픈·공백·괄호 차이로 같은 번호를 다른 리드로 오인하지 않게 숫자만 남긴다.
function phoneDigits(value: string) {
  return value.replace(/\D/g, "")
}

function leadStr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

// 단건/벌크 리드 등록 입력을 정규화한다. 식별자(학원명·이름·전화·이메일) 하나는 있어야 하고,
// 전화·이메일이 있으면 형식이 맞아야 한다 — 틀리면 행 전체를 invalid로 분류한다.
function normalizeLeadInput(raw: unknown): LeadCreateInput | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const name = leadStr(r.name)
  const org = leadStr(r.org) ?? leadStr(r.organization) ?? leadStr(r.organizationName)
  const phone = leadStr(r.phone)
  const email = leadStr(r.email)
  if (!name && !org && !phone && !email) return null
  if (phone && !LEAD_PHONE_PATTERN.test(phone)) return null
  if (email && (email.length > LEAD_EMAIL_MAX_LENGTH || !LEAD_EMAIL_PATTERN.test(email))) return null
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
    const isBulk = Array.isArray((body as { leads?: unknown[] } | null)?.leads)
    const rawList = isBulk ? (body as { leads: unknown[] }).leads : [body]
    if (rawList.length > MAX_BULK_LEADS) {
      return NextResponse.json(
        { error: `한 번에 등록할 수 있는 리드는 최대 ${MAX_BULK_LEADS}행입니다. 나눠서 등록하세요.` },
        { status: 400 }
      )
    }
    const inputs = rawList.map(normalizeLeadInput).filter((lead): lead is LeadCreateInput => lead !== null)
    // invalid = 식별자 누락 + 형식 불량 행 수. DB 쓰기 실패(failed)와 구분해 집계한다.
    const invalid = rawList.length - inputs.length
    if (inputs.length === 0) {
      return NextResponse.json(
        { error: "유효한 리드가 없습니다 (학원명·이름·전화·이메일 중 하나가 필요하고, 전화·이메일 형식이 맞아야 합니다)." },
        { status: 400 }
      )
    }

    // 같은 전화(숫자만 비교)·같은 이메일(소문자 비교)이 이미 있으면 저장하지 않고 duplicates로
    // 센다 — 같은 시트를 두 번 붙여넣는 사고가 리드 보드를 복제 리드로 오염시키는 것을 막는다.
    const existing = await findLeadsByContacts({
      phones: inputs.map((lead) => lead.phone ?? "").filter(Boolean),
      emails: inputs.map((lead) => lead.email ?? "").filter(Boolean),
    })
    const existingIdByPhone = new Map<string, string>()
    const existingIdByEmail = new Map<string, string>()
    for (const lead of existing) {
      const digits = lead.phone ? phoneDigits(lead.phone) : ""
      if (digits && !existingIdByPhone.has(digits)) existingIdByPhone.set(digits, lead.id)
      const email = lead.email?.trim().toLowerCase()
      if (email && !existingIdByEmail.has(email)) existingIdByEmail.set(email, lead.id)
    }

    const seenPhones = new Set<string>()
    const seenEmails = new Set<string>()
    const toSave: LeadCreateInput[] = []
    let duplicates = 0
    let firstExistingId: string | null = null
    for (const lead of inputs) {
      const digits = lead.phone ? phoneDigits(lead.phone) : ""
      const email = lead.email?.trim().toLowerCase() ?? ""
      const existingId =
        (digits ? existingIdByPhone.get(digits) : undefined) ??
        (email ? existingIdByEmail.get(email) : undefined) ??
        null
      const isDuplicate =
        existingId !== null || (digits !== "" && seenPhones.has(digits)) || (email !== "" && seenEmails.has(email))
      if (isDuplicate) {
        duplicates += 1
        if (firstExistingId === null && existingId !== null) firstExistingId = existingId
        continue
      }
      if (digits) seenPhones.add(digits)
      if (email) seenEmails.add(email)
      toSave.push(lead)
    }

    // 단건 등록이 중복이면 조용히 0건 성공으로 넘기지 않고 409로 알린다 — 기존 리드로 안내한다.
    if (!isBulk && duplicates > 0) {
      return NextResponse.json(
        { error: "이미 등록된 리드입니다(전화/이메일 일치).", existingId: firstExistingId },
        { status: 409 }
      )
    }

    const results = await Promise.allSettled(toSave.map((lead) => saveLead(lead)))
    const createdLeads = results
      .filter((result): result is PromiseFulfilledResult<LeadRecord> => result.status === "fulfilled")
      .map((result) => result.value)
    const created = createdLeads.length
    return NextResponse.json({
      created,
      failed: results.length - created,
      total: rawList.length,
      invalid,
      duplicates,
      ids: createdLeads.map((lead) => lead.id),
      firstId: createdLeads[0]?.id ?? null,
    })
  } catch (error) {
    console.error("[POST /api/admin/leads] error:", error)
    return NextResponse.json({ error: "리드 등록에 실패했습니다." }, { status: 500 })
  }
}
