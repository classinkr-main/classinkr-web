import "server-only"

import {
  readStoredSegmentFilter,
  segmentFilterUsesContact,
  segmentFilterUsesNeoSignals,
} from "@/lib/crm/customer-segment-filter"
import type { CustomerSegmentFilter } from "@/lib/crm/saved-segment-api"
import {
  AUTO_TAG_MAX_SEGMENTS_PER_RUN,
  SEGMENT_DAILY_RETENTION_DAYS,
  SEGMENT_SPIKE_LOOKBACK_DAYS,
  addDaysToDateKey,
  autoTagResultStatus,
  decideAutoTag,
  kstDateKeyOf,
  segmentAutoTagMarker,
  segmentSpikeBaseline,
  segmentUntagLimit,
  type SavedSegmentRecord,
  type SavedSegmentRunTrigger,
  type SegmentAutoTagStatus,
  type SegmentQualityFlag,
  type SegmentSpikeBaseline,
} from "@/lib/crm/saved-segments"
import { DAILY_SYNC_STALE_AFTER_HOURS, isSyncStale } from "@/lib/crm/sync-freshness"
import { parseUnifiedCustomerTargetKey, unifiedCustomerStorageKey } from "@/lib/crm/unified-customer-key"
import type { CrmUnifiedCustomerSource } from "@/lib/crm/unified-view-rules"
import {
  addCustomerTagToTargets,
  planSegmentAutoTagRemovals,
  previewCustomerTagForTargets,
  type CrmBulkTagTarget,
} from "@/lib/repositories/crm-customer-tags"
import {
  SavedSegmentsNotReadyError,
  deleteSavedSegmentDailyBefore,
  listActiveSavedSegmentsForRun,
  listSavedSegmentDailyPoints,
  updateSavedSegmentRunState,
  upsertSavedSegmentDailyRows,
  type SavedSegmentDailyUpsert,
} from "@/lib/repositories/crm-saved-segments"
import { evaluateCrmSegmentFilters, type CrmSegmentFilterResult } from "@/lib/repositories/crm-unified-customers"

// 저장 세그먼트 매일 평가 + 자동 태그(세그먼트 허브, C안 ②, 2026-09-25).
//
// 호출: /api/cron/dispatch/[slot] 의 UTC 슬롯 21(= KST 06시)에 편승(새 크론·vercel.json 변경 없음) + 허브의 수동
// 실행(POST /api/admin/crm/segments/[id]/run). 순서:
//   1) 활성 세그먼트 전량 → 2) 읽을 수 있는 조건을 스냅샷 한 번에 일괄 평가(bypassCache — unstable_cache SWR 로
//   어제 저녁 스냅샷을 받지 않게) → 3) 세그먼트별 품질 플래그 → 4) 자동 태그 결정(가드 우선순위)·적용(붙이기는
//   마커 "auto:seg:<id>", 떼기는 그 마커 행만 — 떼기 계획은 붙이기 전에 세워 상한 분모를 "이번 실행 전 마커 행 수"로
//   고정한다) → 5) 일별 행 배치 upsert(PK — 같은 날 재실행은 덮어쓴다) → 6) 세그먼트 행 last_* 갱신(묶음 병렬) →
//   7) 보존 기간 지난 일별 행 삭제(best-effort).
// 자동 태그 적용은 autoTagOrder 순서(지난번 예산 밖으로 밀린 세그먼트 먼저)로 돌고, 실행당 개수 상한·시간 예산도 그
// 순서로 판정한다 — 목록(updated_at) 순으로 돌면 예산에 밀린 세그먼트가 매일 다시 밀린다. 실행당 개수 상한은 실제로
// 적용을 시작한 세그먼트만 센다(NEO 오래됨·품질 저하·급변 등 가드로 싸게 건너뛴 세그먼트가 자리를 차지하지 않게).
// 시간 예산: 디스패처(maxDuration 60초)는 요청 시작 기준 남은 시간(segmentDailyTimeBudgetMs — 같은 슬롯에서 앞선
// 아침 카드가 쓴 시간을 뺀다)을 넘긴다. 예산은 "새 세그먼트 적용 시작" 판정에만 쓰고, 뒤쪽 쓰기(일별 upsert·last_*
// 묶음 병렬 갱신·보존 삭제)는 남겨 둔 여유(요청 기준 20초) 안에 끝난다.
// 모든 세그먼트가 실행 전 같은 태그 상태를 본다 — A 의 자동 태그를 조건으로 쓰는 B 는 하루 늦게 반영된다(결정적).
// dryRun 은 쓰기 0(태그·일별·세그먼트 행·보존 삭제 전부 건너뜀) — 붙일·뗄 예정 수만 센다.
// 세그먼트 하나의 실패는 그 세그먼트만 failed 로 남기고 다음으로 넘어간다. Compass 에는 아무것도 쓰지 않는다.

