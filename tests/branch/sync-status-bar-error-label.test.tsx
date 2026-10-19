// SyncStatusBar 오류 라벨(2026-09-25 리뷰) — lastError 에는 동기화 실패만 오지 않는다.
// BranchDashboardClient 가 pickSyncStatusError({ syncError, summaryError: summary.error, runError: summary.data?.lastError })
// 로 넘기므로 수동 동기화 요청 실패·요약 불러오기 실패(타임아웃 포함)·마지막 실행 기록 오류가 모두 섞인다.
// 그래서 "동기화 실패"로 단정하지 않고 "불러오기·동기화 오류 — {분류}"로 말한다. 원문은 싣지 않는다.
// 2026-10-19 병합 검토 후속: "원천 갱신 실패"(10-14) 머리말은 실행 기록 오류(origin run)에만 붙고, "실패 원인 보기"는
// 원문이 없는 화면(/admin/ops)을 가리키지 않는다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import SyncStatusBar, { pickSyncStatusError, type SyncStatusErrorOrigin } from "@/components/admin/branch/SyncStatusBar"

function render(lastError: string | null, lastErrorOrigin?: SyncStatusErrorOrigin | null) {
  return renderToStaticMarkup(
    createElement(SyncStatusBar, { lastSync: null, lastError, lastErrorOrigin, onRefresh: async () => undefined })
  )
}

const PERMISSION_ERROR =
  "rev: [branch/sheets] https://sheets.googleapis.com/v4/spreadsheets/SECRET-ID failed: The caller does not have permission"

describe("SyncStatusBar — 오류 라벨", () => {
  it("시트 권한 오류는 분류 라벨로만 — 원문·내부 URL 은 싣지 않는다", () => {
    for (const origin of [undefined, "request", "run"] as const) {
      const html = render(PERMISSION_ERROR, origin)
      expect(html).toContain("오류 — 권한 오류")
      expect(html).not.toContain("does not have permission")
      expect(html).not.toContain("SECRET-ID")
    }
    expect(render(PERMISSION_ERROR)).toContain("불러오기·동기화 오류 — 권한 오류")
  })

  it("요약 불러오기 실패(타임아웃)도 '동기화 실패'·'원천 갱신 실패'로 단정하지 않는다", () => {
    for (const origin of [undefined, "request"] as const) {
      const html = render("Request timed out after 15000ms", origin)
      expect(html).toContain("불러오기·동기화 오류 — 네트워크·일시 오류")
      expect(html).not.toContain("동기화 실패")
      expect(html).not.toContain("원천 갱신 실패")
      expect(html).not.toContain("15000ms")
    }
  })

  it("실행 기록 오류(origin run)만 '원천 갱신 실패' 머리말을 단다", () => {
    const html = render(PERMISSION_ERROR, "run")
    expect(html).toContain("원천 갱신 실패 · 동기화 실행 오류 — 권한 오류")
  })

  it("'실패 원인 보기'는 원문이 없는 운영 상태(/admin/ops)를 가리키지 않고, 출처별로 원문이 어디 있는지 사실대로 말한다", () => {
    const run = render(PERMISSION_ERROR, "run")
    const request = render("Request timed out after 15000ms", "request")
    for (const html of [run, request]) {
      expect(html).toContain("실패 원인 보기")
      expect(html).not.toContain("/admin/ops")
      expect(html).not.toContain("운영 상태")
    }
    expect(run).toContain("마지막 동기화 실행 기록의 오류입니다")
    expect(run).toContain("DB 실행 기록(branch_sync_runs.error)에만 남습니다")
    expect(request).toContain("이 화면의 요청(요약 불러오기·수동 동기화 요청)에서 받은 오류")
    expect(request).not.toContain("branch_sync_runs")
  })

  it("오류가 없으면 오류 라벨을 그리지 않는다", () => {
    expect(render(null)).not.toContain("불러오기·동기화 오류")
    expect(render(null, "run")).not.toContain("원천 갱신 실패")
  })
})

describe("pickSyncStatusError — 보이는 오류와 그 출처", () => {
  it("수동 동기화 요청 오류 → 요약 불러오기 오류 → 실행 기록 오류 순으로 고르고, 출처를 같이 낸다", () => {
    expect(pickSyncStatusError({ syncError: "POST failed", summaryError: "timeout", runError: "rev: denied" })).toEqual({
      lastError: "POST failed",
      lastErrorOrigin: "request",
    })
    expect(pickSyncStatusError({ syncError: null, summaryError: "timeout", runError: "rev: denied" })).toEqual({
      lastError: "timeout",
      lastErrorOrigin: "request",
    })
    expect(pickSyncStatusError({ syncError: null, summaryError: null, runError: "rev: denied" })).toEqual({
      lastError: "rev: denied",
      lastErrorOrigin: "run",
    })
    expect(pickSyncStatusError({ syncError: null, summaryError: undefined, runError: undefined })).toEqual({
      lastError: null,
      lastErrorOrigin: null,
    })
  })

  it("KR Team 대시보드가 요약 불러오기 오류까지 같은 고르기로 넘기고 출처를 바에 전달한다(라벨 근거)", () => {
    const client = readFileSync(
      join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx"),
      "utf8"
    )
    expect(client).toMatch(
      /const \{ lastError, lastErrorOrigin \} = pickSyncStatusError\(\{\s*syncError,\s*summaryError: summary\.error,\s*runError: summary\.data\?\.lastError,?\s*\}\)/
    )
    const bar = client.indexOf("<SyncStatusBar")
    expect(bar).toBeGreaterThan(-1)
    expect(client.slice(bar, client.indexOf("/>", bar))).toMatch(/\blastErrorOrigin=\{lastErrorOrigin\}/)
  })
})
