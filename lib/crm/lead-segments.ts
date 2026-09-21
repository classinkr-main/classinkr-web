/**
 * 리드 세그먼트 SSOT — "메타 광고 리드 · 인계 리드 · 기존 리드 · 고객" (2026-09-20 Compass 정리 라운드).
 *
 * 리드 보드 상단 칩·홈 세그먼트 타일·커맨드 팔레트 이동 명령이 전부 이 파일의 정의와 판정을 쓴다.
 * 한 리드는 여러 세그먼트에 동시에 속할 수 있다(예: 메타 광고로 들어왔고 Compass에도 이미 있음).
 * 판정 근거:
 *  - meta_ads:     우리 리드의 source 그룹이 "meta"(meta_lead_ads) 이거나 fbclid/utm_source 가 Meta 계열.
 *  - bd_handover:  Compass 오버레이(전화 키 매칭)의 단계가 "bd"(BD인계) 이거나 BD 담당이 지정된 진행 건.
 *  - existing:     Compass 에 같은 전화 키의 리드가 이미 있거나 NeoCRM 등록 시각이 찍힌 리드(재유입 포함).
 *  - customer:     우리 status 가 converted 이거나 Compass 단계가 won(결제).
 * Compass 가 끊겨 있으면 bd_handover/existing 은 판정할 수 없다 — 0 이 아니라 null(연결 끊김)로 세어
 * 화면이 "없음"과 "모름"을 구분하게 한다.
 */

import type { LeadRecord } from "@/lib/repositories/leads"
import type { CompassOverlayEntry } from "@/lib/compass/overlay"
import { getLeadSourceGroup, isConvertedLead } from "@/lib/crm/lead-attribution"

export type LeadSegmentId = "all" | "meta_ads" | "bd_handover" | "existing" | "customer"

export interface LeadSegmentDefinition {
  id: LeadSegmentId
  label: string
  /** 칩·타일용 짧은 라벨 */
  shortLabel: string
  /** title/툴팁 한 줄 정의 */
  hint: string
  /** true 면 Compass 오버레이 없이는 판정 불가 → down 시 null 카운트 */
  needsCompass: boolean
}

export const LEAD_SEGMENTS: readonly LeadSegmentDefinition[] = [
  { id: "all", label: "전체", shortLabel: "전체", hint: "현재 필터의 모든 리드", needsCompass: false },
  {
    id: "meta_ads",
    label: "메타 광고 리드",
    shortLabel: "메타 광고",
    hint: "Meta 리드 광고(meta_lead_ads) 또는 Meta 클릭·UTM 으로 들어온 리드",
    needsCompass: false,
  },
  {
    id: "bd_handover",
    label: "인계 리드",
    shortLabel: "인계",
    hint: "Compass 단계가 BD인계이거나 BD 담당이 지정된 진행 건(결제·이탈 제외)",
    needsCompass: true,
  },
  {
    id: "existing",
    label: "기존 리드",
    shortLabel: "기존",
    hint: "Compass 또는 NeoCRM 에 이미 등록된 리드(전화 키 매칭 · 재유입 포함)",
    needsCompass: true,
  },
  {
    id: "customer",
    label: "고객",
    shortLabel: "고객",
    hint: "전환 완료(converted) 리드 또는 Compass 결제(won) 단계",
    needsCompass: false,
  },
] as const

export const LEAD_SEGMENT_IDS: readonly LeadSegmentId[] = LEAD_SEGMENTS.map((segment) => segment.id)

export const LEAD_SEGMENT_PARAM = "segment"
export const LEADS_BOARD_PATH = "/admin/crm/customers/leads"

export function isLeadSegmentId(value: unknown): value is LeadSegmentId {
  return typeof value === "string" && (LEAD_SEGMENT_IDS as string[]).includes(value)
}

export function readLeadSegmentParam(value: string | null | undefined): LeadSegmentId {
  return isLeadSegmentId(value) ? value : "all"
}