export interface CrmSegmentDailyOptions {
  now?: Date
  trigger: SavedSegmentRunTrigger
  /** 이 세그먼트들만(수동 실행) — 없으면 활성 전부 */
  segmentIds?: readonly string[]
  /** 쓰기 0 — 붙일·뗄 예정 수만 */
  dryRun?: boolean
  /**
   * 드라이런 전용 — 자동 태그가 꺼져 있어도 이 설정으로 켰다고 치고 미리본다("켜기 전 미리보기").
   * label 이 없으면 세그먼트에 저장된 라벨을 쓴다.
   */
  simulateAutoTag?: { label?: string | null; untag?: boolean }
  /**
   * 자동 태그 적용 시간 예산(ms, 잡 시작 기준) — 넘으면 남은 세그먼트는 skipped_time_budget. 디스패처(maxDuration 60초)는
   * 요청 시작 기준 남은 시간(segmentDailyTimeBudgetMs)을 넘긴다. 없으면 40초.
   */
  timeBudgetMs?: number
}

export interface CrmSegmentDailySegmentOutcome {
  id: string
  name: string
  readable: boolean
  total: number | null
  bySource: Record<CrmUnifiedCustomerSource, number>
  flags: SegmentQualityFlag[]
  autoTagStatus: SegmentAutoTagStatus
  /** dryRun 이면 붙일 예정 수 */
  tagged: number
  /** dryRun 이면 뗄 예정 수 */
  untagged: number
  failed: number
  /** 쓰기 대상으로 해석하지 못한 회원 키 수 */
  invalid: number
  blockedUntag?: boolean
}

export interface CrmSegmentDailyReport {
  status: "ok" | "partial" | "failed" | "skipped"
  reason?: "not_ready" | "no_segments" | "evaluation_failed"
  trigger: SavedSegmentRunTrigger
  dryRun: boolean
  snapshotDate: string
  /** 일별 기록: written(쓴 행 수) · not_ready(일별 표 미적용) · failed · skipped(dryRun·대상 없음) */
  daily: "written" | "not_ready" | "failed" | "skipped"
  segments: CrmSegmentDailySegmentOutcome[]
  durationMs: number
}

const DEFAULT_TIME_BUDGET_MS = 40_000
/** 세그먼트 행 last_* 갱신 동시성 — 순차 N회면 활성 세그먼트 수에 비례해 뒤쪽 시간이 늘어난다. */
const RUN_STATE_UPDATE_CONCURRENCY = 5

function emptyBySource(): Record<CrmUnifiedCustomerSource, number> {
  return { lead: 0, neo_account: 0, customer: 0, task: 0 }
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "Error"
}

interface EvaluatedSegment {
  segment: SavedSegmentRecord
  filter: CustomerSegmentFilter
  result: CrmSegmentFilterResult
  flags: SegmentQualityFlag[]
  usesNeo: boolean
}

/**
 * 자동 태그 적용 순서 — 지난번 예산 밖으로 밀린 세그먼트 먼저, 그다음 오래 평가 안 된 순, 동률은 생성 순.
 * 적용 루프·실행당 개수 상한·시간 예산 판정이 모두 이 순서를 따른다(밀린 세그먼트가 계속 밀리는 기아 방지).
 */
function autoTagOrder(a: SavedSegmentRecord, b: SavedSegmentRecord) {
  const aDeferred = a.lastRunStatus === "skipped_time_budget" ? 0 : 1
  const bDeferred = b.lastRunStatus === "skipped_time_budget" ? 0 : 1
  if (aDeferred !== bDeferred) return aDeferred - bDeferred
  const aEval = a.lastEvaluatedAt ?? ""
  const bEval = b.lastEvaluatedAt ?? ""
  if (aEval !== bEval) return aEval < bEval ? -1 : 1
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1
}

