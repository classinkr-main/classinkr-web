import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SlotPicker } from "@/components/showroom/SlotPicker"
import { DesiredDateCalendar } from "@/components/checkout/DesiredDateCalendar"
import type { ShowroomSlot } from "@/lib/showroom/slots"

/**
 * 접근성 계약은 렌더된 마크업으로 고정한다.
 *
 * 이 저장소에는 jsdom 이 없어 키 입력 자체는 돌려볼 수 없다(관례가 renderToStaticMarkup
 * 이다). 대신 **키보드 조작이 성립하기 위한 전제**를 여기서 잡는다 — 탭 정지점이 하나인지,
 * 마감 슬롯이 포커스를 받을 수 있는지. 이 둘이 깨지면 방향키 핸들러가 아무리 맞아도
 * 사용자는 슬롯에 닿지 못한다.
 */

const SLOTS: ShowroomSlot[] = [
  { time: "10:00", state: "open" },
  { time: "11:00", state: "booked" },
  { time: "14:00", state: "open" },
  { time: "15:00", state: "open" },
  { time: "16:00", state: "booked" },
]

function renderSlots(overrides: Partial<Parameters<typeof SlotPicker>[0]> = {}) {
  return renderToStaticMarkup(
    <SlotPicker
      slots={SLOTS}
      value=""
      onChange={() => {}}
      durationMinutes={60}
      labelledById="time-label"
      {...overrides}
    />
  )
}

describe("SlotPicker 접근성 계약", () => {
  it("탭 정지점이 정확히 하나다 — 슬롯마다 서 는 대신 그룹 단위로 지나간다", () => {
    const html = renderSlots()
    expect(html.match(/tabindex="0"/g) ?? []).toHaveLength(1)
    expect((html.match(/tabindex="-1"/g) ?? []).length).toBe(SLOTS.length - 1)
  })

  it("선택된 슬롯이 있으면 그것이 탭 정지점이다", () => {
    const html = renderSlots({ value: "15:00" })
    // 15:00 버튼에 tabindex="0" 이 붙어야 한다.
    const selectedButton = html.split("<button").find((chunk) => chunk.includes(">15:00<"))
    expect(selectedButton).toContain('tabindex="0"')
    expect(selectedButton).toContain('aria-checked="true"')
  })

  it("미선택이면 첫 선택 가능 슬롯이 탭 정지점이다 — 마감으로 시작하지 않는다", () => {
    const html = renderSlots()
    const first = html.split("<button").find((chunk) => chunk.includes(">10:00<"))
    expect(first).toContain('tabindex="0"')
  })

  it("마감 슬롯은 native disabled 가 아니라 aria-disabled 다", () => {
    const html = renderSlots()
    // native disabled 면 포커스를 못 받아 스크린리더가 "마감"에 도달하지 못한다.
    expect(html).not.toContain("disabled=\"\"")
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(2)
  })

  it("마감 슬롯의 라벨이 상태를 말한다", () => {
    const html = renderSlots()
    expect(html).toContain('aria-label="오전 11:00 마감"')
    expect(html).toContain('aria-label="오전 10:00 상담 60분"')
  })

  it("점심 공백이 드러나게 오전·오후로 가른다", () => {
    const html = renderSlots()
    expect(html).toContain("오전")
    expect(html).toContain("오후")
  })

  it("한 시간대만 있으면 그룹 라벨을 붙이지 않는다", () => {
    const html = renderSlots({ slots: [{ time: "14:00", state: "open" }] })
    expect(html).not.toContain(">오후<")
  })

  it("라디오그룹으로 묶이고 라벨이 연결된다", () => {
    const html = renderSlots()
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-labelledby="time-label"')
    expect((html.match(/role="radio"/g) ?? []).length).toBe(SLOTS.length)
  })
})

describe("DesiredDateCalendar 날짜 주석", () => {
  const base = {
    value: "",
    onChange: () => {},
    todayIso: "2026-09-21",
    minIso: "2026-09-22",
    maxIso: "2026-10-31",
  }

  it("주석을 넘기지 않으면 보조 표시가 없다 — /checkout 기존 렌더와 같다", () => {
    const html = renderToStaticMarkup(<DesiredDateCalendar {...base} />)
    expect(html).not.toContain('aria-hidden="true"><span class="h-[3px]')
    expect(html).not.toContain("line-through")
  })

  it("마감은 취소선으로 '열렸다가 닫힌 날'임을 남긴다", () => {
    const html = renderToStaticMarkup(
      <DesiredDateCalendar
        {...base}
        disabledIsoDates={new Set(["2026-09-25"])}
        annotations={new Map([["2026-09-25", { label: "마감", tone: "full" as const }]])}
      />
    )
    expect(html).toContain("line-through")
    expect(html).toContain("2026년 9월 25일 (금) 마감")
  })

  it("휴무는 취소선 없이 회색으로 남는다 — 찬 날과 구분된다", () => {
    const html = renderToStaticMarkup(
      <DesiredDateCalendar
        {...base}
        disabledIsoDates={new Set(["2026-09-26"])}
        annotations={new Map([["2026-09-26", { label: "주말 휴무" }]])}
      />
    )
    expect(html).toContain("2026년 9월 26일 (토) 주말 휴무")
    expect(html).not.toContain("line-through")
  })
})
