// lib/marketing/ad-board.ts
// 광고 탭 채널 카드 — 계획표(코드) + 광고 일자 스냅샷 + 우리 DB 리드 짝짓기. 순수 모듈.
//
// 성과는 플랫폼 전환 칸이 아니라 우리 leads 로 센다. 11/6 부터 구글 태그는 쿠키 동의 뒤에만
// 켜져 Google Ads 전환 칸은 실제보다 적게 나온다 — 플랫폼 숫자는 참고 칸에만 둔다.
//
// 리드 → 캠페인 짝짓기(위에서 먼저 맞는 것):
//   Meta 리드(source=meta_lead_ads): utm_campaign = 캠페인 이름(옛 이름 포함) 또는 ID
//   그 밖의 리드: ① 랜딩 주소 gad_campaignid = 구글 캠페인 ID  ② utm_campaign = 구글 캠페인 이름·ID
//                 ③ gclid 만 있으면 '캠페인 미상' 칸 — click_view 조회는 아직 안 한다
// 못 붙인 리드는 버리지 않고 채널 아래 칸(unmatched)으로 센다.

import { isContactedLead } from "@/lib/crm/lead-attribution"
import { summarizeVideo, type AdInsightRow, type VideoSummary } from "@/lib/marketing/ad-insights"
import type { AdCampaignRecord, AdPlanStatus } from "@/lib/marketing/google-ads-setup"
import { shiftDays } from "@/lib/marketing/perf"
import type { LeadRecord } from "@/lib/repositories/leads"

export type AdBoardStatus = AdPlanStatus | "ended"

/** 최근 이 일수 안에 집행(노출 또는 광고비)이 있으면 운영 중으로 본다(오늘 포함 3일). */
export const RUNNING_WINDOW_DAYS = 2

export interface AdBoardCampaign {
  /** 행 키 — 플랫폼 ID, 없으면 계획 키·이름. */
  id: string
  key: string | null
  name: string
  /** 유형·메모·옛 이름 — 한 줄. */
  note: string | null
  status: AdBoardStatus
  /** 계획표 상태와 스냅샷이 다르다(예: 보류인데 최근 집행 있음). */
  planMismatch: boolean
  start: string | null
  end: string | null
  dailyBudget: number | null
  /** 기간 집행(채널 통화). null = 미집계(API 밖). */
  spend: number | null
  /** 마지막 집행일. */
  lastActive: string | null
  /** 플랫폼이 센 리드(Meta) 또는 전환(Google) — 참고용. */
  platformLeads: number | null
  clicks: number | null
  /** 우리 DB 리드. null = 짝지을 키가 없다. */
  dbLeads: number | null
  contacted: number
  /**
   * Google 만 — 유형·조회수·조회당 비용(lib/marketing/ad-insights.ts summarizeVideo).
   * 계획만 있고 집행이 없으면 undefined. 배포 직후 옛 캐시 항목에도 없다.
   */
  video?: VideoSummary
}

export interface AdBoardBucket {
  label: string
  note: string
  dbLeads: number
  contacted: number
}

export interface AdBoardChannel {
  /** 스냅샷 조회 성공 여부. false 면 집행·상태는 미측정. */
  measured: boolean
  currency: string | null
  spend: number | null
  platformLeads: number | null
  /** 이 채널로 짝지은 DB 리드 전부(캠페인 + 미상 칸). */
  dbLeads: number
  contacted: number
  campaigns: AdBoardCampaign[]
  unmatched: AdBoardBucket[]
}

export interface AdBoard {
  /** 리드 조회 성공 여부 — false 면 DB 리드 칸은 전부 미측정. */
  leadsMeasured: boolean
  google: AdBoardChannel & { legacy: AdBoardCampaign[] }
  meta: AdBoardChannel
}

export interface BuildAdBoardInput {
  /** 기간 시작·끝(KST, 양 끝 포함). */
  since: string
  until: string
  /** 채널 중립 행 — 기간 앞쪽(마지막 집행일 판정용)까지 포함해도 된다. null = 조회 실패. */
  meta: readonly AdInsightRow[] | null
  google: readonly AdInsightRow[] | null
  /** Google 계획표 — API 로 읽는 계정은 395 하나다. */
  plan: readonly AdCampaignRecord[]
  /** 기간 안 리드(테스트 제외). null = 조회 실패. */
  leads: readonly LeadRecord[] | null
}

