import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getCampaign,
  updateCampaign,
  deleteCampaign,
} from "@/lib/repositories/marketing-campaigns"
import { sanitizeCampaignPatch } from "@/lib/marketing/campaign-sanitize"
import {
  computeCampaignRollup,
  type CampaignRollupSources,
} from "@/lib/marketing/campaign-rollup"
import type { CampaignLink } from "@/lib/types/marketing-campaign"
import { getAllEventMetrics } from "@/lib/repositories/event-metrics"
import { getMetaCampaignDashboard } from "@/lib/meta/marketing"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// sanitizer 를 라우트에서 re-export → 단위테스트가 라우트 파일에서 가져온다.
export { sanitizeCampaignPatch }

/**
 * 링크된 채널 실행의 지표를 best-effort 로 수집해 롤업 sources 를 구성한다.
 * 각 채널 수집은 독립 try/catch 로 격리 — 한 소스 실패가 다른 채널을 0 으로 만들지 않는다.
 *
 * v1 정직 노트(축약 지점):
 *  - 행사 leads = 0 으로 고정. 리드↔행사 attribution 은 전체 리드 로드 + 토큰 매칭이라
 *    무거워(참고: app/admin/campaigns/page.tsx) v1 범위 밖으로 미룬다. deals/매출은 정확히 집계.
 *  - Meta 는 링크가 있을 때만 라이브 대시보드 1콜. 미구성/레이트리밋이면 빈 맵 →
 *    롤업이 meta 를 0/null 로 강등(조작 없음).
 */
async function gatherRollupSources(links: CampaignLink[]): Promise<CampaignRollupSources> {
  const sources: CampaignRollupSources = {
    emailCampaigns: {},
    smsCampaigns: {},
    eventMetrics: {},
    metaCampaigns: {},
  }

  const emailIds = links.filter((l) => l.refType === "email_campaign").map((l) => l.refId)
  const smsIds = links.filter((l) => l.refType === "sms_campaign").map((l) => l.refId)
  const eventIds = new Set(links.filter((l) => l.refType === "event").map((l) => l.refId))
  const hasMeta = links.some((l) => l.refType === "meta_campaign")

  // ── 이메일: 링크된 id 로 직접 조회(지평 없음 — SMS 와 동일 패턴).
  //    getAllCampaigns()(최근 N건)을 필터하면 N 밖의 오래된 링크가 사일런트 언더카운트되므로 쓰지 않는다.
  if (emailIds.length > 0) {
    try {
      const { data } = await createSupabaseAdminClient()
        .from("email_campaigns")
        .select("id, recipient_count, open_count")
        .in("id", emailIds)
      for (const row of data ?? []) {
        sources.emailCampaigns[String(row.id)] = {
          recipientCount: row.recipient_count ?? 0,
          openCount: row.open_count ?? 0,
        }
      }
    } catch {
      /* 소스 실패는 이메일 채널 0 기여로 격리 */
    }
  }

  // ── 문자: sms_campaigns 를 링크된 id 로 직접 조회(전용 저장소 함수 없음) ──
  if (smsIds.length > 0) {
    try {
      const { data } = await createSupabaseAdminClient()
        .from("sms_campaigns")
        .select("id, recipient_count")
        .in("id", smsIds)
      for (const row of data ?? []) {
        sources.smsCampaigns[String(row.id)] = { recipientCount: row.recipient_count ?? 0 }
      }
    } catch {
      /* 격리 */
    }
  }

  // ── 행사: event-metrics(JSON) 에서 deals/매출. leads 는 v1 미집계(0) ──
  if (eventIds.size > 0) {
    try {
      const all = getAllEventMetrics()
      for (const [eventId, m] of Object.entries(all)) {
        if (eventIds.has(eventId)) {
          sources.eventMetrics[eventId] = {
            dealsCount: m.dealsCount,
            dealsRevenue: m.dealsRevenue,
            leads: 0, // v1 미집계(NOT "0 leads") — D1-6 UI 는 "미집계"로 라벨링할 것
          }
        }
      }
    } catch {
      /* 격리 */
    }
  }

  // ── Meta: 링크가 있을 때만 라이브 1콜. 실패 시 빈 맵 → 롤업 meta 0/null 강등 ──
  // 주의: 라이브 대시보드 상위 N개만 조회 — 그 밖의(상위 N 밖) Meta 캠페인 링크는 집계 0
  //       (id별 Graph 조회는 top-N 대시보드와 다른 호출이라 향후 개선 지점).
  if (hasMeta) {
    try {
      const dash = await getMetaCampaignDashboard()
      const currency = dash.account.currency ?? "USD"
      for (const c of dash.campaigns) {
        sources.metaCampaigns[c.id] = {
          spend: c.insights.spend,
          leads: c.insights.leads,
          currency,
        }
      }
    } catch {
      /* Meta 미구성/레이트리밋 → 빈 맵 */
    }
  }

  return sources
}

/**
 * GET /api/admin/marketing-campaigns/[id]
 * 캠페인 1건 + links + 읽기시점 롤업. 링크된 실행의 가용 지표만 정직하게 집계한다.
 * (getCampaign 은 오류/부재를 null 로 흡수 → 여기선 404 로 강등, 크래시 없음.)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const campaign = await getCampaign(id)
    if (!campaign) {
      return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 })
    }
    const sources = await gatherRollupSources(campaign.links)
    const rollup = computeCampaignRollup(campaign.links, sources)
    return NextResponse.json({ campaign, rollup })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/marketing-campaigns/[id]
 * 부분 수정. sanitize → 유효하지 않으면 400. 변경 필드가 없으면 400(무의미 update 방지).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    const body = await req.json().catch(() => null)
    const patch = sanitizeCampaignPatch(body)
    if (!patch) {
      return NextResponse.json(
        { error: "수정 입력이 유효하지 않습니다(status/budget/name 확인)." },
        { status: 400 },
      )
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "변경할 필드가 없습니다." }, { status: 400 })
    }
    const campaign = await updateCampaign(id, patch)
    return NextResponse.json({ campaign })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/marketing-campaigns/[id]
 * 캠페인 삭제(campaign_links 는 FK ON DELETE CASCADE 로 함께 제거).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  try {
    await deleteCampaign(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
