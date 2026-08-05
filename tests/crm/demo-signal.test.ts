import { describe, expect, it } from "vitest"

import type { CalendarEvent } from "@/lib/calendar-data"
import {
  buildDemoSignalIndex,
  demoSignalLift,
  extractDemoCustomerName,
  findDemoSignal,
} from "@/lib/crm/demo-signal"

const NOW = new Date("2026-08-05T03:00:00.000Z")

function ev(title: string, date: string): CalendarEvent {
  return {
    id: `showroom_${title}`,
    title,
    date,
    type: "meeting",
    source: "showroom",
    sourceLabel: "쇼룸 예약",
    readonly: true,
    createdAt: date,
    updatedAt: date,
  } as CalendarEvent
}

describe("extractDemoCustomerName", () => {
  it("실제 쇼룸 캘린더 제목에서 고객명만 남긴다", () => {
    // 2026-08-05 프로덕션 피드의 실제 제목들.
    expect(extractDemoCustomerName("갈무리국어학원 데모(쇼룸)")).toBe("갈무리국어학원")
    expect(extractDemoCustomerName("홍성 프라임수학 쇼룸 방문")).toBe("홍성 프라임수학")
    expect(extractDemoCustomerName("강동 라미잉글리시 데모")).toBe("강동 라미잉글리시")
    expect(extractDemoCustomerName("왕수학 커밍(희성)")).toBe("왕수학")
  })
})

describe("buildDemoSignalIndex", () => {
  it("예정·당일·최근만 신호로 남기고 오래된 데모는 버린다", () => {
    const index = buildDemoSignalIndex(
      [
        ev("갈무리국어학원 데모(쇼룸)", "2026-08-10"), // 5일 뒤
        ev("강동 라미잉글리시 데모", "2026-08-05"), // 오늘
        ev("홍성 프라임수학 쇼룸 방문", "2026-07-30"), // 6일 전
        ev("삼남매 전자테크 쇼룸 방문", "2026-06-09"), // 두 달 전 — 신호 아님
      ],
      NOW
    )

    expect(index.total).toBe(3)
    expect(findDemoSignal(index, "갈무리국어학원")?.phase).toBe("upcoming")
    expect(findDemoSignal(index, "강동 라미잉글리시")?.phase).toBe("today")
    expect(findDemoSignal(index, "홍성 프라임수학")?.phase).toBe("recent")
    expect(findDemoSignal(index, "삼남매 전자테크")).toBeNull()
  })

  it("데모 성격이 아닌 일정(설치팀 미팅)은 신호로 치지 않는다", () => {
    const index = buildDemoSignalIndex([ev("동운미디어 HW설치팀 미팅", "2026-08-07")], NOW)
    expect(index.total).toBe(0)
  })

  it("고객을 못 붙인 일정은 버리지 않고 unmatched 로 남긴다", () => {
    // 정제 후 이름이 너무 짧아(4자 미만) 오검출 위험이 큰 건.
    const index = buildDemoSignalIndex([ev("김쌤 데모", "2026-08-07")], NOW)
    expect(index.byName.size).toBe(0)
    expect(index.unmatched).toHaveLength(1)
    expect(index.total).toBe(1)
  })

  it("같은 고객에 일정이 여럿이면 더 임박한 쪽을 남긴다", () => {
    const index = buildDemoSignalIndex(
      [ev("갈무리국어학원 데모", "2026-07-29"), ev("갈무리국어학원 데모(쇼룸)", "2026-08-05")],
      NOW
    )
    expect(findDemoSignal(index, "갈무리국어학원")?.phase).toBe("today")
  })
})

describe("findDemoSignal 오검출 방지", () => {
  it("두 글자짜리 쓰레기 상호는 아무것도 매칭하지 않는다", () => {
    // 실측상 org 가 "수학"·"학원" 인 리드가 있어, 가드가 없으면 전부 데모로 물든다.
    const index = buildDemoSignalIndex([ev("홍성 프라임수학 쇼룸 방문", "2026-08-07")], NOW)
    expect(findDemoSignal(index, "수학")).toBeNull()
    expect(findDemoSignal(index, "학원")).toBeNull()
    expect(findDemoSignal(index, "홍성 프라임수학")).not.toBeNull()
  })

  it("표기가 조금 달라도(접두 지역명·후행 학원) 같은 고객으로 붙는다", () => {
    const index = buildDemoSignalIndex([ev("프라임수학 데모", "2026-08-07")], NOW)
    expect(findDemoSignal(index, "프라임수학학원")).not.toBeNull()
  })
})

describe("demoSignalLift", () => {
  it("예정·당일이 최근 완료보다 무겁고, 신호가 없으면 0", () => {
    const index = buildDemoSignalIndex(
      [
        ev("갈무리국어학원 데모", "2026-08-05"),
        ev("강동 라미잉글리시 데모", "2026-08-08"),
        ev("삼남매 전자테크 데모", "2026-07-28"),
      ],
      NOW
    )
    const today = demoSignalLift(findDemoSignal(index, "갈무리국어학원"))
    const upcoming = demoSignalLift(findDemoSignal(index, "강동 라미잉글리시"))
    const recent = demoSignalLift(findDemoSignal(index, "삼남매 전자테크"))

    expect(today).toBeGreaterThan(recent)
    expect(upcoming).toBeGreaterThan(recent)
    expect(demoSignalLift(null)).toBe(0)
  })
})
