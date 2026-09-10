// lib/marketing/campaign-rollup-sources.ts
// 크로스채널 캠페인 롤업의 "소스 수집" 레이어 — 링크된 채널 실행의 지표 + 라벨을 한 번에 모은다.
// 집계 자체는 순수함수(campaign-rollup.ts), 라벨 규칙도 순수함수(campaign-labels.ts).
//
// ── 단일 구현, 두 소비처 ──────────────────────────────────────
//   GET /api/admin/marketing-campaigns        (목록: 전체 캠페인의 링크를 한 번에 수집)
//   GET /api/admin/marketing-campaigns/[id]   (상세: 캠페인 1건의 링크)
// 목록이 캠페인마다 이 함수를 부르면 N+1 이 된다. 라우트는 반드시 "모든 캠페인의 링크를
// 합쳐" 1회만 호출하고, 결과 sources 를 캠페인별 computeCampaignRollup 에 재사용한다.
// 그래서 쿼리 수는 캠페인 수와 무관하게 채널당 최대 1회다.
//
// ── best-effort 격리 ─────────────────────────────────────────
// 채널별 수집은 독립 try/catch — 한 소스 실패가 다른 채널을 0 으로 만들거나 라우트를
// 500 으로 만들지 않는다(마이그 미적용 · Meta 미구성 · 레이트리밋 안전).
//
// ── v1 정직 노트(축약 지점) ───────────────────────────────────
//  - 행사 leads = 0 고정. 리드↔행사 attribution 은 전체 리드 로드 + 토큰 매칭이라 무거워
//    v1 범위 밖(참고: app/admin/campaigns/page.tsx). deals/매출은 정확히 집계한다.
//    UI 는 이 0 을 "0명"이 아니라 "미집계"로 라벨링해야 한다.
//  - Meta 는 링크가 있을 때만 라이브 대시보드 1콜. 미구성/레이트리밋이면 빈 맵 →
//    롤업이 meta 를 0/null 로 강등(조작 없음), 라벨도 undefined(지어내지 않음).
//    주의: 대시보드는 상위 N개만 조회 — 그 밖의 Meta 캠페인 링크는 집계 0·라벨 없음
//    (id별 Graph 조회는 top-N 대시보드와 다른 호출이라 향후 개선 지점).

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getAllEventMetrics } from "@/lib/repositories/event-metrics"
import { getAllEventsForAdmin } from "@/lib/repositories/public-events"
import { getMetaCampaignDashboard } from "@/lib/meta/marketing"
import type { CampaignRollupSources } from "@/lib/marketing/campaign-rollup"
import {
  emailCampaignLabel,
  emptyCampaignLinkLabels,
  eventLabel,
  metaCampaignLabel,
  smsCampaignLabel,
  type CampaignLinkLabels,
} from "@/lib/marketing/campaign-labels"
import type { CampaignLink, CampaignRefType } from "@/lib/types/marketing-campaign"

export interface GatheredRollupData {
  sources: CampaignRollupSources
  labels: CampaignLinkLabels
}

// admin 클라이언트는 Database 제네릭 없이 생성되어 row 가 loosely-typed 이다.
// 저장소 레이어 관행대로 필요한 컬럼만 좁게 선언해 쓴다.
type EmailRow = {
  id: string | number
  subject?: string | null
  recipient_count?: number | null
  open_count?: number | null
}
type SmsRow = {
  id: string | number
  message?: string | null
  recipient_count?: number | null
}

function uniqueRefIds(links: CampaignLink[], refType: CampaignRefType): string[] {
  const ids = new Set<string>()
  for (const link of links) {
    if (link.refType === refType) ids.add(link.refId)
  }
  return [...ids]
}

/** 이메일: 링크된 id 로 직접 1회 배치 조회 — 지표(recipient/open)와 라벨(subject)을 함께 얻는다.
 *  getAllCampaigns()(최근 N건)을 필터하면 N 밖의 오래된 링크가 사일런트 언더카운트되므로 쓰지 않는다. */