const STATUS_ORDER: Record<AdBoardStatus, number> = { running: 0, planned: 1, held: 2, paused: 3, ended: 4 }

const round2 = (n: number) => Math.round(n * 100) / 100

/** 랜딩 주소의 gad_campaignid(구글 자동 태그). 없으면 null. */
export function gadCampaignIdOf(landingPage: string | null | undefined): string | null {
  return landingPage?.match(/[?&]gad_campaignid=(\d+)/)?.[1] ?? null
}

interface CampaignRollup {
  id: string
  names: string[]
  spend: number
  currency: string | null
  platformLeads: number
  clicks: number
  lastActive: string | null
  inPeriod: boolean
  /** 기간 안 행 — 유형·조회수 요약(summarizeVideo)이 다시 읽는다. */
  periodRows: AdInsightRow[]
}

/** 캠페인별 기간 합계 + 마지막 집행일. 이름은 오래된 것부터(마지막이 최신). */
function rollupByCampaign(rows: readonly AdInsightRow[], since: string, until: string): Map<string, CampaignRollup> {
  const out = new Map<string, CampaignRollup>()
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (row.date > until) continue
    const entry =
      out.get(row.campaignId) ??
      { id: row.campaignId, names: [], spend: 0, currency: null, platformLeads: 0, clicks: 0, lastActive: null, inPeriod: false, periodRows: [] }
    if (row.campaignName && entry.names.at(-1) !== row.campaignName) {
      entry.names = [...entry.names.filter((name) => name !== row.campaignName), row.campaignName]
    }
    if (row.spend > 0 || row.impressions > 0) entry.lastActive = row.date
    if (row.date >= since) {
      entry.inPeriod = entry.inPeriod || row.spend > 0 || row.impressions > 0 || row.leads > 0
      entry.spend += row.spend
      entry.currency ??= row.currency
      entry.platformLeads += row.channel === "google" ? (row.conversions ?? 0) : row.leads
      entry.clicks += row.clicks
      entry.periodRows.push(row)
    }
    out.set(row.campaignId, entry)
  }
  return out
}

/** 이름·ID → 캠페인 ID. 옛 이름도 잇는다(Meta 캠페인 이름 변경). */
function nameIndex(rollups: Iterable<CampaignRollup>, extra: Iterable<[string, string]> = []): Map<string, string> {
  const index = new Map<string, string>()
  for (const rollup of rollups) {
    index.set(rollup.id, rollup.id)
    for (const name of rollup.names) index.set(name.trim(), rollup.id)
  }
  for (const [name, id] of extra) index.set(name.trim(), id)
  return index
}

interface Tally {
  dbLeads: number
  contacted: number
}
const tally = (): Tally => ({ dbLeads: 0, contacted: 0 })
function count(map: Map<string, Tally>, key: string, lead: LeadRecord) {
  const entry = map.get(key) ?? tally()
  entry.dbLeads += 1
  if (isContactedLead(lead)) entry.contacted += 1
  map.set(key, entry)
}

function liveStatus(lastActive: string | null, until: string): boolean {
  return lastActive != null && lastActive >= shiftDays(until, -RUNNING_WINDOW_DAYS)
}

