import { readFileSync } from "node:fs"
import { join } from "node:path"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SyncHealthBanner } from "@/components/admin/SyncHealthBanner"
import {
  classifySyncFailure,
  collapseNeoSyncAttempts,
  computeBranchSourceHealth,
  computeNeoSyncHealth,
  describeSyncSourceHealth,
  unknownSyncSourceHealth,
  type BranchSyncRunRow,
  type NeoSyncRunRow,
  type SyncSourceHealth,
} from "@/lib/admin/sync-health"

// 동기화 건강 읽기 모델(W7) — 2026-09-24 운영 실측 두 사고를 그대로 재현해 판정·문구를 고정한다.
//  1) NEO 읽기 크론이 06-22부터 매번 env 누락으로 건너뜀(자동 성공 0회), 마지막 수동 성공 08-28.
//  2) KR Team 시트(REV·DSH·KPI) 동기화가 시트 권한 오류로 계속 실패, 마지막 성공 08-18. HW는 정상.
// 원문 오류·키 값이 화면 문구로 새지 않는지도 함께 본다.

const NOW = Date.parse("2026-09-24T03:00:00.000Z") // KST 09-24 12:00
const DAY = 86_400_000

const read = (relPath: string) => readFileSync(join(process.cwd(), relPath), "utf8").replace(/\r\n/g, "\n")

function iso(ms: number) {
  return new Date(ms).toISOString()
}

// ─── fixtures ───────────────────────────────────────────────────

function neoCronSkip(dayOffset: number): NeoSyncRunRow {
  const at = iso(Date.parse("2026-09-24T01:00:00.000Z") - dayOffset * DAY)
  return {
    object_api_key: "all",
    status: "skipped",
    trigger: "cron",
    started_at: at,
    finished_at: at,
    error: "Missing Xiaoshouyi base URL",
  }
}

const NEO_MANUAL_SUCCESS: NeoSyncRunRow = {
  object_api_key: "__sync_lock__",
  status: "success",
  trigger: "manual",
  started_at: "2026-08-28T02:00:00.000Z",
  finished_at: "2026-08-28T02:05:00.000Z",
  error: null,
}

function branchRun(dayOffset: number, status: "success" | "failed", error: string | null, trigger = "cron"): BranchSyncRunRow {
  return {
    started_at: iso(Date.parse("2026-09-24T08:00:00.000Z") - dayOffset * DAY),
    status,
    error,
    source: "all",
    trigger,
  }
}

const SHEET_PERMISSION = "rev: The caller does not have permission"

// ─── 사유 분류 ──────────────────────────────────────────────────

describe("classifySyncFailure — 원문 대신 분류·고정 힌트", () => {
  it("NEO env 누락(base URL / 토큰)을 설정 누락으로, 힌트를 구분한다", () => {
    expect(classifySyncFailure("neo", "Missing Xiaoshouyi base URL")).toEqual({
      failureClass: "config",
      failureHint: "neo_base_url",
    })
    expect(classifySyncFailure("neo", "Missing Xiaoshouyi access token or service credentials")).toEqual({
      failureClass: "config",
      failureHint: "neo_credentials",
    })
  })

  it("시트 권한·공유 끊김은 권한 오류 + 시트 재공유 힌트(크론 알림 isPermissionError와 같은 판정)", () => {
    expect(classifySyncFailure("sheets", SHEET_PERMISSION)).toEqual({ failureClass: "permission", failureHint: "sheet_share" })
    expect(classifySyncFailure("hw", "hw: PERMISSION_DENIED")).toEqual({ failureClass: "permission", failureHint: "sheet_share" })
    expect(classifySyncFailure("sheets", "rev: invalid_grant: Invalid JWT Signature.")).toEqual({
      failureClass: "permission",
      failureHint: "sheet_credentials",
    })
  })

  it("시트 env 누락·네트워크·기타", () => {
    expect(classifySyncFailure("sheets", "rev: Missing env: GOOGLE_BRANCH_DASHBOARD_SHEET_ID")).toEqual({
      failureClass: "config",
      failureHint: "sheet_env",
    })
    expect(classifySyncFailure("neo", "fetch failed: ECONNRESET")).toEqual({ failureClass: "network", failureHint: null })
    expect(classifySyncFailure("sheets", "rev: 503 Service Unavailable")).toEqual({ failureClass: "network", failureHint: null })
    expect(classifySyncFailure("neo", "One or more Xiaoshouyi objects failed to sync")).toEqual({
      failureClass: "other",
      failureHint: null,
    })
    expect(classifySyncFailure("neo", null)).toEqual({ failureClass: "other", failureHint: null })
  })
})

