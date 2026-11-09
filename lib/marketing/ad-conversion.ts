// lib/marketing/ad-conversion.ts
// 광고(소재)별 전환·결제 비율 — Compass CRM 리드가 광고 id(meta_ad_id)를 들고 있으므로, 그 리드가
// 지금 어느 단계까지 갔는지를 광고 단위로 센다. 순수 모듈(서버 의존 없음). 조회는 lib/compass/bridge.ts.
//
// 모집단: 기간 안에 **생성된** Compass 리드(created_at) 중 meta_ad_id 가 있는 것. 단계는 "지금" 값이다 —
// 짧은 기간일수록 결제까지 갈 시간이 모자라 결제율이 낮게 보이는 것이 정상이다(코호트의 현재 상태).
//
// 단계 도달 판정(Compass lib/stages.ts 순서 new→contact→demo→quote→bd→won, lost 는 종료):
//   데모  = demo_at 이 있거나 단계가 demo·quote·bd·won
//   BD인계 = bd_contact_at·bd_paid_at 이 있거나 단계가 bd·won
//   결제  = 단계 won 이거나 bd_paid_at 이 있음
// lost(종료)는 현재 단계만으론 어디까지 갔는지 모르므로 위 시각 칸으로만 도달을 인정한다.
//
// 정직 규칙(이 저장소 공통):
//  - 분모 0 은 0% 가 아니라 null.
//  - 집행비는 Compass ad 레벨 insights(USD). 기간 안 집행 기록이 없는 광고는 0 이 아니라 null(모름).
//  - 결제 금액(paid_amount)은 아직 비어 있어 ROAS 는 만들지 않는다. 건수 비율과 결제 1건당 비용만.
//  - CPL 은 여기서 CRM 리드 축(spend ÷ Compass CRM 리드)이다 — 소재별 CPL 카드(Meta 리포트 리드 축)와 값이 다르다.

export interface AdConversionLeadInput {
  meta_ad_id: string | null
  stage: string | null
  created_at: string
  demo_at?: string | null
  bd_contact_at?: string | null
  bd_paid_at?: string | null
}

export interface AdConversionAdInput {
  day: string
  ad_id: string
  ad_name: string | null
  campaign_name?: string | null
  spend_usd: number | null
}

export interface AdConversionCounts {
  leads: number
  demo: number
  bd: number
  paid: number
  /** 기간 안 집행비 합(USD). 집행 기록이 하나도 없으면 null. */
  spendUsd: number | null
  /** 데모 ÷ 리드(%) */
  demoRate: number | null
  /** 결제 ÷ 리드(%) — "리드 → 결제" */
  paidRate: number | null
  /** 결제 ÷ 데모(%) — "데모 → 결제" */
  demoToPaidRate: number | null
  /** 집행비 ÷ 리드(USD) — CRM 리드 축 */
  costPerLead: number | null
  /** 집행비 ÷ 결제(USD) */
  costPerPaid: number | null
}

export interface AdConversionRow extends AdConversionCounts {
  adId: string
  adName: string | null
  campaignName: string | null
}

export interface AdConversionCampaignRow extends AdConversionCounts {
  campaignName: string
}

export interface AdConversionResult {
  rows: AdConversionRow[]
  campaigns: AdConversionCampaignRow[]
  totals: AdConversionCounts
  /** 기간 안 생성 리드 중 광고 id 가 없어 광고에 붙일 수 없는 건수. */
  unattributedLeads: number
}

const DEMO_STAGES = new Set(["demo", "quote", "bd", "won"])
const BD_STAGES = new Set(["bd", "won"])

export function leadReached(lead: AdConversionLeadInput) {
  const stage = lead.stage ?? ""
  const paid = stage === "won" || Boolean(lead.bd_paid_at)
  const bd = paid || BD_STAGES.has(stage) || Boolean(lead.bd_contact_at)
  const demo = bd || DEMO_STAGES.has(stage) || Boolean(lead.demo_at)
  return { demo, bd, paid }
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null
}

