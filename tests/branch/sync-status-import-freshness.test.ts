import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import SyncStatusBar from "@/components/admin/branch/SyncStatusBar"
import type { BranchDataSources } from "@/components/admin/branch/types"

function renderBar(asOf: string, extra: { sheetFreshnessError?: boolean; lastError?: string } = {}) {
  const dataSources: BranchDataSources = {
    rev: { kind: "import", asOf }, dsh: { kind: "mirror", asOf: "2026-10-15T02:58:49.279Z" },
  }
  return renderToStaticMarkup(createElement(SyncStatusBar, {
    lastSync: "2026-10-15T02:58:49.279Z", lastSyncStartedAt: "2026-10-15T02:58:30Z",
    lastError: null, dataSources, onRefresh: async () => {}, ...extra,
  }))
}

describe("SyncStatusBar import capture window", () => {
  it("does not ask to recapture an import captured during the same sync", () => {
    expect(renderBar("2026-10-15T02:58:42.741Z")).not.toContain("장부에서 재동기화")
  })

  it("still warns for an import captured before this sync", () => {
    expect(renderBar("2026-08-28T00:00:00Z")).toContain("임포트가 시트 동기화보다 오래됨")
  })

  it("continues to expose Drive freshness failures after a successful capture", () => {
    const html = renderBar("2026-10-15T02:58:42.741Z", { sheetFreshnessError: true })
    expect(html).toContain("시트 신선도 확인 실패")
    expect(html).toContain("시트 신선도 확인 불가")
  })

  it("keeps the failed sync warning when source access fails", () => {
    expect(renderBar("2026-08-28T00:00:00Z", { lastError: "rev: permission denied" })).toContain("원천 갱신 실패")
  })
})