// ─── NEO ────────────────────────────────────────────────────────

describe("computeNeoSyncHealth — 자동 동기화 env 누락 + 마지막 수동 성공", () => {
  const rows: NeoSyncRunRow[] = [...Array.from({ length: 27 }, (_, index) => neoCronSkip(index)), NEO_MANUAL_SUCCESS]

  it("멈춘 동기화를 failing으로, 마지막 성공은 수동 08-28로 판정한다", () => {
    const health = computeNeoSyncHealth(rows, NEO_MANUAL_SUCCESS, NOW)
    expect(health).toMatchObject({
      source: "neo",
      state: "failing",
      lastSuccessAt: "2026-08-28T02:05:00.000Z",
      lastSuccessTrigger: "manual",
      lastAttemptOutcome: "skipped",
      lastAttemptTrigger: "cron",
      failureClass: "config",
      failureHint: "neo_base_url",
      consecutiveFailures: 27,
      consecutiveFailureDays: 27,
      failuresTruncated: false,
      autoSucceededInWindow: false,
    })
  })

  it("띠 문구: 무엇이 멈췄고 · 언제 값이며 · 누가 무엇을 하면 풀리는지", () => {
    const copy = describeSyncSourceHealth(computeNeoSyncHealth(rows, NEO_MANUAL_SUCCESS, NOW), NOW)!
    expect(copy.tone).toBe("danger")
    expect(copy.headline).toBe("NEO 자동 동기화가 설정되지 않음(env 누락)")
    expect(copy.asOf).toBe("마지막 수동 동기화 08-28(27일 전) · 이 화면의 NEO 수치는 그 시점 값")
    expect(copy.action).toContain("운영 env XIAOSHOUYI_BASE_URL 설정 필요")
    expect(copy.details.join(" ")).toContain("자동(크론) 실행이 한 번도 성공하지 않음")
    // 원문 오류 문자열은 싣지 않는다
    expect(JSON.stringify(copy)).not.toContain("Missing Xiaoshouyi base URL")
  })

  it("창 안에 성공이 없으면 연속 실패를 '이상'으로 표시하고, 창 밖 마지막 성공은 별도 조회값을 쓴다", () => {
    const onlySkips = Array.from({ length: 5 }, (_, index) => neoCronSkip(index))
    const health = computeNeoSyncHealth(onlySkips, NEO_MANUAL_SUCCESS, NOW)
    expect(health.failuresTruncated).toBe(true)
    expect(health.lastSuccessAt).toBe("2026-08-28T02:05:00.000Z")
    expect(describeSyncSourceHealth(health, NOW)!.details.join(" ")).toContain("5회 이상")
  })

  it("토큰 누락 경로의 코디네이터 건너뜀 + 'all' 건너뜀은 한 시도로 접고, 진행 중·객체별 행은 세지 않는다", () => {
    const coordinator: NeoSyncRunRow = {
      object_api_key: "__sync_lock__",
      status: "skipped",
      trigger: "cron",
      started_at: "2026-09-23T01:00:00.000Z",
      finished_at: "2026-09-23T01:00:03.000Z",
      error: "Missing Xiaoshouyi access token or service credentials",
    }
    const duplicate: NeoSyncRunRow = { ...coordinator, object_api_key: "all", started_at: "2026-09-23T01:00:03.000Z" }
    const running: NeoSyncRunRow = { ...coordinator, status: "running", started_at: "2026-09-24T01:00:00.000Z" }
    const objectRow: NeoSyncRunRow = { ...coordinator, object_api_key: "account", status: "failed", started_at: "2026-09-22T01:00:00.000Z" }

    const attempts = collapseNeoSyncAttempts([duplicate, coordinator, running, objectRow])
    expect(attempts).toHaveLength(1)
    expect(attempts[0].object_api_key).toBe("__sync_lock__")

    const health = computeNeoSyncHealth([duplicate, coordinator, running, objectRow], null, NOW)
    expect(health.consecutiveFailures).toBe(1)
    expect(health.failureHint).toBe("neo_credentials")
    expect(health.lastSuccessAt).toBeNull()
    expect(describeSyncSourceHealth(health, NOW)!.asOf).toContain("기준 시점을 알 수 없음")
  })

  it("매일 자동 성공 중이면 ok — 띠를 그리지 않는다", () => {
    const success: NeoSyncRunRow = {
      object_api_key: "__sync_lock__",
      status: "success",
      trigger: "cron",
      started_at: "2026-09-24T01:00:00.000Z",
      finished_at: "2026-09-24T01:04:00.000Z",
      error: null,
    }
    const health = computeNeoSyncHealth([success], success, NOW)
    expect(health.state).toBe("ok")
    expect(health.autoSucceededInWindow).toBe(true)
    expect(describeSyncSourceHealth(health, NOW)).toBeNull()
  })

  it("심각도는 실패 일수(KST) — 같은 날 크론 실패 + 수동 재시도 실패는 warning, 이틀째 실패부터 danger", () => {
    // 어제(KST 09-23 10:00) 자동 성공 → 오늘(KST 09-24) 크론 실패 + 같은 날 수동 재시도 실패.
    const yesterdaySuccess: NeoSyncRunRow = {
      object_api_key: "__sync_lock__",
      status: "success",
      trigger: "cron",
      started_at: "2026-09-23T01:00:00.000Z",
      finished_at: "2026-09-23T01:04:00.000Z",
      error: null,
    }
    const cronFail: NeoSyncRunRow = {
      ...yesterdaySuccess,
      status: "failed",
      started_at: "2026-09-24T01:00:00.000Z",
      finished_at: "2026-09-24T01:03:00.000Z",
      error: "fetch failed: ECONNRESET",
    }
    const manualRetryFail: NeoSyncRunRow = {
      ...cronFail,
      trigger: "manual",
      started_at: "2026-09-24T02:30:00.000Z",
      finished_at: "2026-09-24T02:31:00.000Z",
    }
    const sameDay = computeNeoSyncHealth([manualRetryFail, cronFail, yesterdaySuccess], yesterdaySuccess, NOW)
    expect(sameDay.consecutiveFailures).toBe(2)
    expect(sameDay.consecutiveFailureDays).toBe(1)
    expect(describeSyncSourceHealth(sameDay, NOW)!.tone).toBe("warning")

    // 전날(KST 09-23)에도 실패했다면 이틀째 — danger. 마지막 성공(09-22)은 48시간 안이라 longStale 아님.
    const twoDaysAgoSuccess: NeoSyncRunRow = {
      ...yesterdaySuccess,
      started_at: "2026-09-22T04:00:00.000Z",
      finished_at: "2026-09-22T04:04:00.000Z",
    }
    const yesterdayFail: NeoSyncRunRow = { ...cronFail, started_at: "2026-09-23T01:00:00.000Z", finished_at: "2026-09-23T01:03:00.000Z" }
    const twoDays = computeNeoSyncHealth([cronFail, yesterdayFail, twoDaysAgoSuccess], twoDaysAgoSuccess, NOW)
    expect(twoDays.consecutiveFailures).toBe(2)
    expect(twoDays.consecutiveFailureDays).toBe(2)
    expect(describeSyncSourceHealth(twoDays, NOW)!.tone).toBe("danger")
  })
})