function per(spend: number | null, d: number): number | null {
  return spend != null && d > 0 ? Math.round((spend / d) * 100) / 100 : null
}

function finish(c: { leads: number; demo: number; bd: number; paid: number; spendUsd: number | null }): AdConversionCounts {
  return {
    ...c,
    demoRate: pct(c.demo, c.leads),
    paidRate: pct(c.paid, c.leads),
    demoToPaidRate: pct(c.paid, c.demo),
    costPerLead: per(c.spendUsd, c.leads),
    costPerPaid: per(c.spendUsd, c.paid),
  }
}

/** KST 날짜(YYYY-MM-DD)로 자른다 — 기간 경계가 KST 달력이라서. */
function kstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

export function aggregateAdConversion(
  leads: readonly AdConversionLeadInput[],
  ads: readonly AdConversionAdInput[],
  window: { since: string; until: string },
): AdConversionResult {
  const inWindow = (day: string) => day >= window.since && day <= window.until

  type Acc = { leads: number; demo: number; bd: number; paid: number; spendUsd: number | null; adName: string | null; campaignName: string | null }
  const byAd = new Map<string, Acc>()
  const acc = (adId: string): Acc => {
    let a = byAd.get(adId)
    if (!a) byAd.set(adId, (a = { leads: 0, demo: 0, bd: 0, paid: 0, spendUsd: null, adName: null, campaignName: null }))
    return a
  }

  for (const ad of ads) {
    // 이름은 기간 밖 행에서도 채운다(기간 전에 집행한 광고의 리드도 이름으로 보이게). 집행비는 기간 안만.
    const a = acc(ad.ad_id)
    a.adName ??= ad.ad_name
    a.campaignName ??= ad.campaign_name ?? null
    if (inWindow(ad.day)) a.spendUsd = (a.spendUsd ?? 0) + (Number(ad.spend_usd) || 0)
  }

  let unattributedLeads = 0
  for (const lead of leads) {
    if (!inWindow(kstDay(lead.created_at))) continue
    if (!lead.meta_ad_id) { unattributedLeads++; continue }
    const a = acc(lead.meta_ad_id)
    const r = leadReached(lead)
    a.leads++
    if (r.demo) a.demo++
    if (r.bd) a.bd++
    if (r.paid) a.paid++
  }

  // 리드도 집행비도 없는 광고(기간 밖에서만 돈 광고)는 뺀다.
  const rows: AdConversionRow[] = [...byAd.entries()]
    .filter(([, a]) => a.leads > 0 || (a.spendUsd ?? 0) > 0)
    .map(([adId, a]) => ({ adId, adName: a.adName, campaignName: a.campaignName, ...finish(a) }))
    .sort((x, y) => y.paid - x.paid || y.demo - x.demo || y.leads - x.leads || (y.spendUsd ?? 0) - (x.spendUsd ?? 0))

  const byCampaign = new Map<string, { leads: number; demo: number; bd: number; paid: number; spendUsd: number | null }>()
  const total = { leads: 0, demo: 0, bd: 0, paid: 0, spendUsd: null as number | null }
  for (const r of rows) {
    const key = r.campaignName ?? "캠페인 모름"
    const c = byCampaign.get(key) ?? { leads: 0, demo: 0, bd: 0, paid: 0, spendUsd: null }
    for (const t of [c, total]) {
      t.leads += r.leads; t.demo += r.demo; t.bd += r.bd; t.paid += r.paid
      if (r.spendUsd != null) t.spendUsd = (t.spendUsd ?? 0) + r.spendUsd
    }
    byCampaign.set(key, c)
  }
  const campaigns = [...byCampaign.entries()]
    .map(([campaignName, c]) => ({ campaignName, ...finish(c) }))
    .sort((x, y) => y.paid - x.paid || y.leads - x.leads)

  return { rows, campaigns, totals: finish(total), unattributedLeads }
}
