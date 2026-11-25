import { describe, expect, it } from "vitest"

import {
  filterLedgerRows,
  formatSignedQuantity,
  groupLedgerRows,
  ledgerDate,
  ledgerPartyLabel,
  movementLot,
  signedQuantity,
  summarizeProducts,
} from "@/components/admin/hardware/inventory/home-ledger-model"
import type { HardwareMovement } from "@/components/admin/hardware/inventory/shared"

// 홈 원장 순수 모델 — 묶음 키(입고는 물류번호별)·취소 제외·부호·예정 수·칩·검색·요약 자르기.

let seq = 0
const mv = (patch: Partial<HardwareMovement> = {}): HardwareMovement =>
  ({
    id: `m${++seq}`,
    item_id: "ifp86",
    product_name: '86" IFP',
    movement_type: "outbound",
    quantity: 1,
    occurred_at: "2026-11-20",
    from_location: "창고",
    to_location: "새솔영어학원",
    owner: "민재",
    status: "설치 완료",
    reference_no: null,
    memo: null,
    lot_no: null,
    source: "admin_manual",
    voided_at: null,
    ...patch,
  }) as HardwareMovement

describe("묶음 상대 라벨", () => {
  it("출고는 도착지 고객사, 일반 위치는 고객(미지정)", () => {
    expect(ledgerPartyLabel(mv())).toBe("새솔영어학원")
    expect(ledgerPartyLabel(mv({ to_location: "고객" }))).toBe("고객(미지정)")
  })

  it("입고는 물류번호별 — FY24-25 는 H0, 없으면 미지정, 시트 행은 reference_no", () => {
    expect(ledgerPartyLabel(mv({ movement_type: "inbound", to_location: "창고", lot_no: " H8 " }))).toBe("입고 · H8")
    expect(ledgerPartyLabel(mv({ movement_type: "inbound", to_location: "창고", lot_no: "FY24-25" }))).toBe("입고 · H0")
    expect(ledgerPartyLabel(mv({ movement_type: "inbound", to_location: "창고" }))).toBe("입고 · 물류번호 미지정")
    expect(
      ledgerPartyLabel(mv({ movement_type: "inbound", to_location: "창고", source: "sheet_import", reference_no: "H7" }))
    ).toBe("입고 · H7")
  })

  it("회수는 돌아온 곳", () => {
    expect(ledgerPartyLabel(mv({ movement_type: "return", from_location: "한길과학", to_location: "창고" }))).toBe("한길과학")
    expect(ledgerPartyLabel(mv({ movement_type: "return", from_location: "샘플", to_location: "사무실" }))).toBe("고객(미지정)")
  })

  it("조정·이동·수리는 방향과 무관하게 유형 이름 — 고객(미지정)에 섞이지 않는다", () => {
    expect(ledgerPartyLabel(mv({ movement_type: "adjust", from_location: "창고", to_location: null }))).toBe("조정")
    expect(ledgerPartyLabel(mv({ movement_type: "adjust", from_location: null, to_location: "창고" }))).toBe("조정")
    expect(ledgerPartyLabel(mv({ movement_type: "transfer", from_location: "창고", to_location: "사무실" }))).toBe("이동")
    expect(ledgerPartyLabel(mv({ movement_type: "repair", from_location: "창고", to_location: "수리" }))).toBe("수리")
  })

  it("movementLot 은 lot_no 우선, 수기 기록의 reference_no 는 물류번호가 아니다", () => {
    expect(movementLot(mv({ lot_no: "C7", reference_no: "H1", source: "sheet_import" }))).toBe("C7")
    expect(movementLot(mv({ reference_no: "deal:1" }))).toBeNull()
  })
})

describe("부호 수량", () => {
  it("입고·회수 +, 출고(예정 포함) −, 조정은 방향, 이동·수리 0", () => {
    expect(signedQuantity(mv({ movement_type: "inbound", quantity: 12 }))).toBe(12)
    expect(signedQuantity(mv({ movement_type: "return", quantity: 1 }))).toBe(1)
    expect(signedQuantity(mv({ quantity: 2 }))).toBe(-2)
    expect(signedQuantity(mv({ quantity: 2, status: "배송 예정", planned: true }))).toBe(-2)
    expect(signedQuantity(mv({ movement_type: "adjust", from_location: null, to_location: "창고", quantity: 3 }))).toBe(3)
    expect(signedQuantity(mv({ movement_type: "adjust", from_location: "창고", to_location: null, quantity: 3 }))).toBe(-3)
    expect(signedQuantity(mv({ movement_type: "transfer", quantity: 4 }))).toBe(0)
    expect(signedQuantity(mv({ movement_type: "repair", quantity: 4 }))).toBe(0)
  })

  it("로트 잔량 기준 — 창고 증감과 다르다(창고→사무실 이동 0, 사무실발 샘플 대여 −, 샘플 반환 +)", () => {
    expect(signedQuantity(mv({ movement_type: "transfer", from_location: "창고", to_location: "사무실", quantity: 4 }))).toBe(0)
    expect(signedQuantity(mv({ from_location: "사무실", to_location: "샘플", quantity: 1 }))).toBe(-1)
    expect(signedQuantity(mv({ movement_type: "return", from_location: "샘플", to_location: "사무실", quantity: 1 }))).toBe(1)
  })

  it("표시는 +N · −N(유니코드 마이너스) · 0 변화는 부호 없음", () => {
    expect(formatSignedQuantity(mv({ movement_type: "inbound", quantity: 1200 }))).toBe("+1,200")
    expect(formatSignedQuantity(mv({ quantity: 2 }))).toBe("−2")
    expect(formatSignedQuantity(mv({ movement_type: "transfer", quantity: 4 }))).toBe("4")
  })
})