// ─── KR Team 시트·HW ────────────────────────────────────────────

describe("computeBranchSourceHealth — 시트 권한 오류(REV) + HW 정상", () => {
  // 08-18 마지막 성공 이후 매일 rev 권한 실패, hw는 같은 런에서 성공(오류에 rev 세그먼트만 있음).
  const runs: BranchSyncRunRow[] = [
    ...Array.from({ length: 20 }, (_, index) => branchRun(index, "failed", SHEET_PERMISSION)),
    branchRun(20, "failed", SHEET_PERMISSION, "manual"),
    { ...branchRun(37, "success", null), started_at: "2026-08-18T08:00:00.000Z" },
  ]

  it("sheets는 권한 오류 failing, hw는 ok(같은 런의 다른 원천 실패를 자기 실패로 세지 않는다)", () => {
    const sheets = computeBranchSourceHealth(runs, "sheets", NOW)
    expect(sheets).toMatchObject({
      source: "sheets",
      state: "failing",
      lastSuccessAt: "2026-08-18T08:00:00.000Z",
      lastSuccessTrigger: "cron",
      lastAttemptOutcome: "failed",
      failureClass: "permission",
      failureHint: "sheet_share",
      consecutiveFailures: 21,
      consecutiveFailureDays: 21,
      failuresTruncated: false,
    })
    const hw = computeBranchSourceHealth(runs, "hw", NOW)
    expect(hw.state).toBe("ok")
    expect(hw.consecutiveFailures).toBe(0)
  })

  it("띠 문구는 시트 재공유를 안내하고 원문 오류를 싣지 않는다", () => {
    const copy = describeSyncSourceHealth(computeBranchSourceHealth(runs, "sheets", NOW), NOW)!
    expect(copy.tone).toBe("danger")
    expect(copy.headline).toBe("KR Team 시트(REV·DSH·KPI) 동기화가 권한 오류로 21회 연속 실패")
    expect(copy.asOf).toBe("마지막 자동 동기화 08-18(37일 전) · 이 화면의 시트(REV·DSH·KPI) 수치는 그 시점 값")
    expect(copy.action).toBe("시트 공유 권한 확인 필요 — 시트 소유자가 서비스 계정에 뷰어로 다시 공유")
    expect(JSON.stringify(copy)).not.toContain("does not have permission")
  })

  it("실패 없이 마지막 성공이 36시간을 넘으면 stale(크론 미실행), 기록이 전혀 없어도 stale", () => {
    const old = computeBranchSourceHealth([branchRun(3, "success", null)], "hw", NOW)
    expect(old.state).toBe("stale")
    expect(describeSyncSourceHealth(old, NOW)!.headline).toContain("돌지 않음")

    const empty = computeBranchSourceHealth([], "hw", NOW)
    expect(empty.state).toBe("stale")
    expect(describeSyncSourceHealth(empty, NOW)!.headline).toBe("하드웨어 시트 동기화 기록 없음")
  })

  it("실패 일수(KST) 기준 — 하루 실패는 같은 날 수동 재시도가 더 실패해도 warning, 이틀째부터 danger", () => {
    const oneFail = computeBranchSourceHealth(
      [branchRun(0, "failed", "rev: fetch failed"), branchRun(1, "success", null)],
      "sheets",
      NOW
    )
    expect(describeSyncSourceHealth(oneFail, NOW)!.tone).toBe("warning")

    // 크론 실패(KST 09-24 17:00) 뒤 같은 날 수동 재시도(KST 09-24 17:40)도 실패 — 런은 2회지만 하루다.
    const cronFail = branchRun(0, "failed", "rev: fetch failed")
    const manualRetry: BranchSyncRunRow = {
      ...branchRun(0, "failed", "rev: fetch failed", "manual"),
      started_at: iso(Date.parse(cronFail.started_at) + 40 * 60_000),
    }
    const sameDay = computeBranchSourceHealth([manualRetry, cronFail, branchRun(1, "success", null)], "sheets", NOW)
    expect(sameDay.consecutiveFailures).toBe(2)
    expect(sameDay.consecutiveFailureDays).toBe(1)
    expect(describeSyncSourceHealth(sameDay, NOW)!.tone).toBe("warning")

    // 전날에도 실패했다면 이틀째 — 마지막 성공(2일 전)은 48시간 안이라 longStale 없이 일수만으로 danger.
    const twoDays = computeBranchSourceHealth(
      [branchRun(0, "failed", "rev: fetch failed"), branchRun(1, "failed", "rev: fetch failed"), {
        ...branchRun(2, "success", null),
        started_at: iso(NOW - 40 * 3_600_000),
      }],
      "sheets",
      NOW
    )
    expect(twoDays.consecutiveFailureDays).toBe(2)
    expect(describeSyncSourceHealth(twoDays, NOW)!.tone).toBe("danger")
  })
})

