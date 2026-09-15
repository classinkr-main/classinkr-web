// 시트-동기화 신선도 순수 판정(품질 웨이브 4, 항목 4) — SyncStatusBar.tsx 안에서만 계산하던
// sheetAhead 로직을 lib/branch/sheet-freshness.ts로 추출한 결과를 검증한다. data-source-freshness
// 테스트(isImportStale)와 같은 패턴.
import { describe, it, expect } from "vitest"
import { isSheetAheadOfSync, resolveSheetFreshnessFromSettled, SHEET_AHEAD_WARN_MS } from "@/lib/branch/sheet-freshness"

function fulfilled(value: string | null): PromiseSettledResult<string | null> {
  return { status: "fulfilled", value }
}
function rejected(reason: unknown = new Error("drive failed")): PromiseSettledResult<string | null> {
  return { status: "rejected", reason }
}

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

// 품질 감사 2026-09-10 — #2(data_trust 핵심): getSheetModifiedTime(google-sheets.ts)가 재시도
// 후에도 실패하면 이제 던진다(예전엔 null로 삼켜 "정상인데 값 없음"과 "확인 자체가 실패함"이
// 구분되지 않았다 — isSheetAheadOfSync(null, lastSync)가 항상 false라 앰버 배지가 조용히
// 꺼졌다). summary-payload.ts의 readSheetFreshness가 Promise.allSettled로 모은 두 결과를
// 이 순수 함수에 넘겨 판정한다 — async/캐시(unstable_cache)와 분리해 여기서 직접 검증한다.
describe("resolveSheetFreshnessFromSettled", () => {
  it("두 조회 모두 성공하면 더 최신 modifiedTime을 고르고 failed=false", () => {
    const result = resolveSheetFreshnessFromSettled(
      fulfilled("2026-09-01T00:00:00Z"),
      fulfilled("2026-09-05T00:00:00Z"),
    )
    expect(result).toEqual({ modifiedTime: "2026-09-05T00:00:00Z", failed: false })
  })

  it("한쪽만 실패해도 failed=true — 성공한 쪽 값이 있어도 '확인 못 함'으로 승격한다", () => {
    const result = resolveSheetFreshnessFromSettled(rejected(), fulfilled("2026-09-05T00:00:00Z"))
    expect(result.failed).toBe(true)
  })

  it("둘 다 실패하면 modifiedTime null, failed true", () => {
    const result = resolveSheetFreshnessFromSettled(rejected(), rejected())
    expect(result).toEqual({ modifiedTime: null, failed: true })
  })

  it("둘 다 성공했지만 값이 없으면(정상 케이스) modifiedTime null, failed false — '값 없음'과 '조회 실패'를 구분한다", () => {
    const result = resolveSheetFreshnessFromSettled(fulfilled(null), fulfilled(null))
    expect(result).toEqual({ modifiedTime: null, failed: false })
  })

  it("한쪽만 값이 있으면 그 값을 쓴다", () => {
    const result = resolveSheetFreshnessFromSettled(fulfilled(null), fulfilled("2026-09-05T00:00:00Z"))
    expect(result).toEqual({ modifiedTime: "2026-09-05T00:00:00Z", failed: false })
  })
})
