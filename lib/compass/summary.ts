import "server-only"

import { getBusinessDateParts, toBusinessStorageDateTime } from "@/lib/business-time"
import {
  getCompassBdOpenCount,
  getCompassDemos,
  getCompassLeadSliceByInflowRange,
  getCompassUpcomingActions,
  type CompassLeadRow,
  type CompassLeadSliceRow,
} from "@/lib/compass/bridge"
import { compassLeadUrl, COMPASS_CARE_STAGE_LABEL, COMPASS_STAGE_LABEL } from "@/lib/compass/normalize"
import {
  COMPASS_CARE_STAGES,
  COMPASS_FUNNEL_STAGES,
  COMPASS_SUMMARY_ACTION_LIMIT,
  COMPASS_SUMMARY_LOST_REASON_LIMIT,
  COMPASS_SUMMARY_MAX_ROWS,
  COMPASS_SUMMARY_OWNER_LIMIT,
  COMPASS_SUMMARY_PERIODS,
  COMPASS_UPCOMING_ACTION_HOURS,
  type CompassFunnelStage,
  type CompassSummary,
  type CompassSummaryActionRow,
  type CompassSummaryCount,
  type CompassSummaryOwnerRow,
  type CompassSummaryPeriodKey,
} from "@/lib/compass/summary-contract"

/**
 * Compass 정리 대시보드 요약(§13 D1)의 조립 정본.
 *
 * lib/compass/bridge.ts의 슬라이스(금액 컬럼 제외) + 보조 조회 3종을 병렬로 모아 한 응답으로
 * 묶는다. 라우트(GET /api/admin/crm/compass-summary)는 이 함수만 부른다 — 집계 규칙이
 * 여기 한 곳에만 있어야 화면(홈 밴드·인사이트)이 서로 다른 수치를 내지 않는다.
 *
 * down 규약: 슬라이스가 죽으면 전체를 down=true로 강등하고 숫자는 전부 0을 낸다(보조 조회가
 * 살아 있어도 신뢰하지 않는다). 보조 조회(BD인계·오늘 데모·다음 액션)만 죽으면 down=false를
 * 유지하되 해당 필드만 0으로 내리고 error에 사유를 남긴다 — 슬라이스가 살아 있으면 유입·퍼널·
 * 담당별 집계는 정확하기 때문이다.
 */

const UNASSIGNED_OWNER_LABEL = "미배정"
const NO_LOST_REASON_LABEL = "사유 없음"
const OTHER_PLATFORM_LABEL = "기타"

// Compass의 platform/channel 자유 텍스트 안에서 메타 계열을 판별한다. fb/ig는 부분 문자열
// 오검출을 막기 위해 단어 경계를 둔다(예: "config" 안의 "fig"가 아니라 "FB" 단독 토큰만).
const META_PLATFORM_PATTERN = /meta|facebook|instagram|\bfb\b|\big\b/i

function resolveCompassSummaryPeriodDays(periodKey: CompassSummaryPeriodKey): number {
  const found = COMPASS_SUMMARY_PERIODS.find((period) => period.key === periodKey)
  return found ? found.days : COMPASS_SUMMARY_PERIODS[0].days
}

/** 'YYYY-MM-DD' 문자열을 날짜 단위로 이동한다(시각 정보 없이 순수 날짜 산술). */
function shiftKstDateString(dateStr: string, deltaDays: number): string {
  const shiftedMs = new Date(`${dateStr}T00:00:00Z`).getTime() + deltaDays * 86_400_000
  return new Date(shiftedMs).toISOString().slice(0, 10)
}

function resolveCompassSummaryPeriod(
  periodKey: CompassSummaryPeriodKey,
  now: Date,
): { key: CompassSummaryPeriodKey; since: string; until: string } {
  const days = resolveCompassSummaryPeriodDays(periodKey)
  const todayKst = getBusinessDateParts(now).date
  const sinceDateKst = shiftKstDateString(todayKst, -(days - 1))
  return {
    key: periodKey,
    since: toBusinessStorageDateTime(`${sinceDateKst}T00:00`),
    until: now.toISOString(),
  }
}

/** platform/channel 정규화 — meta/facebook/instagram/fb/ig 계열은 "meta"/"메타",
 *  그 외는 channel 원문을 key·label로, channel마저 비면 "기타". */
