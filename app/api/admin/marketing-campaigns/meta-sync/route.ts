import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getMetaCampaignDashboard, MetaConfigError } from "@/lib/meta/marketing"
import {
  addLink,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign,
} from "@/lib/repositories/marketing-campaigns"
import { buildMetaSyncPlan } from "@/lib/marketing/meta-sync"

/**
 * POST /api/admin/marketing-campaigns/meta-sync
 * Meta 캠페인 ↔ 우산 캠페인 동기화 — 플랜 계산은 순수함수(lib/marketing/meta-sync.ts), 여기서는 적용만.
 *
 *  - 미링크 Meta 캠페인 → 우산 캠페인 생성 + 1:1 링크(미러)
 *  - 미러(링크가 meta 1건뿐) → 이름·상태·기간을 Meta 기준으로 패치
 *  - 크로스채널 우산·ARCHIVED 는 건드리지 않고 카운트로 보고
 *
 * 적용은 순차 + 항목별 격리 — 한 건의 DB 오류가 나머지 동기화를 막지 않고 failed 로 보고된다.
 * Graph 조회는 요청당 1콜(대시보드). 조회 지평(limit 100)을 넘는 계정은 그 밖 캠페인이
 * 이번 동기화에서 빠진다 — 현재 계정 규모(수십 건)에선 전량이 잡힌다.
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const [dashboard, campaigns] = await Promise.all([
      // 동기화는 항상 신선한 상태를 기준으로 — 방금 광고 관리자에서 바꾼 상태가 45초 메모에 가려지면 안 된다.
      getMetaCampaignDashboard({ limit: 100, fresh: true }),
      listCampaigns(),
    ])

    const plan = buildMetaSyncPlan(dashboard.campaigns, campaigns)

    const created: Array<{ campaignId: string; metaId: string; name: string }> = []
    const updated: Array<{ campaignId: string; name: string; changes: string[] }> = []
    const failed: Array<{ name: string; error: string; orphanCampaignId?: string }> = []

    for (const item of plan.toCreate) {
      let createdCampaignId: string | null = null
      try {
        const campaign = await createCampaign(item.input)
        createdCampaignId = campaign.id
        // 링크까지 되어야 "가져옴"이다 — 링크 없이 남으면 미러로 인식되지 않으면서
        // linkedMetaIds 에도 안 잡혀, 다음 동기화가 같은 Meta 캠페인을 또 가져온다.
        await addLink(campaign.id, "meta_campaign", item.metaId)
        created.push({ campaignId: campaign.id, metaId: item.metaId, name: item.name })
      } catch (err) {
        // 링크가 실패한 생성 캠페인은 보상 삭제 — 고아를 남기면 동기화를 누를 때마다
        // 동명 캠페인이 누적된다. 삭제까지 실패하면 정리 대상을 특정할 수 있게 id 를 남긴다.
        if (createdCampaignId) {
          try {
            await deleteCampaign(createdCampaignId)
            createdCampaignId = null
          } catch (cleanupErr) {
            console.warn("[meta-sync] 고아 캠페인 정리 실패", createdCampaignId, cleanupErr)
          }
        }
        failed.push({
          name: item.name,
          error: err instanceof Error ? err.message : String(err),
          ...(createdCampaignId ? { orphanCampaignId: createdCampaignId } : {}),
        })
      }
    }

    for (const item of plan.toUpdate) {
      try {
        await updateCampaign(item.campaignId, item.patch)
        updated.push({ campaignId: item.campaignId, name: item.name, changes: item.changes })
      } catch (err) {
        failed.push({ name: item.name, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      failed,
      unchangedMirrorCount: plan.unchangedMirrorCount,
      crossChannelLinkedCount: plan.crossChannelLinkedCount,
      unresolvedMirrorCount: plan.unresolvedMirrorCount,
      skipped: plan.skipped,
    })
  } catch (error) {
    if (error instanceof MetaConfigError) {
      return NextResponse.json(
        { ok: false, configured: false, error: "Meta 연동이 설정되지 않았습니다." },
        { status: 503 }
      )
    }
    console.error("[POST /api/admin/marketing-campaigns/meta-sync]", error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Meta 동기화에 실패했습니다." },
      { status: 500 }
    )
  }
}
