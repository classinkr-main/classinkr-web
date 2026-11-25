// 시트 고정(D5) 중 동기화 결과 문구 — REV 를 건너뛴 사실·스냅샷 다시 읽기를 말하고, DSH 성공 + HW 실패는 부분 성공이다(F6).
import { describe, expect, it } from "vitest"

import { describeSyncOutcome, resolveSyncOutcome } from "@/lib/admin/sync-outcome"

describe("resolveSyncOutcome — dshOk", () => {
  it("DSH 성공 + HW 실패(ok=false)는 partial, DSH 실패만이면 failed", () => {
    expect(resolveSyncOutcome({ ok: false, dshOk: true })).toBe("partial")
    expect(resolveSyncOutcome({ ok: false, dshOk: false })).toBe("failed")
  })
})

describe("describeSyncOutcome — 시트 고정", () => {
  it("REV 를 건너뛴 완료는 그 사실을 말한다(성공 톤)", () => {
    expect(
      describeSyncOutcome({ ok: true, ranSources: ["dsh", "hw"], revSheetLock: { lockedAt: "2026-12-01", reread: false } }),
    ).toEqual({
      tone: "success",
      message: "동기화를 마쳤습니다 — DSH·KPI·하드웨어만 읽었습니다(REV 시트는 12월 1일 기준으로 고정돼 다시 읽지 않음).",
    })
    expect(
      describeSyncOutcome({ ok: true, ranSources: ["dsh"], revSheetLock: { lockedAt: "2026-12-01", reread: false } }).message,
    ).toContain("DSH·KPI만 읽었습니다")
  })

  it("스냅샷 다시 읽기 완료", () => {
    expect(
      describeSyncOutcome({ ok: true, revOk: true, ranSources: ["rev"], revSheetLock: { lockedAt: "2026-12-01", reread: true } }),
    ).toEqual({ tone: "success", message: "12/1 스냅샷을 다시 읽었습니다 — 장부 기준값을 방금 읽은 시트 값으로 바꿨습니다." })
  })

  it("경고가 있으면 지금처럼 경고 톤으로 그 경고를 보인다", () => {
    const notice = describeSyncOutcome({
      ok: true,
      warnings: ["REV 범위가 상한에 도달했습니다"],
      revSheetLock: { lockedAt: "2026-12-01", reread: true },
    })
    expect(notice.tone).toBe("warning")
    expect(notice.message).toContain("REV 범위가 상한에 도달했습니다")
  })

  it("고정이 없으면 지금 문구 그대로", () => {
    expect(describeSyncOutcome({ ok: true }).message).toBe("동기화를 마쳤습니다 — 화면을 최신 값으로 다시 불러왔습니다.")
  })
})
