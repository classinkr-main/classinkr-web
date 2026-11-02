import { describe, expect, it } from "vitest"

import {
  HARDWARE_PROCESS_ALERT_UTC_SLOT,
  NO_OWNER_LABEL,
  buildProcessAlertMessage,
  kstDateKey,
  selectProcessAlerts,
  type ProcessAlertMovementRow,
} from "@/lib/hardware/process-alerts"

// 2026-10-28 09:00 KST
const NOW = new Date("2026-10-28T00:00:00.000Z")

let seq = 0
function row(overrides: Partial<ProcessAlertMovementRow> = {}): ProcessAlertMovementRow {
  seq += 1
  return {
    id: `m${seq}`,
    product_name: '86" IFP',
    movement_type: "outbound",
    quantity: 1,
    occurred_at: null,
    created_at: "2026-10-27T01:00:00.000Z",
    to_location: "한빛학원",
    owner: "김담당",
    status: "배송 예정",
    memo: null,
    voided_at: null,
    ...overrides,
  }
}

describe("배송 예정 30일 경과 고르기", () => {
  it("예정일 기준 30일 이상이면 고른다 — 29일은 아직", () => {
    const stale = row({ occurred_at: "2026-09-28" }) // 30일
    const fresh = row({ occurred_at: "2026-09-29" }) // 29일
    const selection = selectProcessAlerts([stale, fresh], NOW)
    expect(selection.stalePlannedCount).toBe(1)
    expect(selection.groups[0].stalePlanned[0]).toMatchObject({
      id: stale.id,
      basisKind: "planned",
      basisDate: "2026-09-28",
      ageDays: 30,
    })
  })

  it("예정일이 없으면 등록일 기준으로 센다(D9)", () => {
    const undated = row({ occurred_at: null, created_at: "2026-09-20T03:00:00.000Z" })
    const undatedFresh = row({ occurred_at: null, created_at: "2026-10-20T03:00:00.000Z" })
    const selection = selectProcessAlerts([undated, undatedFresh], NOW)
    expect(selection.stalePlannedCount).toBe(1)
    expect(selection.groups[0].stalePlanned[0]).toMatchObject({
      id: undated.id,
      basisKind: "created",
      basisDate: "2026-09-20",
    })
    expect(selection.groups[0].stalePlanned[0].ageDays).toBeGreaterThanOrEqual(30)
  })

  it("취소된 행·실제 출고·회수는 배송 예정으로 안 센다", () => {
    const selection = selectProcessAlerts(
      [
        row({ occurred_at: "2026-08-01", voided_at: "2026-10-01T00:00:00.000Z" }),
        row({ occurred_at: "2026-08-01", status: "설치 완료" }),
        row({ occurred_at: "2026-08-01", movement_type: "return", status: "예정" }),
      ],
      NOW
    )
    expect(selection.stalePlannedCount).toBe(0)
    expect(selection.groups).toHaveLength(0)
  })

  it("시트 예정 표기(예약·대기)도 같은 판정을 쓴다", () => {
    const selection = selectProcessAlerts([row({ occurred_at: "2026-08-01", status: "예약" })], NOW)
    expect(selection.stalePlannedCount).toBe(1)
  })
})

