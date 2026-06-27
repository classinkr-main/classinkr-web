import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getLeads, getDashboardLeads, saveLead, type LeadRecord } from "@/lib/repositories/leads"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    // ?scope=dashboard 는 화면에 쓰는 컬럼만 가져와 페이로드를 줄인다.
    const scope = new URL(req.url).searchParams.get("scope")
    const leads = scope === "dashboard" ? await getDashboardLeads() : await getLeads()
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
  }
}

// 리드 등록 — 단건(객체) 또는 벌크({ leads: [...] }). 부분 실패는 전체 실패로 만들지 않는다.
export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

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
    const created = results.filter((result) => result.status === "fulfilled").length
    return NextResponse.json({ created, failed: results.length - created, total: inputs.length })
  } catch (error) {
    console.error("[POST /api/admin/leads] error:", error)
    return NextResponse.json({ error: "리드 등록에 실패했습니다." }, { status: 500 })
  }
}
