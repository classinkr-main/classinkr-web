// 서빙 소스 신선도 순수 판정 — 2026-07-16 사고(7/3 스테일 REV 임포트가 13일간 최신 시트
// 반영분을 가렸으나 KR Team 화면은 "마지막 동기화: 방금"만 보여줘 재발을 알 길이 없었다)
// 재발 시 SyncStatusBar가 즉시 경고할 수 있도록 판정 로직만 분리해 검증한다.
import { describe, it, expect } from "vitest"
import { isImportStale } from "@/lib/branch/data-source-freshness"

describe("isImportStale", () => {
  it("returns true when the import's capture time predates the sheet's last sync", () => {
    expect(isImportStale("2026-07-03T00:00:00Z", "2026-07-16T09:00:00Z")).toBe(true)
  })

  it("returns false when the import is at or after the last sync", () => {
    expect(isImportStale("2026-07-16T09:00:00Z", "2026-07-16T09:00:00Z")).toBe(false)
    expect(isImportStale("2026-07-17T00:00:00Z", "2026-07-16T09:00:00Z")).toBe(false)
  })

  it("returns false when either timestamp is missing", () => {
    expect(isImportStale(null, "2026-07-16T09:00:00Z")).toBe(false)
    expect(isImportStale(undefined, "2026-07-16T09:00:00Z")).toBe(false)
    expect(isImportStale("2026-07-03T00:00:00Z", null)).toBe(false)
    expect(isImportStale("2026-07-03T00:00:00Z", undefined)).toBe(false)
    expect(isImportStale(null, null)).toBe(false)
  })

  it("returns false when either timestamp fails to parse", () => {
    expect(isImportStale("not-a-date", "2026-07-16T09:00:00Z")).toBe(false)
    expect(isImportStale("2026-07-03T00:00:00Z", "not-a-date")).toBe(false)
  })
})
