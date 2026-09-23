// 라운드 5 S-1·S-3 — 동기화 결과 계약과 화면 문구(lib/admin/sync-outcome.ts), 만료 묶음 판정
// (lib/branch/sync/cache-bundles.ts). 완료가 아니면 "완료"라고 말하지 않는다는 것이 핵심 불변식이다.
import { describe, expect, it } from "vitest"

import { describeSyncOutcome, resolveSyncOutcome } from "@/lib/admin/sync-outcome"
import { branchSyncBundles } from "@/lib/branch/sync/cache-bundles"

const NOW = Date.parse("2026-09-23T08:10:00.000Z")

describe("resolveSyncOutcome — 설계 §7.2 규칙", () => {
  it("ok → done, skipped → running", () => {
    expect(resolveSyncOutcome({ ok: true })).toBe("done")
    expect(resolveSyncOutcome({ ok: false, skipped: true })).toBe("running")
  })

  it("ok가 아니고 revOk이거나 hw 결과가 있으면 partial, 둘 다 없으면 failed", () => {
    expect(resolveSyncOutcome({ ok: false, revOk: true })).toBe("partial")
    expect(resolveSyncOutcome({ ok: false, revOk: false, hw: { inbound: 1 } })).toBe("partial")
    expect(resolveSyncOutcome({ ok: false, revOk: false })).toBe("failed")
    expect(resolveSyncOutcome({ ok: false })).toBe("failed")
  })
})

describe("describeSyncOutcome — 버튼 화면 알림 한 줄", () => {
  it("running은 안내 톤이고 '완료'라고 말하지 않으며 잠금 실행의 경과 분을 붙인다", () => {
    const notice = describeSyncOutcome(
      { outcome: "running", startedAt: "2026-09-23T08:07:00.000Z" },
      { now: NOW },
    )
    expect(notice.tone).toBe("info")
    expect(notice.message).toContain("이미 동기화가 진행 중")
    expect(notice.message).toContain("3분 전 시작")
    expect(notice.message).not.toContain("마쳤습니다")
    expect(notice.message).not.toContain("완료")
  })

  it("계약 이전 응답({ ok:false, skipped:true })도 running으로 읽는다 — 예전 화면이 '완료'로 보여 주던 경우", () => {
    const notice = describeSyncOutcome({ ok: false, skipped: true }, { now: NOW })
    expect(notice.tone).toBe("info")
    expect(notice.message).toContain("이미 동기화가 진행 중")
  })

  it("done은 성공 톤, 경고가 있으면 경고 톤으로 첫 경고를 붙인다", () => {
    expect(describeSyncOutcome({ outcome: "done" }).tone).toBe("success")
    const warned = describeSyncOutcome({ outcome: "done", warnings: ["REV 시트가 범위 상한에 닿았습니다"] })
    expect(warned.tone).toBe("warning")
    expect(warned.message).toContain("REV 시트가 범위 상한에 닿았습니다")
  })

  it("partial은 경고 톤으로 경고(없으면 오류)를 붙이고, failed는 오류 톤으로 원인을 붙인다", () => {
    const partial = describeSyncOutcome({ outcome: "partial", error: "hw: boom" })
    expect(partial.tone).toBe("warning")
    expect(partial.message).toContain("일부만 동기화")
    expect(partial.message).toContain("hw: boom")

    const failed = describeSyncOutcome({ outcome: "failed", error: "rev: permission" })
    expect(failed.tone).toBe("error")
    expect(failed.message).toContain("rev: permission")
    expect(failed.message).toContain("마지막으로 성공한 동기화 기준")
  })

  it("skipped는 서버가 준 사유를 그대로 보여 준다", () => {
    expect(describeSyncOutcome({ outcome: "skipped", outcomeReason: "시트 ID 설정이 없습니다" }).message).toBe(
      "시트 ID 설정이 없습니다",
    )
  })

  it("401·403은 실패 대신 권한 안내", () => {
    const notice = describeSyncOutcome({ error: "Forbidden" }, { httpStatus: 403 })
    expect(notice.tone).toBe("error")
    expect(notice.message).toContain("권한이 없습니다")
  })

  it("본문이 없으면(JSON 파싱 실패) 실패로 읽는다", () => {
    expect(describeSyncOutcome(null).tone).toBe("error")
  })
})

describe("branchSyncBundles — 데이터를 쓴 소스의 묶음만(설계 §7.1)", () => {
  it("skipped면 아무것도 만료하지 않는다", () => {
    expect(branchSyncBundles({ ok: false, skipped: true }, ["rev", "hw"])).toEqual([])
  })

  it("완전 성공은 요청 소스의 묶음, 부분 실패는 성공 소스만", () => {
    expect(branchSyncBundles({ ok: true, revOk: true, hw: {} }, ["rev", "hw"])).toEqual(["branchRev", "branchHw"])
    expect(branchSyncBundles({ ok: true, revOk: true }, ["rev"])).toEqual(["branchRev"])
    expect(branchSyncBundles({ ok: false, revOk: true }, ["rev", "hw"])).toEqual(["branchRev"])
    expect(branchSyncBundles({ ok: false, revOk: false, hw: {} }, ["rev", "hw"])).toEqual(["branchHw"])
  })

  it("전 소스 실패면 실행 기록·개요 상태 묶음만", () => {
    expect(branchSyncBundles({ ok: false, revOk: false }, ["rev"])).toEqual(["branchSyncStatus"])
  })

  it("요청하지 않은 소스는 성공 신호가 있어도 만료하지 않는다", () => {
    expect(branchSyncBundles({ ok: true, revOk: true, hw: {} }, ["hw"])).toEqual(["branchHw"])
  })
})