describe("샘플 반납 예정일 지남 고르기", () => {
  function sample(overrides: Partial<ProcessAlertMovementRow> = {}) {
    return row({
      status: "설치 완료",
      occurred_at: "2026-10-01",
      outbound_type: "sample",
      expected_return_at: "2026-10-20",
      quantity: 2,
      ...overrides,
    })
  }

  it("반납 예정일이 오늘 전이고 남은 수량이 있으면 고른다 — 오늘이 반납일이면 아직", () => {
    const overdue = sample()
    const dueToday = sample({ expected_return_at: "2026-10-28" })
    const selection = selectProcessAlerts([overdue, dueToday], NOW)
    expect(selection.overdueSampleCount).toBe(1)
    expect(selection.groups[0].overdueSamples[0]).toMatchObject({
      id: overdue.id,
      outstanding: 2,
      quantity: 2,
      expectedReturnAt: "2026-10-20",
      overdueDays: 8,
    })
  })

  it("부분 회수는 남은 수량만, 전량 회수는 빠진다 — 취소된 회수는 안 센다", () => {
    const partial = sample()
    const full = sample()
    const rows = [
      partial,
      full,
      row({ movement_type: "return", status: "회수", quantity: 1, return_of_movement_id: partial.id }),
      row({ movement_type: "return", status: "회수", quantity: 1, return_of_movement_id: partial.id, voided_at: "2026-10-25T00:00:00.000Z" }),
      row({ movement_type: "return", status: "회수", quantity: 2, return_of_movement_id: full.id }),
    ]
    const selection = selectProcessAlerts(rows, NOW)
    expect(selection.overdueSampleCount).toBe(1)
    expect(selection.groups[0].overdueSamples[0]).toMatchObject({ id: partial.id, outstanding: 1, quantity: 2 })
  })

  it("유형이 샘플이 아니면(세일즈) 반납 예정일이 있어도 안 고른다 — 비어 있으면 메모로 추정", () => {
    const selection = selectProcessAlerts(
      [
        sample({ outbound_type: "sales" }),
        sample({ outbound_type: null, memo: "샘플 · 데모용" }),
      ],
      NOW
    )
    expect(selection.overdueSampleCount).toBe(1)
  })

  it("배송 예정 상태의 샘플은 반납 알림이 아니라 예정 경과로만 본다", () => {
    const selection = selectProcessAlerts([sample({ status: "배송 예정", occurred_at: "2026-10-20" })], NOW)
    expect(selection.overdueSampleCount).toBe(0)
    expect(selection.stalePlannedCount).toBe(0)
  })

  it("프로세스 칸이 없는 DB 면 샘플 쪽은 건너뛰고 배송 예정만 본다", () => {
    const selection = selectProcessAlerts([sample(), row({ occurred_at: "2026-08-01" })], NOW, {
      sampleCheckAvailable: false,
    })
    expect(selection.sampleCheckAvailable).toBe(false)
    expect(selection.overdueSampleCount).toBe(0)
    expect(selection.stalePlannedCount).toBe(1)
  })
})

describe("담당자 묶기", () => {
  it("계정 → 이름 → 담당자 없음 순서로 묶고, 이름만 있는 이전 행은 같은 이름의 계정에 합친다", () => {
    const selection = selectProcessAlerts(
      [
        row({ occurred_at: "2026-08-01", owner_user_id: "u-1", owner: "김담당" }),
        row({ occurred_at: "2026-08-02", owner_user_id: null, owner: "김 담당" }),
        row({ occurred_at: "2026-08-03", owner_user_id: null, owner: "박담당" }),
        row({ occurred_at: "2026-08-04", owner_user_id: null, owner: "  " }),
      ],
      NOW
    )
    expect(selection.groups.map((group) => [group.key, group.label, group.stalePlanned.length])).toEqual([
      ["user:u-1", "김담당", 2],
      ["name:박담당", "박담당", 1],
      ["none", NO_OWNER_LABEL, 1],
    ])
  })

  it("이름이 없는 계정 묶음은 계정 id 앞부분으로 보인다", () => {
    const selection = selectProcessAlerts([row({ occurred_at: "2026-08-01", owner_user_id: "abcdef12-3456", owner: null })], NOW)
    expect(selection.groups[0].label).toBe("계정 abcdef12")
  })
})