// ─── 실행 기록의 원천(source) — REV만 새로고침한 런이 HW 실패를 지우지 않는다 ─────────

describe("computeBranchSourceHealth — 한 원천만 돌린 런은 다른 원천 판정에서 건너뛴다", () => {
  // HW가 이틀째(KST 09-23·09-24) 크론에서 실패 중인데, 매일 크론 뒤 매출 장부에서 REV만 새로고침
  // (source="rev")해 성공했다. 예전에는 모든 런이 "all"이라 이 REV 성공이 HW 성공으로 읽혔다.
  const HW_TIMEOUT = "hw: 503 Service Unavailable"
  const revOnlyRefresh = (atIso: string, status: "success" | "failed", error: string | null): BranchSyncRunRow => ({
    started_at: atIso,
    status,
    error,
    source: "rev",
    trigger: "manual",
  })
  const runs: BranchSyncRunRow[] = [
    revOnlyRefresh("2026-09-24T10:00:00.000Z", "success", null), // KST 09-24 19:00 — 오늘 크론 뒤 REV만
    branchRun(0, "failed", HW_TIMEOUT), // KST 09-24 17:00 cron all — HW 실패
    revOnlyRefresh("2026-09-23T10:00:00.000Z", "success", null), // KST 09-23 19:00 — 어제 크론 뒤 REV만
    branchRun(1, "failed", HW_TIMEOUT), // KST 09-23 17:00 cron all — HW 실패
    branchRun(2, "success", null), // KST 09-22 17:00 cron all 성공
  ]

  it("HW는 이틀째 실패(danger) 그대로, REV 새로고침 성공이 HW 연속 실패를 0으로 만들지 않는다", () => {
    const hw = computeBranchSourceHealth(runs, "hw", NOW)
    expect(hw.state).toBe("failing")
    expect(hw.consecutiveFailures).toBe(2)
    expect(hw.consecutiveFailureDays).toBe(2)
    expect(hw.lastSuccessAt).toBe(branchRun(2, "success", null).started_at)
    expect(describeSyncSourceHealth(hw, NOW)!.tone).toBe("danger")

    // REV(시트)는 all 런에서 자기 실패가 없고 rev 단독 런이 성공 — 정상.
    const sheets = computeBranchSourceHealth(runs, "sheets", NOW)
    expect(sheets.consecutiveFailures).toBe(0)
  })

  it("REV만 돌린 런의 실패(접두사 없는 오류 포함)는 HW 판정에 들어가지 않는다", () => {
    const revOnlyFailure = revOnlyRefresh("2026-09-24T10:00:00.000Z", "failed", "connection reset")
    const hw = computeBranchSourceHealth([revOnlyFailure, branchRun(1, "success", null)], "hw", NOW)
    expect(hw.consecutiveFailures).toBe(0)
    const sheets = computeBranchSourceHealth([revOnlyFailure, branchRun(1, "success", null)], "sheets", NOW)
    expect(sheets.consecutiveFailures).toBe(1)
  })

  it("옛 기록(source='all')은 예전 해석 그대로 — 성공한 all 런은 두 원천 모두의 성공", () => {
    const legacy = [branchRun(0, "success", null), branchRun(1, "failed", HW_TIMEOUT)]
    expect(computeBranchSourceHealth(legacy, "hw", NOW).consecutiveFailures).toBe(0)
    expect(computeBranchSourceHealth(legacy, "sheets", NOW).consecutiveFailures).toBe(0)
  })
})

