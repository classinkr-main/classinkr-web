import { describe, expect, it } from "vitest"

import {
  COMPASS_NEXT_ACTION_LOOKBACK_DAYS,
  COMPASS_NEXT_ACTION_TEXT_MAX,
  bucketCompassDue,
  compassDueOverdueDays,
  compassOwnerKeys,
  compassResponsibleName,
  isBeyondCompassLookback,
  isOpenCompassAction,
  maskContactsInText,
  matchCompassOwner,
  truncateCompassNextActionText,
} from "@/lib/compass/next-actions"

// 기준: 2026-09-25(금) 00:30 KST = 09-24T15:30Z — KST 날짜 경계 바로 뒤.
const NOW_MS = new Date("2026-09-24T15:30:00.000Z").getTime()

describe("Compass 다음 액션 순수 판정", () => {
  it("KST 달력일로 지남·오늘·이후를 가른다(오늘 안의 이른 시각은 지남이 아니다)", () => {
    expect(bucketCompassDue("2026-09-24T14:59:59.000Z", NOW_MS)).toBe("overdue") // 09-24 23:59 KST
    expect(bucketCompassDue("2026-09-24T15:00:00.000Z", NOW_MS)).toBe("today") // 09-25 00:00 KST
    expect(bucketCompassDue("2026-09-25T14:59:00.000Z", NOW_MS)).toBe("today") // 09-25 23:59 KST
    expect(bucketCompassDue("2026-09-25T15:00:00.000Z", NOW_MS)).toBe("later")
    expect(bucketCompassDue("깨진 값", NOW_MS)).toBeNull()
    expect(bucketCompassDue(null, NOW_MS)).toBeNull()
  })

  it("지난 일수와 14일 창", () => {
    expect(COMPASS_NEXT_ACTION_LOOKBACK_DAYS).toBe(14)
    expect(compassDueOverdueDays("2026-09-11T03:00:00.000Z", NOW_MS)).toBe(14)
    expect(isBeyondCompassLookback("2026-09-11T03:00:00.000Z", NOW_MS)).toBe(false)
    expect(isBeyondCompassLookback("2026-09-10T03:00:00.000Z", NOW_MS)).toBe(true)
    expect(compassDueOverdueDays("2026-09-26T03:00:00.000Z", NOW_MS)).toBe(0)
  })

  it("열린 액션 = 종료(lost)·케어 종료(closed)가 아닌 것 — 결제(won) 뒤 케어는 남긴다", () => {
    expect(isOpenCompassAction({ stage: "contact", care_stage: null })).toBe(true)
    expect(isOpenCompassAction({ stage: "won", care_stage: "leader" })).toBe(true)
    expect(isOpenCompassAction({ stage: "lost", care_stage: null })).toBe(false)
    expect(isOpenCompassAction({ stage: "won", care_stage: "closed" })).toBe(false)
  })

  it("책임자 — BD 단계는 bd_owner 우선, 그 밖은 caller → owner", () => {
    expect(compassResponsibleName({ stage: "bd", bd_owner: "비디", caller: "콜러", owner: "오너" })).toBe("비디")
    expect(compassResponsibleName({ stage: "demo", bd_owner: "비디", caller: " 콜러 ", owner: "오너" })).toBe("콜러")
    expect(compassResponsibleName({ stage: "demo", caller: "", owner: "오너" })).toBe("오너")
    expect(compassResponsibleName({ stage: "demo" })).toBeNull()
  })

  it("담당 매칭은 caller·owner·bd_owner 를 소문자·trim 으로 비교한다", () => {
    const row = { caller: " Kim ", owner: "박오너", bd_owner: null }
    expect(compassOwnerKeys(row)).toEqual(["kim", "박오너"])
    expect(matchCompassOwner(row, new Set(["kim"]))).toBe(true)
    expect(matchCompassOwner(row, new Set(["lee"]))).toBe(false)
    expect(matchCompassOwner(row, new Set())).toBe(true)
  })

  it("문구는 표시용으로 60자까지 자른다(공백 정리)", () => {
    expect(COMPASS_NEXT_ACTION_TEXT_MAX).toBe(60)
    expect(truncateCompassNextActionText("  견적   설명  ")).toBe("견적 설명")
    const long = truncateCompassNextActionText("가".repeat(100))
    expect(Array.from(long ?? "")).toHaveLength(60)
    expect(long?.endsWith("…")).toBe(true)
    expect(truncateCompassNextActionText("   ")).toBeNull()
  })

  it("문구 속 전화·이메일은 가린다 — 날짜·시각·금액은 그대로", () => {
    expect(maskContactsInText("010-1234-5678 로 콜백")).toBe("010-****-5678 로 콜백")
    expect(maskContactsInText("대표번호 02 345 6789, 휴대 01098765432")).toBe("대표번호 02-****-6789, 휴대 010-****-5432")
    expect(maskContactsInText("메일 boss.kim@ga-school.co.kr 확인")).toBe("메일 ***@ga-school.co.kr 확인")
    expect(maskContactsInText("2026-09-25 14:00 견적 1,200,000원")).toBe("2026-09-25 14:00 견적 1,200,000원")
    expect(maskContactsInText("주문 12010123456789")).toBe("주문 12010123456789")
    expect(truncateCompassNextActionText("  010-1111-2222   재통화 ")).toBe("010-****-2222 재통화")
  })
})