export function buildAdBoard(input: BuildAdBoardInput): AdBoard {
  const { since, until, plan } = input
  const leadsMeasured = input.leads != null
  const metaRollups = rollupByCampaign(input.meta ?? [], since, until)
  const googleRollups = rollupByCampaign(input.google ?? [], since, until)

  // ── 리드 짝짓기 ──
  const metaIndex = nameIndex(metaRollups.values())
  const googlePlanIds = plan.flatMap((record): Array<[string, string]> =>
    record.campaignId ? [[record.campaignId, record.campaignId], [record.name, record.campaignId]] : []
  )
  const googleIndex = nameIndex(googleRollups.values(), googlePlanIds)
  const metaTally = new Map<string, Tally>()
  const googleTally = new Map<string, Tally>()
  const metaUnmatched = new Map<string, Tally>()
  const googleUnmatched = new Map<string, Tally>()

  for (const lead of input.leads ?? []) {
    const utm = lead.utm_campaign?.trim() || null
    if (lead.source === "meta_lead_ads") {
      const id = utm ? metaIndex.get(utm) : undefined
      if (id) count(metaTally, id, lead)
      else count(metaUnmatched, utm ? "name" : "none", lead)
      continue
    }
    const gad = gadCampaignIdOf(lead.landing_page)
    if (gad) {
      if (googleIndex.get(gad) === gad) count(googleTally, gad, lead)
      else count(googleUnmatched, "id", lead)
      continue
    }
    const byName = utm ? googleIndex.get(utm) : undefined
    if (byName) count(googleTally, byName, lead)
    else if (lead.gclid) count(googleUnmatched, "gclid", lead)
  }

  // ── Google: 계획표 순서 + 계획 밖 라이브 캠페인 ──
  const googleMeasured = input.google != null
  const toGoogleRow = (record: AdCampaignRecord): AdBoardCampaign => {
    const rollup = record.campaignId ? googleRollups.get(record.campaignId) : undefined
    const apiAccount = record.account === "395" && googleMeasured
    const running = apiAccount && liveStatus(rollup?.lastActive ?? null, until)
    const pastEnd = record.end != null && record.end < until
    let status: AdBoardStatus = record.status
    let planMismatch = false
    if (apiAccount && record.campaignId) {
      if (running) {
        planMismatch = record.status !== "running"
        status = "running"
      } else if (record.status === "running") {
        // 계획상 운영인데 최근 집행이 없다 — 기간이 끝났으면 종료, 아니면 계획과 다름.
        planMismatch = !pastEnd
        status = "paused"
      }
    }
    if (pastEnd && (status === "paused" || status === "planned")) status = "ended"
    const leads = record.campaignId ? googleTally.get(record.campaignId) : undefined
    return {
      id: record.campaignId ?? `${record.account}:${record.key ?? record.name}`,
      key: record.key,
      name: record.name,
      note: [record.type !== record.name ? record.type : null, record.note].filter(Boolean).join(" · ") || null,
      status,
      planMismatch,
      start: record.start,
      end: record.end,
      dailyBudget: record.dailyBudget,
      spend: apiAccount && record.campaignId ? round2(rollup?.spend ?? 0) : null,
      lastActive: rollup?.lastActive ?? null,
      platformLeads: apiAccount && record.campaignId ? (rollup?.platformLeads ?? 0) : null,
      clicks: apiAccount && record.campaignId ? (rollup?.clicks ?? 0) : null,
      dbLeads: leadsMeasured ? (leads?.dbLeads ?? (record.campaignId ? 0 : null)) : null,
      contacted: leads?.contacted ?? 0,
      video: apiAccount && rollup?.periodRows.length ? summarizeVideo(rollup.periodRows) : undefined,
    }
  }
  const plannedIds = new Set(plan.flatMap((record) => (record.campaignId ? [record.campaignId] : [])))
  const unplannedGoogle: AdBoardCampaign[] = [...googleRollups.values()]
    .filter((rollup) => !plannedIds.has(rollup.id) && (rollup.inPeriod || googleTally.has(rollup.id)))
    .map((rollup): AdBoardCampaign => {
      const leads = googleTally.get(rollup.id)
      return {
        id: rollup.id,
        key: null,
        name: rollup.names.at(-1) ?? rollup.id,
        note: "계획표에 없음",
        status: liveStatus(rollup.lastActive, until) ? "running" : "paused",
        planMismatch: false,
        start: null,
        end: null,
        dailyBudget: null,
        spend: round2(rollup.spend),
        lastActive: rollup.lastActive,
        platformLeads: rollup.platformLeads,
        clicks: rollup.clicks,
        dbLeads: leadsMeasured ? (leads?.dbLeads ?? 0) : null,
        contacted: leads?.contacted ?? 0,
        video: rollup.periodRows.length ? summarizeVideo(rollup.periodRows) : undefined,
      }
    })
  const byStatus = (a: AdBoardCampaign, b: AdBoardCampaign) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  const googleRows = [...plan.filter((r) => r.account === "395").map(toGoogleRow), ...unplannedGoogle].sort(byStatus)
  const legacyRows = plan.filter((r) => r.account !== "395").map(toGoogleRow)

  const googleBuckets: AdBoardBucket[] = []
  const unknownId = googleUnmatched.get("id")
  if (unknownId) googleBuckets.push({ label: "캠페인 ID 만", note: "랜딩 gad_campaignid 가 계정에 없는 캠페인", ...unknownId })
  const gclidOnly = googleUnmatched.get("gclid")
  if (gclidOnly) googleBuckets.push({ label: "gclid 만", note: "캠페인 미상 — 395 클릭 조회 전, 924 일 수 있음", ...gclidOnly })

  const sumRows = (rows: AdBoardCampaign[], pick: (row: AdBoardCampaign) => number | null) =>
    rows.reduce((total, row) => total + (pick(row) ?? 0), 0)
  const googleAll = [...googleRows, ...legacyRows]
  const googleCurrency = [...googleRollups.values()].find((r) => r.currency)?.currency ?? null

  // ── Meta: 기간에 집행·리드가 있었던 캠페인, 광고비 순 ──
  const metaMeasured = input.meta != null
  const metaRows: AdBoardCampaign[] = [...metaRollups.values()]
    .filter((rollup) => rollup.inPeriod || metaTally.has(rollup.id))
    .map((rollup): AdBoardCampaign => {
      const leads = metaTally.get(rollup.id)
      const oldNames = rollup.names.slice(0, -1)
      return {
        id: rollup.id,
        key: null,
        name: rollup.names.at(-1) ?? rollup.id,
        note: oldNames.length > 0 ? `옛 이름 ${oldNames.map((name) => `'${name}'`).join(", ")}` : null,
        status: liveStatus(rollup.lastActive, until) ? "running" : "paused",
        planMismatch: false,
        start: null,
        end: null,
        dailyBudget: null,
        spend: round2(rollup.spend),
        lastActive: rollup.lastActive,
        platformLeads: rollup.platformLeads,
        clicks: rollup.clicks,
        dbLeads: leadsMeasured ? (leads?.dbLeads ?? 0) : null,
        contacted: leads?.contacted ?? 0,
      }
    })
    .sort((a, b) => byStatus(a, b) || (b.spend ?? 0) - (a.spend ?? 0))
  const metaBuckets: AdBoardBucket[] = []
  const metaByName = metaUnmatched.get("name")
  if (metaByName) metaBuckets.push({ label: "캠페인 이름 못 찾음", note: "utm_campaign 이 스냅샷 이름과 다르다", ...metaByName })
  const metaNone = metaUnmatched.get("none")
  if (metaNone) metaBuckets.push({ label: "캠페인 정보 없음", note: "utm_campaign 이 비어 있다", ...metaNone })

  const channelTotals = (rows: AdBoardCampaign[], buckets: AdBoardBucket[]) => ({
    dbLeads: sumRows(rows, (r) => r.dbLeads) + buckets.reduce((t, b) => t + b.dbLeads, 0),
    contacted: sumRows(rows, (r) => r.contacted) + buckets.reduce((t, b) => t + b.contacted, 0),
  })

  return {
    leadsMeasured,
    google: {
      measured: googleMeasured,
      currency: googleCurrency,
      spend: googleMeasured ? round2(sumRows(googleRows, (r) => r.spend)) : null,
      platformLeads: googleMeasured ? sumRows(googleRows, (r) => r.platformLeads) : null,
      ...channelTotals(googleAll, googleBuckets),
      campaigns: googleRows,
      legacy: legacyRows,
      unmatched: googleBuckets,
    },
    meta: {
      measured: metaMeasured,
      currency: [...metaRollups.values()].find((r) => r.currency)?.currency ?? null,
      spend: metaMeasured ? round2(sumRows(metaRows, (r) => r.spend)) : null,
      platformLeads: metaMeasured ? sumRows(metaRows, (r) => r.platformLeads) : null,
      ...channelTotals(metaRows, metaBuckets),
      campaigns: metaRows,
      unmatched: metaBuckets,
    },
  }
}
