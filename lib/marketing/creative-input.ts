// lib/marketing/creative-input.ts
// 광고 소재별 성과 집계 — 원천은 leads 의 UTM(getMetaAdInfo). 순수 모듈(서버 의존 없음),
// components/admin/campaigns/leads/AdLeadsPanel 이 쓰는 lib/campaigns/ad-leads.ts 와 같은 결.
//
// 이 모듈이 만드는 것은 "우리 leads 테이블 기준" 리드·전환 건수 랭킹뿐이다 — 여기서 금액은
// 나오지 않는다(이 모듈의 입력에 금액이 없다).
//
// 소재별 광고비·CPL 은 별개 원천에 있다: 우리 Meta 수집(meta_insights_daily)은 여전히 캠페인
// 레벨이지만, 마케팅팀 앱 Compass 가 같은 광고 계정에서 ad 레벨 insights 를 수집해 읽기 전용
// 뷰(compass_ads_v)로 연결돼 있다. 그 값을 이 랭킹에 붙이는 조인은
// lib/marketing/compass-creative.ts 의 attachCompassSpend 다(2026-08-28).
//
// 여전히 없는 것: 소재별 매출·ROAS. 소비처(API 응답·UI·AI 프롬프트)는 지출/CPL 은 Compass
// 수집분임을 밝히고, 매출·ROAS 는 계산도 언급도 하지 않는다.

import { getMetaAdInfo, isConvertedLead, isTestLead } from "@/lib/crm/lead-attribution"
import type { LeadRecord } from "@/lib/repositories/leads"

export interface AdCreativePerf {
  campaign: string | null
  adset: string | null
  ad: string | null
  leads: number
  converted: number
}

// 그룹 키 구분자 — 파이프는 캠페인·광고세트·광고명 텍스트에 실제로 나타날 일이 거의 없어
// 서로 다른 조합이 우연히 같은 키로 접힐 위험이 낮다.
const KEY_DELIMITER = "|"

/** 그룹 키 — 세 축 중 하나가 비어도(getMetaAdInfo 는 "하나라도 있으면" 반환) 서로 다른 소재로 접히지 않게 구분자로 조인한다. */
function creativeKey(info: { campaign?: string; adset?: string; ad?: string }): string {
  return [info.campaign ?? "", info.adset ?? "", info.ad ?? ""].join(KEY_DELIMITER)
}

/**
 * 리드를 (캠페인, 광고세트, 광고명) 단위로 접어 리드·전환 건수를 센다.
 * - Meta 리드애즈가 아니거나(getMetaAdInfo null) 테스트 리드는 제외.
 * - 정렬은 리드 수 내림차순, 동률이면 광고명(없으면 광고세트→캠페인) 사전순으로 안정화한다.
 */
export function aggregateAdCreativePerf(leads: LeadRecord[]): AdCreativePerf[] {
  const byKey = new Map<string, AdCreativePerf>()

  for (const lead of leads) {
    if (isTestLead(lead)) continue
    const info = getMetaAdInfo(lead)
    if (!info) continue

    const key = creativeKey(info)
    const row = byKey.get(key)
    if (row) {
      row.leads += 1
      if (isConvertedLead(lead)) row.converted += 1
    } else {
      byKey.set(key, {
        campaign: info.campaign ?? null,
        adset: info.adset ?? null,
        ad: info.ad ?? null,
        leads: 1,
        converted: isConvertedLead(lead) ? 1 : 0,
      })
    }
  }

  const tieBreakLabel = (row: AdCreativePerf) => row.ad ?? row.adset ?? row.campaign ?? ""

  return Array.from(byKey.values()).sort((a, b) => {
    if (b.leads !== a.leads) return b.leads - a.leads
    return tieBreakLabel(a).localeCompare(tieBreakLabel(b))
  })
}
