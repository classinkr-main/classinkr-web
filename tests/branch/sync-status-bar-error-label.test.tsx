// SyncStatusBar 오류 라벨(2026-09-25 리뷰) — lastError 에는 동기화 실패만 오지 않는다.
// BranchDashboardClient 가 `syncError ?? summary.error ?? summary.data?.lastError` 로 넘기므로
// 수동 동기화 요청 실패·요약 불러오기 실패(타임아웃 포함)·마지막 실행 기록 오류가 모두 섞인다.
// 그래서 "동기화 실패"로 단정하지 않고 "불러오기·동기화 오류 — {분류}"로 말한다. 원문은 싣지 않는다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import SyncStatusBar from "@/components/admin/branch/SyncStatusBar"

function render(lastError: string | null) {
  return renderToStaticMarkup(
    createElement(SyncStatusBar, { lastSync: null, lastError, onRefresh: async () => undefined })
  )
}

describe("SyncStatusBar — 오류 라벨", () => {
  it("시트 권한 오류는 분류 라벨로만 — 원문·내부 URL 은 싣지 않는다", () => {
    const html = render(
      "rev: [branch/sheets] https://sheets.googleapis.com/v4/spreadsheets/SECRET-ID failed: The caller does not have permission"
    )
    expect(html).toContain("불러오기·동기화 오류 — 권한 오류")
    expect(html).not.toContain("does not have permission")
    expect(html).not.toContain("SECRET-ID")
  })

  it("요약 불러오기 실패(타임아웃)도 '동기화 실패'로 단정하지 않는다", () => {
    const html = render("Request timed out after 15000ms")
    expect(html).toContain("불러오기·동기화 오류 — 네트워크·일시 오류")
    expect(html).not.toContain("동기화 실패")
    expect(html).not.toContain("15000ms")
  })

  it("오류가 없으면 오류 라벨을 그리지 않는다", () => {
    expect(render(null)).not.toContain("불러오기·동기화 오류")
  })

  it("KR Team 대시보드가 요약 불러오기 오류까지 같은 lastError 로 넘긴다(라벨 근거)", () => {
    const client = readFileSync(
      join(process.cwd(), "components/admin/branch/BranchDashboardClient.tsx"),
      "utf8"
    )
    expect(client).toMatch(/const lastError = [^\n]*summary\.error/)
  })
})
