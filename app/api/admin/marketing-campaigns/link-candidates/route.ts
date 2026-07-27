import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllCampaigns } from "@/lib/repositories/marketing"
import { getAllEventsForAdmin } from "@/lib/repositories/public-events"
import { getMetaCampaignDashboard } from "@/lib/meta/marketing"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  emailCampaignLabel,
  eventLabel,
  metaCampaignLabel,
  smsCampaignLabel,
} from "@/lib/marketing/campaign-labels"

/**
 * GET /api/admin/marketing-campaigns/link-candidates
 * 링크 피커용 편의 라우트 — 채널별 실행을 { id, label } 목록으로 반환한다.
 *
 * 설계 노트: "아직 아무 캠페인에도 안 붙은 것만" 필터링하지 않고 전체를 반환한다(스펙의 더 단순한 안).
 * 실행은 여러 캠페인에 링크될 수 있고, 이미 붙은 항목은 피커(D1-6)가 캠페인 자신의 links[] 로
 * 비활성 처리하면 된다. 여기서 전역 필터를 걸면 실행-캠페인 다대다를 막게 되므로 의도적으로 열어둔다.
 *
 * best-effort: 소스별 독립 try/catch — 한 소스가 throw 해도 그 채널만 [] 로 강등하고
 * 라우트 전체를 500 으로 만들지 않는다(마이그 미적용·Meta 미구성 등 안전).
 */

type Candidate = { id: string; label: string }

// 라벨 규칙은 lib/marketing/campaign-labels.ts 단일 진실원 — 캠페인 상세/목록의
// links[].label 이 같은 함수를 쓴다(피커에서 고른 이름 ≠ 붙인 뒤 보이는 이름 방지).

type SmsRow = { id: string | number; message?: string | null }

async function safeEmailCandidates(): Promise<Candidate[]> {
  try {
    const all = await getAllCampaigns()
    return all.map((c) => ({ id: String(c.id), label: emailCampaignLabel(c) }))
  } catch {
    return []
  }
}

async function safeSmsCandidates(): Promise<Candidate[]> {
  try {
    const { data } = await createSupabaseAdminClient()
      .from("sms_campaigns")
      .select("id, message, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
    return ((data ?? []) as SmsRow[]).map((row) => ({
      id: String(row.id),
      label: smsCampaignLabel(row),
    }))
  } catch {
    return []
  }
}

async function safeEventCandidates(): Promise<Candidate[]> {
  try {
    const events = await getAllEventsForAdmin()
    return events.map((e) => ({ id: e.id, label: eventLabel(e) }))
  } catch {
    return []
  }
}

async function safeMetaCandidates(): Promise<Candidate[]> {
  try {
    const dash = await getMetaCampaignDashboard()
    return dash.campaigns.map((c) => ({ id: c.id, label: metaCampaignLabel(c) }))
  } catch {
    // Meta 미구성/레이트리밋 → 빈 목록(라우트 전체는 계속 200).
    return []
  }
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const [emailCampaigns, smsCampaigns, events, metaCampaigns] = await Promise.all([
    safeEmailCandidates(),
    safeSmsCandidates(),
    safeEventCandidates(),
    safeMetaCandidates(),
  ])

  return NextResponse.json({ emailCampaigns, smsCampaigns, events, metaCampaigns })
}
