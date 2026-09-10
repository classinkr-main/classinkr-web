// lib/marketing/intake-feed.ts
// "오늘 유입" 라이브 인테이크 — 어드민 public.leads 와 Compass 리드를 한 줄기로 합친다.
// 순수 모듈(서버 의존 없음) — 조회는 라우트가 하고 여기서는 창 계산·중복 접기·정렬만 한다.
//
// ── 정직 규칙 ────────────────────────────────────────────────
//  - 두 원천에 같은 사람이 있으면 1건이다. 접는 키는 전화 정규화 키(normalizePhoneKey) —
//    compass_leads_v 의 phone_key SQL 표현식과 같은 규칙이라 양쪽이 같은 값을 만든다.
//  - 전화가 없는 리드는 서로 접지 않는다(이름·학원 유사도로 합치면 다른 사람을 합칠 수 있다).
//  - 한 원천이 죽으면 그 원천만 미측정으로 표기한다. 남은 쪽 숫자를 "전체"라고 부르지 않는다.
//  - 어제 비교는 "어제 같은 시각까지" 창이다. 어제 하루 전체와 견주면 오전에는 항상 급감으로 보인다.
//  - 시각 축은 KST(lib/business-time.ts) 단일 기준.

import { toBusinessStorageDateTime, getBusinessDateParts } from "@/lib/business-time"
import { normalizePhoneKey } from "@/lib/compass/normalize"
import { getMetaAdInfo, isTestLead } from "@/lib/crm/lead-attribution"
import { shiftDays } from "@/lib/marketing/perf"
import type { LeadRecord } from "@/lib/repositories/leads"

/* ─── 창 계산 ────────────────────────────────────────────────── */

export interface IntakeWindows {
  /** KST 오늘(YYYY-MM-DD). */
  todayKst: string
  /** KST 어제(YYYY-MM-DD). */
  yesterdayKst: string
  /** 오늘 00:00 KST 의 절대 시각(ISO). */
  todayStartIso: string
  /** 지금(ISO) — 오늘 창의 끝점. */
  nowIso: string
  /** 어제 00:00 KST 의 절대 시각(ISO). */
  yesterdayStartIso: string
  /** 어제의 "같은 시각"(지금 − 24h) — 어제 창의 끝점. */
  yesterdaySameTimeIso: string
}

const DAY_MS = 86_400_000

/** KST 일자(YYYY-MM-DD)의 자정 절대 시각. business-time 의 저장 규약(+09:00 명시)을 그대로 쓴다. */
function kstDayStartIso(dayKst: string): string {
  return new Date(toBusinessStorageDateTime(`${dayKst}T00:00`)).toISOString()
}

export function resolveIntakeWindows(now: Date = new Date()): IntakeWindows {
  const { date: todayKst } = getBusinessDateParts(now)
  const yesterdayKst = shiftDays(todayKst, -1)
  return {
    todayKst,
    yesterdayKst,
    todayStartIso: kstDayStartIso(todayKst),
    nowIso: now.toISOString(),
    yesterdayStartIso: kstDayStartIso(yesterdayKst),
    yesterdaySameTimeIso: new Date(now.getTime() - DAY_MS).toISOString(),
  }
}

/* ─── 입력·출력 계약 ─────────────────────────────────────────── */

/** compass_leads_v 한 행의 구조적 최소 형태(브리지는 server-only 라 값 import 하지 않는다). */
export interface CompassIntakeLead {
  id: number
  academy: string | null
  name: string | null
  phone_key: string | null
  region: string | null
  meta_ad_id: string | null
  channel?: string | null
  platform?: string | null
  last_inflow_at: string | null
}

export type IntakeOrigin = "admin" | "compass"

export interface IntakeFeedItem {
  /**
   * 표시용 안정 키 — 기여한 원천의 레코드 id로만 만든다(`c:<compassId>` 또는 `a:<leadId>`).
   * 접기 키(전화 정규화 값)는 응답에 싣지 않는다 — 전화번호는 중복 판정에만 쓰고
   * 클라이언트 payload·DOM 속성으로 새어 나가게 두지 않는다(불필요한 PII 노출 금지).
   */
  key: string
  /** 유입 시각(ISO). 양쪽에 다 있으면 이른 쪽(최초 유입). */
  at: string
  name: string | null
  org: string | null
  region: string | null
  /** 유입 광고명 — 우리 UTM 우선, 없으면 Compass 광고 ID 매핑, 그래도 없으면 채널 라벨. */
  adName: string | null
  /** 어느 원천에서 왔는지. 2개면 두 원천이 같은 사람을 잡았다는 뜻. */
  origins: IntakeOrigin[]
  compassLeadId: number | null
}