async function gatherEmail(
  ids: string[],
  sources: CampaignRollupSources,
  labels: CampaignLinkLabels,
): Promise<void> {
  if (ids.length === 0) return
  try {
    const { data } = await createSupabaseAdminClient()
      .from("email_campaigns")
      .select("id, subject, recipient_count, open_count")
      .in("id", ids)
    for (const row of (data ?? []) as EmailRow[]) {
      const id = String(row.id)
      sources.emailCampaigns[id] = {
        recipientCount: row.recipient_count ?? 0,
        openCount: row.open_count ?? 0,
      }
      labels.email_campaign[id] = emailCampaignLabel(row)
    }
  } catch {
    /* 소스 실패는 이메일 채널 0 기여로 격리 */
  }
}

/** 문자: sms_campaigns 를 링크된 id 로 직접 1회 배치 조회(전용 저장소 함수 없음). */
async function gatherSms(
  ids: string[],
  sources: CampaignRollupSources,
  labels: CampaignLinkLabels,
): Promise<void> {
  if (ids.length === 0) return
  try {
    const { data } = await createSupabaseAdminClient()
      .from("sms_campaigns")
      .select("id, message, recipient_count")
      .in("id", ids)
    for (const row of (data ?? []) as SmsRow[]) {
      const id = String(row.id)
      sources.smsCampaigns[id] = { recipientCount: row.recipient_count ?? 0 }
      labels.sms_campaign[id] = smsCampaignLabel(row)
    }
  } catch {
    /* 격리 */
  }
}

/** 행사: 지표는 event_metrics(Supabase, 2026-08-20 이전 완료), 라벨은 public_events.
 *  두 소스를 각각 격리한다 — 라벨 조회가 죽어도 deals/매출은 살리고, 그 반대도 마찬가지. */
async function gatherEvents(
  ids: Set<string>,
  sources: CampaignRollupSources,
  labels: CampaignLinkLabels,
): Promise<void> {
  if (ids.size === 0) return
  try {
    const all = await getAllEventMetrics()
    for (const [eventId, m] of Object.entries(all)) {
      if (ids.has(eventId)) {
        sources.eventMetrics[eventId] = {
          dealsCount: m.dealsCount,
          dealsRevenue: m.dealsRevenue,
          leads: 0, // v1 미집계(NOT "0 leads")
        }
      }
    }
  } catch {
    /* 격리 */
  }
  try {
    const events = await getAllEventsForAdmin()
    for (const event of events) {
      if (ids.has(event.id)) labels.event[event.id] = eventLabel(event)
    }
  } catch {
    /* 라벨 없이 진행 → UI 는 raw id 폴백 */
  }
}

/** Meta: 요청당 라이브 대시보드 1콜(링크가 있을 때만). 실패 시 빈 맵 → 롤업 meta 0/null 강등. */
async function gatherMeta(
  sources: CampaignRollupSources,
  labels: CampaignLinkLabels,
): Promise<void> {
  try {
    const dash = await getMetaCampaignDashboard()
    const currency = dash.account.currency ?? "USD"
    for (const c of dash.campaigns) {
      sources.metaCampaigns[c.id] = {
        spend: c.insights.spend,
        leads: c.insights.leads,
        currency,
      }
      labels.meta_campaign[c.id] = metaCampaignLabel(c)
    }
  } catch {
    /* MetaConfigError · 레이트리밋 → 빈 맵 */
  }
}

/**
 * 링크된 채널 실행의 지표 + 라벨을 채널당 최대 1회 조회로 수집한다.
 * 링크가 없는 채널은 아예 조회하지 않는다(빈 목록 → 0 쿼리).
 */
export async function gatherRollupSources(links: CampaignLink[]): Promise<GatheredRollupData> {
  const sources: CampaignRollupSources = {
    emailCampaigns: {},
    smsCampaigns: {},
    eventMetrics: {},
    metaCampaigns: {},
  }
  const labels = emptyCampaignLinkLabels()

  const emailIds = uniqueRefIds(links, "email_campaign")
  const smsIds = uniqueRefIds(links, "sms_campaign")
  const eventIds = new Set(uniqueRefIds(links, "event"))
  const hasMeta = links.some((l) => l.refType === "meta_campaign")

  // 채널 간 의존이 없으므로 병렬 — 각 수집은 내부에서 이미 격리되어 reject 하지 않는다.
  await Promise.all([
    gatherEmail(emailIds, sources, labels),
    gatherSms(smsIds, sources, labels),
    gatherEvents(eventIds, sources, labels),
    hasMeta ? gatherMeta(sources, labels) : Promise.resolve(),
  ])

  return { sources, labels }
}