describe("메시지", () => {
  it("담당자별 머리줄 + 줄마다 품목·수량·고객·기준일·일수", () => {
    const selection = selectProcessAlerts(
      [
        row({ occurred_at: "2026-09-01", quantity: 2, owner: "김담당" }),
        row({ occurred_at: null, created_at: "2026-09-10T00:00:00.000Z", owner: "김담당", product_name: "T1" }),
        row({
          status: "설치 완료",
          outbound_type: "sample",
          expected_return_at: "2026-10-20",
          quantity: 2,
          owner: "박담당",
          product_name: '75" IFP',
        }),
        row({
          movement_type: "return",
          status: "회수",
          quantity: 1,
          return_of_movement_id: `m${seq}`,
        }),
      ],
      NOW
    )
    const { title, message, shownItems, omittedItems } = buildProcessAlertMessage(selection)
    expect(title).toBe("하드웨어 확인 필요 — 배송 예정 30일 경과 2건 · 샘플 반납 지남 1건")
    expect(message).toContain("■ 김담당 — 배송 예정 2")
    expect(message).toContain('· [배송 예정] 86" IFP ×2 · 한빛학원 · 예정일 2026-09-01 · 57일 경과')
    expect(message).toContain("· [배송 예정] T1 ×1 · 한빛학원 · 등록 2026-09-10(예정일 없음) · 48일 경과")
    expect(message).toContain('■ 박담당 — 샘플 1')
    expect(message).toContain('· [샘플] 75" IFP 미반납 1/2대 · 한빛학원 · 반납 예정 2026-10-20 · 8일 지남')
    expect(shownItems).toBe(3)
    expect(omittedItems).toBe(0)
    expect(message).not.toContain("외 ")
  })

  it("줄 수 상한을 넘으면 자르고 남은 건수를 말한다 — 머리줄 건수는 전체", () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      row({ occurred_at: "2026-08-01", owner: index < 25 ? "김담당" : "박담당" })
    )
    const selection = selectProcessAlerts(rows, NOW)
    const built = buildProcessAlertMessage(selection, { maxItems: 5 })
    expect(built.shownItems).toBe(5)
    expect(built.omittedItems).toBe(25)
    expect(built.message).toContain("■ 김담당 — 배송 예정 25")
    expect(built.message).toContain("외 25건은 하드웨어 탭에서 확인하세요.")
  })

  it("기본 상한에서는 WeCom 텍스트 한도(2,048바이트) 안에 든다", () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      row({
        occurred_at: "2026-08-01",
        owner: `담당자${index % 12}`,
        to_location: "아주 긴 이름의 고객사 학원 본관 별관 캠퍼스",
      })
    )
    const built = buildProcessAlertMessage(selectProcessAlerts(rows, NOW))
    const whole = `[WARNING] ${built.title}\n${built.message}\nOpen: https://classin.co.kr/admin/hardware`
    expect(new TextEncoder().encode(whole).length).toBeLessThanOrEqual(2048)
    expect(built.shownItems).toBeGreaterThan(0)
    expect(built.shownItems + built.omittedItems).toBe(200)
    expect(built.message).toMatch(/외 \d+건은 하드웨어 탭에서 확인하세요\./)
  })

  it("프로세스 칸이 없으면 샘플 확인이 빠졌다고 적는다", () => {
    const selection = selectProcessAlerts([row({ occurred_at: "2026-08-01" })], NOW, { sampleCheckAvailable: false })
    expect(buildProcessAlertMessage(selection).message).toContain("샘플 반납 확인은 DB 업데이트 적용 후 실립니다.")
  })
})

describe("시각·날짜", () => {
  it("KST 08시 = UTC 슬롯 23", () => {
    expect(HARDWARE_PROCESS_ALERT_UTC_SLOT).toBe(23)
  })

  it("KST 날짜 키 — 날짜만 있는 값은 그대로, 시각은 +9시간", () => {
    expect(kstDateKey("2026-10-20")).toBe("2026-10-20")
    expect(kstDateKey("2026-10-27T16:00:00.000Z")).toBe("2026-10-28")
    expect(kstDateKey(new Date("2026-10-27T14:59:00.000Z"))).toBe("2026-10-27")
  })
})
