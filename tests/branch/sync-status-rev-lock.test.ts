// 시트 고정 뒤 KR Team 상태 줄(design-1 F8) — 크론이 DSH·하드웨어만 읽어도(source dsh+hw) REV 임포트를
// "시트 동기화보다 오래됨"으로 경고하지 않는다. REV 임포트는 REV 를 실제로 읽은 마지막 성공 런(all·rev)과만 비교한다.
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import SyncStatusBar from "@/components/admin/branch/SyncStatusBar"
import type { BranchDataSources } from "@/components/admin/branch/types"
import { latestRevSyncRun } from "@/lib/branch/data-source-freshness"

const run = (source: string, status: string, started_at: string, finished_at: string | null) => ({ source, status, started_at, finished_at })

describe("latestRevSyncRun", () => {
  it("최신 먼저 목록에서 REV 를 읽은 마지막 성공 런(all·rev)만 고른다", () => {
    const runs = [
      run("dsh+hw", "success", "2026-12-02T00:00:00Z", "2026-12-02T00:01:00Z"),
      run("dsh", "success", "2026-12-01T08:00:00Z", "2026-12-01T08:01:00Z"),
      run("rev", "failed", "2026-12-01T04:00:00Z", "2026-12-01T04:01:00Z"),
      run("all", "success", "2026-11-30T08:00:00Z", "2026-11-30T08:02:00Z"),
      run("rev", "success", "2026-11-30T04:00:00Z", "2026-11-30T04:01:00Z"),
    ]
    expect(latestRevSyncRun(runs)).toEqual({ lastRevSync: "2026-11-30T08:02:00Z", lastRevSyncStartedAt: "2026-11-30T08:00:00Z" })
  })

  it("끝난 시각이 없으면 시작 시각, REV 런이 없으면 null", () => {
    expect(latestRevSyncRun([run("rev", "success", "2026-11-30T04:00:00Z", null)])).toEqual({
      lastRevSync: "2026-11-30T04:00:00Z",
      lastRevSyncStartedAt: "2026-11-30T04:00:00Z",
    })
    expect(latestRevSyncRun([run("dsh+hw", "success", "2026-12-02T00:00:00Z", "2026-12-02T00:01:00Z"), run("hw", "success", "2026-12-01T00:00:00Z", null)])).toEqual({
      lastRevSync: null,
      lastRevSyncStartedAt: null,
    })
  })
})

const IMPORT_AT = "2026-11-30T08:01:30Z"
const DATA_SOURCES: BranchDataSources = {
  rev: { kind: "import", asOf: IMPORT_AT },
  dsh: { kind: "mirror", asOf: "2026-12-02T00:01:00Z" },
}

function renderBar(extra: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(SyncStatusBar, {
    // 마지막 런은 고정 뒤 DSH·하드웨어 크론(REV 임포트보다 새롭다).
    lastSync: "2026-12-02T00:01:00Z",
    lastSyncStartedAt: "2026-12-02T00:00:00Z",
    lastError: null,
    dataSources: DATA_SOURCES,
    ...extra,
  }))
}

describe("SyncStatusBar — REV 임포트 신선도와 시트 고정", () => {
  it("REV 를 읽은 마지막 런과 비교하면 DSH·하드웨어 런이 더 새로워도 오래됨 경고가 없다", () => {
    const html = renderBar({ lastRevSync: "2026-11-30T08:02:00Z", lastRevSyncStartedAt: "2026-11-30T08:00:00Z" })
    expect(html).not.toContain("임포트가 시트 동기화보다 오래됨")
    expect(html).not.toContain("장부에서 재동기화")
  })

  it("REV 런보다 오래된 임포트는 그대로 경고한다", () => {
    const html = renderBar({ lastRevSync: "2026-12-01T08:02:00Z", lastRevSyncStartedAt: "2026-12-01T08:00:00Z" })
    expect(html).toContain("임포트가 시트 동기화보다 오래됨")
  })

  it("구버전 응답(lastRevSync 없음)은 예전처럼 마지막 런과 비교한다", () => {
    expect(renderBar({})).toContain("임포트가 시트 동기화보다 오래됨")
  })

  it("고정 적용 중이면 REV 원천 라벨이 '12/1 고정'이다", () => {
    const html = renderBar({
      lastRevSync: "2026-11-30T08:02:00Z",
      lastRevSyncStartedAt: "2026-11-30T08:00:00Z",
      revSheetLock: { lockedAt: "2026-12-01", active: true },
    })
    expect(html).toContain("REV 장부 임포트 (12/1 고정)")
    expect(renderBar({ lastRevSync: "2026-11-30T08:02:00Z", revSheetLock: { lockedAt: "2026-12-01", active: false } })).not.toContain("12/1 고정")
  })
})
