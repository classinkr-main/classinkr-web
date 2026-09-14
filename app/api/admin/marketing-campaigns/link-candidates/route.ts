import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllEventsForAdmin } from "@/lib/repositories/public-events"
import { getMetaCampaignDashboard } from "@/lib/meta/marketing"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { listCampaignLinkLabels } from "@/lib/repositories/marketing"
import {
  adCampaignLabel,
  emailCampaignLabel,
  eventLabel,
  metaCampaignLabel,
  smsCampaignLabel,
} from "@/lib/marketing/campaign-labels"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { getGoogleAdsDailyRange } from "@/lib/repositories/google-ads-daily"
import { getNaverAdsDailyRange } from "@/lib/repositories/naver-ads-daily"

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
    // 라벨(subject)만 필요 — listCampaignLinkLabels()가 getAllCampaigns()와 같은
    // USE_SUPABASE 모드 분기(JSON 폴백 포함)를 따르면서 좁은 select로 조회한다.
    const campaigns = await listCampaignLinkLabels()
    return campaigns.map((row) => ({
      id: String(row.id),
      label: emailCampaignLabel(row),
    }))
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

/**
 * Google·네이버 후보는 **일자 스냅샷에서** 뽑는다 — 플랫폼 API 를 다시 부르지 않는 이유는
 * 링크 대상이 "우리가 실제로 수집한 캠페인"이어야 하기 때문이다. API 에만 있고 스냅샷에
 * 없는 캠페인을 링크하면 롤업이 영원히 빈 칸으로 남는다.
 * 최근 90일에 집행이 있던 것만 — 그보다 오래된 캠페인은 새로 링크할 일이 없다.
 */
const AD_CANDIDATE_DAYS = 90

async function safeAdCandidates(
  load: (since: string, until: string) => Promise<{ campaignId: string; campaignName: string | null }[]>
): Promise<Candidate[]> {
  try {
    const rows = await load(kstToday(-AD_CANDIDATE_DAYS), kstToday(0))
    // 일자 행이라 캠페인당 여러 건이다 — id 로 접고 이름은 마지막 값(최신)을 쓴다.
    const byId = new Map(rows.map((row) => [row.campaignId, row]))
    return Array.from(byId.values())
      .map((row) => ({ id: row.campaignId, label: adCampaignLabel(row) }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko"))
  } catch {
    // 미연동·마이그 미적용 → 빈 목록(라우트 전체는 계속 200).
    return []
  }
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const [emailCampaigns, smsCampaigns, events, metaCampaigns, googleCampaigns, naverCampaigns] =
    await Promise.all([
      safeEmailCandidates(),
      safeSmsCandidates(),
      safeEventCandidates(),
      safeMetaCandidates(),
      safeAdCandidates(getGoogleAdsDailyRange),
      safeAdCandidates(getNaverAdsDailyRange),
    ])

  return NextResponse.json({
    emailCampaigns,
    smsCampaigns,
    events,
    metaCampaigns,
    googleCampaigns,
    naverCampaigns,
  })
}