describe("필터 · 검색", () => {
  const planned = mv({ status: "배송 예정", planned: true })
  const done = mv({ to_location: "다온수학", product_name: "T1" })
  const inbound = mv({ movement_type: "inbound", to_location: "창고", lot_no: "C7", quantity: 12 })
  const sample = mv({ to_location: "샘플", status: "샘플/대여", outbound_type_resolved: "sample" })
  const voided = mv({ voided_at: "2026-11-21T00:00:00Z" })
  const rows = [planned, done, inbound, sample, voided]

  it("취소 기록은 늘 빠진다", () => {
    expect(filterLedgerRows(rows, "all", "")).toEqual([planned, done, inbound, sample])
  })

  it("날짜 내림차순, 날짜 없는 줄은 맨 뒤 — 고객별 묶음 순서도 따라간다", () => {
    const undated = mv({ occurred_at: null, movement_type: "inbound", to_location: "창고", lot_no: "H0" })
    const old = mv({ occurred_at: "2026-07-01", to_location: "익산" })
    const recent = mv({ occurred_at: "2026-11-24", to_location: "새솔" })
    const undatedSameParty = mv({ occurred_at: null, to_location: "익산", status: "배송 예정", planned: true })
    const sorted = filterLedgerRows([undated, undatedSameParty, old, recent], "all", "")
    expect(sorted).toEqual([recent, old, undated, undatedSameParty])
    expect(groupLedgerRows(sorted).map((group) => group.label)).toEqual(["새솔", "익산", "입고 · H0"])
  })

  it("칩: 배송 예정 · 출고 · 입고 · 샘플", () => {
    expect(filterLedgerRows(rows, "planned", "")).toEqual([planned])
    expect(filterLedgerRows(rows, "outbound", "")).toEqual([planned, done, sample])
    expect(filterLedgerRows(rows, "inbound", "")).toEqual([inbound])
    expect(filterLedgerRows(rows, "sample", "")).toEqual([sample])
  })

  it("검색: 고객사 · 제품(공백·따옴표 무시) · 물류번호", () => {
    expect(filterLedgerRows(rows, "all", "다온")).toEqual([done])
    expect(filterLedgerRows(rows, "all", "86 ifp")).toEqual([planned, inbound, sample])
    expect(filterLedgerRows(rows, "all", "c7")).toEqual([inbound])
    expect(filterLedgerRows(rows, "all", "  ")).toHaveLength(4)
  })

  it("검색: 물류번호는 표시 라벨(FY24-25 → H0)로도 찾는다 — 출고 줄 포함", () => {
    const legacy = mv({ lot_no: "FY24-25" })
    expect(filterLedgerRows([legacy], "all", "H0")).toEqual([legacy])
    expect(filterLedgerRows([legacy], "all", "FY24-25")).toEqual([legacy])
  })
})

describe("고객별 묶음", () => {
  it("상대별로 처음 나온 순서, 예정 줄 수, 최근(예정 제외)·다음 예정일", () => {
    const rows = [
      mv({ occurred_at: "2026-11-27", status: "배송 예정", planned: true }),
      mv({ movement_type: "inbound", to_location: "창고", lot_no: "C7", occurred_at: "2026-11-24" }),
      mv({ occurred_at: "2026-11-12", product_name: "T1" }),
      mv({ movement_type: "inbound", to_location: "창고", occurred_at: "2026-11-01" }),
    ]
    const groups = groupLedgerRows(rows)
    expect(groups.map((group) => group.label)).toEqual(["새솔영어학원", "입고 · C7", "입고 · 물류번호 미지정"])
    // 11/27 은 앞으로의 배송 예정일이라 "최근"이 아니다.
    expect(groups[0]).toMatchObject({ plannedCount: 1, lastDate: "2026-11-12", nextPlannedDate: "2026-11-27" })
    expect(groups[0].movements).toHaveLength(2)
    expect(groups[1]).toMatchObject({ plannedCount: 0, nextPlannedDate: null })
  })

  it("예정 줄만 있으면 lastDate 는 null, 다음 예정일은 가장 이른 날", () => {
    const groups = groupLedgerRows([
      mv({ occurred_at: "2026-12-05", status: "배송 예정", planned: true }),
      mv({ occurred_at: "2026-11-30", status: "배송 예정", planned: true }),
    ])
    expect(groups[0]).toMatchObject({ lastDate: null, nextPlannedDate: "2026-11-30" })
  })

  it("날짜 없는 기록만 있으면 lastDate 는 null", () => {
    expect(groupLedgerRows([mv({ occurred_at: null })])[0].lastDate).toBeNull()
  })
})

describe("제품 요약", () => {
  it("수량 많은 순 상위 3 + 외 N, 단축명", () => {
    const rows = [
      mv({ product_name: "T1", quantity: 2 }),
      mv({ product_name: '86" IFP 전자칠판', quantity: 3 }),
      mv({ product_name: "STD1", quantity: 2 }),
      mv({ product_name: "S1", quantity: 1 }),
      mv({ product_name: "T1", quantity: 2 }),
    ]
    expect(summarizeProducts(rows)).toBe('T1 4 · 86" IFP 3 · STD1 2 외 1')
  })

  it("3개 이하는 자르지 않는다", () => {
    expect(summarizeProducts([mv({ quantity: 2 })])).toBe('86" IFP 2')
  })
})

describe("날짜 표기", () => {
  it("올해 MM/DD, 다른 해 YY/MM/DD, 없으면 -", () => {
    expect(ledgerDate("2026-11-05T09:00:00Z", "2026-11-25")).toBe("11/05")
    expect(ledgerDate("2025-03-01", "2026-11-25")).toBe("25/03/01")
    expect(ledgerDate(null, "2026-11-25")).toBe("-")
  })
})