export function leadSegment(id: LeadSegmentId): LeadSegmentDefinition {
  return LEAD_SEGMENTS.find((segment) => segment.id === id) ?? LEAD_SEGMENTS[0]
}

/** 리드 보드 딥링크 — all 은 파라미터를 붙이지 않는다(기본값은 URL 에서 제외하는 보드 규약). */
export function leadSegmentHref(id: LeadSegmentId, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra)
  if (id !== "all") params.set(LEAD_SEGMENT_PARAM, id)
  const query = params.toString()
  return query ? `${LEADS_BOARD_PATH}?${query}` : LEADS_BOARD_PATH
}

const META_UTM_SOURCE = /^(meta|facebook|fb|instagram|ig)$/i

/** Meta 광고 리드 판정 — source 그룹 meta 이거나 Meta 클릭/UTM 흔적. */
export function isMetaAdLead(lead: Pick<LeadRecord, "source" | "fbclid" | "utm_source">): boolean {
  if (getLeadSourceGroup(lead as LeadRecord) === "meta") return true
  if (lead.fbclid?.trim()) return true
  const utmSource = lead.utm_source?.trim() ?? ""
  return utmSource ? META_UTM_SOURCE.test(utmSource) : false
}

export interface LeadSegmentContext {
  /** 이 리드에 겹친 Compass 항목. 매칭 없음은 undefined/null. */
  overlay?: CompassOverlayEntry | null
  /** Compass 연결 끊김 — needsCompass 세그먼트는 판정하지 않는다(false 도 true 도 아님). */
  compassDown?: boolean
}

function isBdHandover(entry: CompassOverlayEntry): boolean {
  if (entry.stage === "won" || entry.stage === "lost") return false
  return entry.stage === "bd" || Boolean(entry.bdOwner?.trim())
}

/** 리드가 속한 세그먼트 집합. 항상 "all" 을 포함한다. Compass down 이면 needsCompass 세그먼트는 넣지 않는다. */
export function resolveLeadSegments(lead: LeadRecord, ctx: LeadSegmentContext = {}): Set<LeadSegmentId> {
  const segments = new Set<LeadSegmentId>(["all"])
  if (isMetaAdLead(lead)) segments.add("meta_ads")
  if (isConvertedLead(lead)) segments.add("customer")
  const entry = ctx.compassDown ? null : ctx.overlay ?? null
  if (entry) {
    segments.add("existing")
    if (isBdHandover(entry)) segments.add("bd_handover")
    if (entry.stage === "won") segments.add("customer")
  }
  return segments
}

export function matchesLeadSegment(lead: LeadRecord, segment: LeadSegmentId, ctx: LeadSegmentContext = {}): boolean {
  if (segment === "all") return true
  return resolveLeadSegments(lead, ctx).has(segment)
}

export type LeadSegmentCounts = Record<LeadSegmentId, number | null>

/**
 * 칩 카운트 — 한 번 순회로 전부 센다. Compass down 이면 needsCompass 세그먼트는 null(연결 끊김).
 * lookup 은 useCompassOverlay().lookup 과 같은 시그니처.
 */
export function countLeadSegments(
  leads: readonly LeadRecord[],
  lookup: (lead: LeadRecord) => CompassOverlayEntry | undefined,
  compassDown = false,
): LeadSegmentCounts {
  const counts: LeadSegmentCounts = { all: 0, meta_ads: 0, bd_handover: 0, existing: 0, customer: 0 }
  for (const lead of leads) {
    const segments = resolveLeadSegments(lead, { overlay: lookup(lead), compassDown })
    for (const id of segments) counts[id] = (counts[id] ?? 0) + 1
  }
  if (compassDown) {
    for (const segment of LEAD_SEGMENTS) {
      if (segment.needsCompass) counts[segment.id] = null
    }
  }
  return counts
}