export interface IntakeFeedResult {
  /** 오늘 00:00 KST~지금, 중복 접은 뒤 건수. */
  todayCount: number
  /** 어제 00:00 KST~같은 시각, 중복 접은 뒤 건수. */
  yesterdayCount: number
  /** todayCount − yesterdayCount. 두 원천이 모두 미측정이면 null. */
  delta: number | null
  /** 오늘 창에서 두 원천이 겹쳐 1건으로 접힌 수 — 합계가 단순 덧셈이 아닌 이유를 밝힌다. */
  overlapCount: number
  /** 최근순 피드(최대 maxItems). */
  items: IntakeFeedItem[]
  adminMeasured: boolean
  compassMeasured: boolean
  /**
   * Compass 조회가 행 상한에 닿았는지. 브리지는 last_inflow_at 내림차순으로 자르므로
   * 잘리면 "어제 이른 시각"부터 사라진다 — 어제 카운트가 과소집계돼 델타가 부풀려진다.
   */
  compassTruncated: boolean
  windows: IntakeWindows
}

interface Bucket {
  /** 접기 키(전화 정규화 값 포함) — 맵 내부 전용. 절대 응답에 싣지 않는다. */
  foldKey: string
  atMs: number
  at: string
  name: string | null
  org: string | null
  region: string | null
  adName: string | null
  origins: Set<IntakeOrigin>
  compassLeadId: number | null
  /** 표시 키 산출용 — 이 버킷에 기여한 첫 어드민 리드 id. */
  adminLeadId: string | null
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** 이미 잡힌 값을 덮어쓰지 않고, 비어 있을 때만 채운다(먼저 들어온 원천의 값이 이긴다). */
function fill(bucket: Bucket, field: "name" | "org" | "region" | "adName", value: string | null) {
  if (bucket[field] == null && value != null) bucket[field] = value
}

function foldInto(map: Map<string, Bucket>, foldKey: string, atMs: number, at: string): Bucket {
  const existing = map.get(foldKey)
  if (existing) {
    // 최초 유입 시각을 남긴다 — 두 원천이 같은 사람을 다른 시각에 기록했을 때 늦은 쪽을 쓰면
    // "방금 들어온 리드"로 오독된다.
    if (atMs < existing.atMs) {
      existing.atMs = atMs
      existing.at = at
    }
    return existing
  }
  const created: Bucket = {
    foldKey,
    atMs,
    at,
    name: null,
    org: null,
    region: null,
    adName: null,
    origins: new Set<IntakeOrigin>(),
    compassLeadId: null,
    adminLeadId: null,
  }
  map.set(foldKey, created)
  return created
}

/** 표시 키 — 레코드 id 기반. 어느 쪽도 없으면(있을 수 없지만) 접기 키 대신 시각으로 대체한다. */
function displayKey(bucket: Bucket): string {
  if (bucket.compassLeadId != null) return `c:${bucket.compassLeadId}`
  if (bucket.adminLeadId != null) return `a:${bucket.adminLeadId}`
  return `t:${bucket.atMs}`
}

export interface BuildIntakeFeedInput {
  /** 어드민 리드 전량. null 이면 조회 실패(미측정) — 0 건과 구분한다. */
  adminLeads: readonly LeadRecord[] | null
  /** Compass 리드(어제 00:00 이후). null 이면 브리지 다운(미측정). */
  compassLeads: readonly CompassIntakeLead[] | null
  windows: IntakeWindows
  /** Compass meta_ad_id → 광고명. 없으면 채널 라벨로 대체한다. */
  adNameById?: ReadonlyMap<string, string> | null
  /** 브리지 조회가 행 상한에 닿았는지 — 라우트가 판정해 넘긴다. */
  compassTruncated?: boolean
  maxItems?: number
}

/**
 * 두 원천의 오늘/어제 창을 각각 접어 건수와 최근 피드를 만든다.
 * 접기 키는 전화 정규화 키 하나뿐 — 없으면 원천별 고유 키라 절대 합쳐지지 않는다.
 */
export function buildIntakeFeed({
  adminLeads,
  compassLeads,
  windows,
  adNameById = null,
  compassTruncated = false,
  maxItems = 8,
}: BuildIntakeFeedInput): IntakeFeedResult {
  const todayFrom = timeOf(windows.todayStartIso) ?? 0
  const todayTo = timeOf(windows.nowIso) ?? Number.MAX_SAFE_INTEGER
  const yFrom = timeOf(windows.yesterdayStartIso) ?? 0
  const yTo = timeOf(windows.yesterdaySameTimeIso) ?? 0

  const today = new Map<string, Bucket>()
  const yesterday = new Map<string, Bucket>()

  for (const lead of adminLeads ?? []) {
    if (isTestLead(lead)) continue
    const ms = timeOf(lead.timestamp)
    if (ms == null) continue
    const inToday = ms >= todayFrom && ms <= todayTo
    const inYesterday = ms >= yFrom && ms <= yTo
    if (!inToday && !inYesterday) continue

    const phoneKey = normalizePhoneKey(lead.phone)
    const key = phoneKey ? `p:${phoneKey}` : `a:${lead.id}`
    const bucket = foldInto(inToday ? today : yesterday, key, ms, lead.timestamp)
    bucket.origins.add("admin")
    if (bucket.adminLeadId == null) bucket.adminLeadId = lead.id
    fill(bucket, "name", clean(lead.name))
    fill(bucket, "org", clean(lead.org))
    fill(bucket, "adName", clean(getMetaAdInfo(lead)?.ad ?? lead.source_detail))
  }

  for (const lead of compassLeads ?? []) {
    const ms = timeOf(lead.last_inflow_at)
    if (ms == null || !lead.last_inflow_at) continue
    const inToday = ms >= todayFrom && ms <= todayTo
    const inYesterday = ms >= yFrom && ms <= yTo
    if (!inToday && !inYesterday) continue

    // 뷰의 phone_key 는 이미 정규화된 값이지만 한 번 더 통과시킨다 — 규칙이 어긋나면
    // 두 원천이 조용히 안 접히는 쪽으로 실패하므로(중복 노출), 여기서 같은 함수로 고정한다.
    const phoneKey = normalizePhoneKey(lead.phone_key)
    const key = phoneKey ? `p:${phoneKey}` : `c:${lead.id}`
    const bucket = foldInto(inToday ? today : yesterday, key, ms, lead.last_inflow_at)
    bucket.origins.add("compass")
    if (bucket.compassLeadId == null) bucket.compassLeadId = lead.id
    fill(bucket, "name", clean(lead.name))
    fill(bucket, "org", clean(lead.academy))
    fill(bucket, "region", clean(lead.region))
    const adName = lead.meta_ad_id ? adNameById?.get(lead.meta_ad_id) : undefined
    fill(bucket, "adName", clean(adName) ?? clean(lead.channel) ?? clean(lead.platform))
  }

  const adminMeasured = adminLeads != null
  const compassMeasured = compassLeads != null
  const measured = adminMeasured || compassMeasured

  const items = [...today.values()]
    // 동시각 동률은 접기 키로 갈라 전순서를 만든다(내부 키라 응답에는 나가지 않는다).
    .sort((a, b) => b.atMs - a.atMs || a.foldKey.localeCompare(b.foldKey))
    .slice(0, maxItems)
    .map<IntakeFeedItem>((bucket) => ({
      key: displayKey(bucket),
      at: bucket.at,
      name: bucket.name,
      org: bucket.org,
      region: bucket.region,
      adName: bucket.adName,
      // 표시 순서를 고정한다(Set 삽입 순서에 화면이 흔들리지 않게).
      origins: (["admin", "compass"] as const).filter((origin) => bucket.origins.has(origin)),
      compassLeadId: bucket.compassLeadId,
    }))

  let overlapCount = 0
  for (const bucket of today.values()) if (bucket.origins.size > 1) overlapCount += 1

  return {
    todayCount: today.size,
    yesterdayCount: yesterday.size,
    // 양쪽 다 미측정이면 0−0=0 이 아니라 "비교 불가"다.
    delta: measured ? today.size - yesterday.size : null,
    overlapCount,
    items,
    adminMeasured,
    compassMeasured,
    compassTruncated,
    windows,
  }
}