// ─── 확인 불가 ──────────────────────────────────────────────────

describe("조회 실패 = 확인 불가(정상인 척하지 않음)", () => {
  it("unknown은 중립 톤 한 줄, 조치 없음", () => {
    const copy = describeSyncSourceHealth(unknownSyncSourceHealth("neo"), NOW)!
    expect(copy.tone).toBe("neutral")
    expect(copy.headline).toBe("NEO CRM 읽기 동기화 상태 확인 불가")
    expect(copy.action).toBeNull()
  })
})

// ─── 표시 컴포넌트 ──────────────────────────────────────────────

describe("SyncHealthBanner — 정적 마크업", () => {
  const okHealth: SyncSourceHealth = {
    ...unknownSyncSourceHealth("hw"),
    state: "ok",
    lastSuccessAt: "2026-09-24T02:00:00.000Z",
    lastSuccessTrigger: "cron",
    lastAttemptAt: "2026-09-24T02:00:00.000Z",
    lastAttemptOutcome: "success",
    lastAttemptTrigger: "cron",
    autoSucceededInWindow: true,
  }

  it("전부 정상이면 banner는 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(createElement(SyncHealthBanner, { sources: [okHealth], nowMs: NOW }))).toBe("")
  })

  it("멈춘 원천이 있으면 가장 심각한 톤으로 한 줄 + 자세히를 그린다", () => {
    const neo = computeNeoSyncHealth([neoCronSkip(0), neoCronSkip(1), NEO_MANUAL_SUCCESS], NEO_MANUAL_SUCCESS, NOW)
    const html = renderToStaticMarkup(createElement(SyncHealthBanner, { sources: [neo, okHealth], nowMs: NOW }))
    expect(html).toContain('data-sync-health-tone="danger"')
    expect(html).toContain("NEO 자동 동기화가 설정되지 않음(env 누락)")
    expect(html).toContain("XIAOSHOUYI_BASE_URL")
    expect(html).toContain("<details")
    expect(html).toContain('href="/admin/ops"')
    // DESIGN.md Danger 틴트·보더
    expect(html).toContain("bg-[#FCE9E9]")
    expect(html).toContain("border-[#F2B8B8]")
    // 정상 원천(hw)은 banner에 나오지 않는다
    expect(html).not.toContain("하드웨어 시트")
    expect(html).not.toContain("Missing Xiaoshouyi")
  })

  it("확인 불가만 있으면 틴트 없는 중립 캡션", () => {
    const html = renderToStaticMarkup(
      createElement(SyncHealthBanner, { sources: [unknownSyncSourceHealth("sheets")], nowMs: NOW })
    )
    expect(html).toContain('data-sync-health-tone="neutral"')
    expect(html).toContain("상태 확인 불가")
    expect(html).not.toContain("bg-[#FCE9E9]")
  })

  it("summary는 정상 원천도 조용한 한 줄로 보여 준다(운영 상태 화면)", () => {
    const html = renderToStaticMarkup(
      createElement(SyncHealthBanner, { sources: [okHealth], nowMs: NOW, variant: "summary", hideOpsLink: true })
    )
    expect(html).toContain("원천 동기화")
    expect(html).toContain("하드웨어 시트")
    expect(html).toContain("정상 · 마지막 성공 09-24 11:00(자동, 1시간 전)")
  })
})

