import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  buildAdCampaignSyncPlan,
  type AdCampaignCandidate,
  type AdSyncChannel,
} from "@/lib/marketing/ad-campaign-sync"
import {
  foldAdSyncCandidates,
  type AdDailySnapshotRow,
} from "@/lib/marketing/ad-sync-candidates"
import { kstToday } from "@/lib/marketing/perf-assemble"
import { addLink, listCampaigns } from "@/lib/repositories/marketing-campaigns"
import { getGoogleAdsDailyRange } from "@/lib/repositories/google-ads-daily"
import { getNaverAdsDailyRange } from "@/lib/repositories/naver-ads-daily"

/**
 * POST /api/admin/marketing-campaigns/ad-sync
 * Google Ads·네이버 검색광고 캠페인 → 이름이 같은 우산 캠페인에 링크.
 * 플랜 계산은 순수함수(lib/marketing/ad-campaign-sync.ts), 여기서는 **적용만** 한다.
 *
 * meta-sync 와 달리 **우산을 만들지도, 고치지도 않는다** — addLink 만 부른다.
 * 그래서 보상 삭제 경로가 아예 없다: 한 건이 실패해도 고아가 생길 수 없고(생성이 없으니),
 * 나머지는 그대로 이어서 붙는다. 실패는 failed 로 보고하고 다음 실행에 다시 시도된다
 * (addLink 는 (campaign, refType, refId) upsert 라 재시도가 멱등하다).
 */

/**
 * 후보를 긁는 창 — 링크 피커(link-candidates)와 **같은 90일**이다.
 * 플래너는 60일(AD_SYNC_STALE_AFTER_DAYS)을 넘긴 후보를 stale 로 뺀다. 창을 60일로 좁히면
 * 그 판정이 영영 안 걸려서 "피커에는 보이는데 동기화가 왜 안 붙였지"에 답할 자리가 사라진다.
 * 창을 피커와 맞춰야 skipped 목록이 그 질문의 답 노릇을 한다.
 */
const AD_SYNC_LOOKBACK_DAYS = 90

/** 채널별 적재 결과 — 0 건과 "못 읽었다"를 화면에서 구분하기 위해 따로 보고한다. */
interface AdSyncSourceState {
  channel: AdSyncChannel
  ok: boolean
  /** 읽은 일자 행 수(캠페인 수가 아니다). 실패면 0. */
  rowCount: number
  error: string | null
}

async function loadChannel(
  channel: AdSyncChannel,
  load: (since: string, until: string) => Promise<AdDailySnapshotRow[]>,
  since: string,
  until: string,
): Promise<{ state: AdSyncSourceState; candidates: AdCampaignCandidate[] }> {
  try {
    const rows = await load(since, until)
    return {
      state: { channel, ok: true, rowCount: rows.length, error: null },
      candidates: foldAdSyncCandidates(rows, channel),
    }
  } catch (err) {
    // 한 채널의 스냅샷이 없어도(마이그 미적용 등) 나머지 채널은 그대로 동기화한다.
    // 다만 조용히 0 건으로 접지 않는다 — 화면이 "붙일 게 없었다"로 읽으면 안 된다.
    return {
      state: {
        channel,
        ok: false,
        rowCount: 0,
        error: err instanceof Error ? err.message : String(err),
      },
      candidates: [],
    }
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const today = kstToday(0)
    const since = kstToday(-AD_SYNC_LOOKBACK_DAYS)

    const [google, naver, campaigns] = await Promise.all([
      loadChannel("google", getGoogleAdsDailyRange, since, today),
      loadChannel("naver", getNaverAdsDailyRange, since, today),
      listCampaigns(),
    ])

    const plan = buildAdCampaignSyncPlan({
      candidates: [...google.candidates, ...naver.candidates],
      campaigns,
      today,
    })

    const linked: Array<{
      channel: AdSyncChannel
      campaignId: string
      adCampaignId: string
      label: string
      umbrellaName: string
    }> = []
    const failed: Array<{ label: string; umbrellaName: string; error: string }> = []

    // 순차 + 항목별 격리 — 한 건의 DB 오류가 나머지 링크를 막지 않는다.
    for (const item of plan.toLink) {
      try {
        await addLink(item.umbrella.id, item.refType, item.adCampaignId)
        linked.push({
          channel: item.channel,
          campaignId: item.umbrella.id,
          adCampaignId: item.adCampaignId,
          label: item.label,
          umbrellaName: item.umbrella.name,
        })
      } catch (err) {
        failed.push({
          label: item.label,
          umbrellaName: item.umbrella.name,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      ok: true,
      linked,
      failed,
      alreadyLinked: plan.alreadyLinked,
      skipped: plan.skipped,
      candidateCount: plan.candidateCount,
      byChannel: plan.byChannel,
      sources: [google.state, naver.state],
      lookbackDays: AD_SYNC_LOOKBACK_DAYS,
    })
  } catch (error) {
    console.error("[POST /api/admin/marketing-campaigns/ad-sync]", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "광고 캠페인 링크에 실패했습니다.",
      },
      { status: 500 },
    )
  }
}
