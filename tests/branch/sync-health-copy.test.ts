// 장부 정보 체계화(2026-09-14) — 동기화가 끊겼을 때 장부 상단에 한 줄로 알릴 문구.
// 예전 원천 스트립은 lastSync(실패한 런 포함)를 "sync 방금"으로 보여 3주 정지를 숨겼다.
import { describe, expect, it } from "vitest"

import { describeSyncHealth } from "@/lib/branch/sync-health-copy"

const NOW = new Date("2026-09-14T03:00:00Z")

describe("describeSyncHealth", () => {
  it("returns null when the source is healthy or the field is missing", () => {
    expect(describeSyncHealth(undefined, NOW)).toBeNull()
    expect(describeSyncHealth({ failedDays: 0, lastSuccessAt: "2026-09-14T00:00:00Z", permissionDenied: false, truncated: false }, NOW)).toBeNull()
  })

  it("says how long it has failed, what the numbers are based on, and the re-share fix", () => {
    const copy = describeSyncHealth(
      { failedDays: 15, lastSuccessAt: "2026-08-18T02:30:52Z", permissionDenied: true, truncated: false },
      NOW,
    )
    expect(copy).toEqual({
      tone: "danger",
      title: "매출 시트 동기화 15일째 실패",
      detail: "화면 수치는 2026-08-18 마지막 성공 기준입니다 (27일 전).",
      action: "시트 공유가 끊겼습니다 — 시트를 서비스 계정에 뷰어로 다시 공유해야 풀립니다.",
    })
  })

  it("uses a softer tone on the first failing day and a retry hint for non-permission errors", () => {
    const copy = describeSyncHealth(
      { failedDays: 1, lastSuccessAt: "2026-09-13T08:38:00Z", permissionDenied: false, truncated: false },
      NOW,
    )
    expect(copy?.tone).toBe("warning")
    expect(copy?.action).toBe("새로고침으로 다시 동기화해 보세요.")
  })

  it("marks truncated history and a missing last success", () => {
    const copy = describeSyncHealth({ failedDays: 20, lastSuccessAt: null, permissionDenied: false, truncated: true }, NOW)
    expect(copy?.title).toBe("매출 시트 동기화 20일 이상 실패")
    expect(copy?.detail).toBe("최근 기록에 성공한 동기화가 없습니다 — 화면 수치의 기준 시점을 확인할 수 없습니다.")
  })
})
