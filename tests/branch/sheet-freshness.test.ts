// 시트-동기화 신선도 순수 판정(품질 웨이브 4, 항목 4) — SyncStatusBar.tsx 안에서만 계산하던
// sheetAhead 로직을 lib/branch/sheet-freshness.ts로 추출한 결과를 검증한다. data-source-freshness
// 테스트(isImportStale)와 같은 패턴.
import { describe, it, expect } from "vitest"
import { isSheetAheadOfSync, SHEET_AHEAD_WARN_MS } from "@/lib/branch/sheet-freshness"

describe("isSheetAheadOfSync", () => {
  it("returns true when the sheet was modified well after the last sync", () => {
    const lastSync = "2026-07-16T09:00:00Z"
    const sheetModifiedAt = new Date(Date.parse(lastSync) + SHEET_AHEAD_WARN_MS + 60_000).toISOString()
    expect(isSheetAheadOfSync(sheetModifiedAt, lastSync)).toBe(true)
  })

  it("returns false when the sheet edit is within the warn threshold of the sync", () => {
    const lastSync = "2026-07-16T09:00:00Z"
    const sheetModifiedAt = new Date(Date.parse(lastSync) + 60_000).toISOString()
    expect(isSheetAheadOfSync(sheetModifiedAt, lastSync)).toBe(false)
  })

  it("returns false when the sheet predates or matches the sync", () => {
    expect(isSheetAheadOfSync("2026-07-16T09:00:00Z", "2026-07-16T09:00:00Z")).toBe(false)
    expect(isSheetAheadOfSync("2026-07-15T09:00:00Z", "2026-07-16T09:00:00Z")).toBe(false)
  })

  it("returns false when either timestamp is missing", () => {
    expect(isSheetAheadOfSync(null, "2026-07-16T09:00:00Z")).toBe(false)
    expect(isSheetAheadOfSync(undefined, "2026-07-16T09:00:00Z")).toBe(false)
    expect(isSheetAheadOfSync("2026-07-16T09:00:00Z", null)).toBe(false)
    expect(isSheetAheadOfSync("2026-07-16T09:00:00Z", undefined)).toBe(false)
  })

  it("returns false when either timestamp fails to parse", () => {
    expect(isSheetAheadOfSync("not-a-date", "2026-07-16T09:00:00Z")).toBe(false)
    expect(isSheetAheadOfSync("2026-07-16T09:00:00Z", "not-a-date")).toBe(false)
  })
})