// ─── 조회(서버) ─────────────────────────────────────────────────

const loaderMocks = vi.hoisted(() => ({
  listRecentSyncRunsFresh: vi.fn(),
  from: vi.fn(),
}))

vi.mock("@/lib/repositories/branch-sync", () => ({
  listRecentSyncRunsFresh: loaderMocks.listRecentSyncRunsFresh,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: loaderMocks.from }),
}))

function neoQuery(result: { data: unknown[] | null; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in", "order"]) chain[method] = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve(result))
  return chain
}

describe("loadSyncHealthReport — 실패는 원천별 확인 불가, 던지지 않는다", () => {
  beforeEach(() => {
    loaderMocks.listRecentSyncRunsFresh.mockReset()
    loaderMocks.from.mockReset()
  })

  it("NEO·시트 조회를 합쳐 요청 순서대로 돌려준다", async () => {
    loaderMocks.from.mockImplementation(() => neoQuery({ data: [NEO_MANUAL_SUCCESS], error: null }))
    loaderMocks.listRecentSyncRunsFresh.mockResolvedValue([branchRun(0, "failed", SHEET_PERMISSION), branchRun(1, "success", null)])
    const { loadSyncHealthReport } = await import("@/lib/admin/sync-health-server")

    const report = await loadSyncHealthReport(["sheets", "neo"], new Date(NOW))
    expect(report.sources.map((source) => source.source)).toEqual(["sheets", "neo"])
    expect(report.sources[0].failureHint).toBe("sheet_share")
    expect(loaderMocks.listRecentSyncRunsFresh).toHaveBeenCalledWith(60)
  })

  it("branch_sync_runs는 캐시를 거치지 않고 읽는다 — 동기화 성공 직후 첫 새로고침에 실패 띠가 남지 않게", () => {
    // finishSyncRun의 revalidateTag(…, "max")는 SWR이라 캐시판(getRecentSyncRuns)은 직전 런을 한 번 더 보여 준다.
    const server = read("lib/admin/sync-health-server.ts")
    expect(server).toContain("listRecentSyncRunsFresh(SYNC_HEALTH_RUN_WINDOW)")
    expect(server).not.toMatch(/\bgetRecentSyncRuns\s*\(/)
  })

  it("조회 오류면 해당 원천만 unknown", async () => {
    loaderMocks.from.mockImplementation(() => neoQuery({ data: null, error: { code: "42P01", message: "relation missing" } }))
    loaderMocks.listRecentSyncRunsFresh.mockRejectedValue(Object.assign(new Error("boom"), { code: "57014" }))
    const { loadSyncHealthReport } = await import("@/lib/admin/sync-health-server")

    const report = await loadSyncHealthReport(["neo", "sheets", "hw"], new Date(NOW))
    expect(report.sources.map((source) => source.state)).toEqual(["unknown", "unknown", "unknown"])
  })
})

// ─── 장착 계약(소스) ────────────────────────────────────────────

describe("경고 띠 장착 — 페이지 셸이 별도 Suspense로 얹는다(첫 바이트를 기다리지 않음)", () => {
  const cases: Array<[string, string]> = [
    ["app/admin/branch/page.tsx", 'sources={["sheets", "hw"]}'],
    ["app/admin/branch/ledger/page.tsx", 'sources={["sheets"]}'],
    ["app/admin/crm/customers/accounts/page.tsx", 'sources={["neo"]}'],
    ["app/admin/crm/deals/rev-sheet/layout.tsx", 'sources={["sheets"]}'],
    ["app/admin/crm/matching/page.tsx", 'sources={["neo", "sheets"]}'],
    ["app/admin/ops/page.tsx", 'variant="summary"'],
  ]

  it.each(cases)("%s", (path, needle) => {
    const source = read(path)
    expect(source).toContain(needle)
    expect(source).toMatch(/<Suspense fallback=\{null\}>\s*<SyncHealthBannerServer/)
  })

  it("표시 컴포넌트는 서버 전용 모듈을 불러오지 않는다(서버·클라 어디서든 렌더)", () => {
    const banner = read("components/admin/SyncHealthBanner.tsx")
    expect(banner).not.toContain("server-only")
    expect(banner).not.toContain("sync-health-server")
    expect(banner).not.toContain('"use client"')
    const model = read("lib/admin/sync-health.ts")
    expect(model).not.toMatch(/import\s+"server-only"/)
  })
})