export async function runCrmSegmentDaily(options: CrmSegmentDailyOptions): Promise<CrmSegmentDailyReport> {
  const startedAt = Date.now()
  const now = options.now ?? new Date()
  const dryRun = options.dryRun === true
  const snapshotDate = kstDateKeyOf(now)
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
  const base = { trigger: options.trigger, dryRun, snapshotDate }
  const finish = (report: Omit<CrmSegmentDailyReport, "trigger" | "dryRun" | "snapshotDate" | "durationMs">) => {
    const full: CrmSegmentDailyReport = { ...base, ...report, durationMs: Date.now() - startedAt }
    console.info("[crm-segment-daily]", {
      status: full.status,
      reason: full.reason,
      trigger: full.trigger,
      dryRun: full.dryRun,
      snapshotDate: full.snapshotDate,
      daily: full.daily,
      segments: full.segments.length,
      applied: full.segments.filter((segment) => segment.autoTagStatus === "applied").length,
      failed: full.segments.filter((segment) => segment.autoTagStatus === "failed").length,
      durationMs: full.durationMs,
    })
    return full
  }

  // 1) 활성 세그먼트 — 표가 없으면 skipped(not_ready). "미설정"과 "실패"를 구분한다(운영 지침).
  let segments: SavedSegmentRecord[]
  try {
    segments = await listActiveSavedSegmentsForRun(options.segmentIds)
  } catch (error) {
    if (error instanceof SavedSegmentsNotReadyError) {
      return finish({ status: "skipped", reason: "not_ready", daily: "skipped", segments: [] })
    }
    throw error
  }
  if (segments.length === 0) return finish({ status: "skipped", reason: "no_segments", daily: "skipped", segments: [] })

  const simulate = dryRun ? options.simulateAutoTag : undefined
  const autoTagConfig = (segment: SavedSegmentRecord) => ({
    enabled: simulate ? true : segment.autoTagEnabled,
    label: (simulate?.label !== undefined && simulate.label !== null ? simulate.label : segment.autoTagLabel) ?? null,
    untag: simulate?.untag ?? segment.autoUntag,
  })

  // 2) 일괄 평가 — 읽을 수 있는 세그먼트만.
  const parsed = segments.map((segment) => ({ segment, read: readStoredSegmentFilter(segment.spec, segment.specVersion) }))
  const readable = parsed.filter(
    (entry): entry is { segment: SavedSegmentRecord; read: { readable: true; filter: CustomerSegmentFilter } } =>
      entry.read.readable
  )
  let batch: Awaited<ReturnType<typeof evaluateCrmSegmentFilters>> | null = null
  if (readable.length > 0) {
    try {
      batch = await evaluateCrmSegmentFilters(
        readable.map((entry) => entry.read.filter),
        { now: options.now, bypassCache: true }
      )
    } catch (error) {
      console.error("[crm-segment-daily] 평가 실패", errorName(error))
      return finish({ status: "failed", reason: "evaluation_failed", daily: "skipped", segments: [] })
    }
  }

  // 3) 품질 플래그.
  const neoStale = batch ? isSyncStale(batch.sources.neoLatestSyncedAt, DAILY_SYNC_STALE_AFTER_HOURS, now.getTime()) : true
  const sourceIncomplete = batch ? !batch.sources.complete || !batch.sources.tagsOk : true
  const evaluated: EvaluatedSegment[] = readable.map((entry, index) => {
    const result = batch!.results[index]
    const usesNeo = segmentFilterUsesNeoSignals(entry.read.filter)
    const flags: SegmentQualityFlag[] = []
    if (segmentFilterUsesContact(entry.read.filter)) {
      if (batch!.meta.compass === "down") flags.push("compass_down")
      else if (batch!.meta.compass === "partial") flags.push("compass_partial")
    }
    if (sourceIncomplete) flags.push("source_incomplete")
    if (usesNeo && neoStale) flags.push("neo_stale")
    if (result.truncated) flags.push("truncated")
    return { segment: entry.segment, filter: entry.read.filter, result, flags, usesNeo }
  })

  // 급변 가드 입력 — 직전 일별 기록(같은 조건). 일별 표가 없으면 가드 입력 없음(null). 직전 기록이 전부 품질
  // 저하(복구 첫날)면 degradedOnly 로 하루 보류한다(segmentSpikeBaseline).
  let dailyTableReady = true
  const baselineById = new Map<string, SegmentSpikeBaseline>()
  if (evaluated.length > 0) {
    try {
      const listed = await listSavedSegmentDailyPoints(
        evaluated.map((entry) => entry.segment.id),
        addDaysToDateKey(snapshotDate, -SEGMENT_SPIKE_LOOKBACK_DAYS)
      )
      if (!listed.available) dailyTableReady = false
      for (const entry of evaluated) {
        const points = listed.points
          .filter((point) => point.segmentId === entry.segment.id)
          .map((point) => ({ date: point.snapshotDate, total: point.total, specHash: point.specHash, flags: point.flags }))
        baselineById.set(entry.segment.id, segmentSpikeBaseline(points, entry.segment.specHash, snapshotDate))
      }
    } catch (error) {
      // 직전 기록을 못 읽으면 급변 가드를 믿을 수 없다 — 자동 태그 세그먼트는 원천 미완성으로 멈춘다.
      console.warn("[crm-segment-daily] 직전 일별 기록 조회 실패", errorName(error))
      for (const entry of evaluated) {
        if (!entry.flags.includes("source_incomplete")) entry.flags.push("source_incomplete")
      }
    }
  }

  // 4) 자동 태그 — 평가한 세그먼트는 전부 결과 행을 먼저 만들고(꺼진 세그먼트는 off 그대로), 켜진 세그먼트만
  // autoTagOrder 순서로 실행당 상한·시간 예산 안에서 적용한다.
  const outcomes = new Map<string, CrmSegmentDailySegmentOutcome>()
  for (const entry of evaluated) {
    outcomes.set(entry.segment.id, {
      id: entry.segment.id,
      name: entry.segment.name,
      readable: true,
      total: entry.result.total,
      bySource: entry.result.bySource,
      flags: entry.flags,
      autoTagStatus: "off",
      tagged: 0,
      untagged: 0,
      failed: 0,
      invalid: 0,
    })
  }
  const autoTagCandidates = evaluated
    .filter((entry) => autoTagConfig(entry.segment).enabled)
    .sort((a, b) => autoTagOrder(a.segment, b.segment))

  // 실행당 개수 상한은 실제로 적용을 시작한 세그먼트 수로 센다(후보 순번이 아니라).
  let applyStarted = 0
  for (const entry of autoTagCandidates) {
    const config = autoTagConfig(entry.segment)
    const outcome = outcomes.get(entry.segment.id)!

    const overBudget = applyStarted >= AUTO_TAG_MAX_SEGMENTS_PER_RUN || Date.now() - startedAt > timeBudgetMs
    const baseline = baselineById.get(entry.segment.id)
    const decision = decideAutoTag({
      enabled: true,
      readable: true,
      usesNeoSignals: entry.usesNeo,
      flags: entry.flags,
      total: entry.result.total,
      truncated: entry.result.truncated,
      previousTotal: baseline?.previousTotal ?? null,
      previousDegradedOnly: baseline?.degradedOnly ?? false,
      overBudget,
    })
    if (decision !== "apply") {
      outcome.autoTagStatus = decision
      continue
    }
    if (!config.label) {
      // 켜져 있는데 라벨이 없다(드라이런 미리보기에서 라벨을 안 넘긴 경우) — 붙일 수 없다.
      outcome.autoTagStatus = "off"
      continue
    }
    applyStarted += 1

    try {
      const targets: CrmBulkTagTarget[] = []
      for (const key of entry.result.keys) {
        const target = parseUnifiedCustomerTargetKey(key)
        if (target) targets.push(target)
      }
      outcome.invalid = entry.result.keys.length - targets.length
      const marker = segmentAutoTagMarker(entry.segment.id)
      // 떼기 계획은 붙이기 전에 — 상한 분모 = 이번 실행 전 이 세그먼트가 붙여 둔 마커 행 수. 붙이기 뒤에 읽으면 방금
      // 붙인 행까지 분모에 들어가 50% 가드가 무력화되고, 붙이기를 하지 않는 드라이런과 막힘 판정이 달라진다.
      // 실제 지우기(apply)는 붙이기 뒤(라벨을 바꾼 회원이 새 라벨 없이 비는 순간이 없게).
      const removalPlan = config.untag
        ? await planSegmentAutoTagRemovals({
            marker,
            label: config.label,
            keepStorageKeys: new Set(targets.map(unifiedCustomerStorageKey)),
            limitFor: segmentUntagLimit,
          })
        : null
      if (dryRun) {
        outcome.tagged = (await previewCustomerTagForTargets(targets, config.label)).wouldApply
      } else {
        const added = await addCustomerTagToTargets(targets, config.label, marker)
        outcome.tagged = added.applied
        outcome.failed += added.failed.length
      }
      if (removalPlan) {
        if (removalPlan.blocked) {
          outcome.blockedUntag = true
        } else if (dryRun) {
          outcome.untagged = removalPlan.candidates
        } else {
          const removal = await removalPlan.apply()
          outcome.untagged = removal.removed
          outcome.failed += removal.failed
        }
      }
      outcome.autoTagStatus = autoTagResultStatus(outcome)
    } catch (error) {
      console.error("[crm-segment-daily] 자동 태그 실패", entry.segment.id, errorName(error))
      outcome.autoTagStatus = "failed"
      outcome.failed = Math.max(outcome.failed, 1)
    }
  }

  // 읽을 수 없는 조건(새 판) — 평가하지 않는다. 자동 태그가 켜져 있으면 skipped_unreadable.
  for (const entry of parsed) {
    if (entry.read.readable) continue
    outcomes.set(entry.segment.id, {
      id: entry.segment.id,
      name: entry.segment.name,
      readable: false,
      total: null,
      bySource: emptyBySource(),
      flags: [],
      autoTagStatus: autoTagConfig(entry.segment).enabled ? "skipped_unreadable" : "off",
      tagged: 0,
      untagged: 0,
      failed: 0,
      invalid: 0,
    })
  }
  const ordered = segments.map((segment) => outcomes.get(segment.id)).filter((outcome): outcome is CrmSegmentDailySegmentOutcome => Boolean(outcome))
  const anyFailed = ordered.some((outcome) => outcome.autoTagStatus === "failed" || outcome.autoTagStatus === "partial")

  if (dryRun) {
    return finish({ status: anyFailed ? "partial" : "ok", daily: "skipped", segments: ordered })
  }

  // 5) 일별 행 — 건수는 품질 플래그와 함께 항상 기록한다(자동 태그 여부와 무관).
  const evaluatedAt = now.toISOString()
  let daily: CrmSegmentDailyReport["daily"] = "skipped"
  if (evaluated.length > 0) {
    if (!dailyTableReady) {
      daily = "not_ready"
    } else {
      const rows: SavedSegmentDailyUpsert[] = evaluated.map((entry) => {
        const outcome = outcomes.get(entry.segment.id)!
        return {
          segmentId: entry.segment.id,
          snapshotDate,
          total: entry.result.total,
          leadCount: entry.result.bySource.lead,
          neoAccountCount: entry.result.bySource.neo_account,
          customerCount: entry.result.bySource.customer,
          specHash: entry.segment.specHash,
          flags: entry.flags,
          autoTagStatus: outcome.autoTagStatus,
          tagged: outcome.tagged,
          untagged: outcome.untagged,
          tagFailed: outcome.failed,
          runTrigger: options.trigger,
          evaluatedAt,
        }
      })
      const written = await upsertSavedSegmentDailyRows(rows)
      daily = written.ok ? "written" : written.reason === "not_ready" ? "not_ready" : "failed"
    }
  }

  // 6) 세그먼트 행 실행 결과 — RUN_STATE_UPDATE_CONCURRENCY 개씩 묶어 병렬(뒤쪽 시간을 활성 세그먼트 수에 덜 묶이게).
  // 실패는 그 세그먼트만 로그.
  let stateFailed = false
  for (let index = 0; index < ordered.length; index += RUN_STATE_UPDATE_CONCURRENCY) {
    const chunk = ordered.slice(index, index + RUN_STATE_UPDATE_CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map((outcome) =>
        updateSavedSegmentRunState(outcome.id, {
          lastCount: outcome.total,
          lastEvaluatedAt: evaluatedAt,
          lastRunStatus: outcome.autoTagStatus,
          lastRunDetail: {
            tagged: outcome.tagged,
            untagged: outcome.untagged,
            failed: outcome.failed,
            invalid: outcome.invalid,
            flags: outcome.flags,
            ...(outcome.blockedUntag ? { blockedUntag: true } : {}),
          },
        })
      )
    )
    settled.forEach((result, offset) => {
      if (result.status === "fulfilled") return
      stateFailed = true
      console.error("[crm-segment-daily] 실행 결과 갱신 실패", chunk[offset].id, errorName(result.reason))
    })
  }

  // 7) 보존 삭제 — 크론에서만(수동 실행은 건너뛴다).
  if (options.trigger === "cron" && dailyTableReady) {
    await deleteSavedSegmentDailyBefore(addDaysToDateKey(snapshotDate, -SEGMENT_DAILY_RETENTION_DAYS))
  }

  const status = anyFailed || stateFailed || daily === "failed" ? "partial" : "ok"
  return finish({ status, daily, segments: ordered })
}