function classifyCompassInflow(row: Pick<CompassLeadSliceRow, "platform" | "channel">): {
  key: string
  label: string
} {
  const platform = (row.platform ?? "").trim()
  const channel = (row.channel ?? "").trim()
  if (META_PLATFORM_PATTERN.test(platform) || META_PLATFORM_PATTERN.test(channel)) {
    return { key: "meta", label: "메타" }
  }
  if (channel.length > 0) return { key: channel, label: channel }
  return { key: OTHER_PLATFORM_LABEL, label: OTHER_PLATFORM_LABEL }
}

/** COMPASS_FUNNEL_STAGES 안 인덱스. 알 수 없는(또는 null) 단계는 0(new)으로 본다.
 *  "lost"도 이 배열에 없어 0이 나오지만, 호출부가 lost 행은 먼저 걸러 여기까지 오지 않는다. */
function stageIndexOf(stage: string | null): number {
  if (!stage) return 0
  const idx = COMPASS_FUNNEL_STAGES.indexOf(stage as CompassFunnelStage)
  return idx >= 0 ? idx : 0
}

function sortCountsDesc(counts: Iterable<CompassSummaryCount>): CompassSummaryCount[] {
  return [...counts].sort((a, b) => b.count - a.count)
}

function emptyCompassSummary(
  period: { key: CompassSummaryPeriodKey; since: string; until: string },
  generatedAt: string,
  options: { down: boolean; truncated: boolean; error?: string },
): CompassSummary {
  return {
    period,
    generatedAt,
    down: options.down,
    ...(options.error ? { error: options.error } : {}),
    truncated: options.truncated,
    inflowTotal: 0,
    byPlatform: [],
    metaInflow: 0,
    stages: COMPASS_FUNNEL_STAGES.map((stage) => ({
      key: stage,
      label: COMPASS_STAGE_LABEL[stage] ?? stage,
      count: 0,
    })),
    lost: 0,
    neoRegistered: 0,
    won: 0,
    careStages: COMPASS_CARE_STAGES.map((stage) => ({
      key: stage,
      label: COMPASS_CARE_STAGE_LABEL[stage] ?? stage,
      count: 0,
    })),
    bdOpen: 0,
    todayDemoCount: 0,
    byOwner: [],
    lostReasons: [],
    upcomingActions: [],
    upcomingActionCount: 0,
  }
}

function toSummaryActionRow(row: CompassLeadRow): CompassSummaryActionRow {
  return {
    compassLeadId: row.id,
    academy: row.academy,
    name: row.name,
    stage: row.stage,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    owner: row.owner,
    caller: row.caller,
    url: compassLeadUrl(row.id),
  }
}

export async function buildCompassSummary(
  periodKey: CompassSummaryPeriodKey,
  now: Date = new Date(),
): Promise<CompassSummary> {
  const period = resolveCompassSummaryPeriod(periodKey, now)
  const generatedAt = now.toISOString()
  const todayKst = getBusinessDateParts(now).date

  const [slice, bdOpen, todayDemos, upcoming] = await Promise.all([
    getCompassLeadSliceByInflowRange(period.since, period.until, { maxRows: COMPASS_SUMMARY_MAX_ROWS }),
    getCompassBdOpenCount(),
    getCompassDemos(todayKst, todayKst),
    getCompassUpcomingActions(COMPASS_UPCOMING_ACTION_HOURS),
  ])

  // 슬라이스가 죽으면 다른 조회가 살아 있어도 숫자를 신뢰하지 않는다 — 즉시 강등.
  if (slice.down) {
    return emptyCompassSummary(period, generatedAt, { down: true, truncated: false, error: slice.error })
  }

  // --- 한 번 순회로 모든 집계를 함께 쌓는다 ---
  const platformCounts = new Map<string, CompassSummaryCount>()
  const stageBuckets = new Array<number>(COMPASS_FUNNEL_STAGES.length).fill(0)
  const careCounts = new Map<string, number>(COMPASS_CARE_STAGES.map((stage) => [stage, 0]))
  const ownerRows = new Map<string, CompassSummaryOwnerRow>()
  const lostReasonCounts = new Map<string, number>()
  let lost = 0
  let neoRegistered = 0
  let won = 0

  for (const row of slice.rows) {
    const isLost = row.stage === "lost"
    const isWon = row.stage === "won"
    if (isLost) lost += 1
    if (isWon) won += 1
    if (row.neocrm_registered_at) neoRegistered += 1

    const platform = classifyCompassInflow(row)
    const existingPlatform = platformCounts.get(platform.key)
    if (existingPlatform) existingPlatform.count += 1
    else platformCounts.set(platform.key, { key: platform.key, label: platform.label, count: 1 })

    if (!isLost) stageBuckets[stageIndexOf(row.stage)] += 1

    if (row.care_stage && careCounts.has(row.care_stage)) {
      careCounts.set(row.care_stage, (careCounts.get(row.care_stage) ?? 0) + 1)
    }

    const ownerKey = row.caller?.trim() || row.owner?.trim() || UNASSIGNED_OWNER_LABEL
    const ownerRow = ownerRows.get(ownerKey) ?? { owner: ownerKey, total: 0, demo: 0, bd: 0, won: 0, lost: 0 }
    ownerRow.total += 1
    if (row.demo_at) ownerRow.demo += 1
    if (row.stage === "bd" || Boolean(row.bd_owner?.trim())) ownerRow.bd += 1
    if (isWon) ownerRow.won += 1
    if (isLost) ownerRow.lost += 1
    ownerRows.set(ownerKey, ownerRow)

    if (isLost) {
      const reasonKey = row.lost_reason?.trim() || NO_LOST_REASON_LABEL
      lostReasonCounts.set(reasonKey, (lostReasonCounts.get(reasonKey) ?? 0) + 1)
    }
  }

  const inflowTotal = slice.rows.length
  const byPlatform = sortCountsDesc(platformCounts.values())
  const metaInflow = platformCounts.get("meta")?.count ?? 0

  // 퍼널 누적 — index i 값은 stageBuckets[i..끝] 합(해당 단계 이상 도달, lost 제외).
  const stages: CompassSummaryCount[] = COMPASS_FUNNEL_STAGES.map((stage, index) => {
    let count = 0
    for (let j = index; j < stageBuckets.length; j += 1) count += stageBuckets[j]
    return { key: stage, label: COMPASS_STAGE_LABEL[stage] ?? stage, count }
  })

  const careStages: CompassSummaryCount[] = COMPASS_CARE_STAGES.map((stage) => ({
    key: stage,
    label: COMPASS_CARE_STAGE_LABEL[stage] ?? stage,
    count: careCounts.get(stage) ?? 0,
  }))

  // total 내림차순 상위 N을 먼저 자르고, 그 안에서만 "미배정"을 맨 뒤로 옮긴다(정렬 안정성
  // 덕에 나머지는 total 순서를 그대로 유지).
  const byOwner = [...ownerRows.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, COMPASS_SUMMARY_OWNER_LIMIT)
    .sort((a, b) => {
      const aUnassigned = a.owner === UNASSIGNED_OWNER_LABEL
      const bUnassigned = b.owner === UNASSIGNED_OWNER_LABEL
      if (aUnassigned === bUnassigned) return 0
      return aUnassigned ? 1 : -1
    })

  const lostReasons = [...lostReasonCounts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, COMPASS_SUMMARY_LOST_REASON_LIMIT)

  // 보조 조회는 슬라이스와 달리 부분 실패를 허용한다 — 죽은 것만 0으로 내리고 사유를 남긴다.
  const auxErrors: string[] = []
  if (bdOpen.down) auxErrors.push(`bd: ${bdOpen.error ?? "조회 실패"}`)
  if (todayDemos.down) auxErrors.push(`demos: ${todayDemos.error ?? "조회 실패"}`)
  if (upcoming.down) auxErrors.push(`actions: ${upcoming.error ?? "조회 실패"}`)

  const upcomingActions = upcoming.down
    ? []
    : [...upcoming.rows]
        .sort((a, b) => (a.next_action_at ?? "").localeCompare(b.next_action_at ?? ""))
        .slice(0, COMPASS_SUMMARY_ACTION_LIMIT)
        .map(toSummaryActionRow)

  return {
    period,
    generatedAt,
    down: false,
    ...(auxErrors.length > 0 ? { error: auxErrors.join("; ") } : {}),
    truncated: slice.truncated,
    inflowTotal,
    byPlatform,
    metaInflow,
    stages,
    lost,
    neoRegistered,
    won,
    careStages,
    bdOpen: bdOpen.down ? 0 : bdOpen.count,
    todayDemoCount: todayDemos.down ? 0 : todayDemos.rows.length,
    byOwner,
    lostReasons,
    upcomingActions,
    upcomingActionCount: upcoming.down ? 0 : upcoming.rows.length,
  }
}
