import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  applyLinesToRows,
  buildFeaturedInboundRows,
  buildImporterChoices,
  buildInboundLotChoices,
  buildInboundMovements,
  buildInboundSubmission,
  buildSampleRegisterPayloads,
  buildStorageChoices,
  createInboundRow,
  DEFAULT_IMPORTER_CHOICES,
  DEFAULT_STORAGE_CHOICES,
  findInboundItem,
  formatMonthDay,
  inboundGridKeyIntent,
  inboundMovementDateKey,
  inboundMovementLot,
  inboundPickerGroup,
  inboundRowAmount,
  inboundStorageKind,
  isOfficeStorage,
  lastUnitPriceByProduct,
  localDateKey,
  lookupLastUnitPrice,
  matchInboundProductName,
  parseInboundPaste,
  parseInboundPrice,
  parseInboundQuantity,
  previousLotComposition,
  recentInboundImporter,
  recentInboundStorage,
  resolveInboundSaveOutcome,
  roundUsd,
  shiftDateKey,
  suggestNextLot,
  summarizeInboundDraft,
  validateInboundDraft,
  type InboundDraft,
  type InboundDraftRow,
  type InboundHistoryMovement,
} from "@/components/admin/hardware/inventory/inbound-sheet-model"
import type { HardwareItem } from "@/components/admin/hardware/inventory/shared"

// 한 화면 입고표(시안 A) 순수 모델 회귀. 픽스처 모양은 운영 원장 실측(2026-09-15 읽기 전용 조회)을 따른다 —
// 입고 54행 전부 sheet_import, lot_no 는 NULL 이고 물량번호는 reference_no, storage_location 은 NULL,
// 단가·수입자는 raw 에서 복구된 값, FY24-25 행은 occurred_at 이 없다.

function movement(overrides: Partial<InboundHistoryMovement>): InboundHistoryMovement {
  return {
    item_id: "item-86",
    product_name: '86" IFP',
    movement_type: "inbound",
    quantity: 1,
    occurred_at: "2026-07-16",
    // 시트 이관 행의 created_at 은 가져오기 실행 시각 — 날짜 판단에 쓰면 안 된다.
    created_at: "2026-08-08T05:39:00.000Z",
    lot_no: null,
    reference_no: null,
    source: "sheet_import",
    voided_at: null,
    unit_price: null,
    storage_location: null,
    importer: null,
    to_location: "창고",
    ...overrides,
  }
}

const ITEM_NAMES = [
  '110" IFP',
  '65" IFP',
  '75" IFP',
  '86" IFP',
  "A1",
  "B1",
  "D2",
  "D2T",
  "OPS",
  "POE",
  "S1",
  "STD1",
  "STD1(promoted)",
  'STDM1(110")',
  "T1",
  "T1(promoted)",
  "전원 케이블(1m)",
  "전원 케이블(3m)",
  "카메라 브라켓",
]

function itemId(name: string) {
  return `item-${name}`
}

const ITEMS: HardwareItem[] = ITEM_NAMES.map((name) => ({
  id: itemId(name),
  name,
  category: null,
  reorder_point: 0,
  lead_time_days: 14,
  source_aliases: [name],
}))

const HISTORY: InboundHistoryMovement[] = [
  movement({ reference_no: "C2", occurred_at: "2026-09-08", product_name: '86" IFP', item_id: itemId('86" IFP'), quantity: 15, importer: "클래스인" }),
  movement({ reference_no: "C1", occurred_at: "2026-07-16", product_name: "STD1", item_id: itemId("STD1"), quantity: 40, importer: "클래스인" }),
  movement({ reference_no: "C1", occurred_at: "2026-07-16", product_name: "T1", item_id: itemId("T1"), quantity: 40, importer: "클래스인" }),
  movement({ reference_no: "C1", occurred_at: "2026-07-16", product_name: '86" IFP', item_id: itemId('86" IFP'), quantity: 40, importer: "클래스인" }),
  movement({ reference_no: "C1", occurred_at: "2026-07-15", product_name: "S1", item_id: itemId("S1"), quantity: 1, importer: "클래스인", to_location: "클래스인" }),
  movement({ reference_no: "Sample", occurred_at: "2026-04-30", product_name: '86" IFP', item_id: itemId('86" IFP'), quantity: 5, unit_price: 0, importer: "클래스인", to_location: "클래스인" }),
  movement({ reference_no: "H8", occurred_at: "2026-03-19", product_name: "T1(promoted)", item_id: itemId("T1(promoted)"), quantity: 19, unit_price: 0, importer: "헥토" }),
  movement({ reference_no: "H8", occurred_at: "2026-03-19", product_name: '86" IFP', item_id: itemId('86" IFP'), quantity: 30, unit_price: 2500, importer: "헥토" }),
  movement({ reference_no: "H8", occurred_at: "2026-03-19", product_name: '86" IFP', item_id: itemId('86" IFP'), quantity: 5, unit_price: 0, importer: "헥토" }),
  movement({ reference_no: "H8", occurred_at: "2026-03-19", product_name: '75" IFP', item_id: itemId('75" IFP'), quantity: 9, unit_price: 2200, importer: "헥토" }),
  movement({ reference_no: "H8", occurred_at: "2026-03-19", product_name: "STD1", item_id: itemId("STD1"), quantity: 19, unit_price: 155, importer: "헥토" }),
  movement({ reference_no: "H7(과사람)", occurred_at: "2025-11-24", product_name: '86" IFP', item_id: itemId('86" IFP'), quantity: 40, unit_price: 2200, importer: "정율사관" }),
  movement({ reference_no: "H6", occurred_at: "2025-11-03", product_name: "T1", item_id: itemId("T1"), quantity: 20, unit_price: 470, importer: "헥토" }),
  movement({ reference_no: "H6", occurred_at: "2025-11-03", product_name: "S1", item_id: itemId("S1"), quantity: 2, unit_price: 470, importer: "헥토" }),
  movement({ reference_no: "FY24-25", occurred_at: null, product_name: "T1", item_id: itemId("T1"), quantity: 8, unit_price: 999, importer: "Learnways" }),
]

function row(overrides: Partial<InboundDraftRow> & { key: string }): InboundDraftRow {
  return {
    productName: '86" IFP',
    itemId: itemId('86" IFP'),
    quantity: "",
    unitPrice: "",
    unitPriceSuggested: false,
    storage: "",
    serials: "",
    pinned: false,
    ...overrides,
  }
}

function draft(overrides: Partial<InboundDraft> = {}): InboundDraft {
  return {
    lot: "C3",
    occurredAt: "2026-09-15",
    importer: "클래스인",
    defaultStorage: "인천 더조은",
    rows: [],
    ...overrides,
  }
}

function sequenceKeys(prefix = "k") {
  let seq = 0
  return () => `${prefix}${++seq}`
}

describe("로컬 날짜 키", () => {
  it("한국 새벽(UTC 전날)에도 로컬 날짜를 돌려준다", () => {
    expect(localDateKey(new Date(2026, 8, 15, 0, 30))).toBe("2026-09-15")
    expect(localDateKey(new Date(2026, 8, 15, 8, 59))).toBe("2026-09-15")
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
  })

  it("월말·윤년·연말을 넘겨 날짜를 옮기고, 형식이 틀리면 입력을 그대로 둔다", () => {
    expect(shiftDateKey("2026-09-15", -1)).toBe("2026-09-14")
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28")
    expect(shiftDateKey("2024-03-01", -1)).toBe("2024-02-29")
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01")
    expect(shiftDateKey("2026-13-01", 1)).toBe("2026-13-01")
    expect(shiftDateKey("9/15", -1)).toBe("9/15")
  })

  it("칩 날짜를 M/D 로 줄인다", () => {
    expect(formatMonthDay("2026-09-08")).toBe("9/8")
    expect(formatMonthDay(null)).toBe("날짜 없음")
  })

  it("시트 이관 행은 occurred_at 이 없으면 날짜를 모르는 것으로 둔다(created_at 폴백은 수기 행만)", () => {
    expect(inboundMovementDateKey(movement({ occurred_at: null }))).toBeNull()
    expect(inboundMovementDateKey(movement({ occurred_at: "2026-07-16T00:00:00+00:00" }))).toBe("2026-07-16")
    const manual = movement({ occurred_at: null, source: "admin_manual", created_at: new Date(2026, 8, 14, 10).toISOString() })
    expect(inboundMovementDateKey(manual)).toBe("2026-09-14")
  })
})

describe("물량번호 후보·추천", () => {
  it("수기 행은 lot_no, 시트 행은 reference_no 를 물량번호로 읽는다(movementLot 규칙)", () => {
    expect(inboundMovementLot(movement({ lot_no: " C3 ", reference_no: "C1" }))).toBe("C3")
    expect(inboundMovementLot(movement({ reference_no: "C1" }))).toBe("C1")
    expect(inboundMovementLot(movement({ source: "admin_manual", reference_no: "deal:123" }))).toBeNull()
  })

  it("입고 물량을 첫 입고일 최신순으로 묶고, 날짜 없는 물량은 맨 뒤로 보낸다", () => {
    const all = buildInboundLotChoices(HISTORY, 0)
    expect(all.map((choice) => choice.lot)).toEqual(["C2", "C1", "Sample", "H8", "H7(과사람)", "H6", "FY24-25"])
    expect(all[1]).toEqual({ lot: "C1", firstDate: "2026-07-15", lastDate: "2026-07-16", totalQuantity: 121, productCount: 4 })
    expect(all.find((choice) => choice.lot === "H8")).toMatchObject({ totalQuantity: 82, productCount: 4 })
    expect(buildInboundLotChoices(HISTORY)).toHaveLength(6)
    expect(buildInboundLotChoices(HISTORY, 2).map((choice) => choice.lot)).toEqual(["C2", "C1"])
  })

  it("취소·출고·수량 0 행은 물량 집계에서 뺀다", () => {
    const choices = buildInboundLotChoices(
      [
        movement({ reference_no: "C9", quantity: 3 }),
        movement({ reference_no: "C9", quantity: 4, voided_at: "2026-09-01T00:00:00Z" }),
        movement({ reference_no: "C9", quantity: 5, movement_type: "outbound" }),
      ],
      0
    )
    expect(choices).toEqual([{ lot: "C9", firstDate: "2026-07-16", lastDate: "2026-07-16", totalQuantity: 3, productCount: 1 }])
  })

  it("날짜가 가장 최근인 영문+숫자 물량의 번호를 올린다: C2 → C3, H8 → H9", () => {
    expect(suggestNextLot(buildInboundLotChoices(HISTORY, 0))).toBe("C3")
    expect(suggestNextLot([{ lot: "H8", firstDate: "2026-03-19", lastDate: "2026-03-19" }])).toBe("H9")
  })

  it("H7(과사람)·FY24-25·Sample 은 올리기 기준이 아니다", () => {
    expect(
      suggestNextLot([
        { lot: "Sample", firstDate: "2026-04-30", lastDate: "2026-04-30" },
        { lot: "H7(과사람)", firstDate: "2025-11-24", lastDate: "2025-11-24" },
        { lot: "FY24-25", firstDate: null, lastDate: null },
      ])
    ).toBeNull()
    expect(
      suggestNextLot([
        { lot: "H7(과사람)", firstDate: "2025-11-24", lastDate: "2025-11-24" },
        { lot: "H5", firstDate: "2025-08-29", lastDate: "2025-08-29" },
      ])
    ).toBe("H6")
  })

  it("추천 번호가 기존 물량(앞 코드 포함)과 겹치면 건너뛴다", () => {
    expect(
      suggestNextLot([
        { lot: "H6", firstDate: "2025-11-03", lastDate: "2025-11-03" },
        { lot: "H7(과사람)", firstDate: null, lastDate: null },
      ])
    ).toBe("H8")
    // 날짜가 잘못 적힌 C1 이 더 최근이어도 이미 있는 C2 는 추천하지 않는다.
    expect(
      suggestNextLot([
        { lot: "C1", firstDate: "2026-09-20", lastDate: "2026-09-20" },
        { lot: "C2", firstDate: "2026-09-08", lastDate: "2026-09-08" },
      ])
    ).toBe("C3")
    expect(suggestNextLot([{ lot: "H08", firstDate: "2026-01-01", lastDate: "2026-01-01" }])).toBe("H09")
    expect(suggestNextLot([])).toBeNull()
  })
})

describe("보관처·수입자 후보", () => {
  it("기본 후보를 앞에 두고, 이력의 클래스인은 클래스인 사무실로 합친다", () => {
    const choices = buildStorageChoices([
      ...HISTORY,
      movement({ source: "admin_manual", storage_location: "평택 물류", occurred_at: "2026-09-10" }),
      movement({ source: "admin_manual", storage_location: "ClassIn", occurred_at: "2026-09-11", to_location: "사무실" }),
      movement({ source: "admin_manual", storage_location: "오산창고", occurred_at: "2026-09-12" }),
    ])
    expect(choices.slice(0, DEFAULT_STORAGE_CHOICES.length)).toEqual([...DEFAULT_STORAGE_CHOICES])
    expect(choices).toEqual(["오산 창고", "인천 더조은", "클래스인 사무실", "고객사 직송", "평택 물류"])
  })

  it("정규화된 도착 위치 '창고' 는 오산·인천을 가를 수 없어 후보로 쓰지 않는다", () => {
    expect(buildStorageChoices([movement({ to_location: "창고" })])).toEqual([...DEFAULT_STORAGE_CHOICES])
  })

  it("수입자 이력을 최근·빈도순으로 뒤에 붙이고 ClassIn 표기를 클래스인으로 합친다", () => {
    const choices = buildImporterChoices([...HISTORY, movement({ importer: "ClassIn", occurred_at: "2026-09-14" })])
    expect(choices.slice(0, DEFAULT_IMPORTER_CHOICES.length)).toEqual([...DEFAULT_IMPORTER_CHOICES])
    expect(choices).toEqual(["클래스인", "헥토", "Learnways", "정율사관"])
  })

  it("새 입고표 기본값: 수입자는 최근 입고, 보관처는 보관처를 명시한 최근 입고만 본다", () => {
    expect(recentInboundImporter(HISTORY)).toBe("클래스인")
    expect(recentInboundStorage(HISTORY)).toBe("")
    expect(
      recentInboundStorage([...HISTORY, movement({ source: "admin_manual", storage_location: "인천 더조은", occurred_at: "2026-09-12" })])
    ).toBe("인천 더조은")
  })

  it("사무실 보관 판정은 서버 사무실 규칙(클래스인·사무실·ClassIn·office)과 같다", () => {
    for (const label of ["클래스인", "클래스인 사무실", "ClassIn", "Class In", "사무실", "office"]) {
      expect(isOfficeStorage(label)).toBe(true)
    }
    for (const label of ["인천 더조은", "오산 창고", "고객사 직송", "", null]) {
      expect(isOfficeStorage(label)).toBe(false)
    }
  })

  it("재고 위치로 읽히지 않는 보관처만 other 로 분류한다", () => {
    expect(inboundStorageKind("오산 창고")).toBe("warehouse")
    expect(inboundStorageKind("인천 더조은")).toBe("warehouse")
    expect(inboundStorageKind("고객사 직송")).toBe("customer")
    expect(inboundStorageKind("클래스인 사무실")).toBe("office")
    expect(inboundStorageKind("평택 물류")).toBe("other")
    expect(inboundStorageKind("  ")).toBeNull()
  })
})

describe("단가·이전 구성", () => {
  it("제품별 가장 최근의 양수 입고 단가를 쓴다(0원 판촉 물량·날짜 없는 행은 뒤로)", () => {
    const prices = lastUnitPriceByProduct(HISTORY)
    expect(lookupLastUnitPrice(prices, '86" IFP')).toBe(2500)
    expect(lookupLastUnitPrice(prices, '75" IFP')).toBe(2200)
    expect(lookupLastUnitPrice(prices, "STD1")).toBe(155)
    expect(lookupLastUnitPrice(prices, "T1")).toBe(470)
    expect(lookupLastUnitPrice(prices, "S1")).toBe(470)
    expect(lookupLastUnitPrice(prices, "T1(promoted)")).toBeNull()
    expect(lookupLastUnitPrice(prices, "86” IFP")).toBe(2500)
  })

  it("물량을 지정하지 않으면 날짜가 가장 최근인 물량의 구성을 돌려준다", () => {
    expect(previousLotComposition(HISTORY)).toEqual([
      { itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 15, unitPrice: null, storage: "" },
    ])
  })

  it("C1 구성: 주요 품목 순서, S1 만 클래스인 사무실, 나머지는 기본 보관처를 따른다", () => {
    expect(previousLotComposition(HISTORY, "C1")).toEqual([
      { itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 40, unitPrice: null, storage: "" },
      { itemId: itemId("STD1"), productName: "STD1", quantity: 40, unitPrice: null, storage: "" },
      { itemId: itemId("T1"), productName: "T1", quantity: 40, unitPrice: null, storage: "" },
      { itemId: itemId("S1"), productName: "S1", quantity: 1, unitPrice: null, storage: "클래스인 사무실" },
    ])
  })

  it("같은 품목이라도 단가가 다르면(유상 30 · 무상 5) 줄을 나눈다", () => {
    const h8 = previousLotComposition(HISTORY, "H8").filter((line) => line.productName === '86" IFP')
    expect(h8).toEqual([
      { itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 30, unitPrice: 2500, storage: "" },
      { itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 5, unitPrice: 0, storage: "" },
    ])
    expect(previousLotComposition(HISTORY, "없는물량")).toEqual([])
  })
})

describe("품목 매칭·주요 품목", () => {
  const namesWithDt1 = [...ITEM_NAMES, "DT1"]

  it("정확 일치만 허용한다 — T1 은 DT1·T1(promoted) 에 붙지 않는다", () => {
    expect(matchInboundProductName("T1", namesWithDt1)).toBe("T1")
    expect(matchInboundProductName("DT1", namesWithDt1)).toBe("DT1")
    expect(matchInboundProductName("t1 (Promoted)", namesWithDt1)).toBe("T1(promoted)")
    expect(matchInboundProductName("T", namesWithDt1)).toBeNull()
    expect(matchInboundProductName("IFP", namesWithDt1)).toBeNull()
    expect(matchInboundProductName("T1 카메라", namesWithDt1)).toBeNull()
  })

  it("인치 표기 변형(86\", 86”, 86inch, 86인치, 86 IFP)은 같은 품목으로 본다", () => {
    for (const text of ['86" IFP', "86” IFP", "86inch IFP", "86 inch IFP", "86인치 IFP", "86 IFP", "86IFP"]) {
      expect(matchInboundProductName(text, ITEM_NAMES)).toBe('86" IFP')
    }
    expect(matchInboundProductName("STDM1(110inch)", ITEM_NAMES)).toBe('STDM1(110")')
    expect(matchInboundProductName("886 IFP", ITEM_NAMES)).toBeNull()
  })

  it("품목은 id 또는 정확한 이름으로 찾는다", () => {
    expect(findInboundItem(ITEMS, itemId("STD1"))?.name).toBe("STD1")
    expect(findInboundItem(ITEMS, "std1")?.name).toBe("STD1")
    expect(findInboundItem(ITEMS, "STD")).toBeNull()
    expect(findInboundItem(ITEMS, null)).toBeNull()
  })

  it("주요 품목 슬롯은 86\" → 75\" → STD1 → T1 → S1, 판촉형·비활성은 뺀다", () => {
    const prices = lastUnitPriceByProduct(HISTORY)
    const rows = buildFeaturedInboundRows(ITEMS, { lastPrices: prices })
    expect(rows.map((featured) => featured.productName)).toEqual(['86" IFP', '75" IFP', "STD1", "T1", "S1"])
    expect(rows[0]).toEqual({
      key: `featured:${itemId('86" IFP')}`,
      itemId: itemId('86" IFP'),
      productName: '86" IFP',
      quantity: "",
      unitPrice: "2500",
      unitPriceSuggested: true,
      storage: "",
      serials: "",
      pinned: true,
    })
    const withoutS1 = buildFeaturedInboundRows(ITEMS, { activeItemIds: ITEMS.filter((item) => item.name !== "S1").map((item) => item.id) })
    expect(withoutS1.map((featured) => featured.productName)).toEqual(['86" IFP', '75" IFP', "STD1", "T1"])
  })

  it("품목 추가 목록은 판촉형과 액세서리를 판촉·기타로 접는다", () => {
    expect(inboundPickerGroup('110" IFP')).toBe("main")
    expect(inboundPickerGroup('STDM1(110")')).toBe("main")
    expect(inboundPickerGroup("T1(promoted)")).toBe("promoEtc")
    expect(inboundPickerGroup("STD1(promoted)")).toBe("promoEtc")
    expect(inboundPickerGroup("OPS")).toBe("promoEtc")
    expect(inboundPickerGroup("카메라 브라켓")).toBe("promoEtc")
  })
})

describe("엑셀 붙여넣기", () => {
  const names = [...ITEM_NAMES, "DT1"]

  it("탭 구분(엑셀 복사) 줄에서 품목·수량·단가를 읽고 머리글은 건너뛴다", () => {
    const result = parseInboundPaste('품목\t수량\t단가\n86" IFP\t40\t2,500\n\nSTD1\t40\t$155.00\n1\tT1\t40', names)
    expect(result.unmatched).toEqual([])
    expect(result.rows).toEqual([
      { lineNumber: 2, productName: '86" IFP', quantity: 40, unitPrice: 2500 },
      { lineNumber: 4, productName: "STD1", quantity: 40, unitPrice: 155 },
      { lineNumber: 5, productName: "T1", quantity: 40, unitPrice: null },
    ])
  })

  it("쉼표·공백 구분과 천 단위 쉼표를 구분한다", () => {
    const result = parseInboundPaste('STD1, 2\n86" IFP, 40, 2,500\nT1,100,470\n75" IFP 9 2,200\nS1 x2\nS1 3대 470', names)
    expect(result.unmatched).toEqual([])
    expect(result.rows.map(({ productName, quantity, unitPrice }) => [productName, quantity, unitPrice])).toEqual([
      ["STD1", 2, null],
      ['86" IFP', 40, 2500],
      ["T1", 100, 470],
      ['75" IFP', 9, 2200],
      ["S1", 2, null],
      ["S1", 3, 470],
    ])
  })

  it("T1 은 DT1·T1(promoted) 로 잘못 붙지 않고, 대소문자·인치 표기만 너그럽게 본다", () => {
    const result = parseInboundPaste("T1 3\nDT1 2\nt1(promoted) 5\n86” ifp 4\n86inch IFP 1", names)
    expect(result.rows.map((line) => [line.productName, line.quantity])).toEqual([
      ["T1", 3],
      ["DT1", 2],
      ["T1(promoted)", 5],
      ['86" IFP', 4],
      ['86" IFP', 1],
    ])
  })

  it("매칭 실패 줄을 이유와 줄 번호로 돌려준다", () => {
    const result = parseInboundPaste("T 3\n\nT1\t0\nT1 1.5\n카메라 2", names)
    expect(result.rows).toEqual([])
    expect(result.unmatched).toEqual([
      { lineNumber: 1, text: "T 3", reason: "product" },
      { lineNumber: 3, text: "T1\t0", reason: "quantity" },
      { lineNumber: 4, text: "T1 1.5", reason: "quantity" },
      { lineNumber: 5, text: "카메라 2", reason: "product" },
    ])
  })
})

describe("구성·붙여넣기 반영", () => {
  it("같은 품목 행에 수량을 채우고, 없는 품목은 행을 더하며, 단가가 없으면 제안 단가를 유지한다", () => {
    const prices = lastUnitPriceByProduct(HISTORY)
    const featured = buildFeaturedInboundRows(ITEMS, { lastPrices: prices })
    const next = applyLinesToRows(
      featured,
      [
        { productName: '86" IFP', quantity: 40, unitPrice: null, storage: "" },
        { productName: "S1", quantity: 1, storage: "클래스인 사무실" },
        { productName: "OPS", quantity: 2, unitPrice: 80 },
        { productName: "신제품 X", quantity: 3 },
      ],
      { items: ITEMS, lastPrices: prices, makeKey: sequenceKeys() }
    )
    const byName = Object.fromEntries(next.map((line) => [line.productName, line]))
    expect(byName['86" IFP']).toMatchObject({ quantity: "40", unitPrice: "2500", unitPriceSuggested: true, storage: "", pinned: true })
    expect(byName.S1).toMatchObject({ quantity: "1", storage: "클래스인 사무실", pinned: true })
    expect(byName.OPS).toMatchObject({ key: "k1", itemId: itemId("OPS"), quantity: "2", unitPrice: "80", unitPriceSuggested: false, pinned: false })
    expect(byName["신제품 X"]).toMatchObject({ key: "k2", quantity: "3", unitPrice: "", pinned: false })
    expect(byName["신제품 X"].itemId).toBeUndefined()
    expect(next).toHaveLength(featured.length + 2)
    // 원본 행 배열은 바꾸지 않는다.
    expect(featured[0].quantity).toBe("")
  })

  it("한 번의 반영에서 같은 품목이 두 줄이면 두 번째 줄은 새 행이 된다", () => {
    const featured = buildFeaturedInboundRows(ITEMS)
    const next = applyLinesToRows(
      featured,
      [
        { productName: '86" IFP', quantity: 30, unitPrice: 2500 },
        { productName: '86" IFP', quantity: 5, unitPrice: 0 },
      ],
      { items: ITEMS, makeKey: sequenceKeys() }
    )
    const boards = next.filter((line) => line.productName === '86" IFP')
    expect(boards.map((line) => [line.quantity, line.unitPrice])).toEqual([
      ["30", "2500"],
      ["5", "0"],
    ])
  })
})

describe("검증", () => {
  it("헤더: 물량번호 필수, 날짜 형식, 수량 입력 품목 없음", () => {
    const result = validateInboundDraft(draft({ lot: " ", occurredAt: "2026-02-30", rows: [row({ key: "a" })] }))
    expect(result.headerErrors).toEqual(["물량번호를 정하세요.", "입고일을 YYYY-MM-DD 형식으로 입력하세요.", "수량을 입력한 품목이 없습니다."])
    expect(result.rowErrors).toEqual({})
  })

  it("행: 수량 1 이상 정수, 단가 0 이상, 시리얼 개수 = 수량, 수량 빈 행은 무시", () => {
    const result = validateInboundDraft(
      draft({
        rows: [
          row({ key: "zero", quantity: "0" }),
          row({ key: "fraction", quantity: "1.5" }),
          row({ key: "negative-price", quantity: "2", unitPrice: "-1" }),
          row({ key: "serial-mismatch", quantity: "3", serials: "SN1, SN2" }),
          row({ key: "serial-ok", quantity: "2", serials: "SN1\nSN2" }),
          row({ key: "free", quantity: "5", unitPrice: "0" }),
          row({ key: "ignored", quantity: "", unitPrice: "abc", serials: "SN9" }),
        ],
      })
    )
    expect(result.headerErrors).toEqual([])
    expect(result.rowErrors).toEqual({
      zero: "수량은 1 이상 정수로 입력하세요.",
      fraction: "수량은 1 이상 정수로 입력하세요.",
      "negative-price": "단가는 0 이상 숫자로 입력하세요.",
      "serial-mismatch": "시리얼 2개와 수량 3대가 다릅니다.",
    })
  })

  it("보관처가 비면 헤더 오류, 인식되지 않는 보관처·새 품목은 경고만 한다", () => {
    const missing = validateInboundDraft(draft({ defaultStorage: "", rows: [row({ key: "a", quantity: "1" })] }))
    expect(missing.headerErrors).toEqual(["기본 보관처를 고르거나 행마다 보관처를 정하세요."])

    const warned = validateInboundDraft(
      draft({
        rows: [
          row({ key: "custom-storage", quantity: "1", storage: "평택 물류" }),
          row({ key: "new-product", quantity: "1", itemId: undefined, productName: "신제품 X" }),
        ],
      })
    )
    expect(warned.headerErrors).toEqual([])
    expect(warned.rowErrors).toEqual({})
    expect(Object.keys(warned.rowWarnings).sort()).toEqual(["custom-storage", "new-product"])
  })

  it("서버 배치 상한(50줄)을 넘으면 막는다", () => {
    const rows = Array.from({ length: 51 }, (_, index) => row({ key: `r${index}`, quantity: "1" }))
    expect(validateInboundDraft(draft({ rows })).headerErrors).toEqual(["한 번에 최대 50줄까지 저장할 수 있습니다."])
  })
})

describe("요약·금액", () => {
  it("품목 수·대수·USD 합계·사무실 대수를 센다(행 보관처가 기본값보다 우선)", () => {
    const summary = summarizeInboundDraft(
      draft({
        rows: [
          row({ key: "a", quantity: "40", unitPrice: "2500" }),
          row({ key: "b", quantity: "5", unitPrice: "0" }),
          row({ key: "c", itemId: itemId("S1"), productName: "S1", quantity: "1", unitPrice: "470", storage: "클래스인 사무실" }),
          row({ key: "d", itemId: itemId("T1"), productName: "T1", quantity: "3", unitPrice: "155.55" }),
          row({ key: "e", itemId: itemId("STD1"), productName: "STD1", quantity: "" , unitPrice: "155" }),
          row({ key: "f", itemId: itemId("OPS"), productName: "OPS", quantity: "abc" }),
        ],
      })
    )
    expect(summary).toEqual({ productCount: 3, lineCount: 4, units: 49, totalUsd: 100936.65, pricedLines: 4, officeUnits: 1 })
  })

  it("금액은 소수 둘째 자리 반올림이다(부동소수 오차 없이)", () => {
    expect(roundUsd(3 * 155.55)).toBe(466.65)
    expect(roundUsd(1.005)).toBe(1.01)
    expect(roundUsd(7 * 0.1)).toBe(0.7)
    expect(inboundRowAmount({ quantity: "3", unitPrice: "155.555" })).toBe(466.67)
    expect(inboundRowAmount({ quantity: "", unitPrice: "155" })).toBeNull()
  })

  it("수량·단가 원문을 너그럽게 읽는다", () => {
    expect(parseInboundQuantity("1,000")).toBe(1000)
    expect(parseInboundQuantity("40,2500")).toBeNull()
    expect(parseInboundQuantity(" 7 ")).toBe(7)
    expect(parseInboundPrice("$2,500.00")).toBe(2500)
    expect(parseInboundPrice("470 USD")).toBe(470)
    expect(parseInboundPrice(".5")).toBe(0.5)
    expect(parseInboundPrice("-3")).toBeNull()
  })
})

describe("전송 형식", () => {
  const MOVEMENT_KEYS = [
    "amountCny",
    "amountUsd",
    "fromLocation",
    "importer",
    "itemId",
    "lotNo",
    "memo",
    "movementType",
    "occurredAt",
    "owner",
    "productName",
    "quantity",
    "referenceNo",
    "serials",
    "status",
    "storageLocation",
    "toLocation",
    "unitPrice",
  ]

  it("수량 있는 행만, 보관처 라벨을 toLocation·storageLocation 양쪽에 싣는다", () => {
    const submission = buildInboundSubmission(
      draft({
        owner: " 문 ",
        rows: [
          row({ key: "board", quantity: "40", unitPrice: "2500", unitPriceSuggested: true }),
          row({ key: "empty", itemId: itemId("75\" IFP"), productName: '75" IFP', quantity: "" }),
          row({ key: "s1", itemId: itemId("S1"), productName: "S1", quantity: "2", unitPrice: "155.555", storage: "클래스인 사무실", serials: "SN1, SN2" }),
          row({ key: "new", itemId: undefined, productName: "  신제품   X ", quantity: "1" }),
        ],
      })
    )
    expect(submission.rowKeys).toEqual(["board", "s1", "new"])
    expect(submission.movements).toEqual([
      {
        itemId: itemId('86" IFP'),
        productName: '86" IFP',
        movementType: "inbound",
        quantity: 40,
        occurredAt: "2026-09-15",
        fromLocation: "",
        toLocation: "인천 더조은",
        owner: "문",
        status: "입고",
        referenceNo: "",
        memo: "",
        lotNo: "C3",
        unitPrice: 2500,
        amountUsd: 100000,
        amountCny: null,
        storageLocation: "인천 더조은",
        importer: "클래스인",
        serials: [],
      },
      {
        itemId: itemId("S1"),
        productName: "S1",
        movementType: "inbound",
        quantity: 2,
        occurredAt: "2026-09-15",
        fromLocation: "",
        toLocation: "클래스인 사무실",
        owner: "문",
        status: "입고",
        referenceNo: "",
        memo: "",
        lotNo: "C3",
        unitPrice: 155.555,
        amountUsd: 311.11,
        amountCny: null,
        storageLocation: "클래스인 사무실",
        importer: "클래스인",
        serials: ["SN1", "SN2"],
      },
      {
        productName: "신제품 X",
        movementType: "inbound",
        quantity: 1,
        occurredAt: "2026-09-15",
        fromLocation: "",
        toLocation: "인천 더조은",
        owner: "문",
        status: "입고",
        referenceNo: "",
        memo: "",
        lotNo: "C3",
        unitPrice: null,
        amountUsd: null,
        amountCny: null,
        storageLocation: "인천 더조은",
        importer: "클래스인",
        serials: [],
      },
    ])
    expect(buildInboundMovements(draft({ rows: [row({ key: "x", quantity: "1" })] }))).toHaveLength(1)
  })

  it("보관처가 끝내 비어 있으면 창고로 보낸다(도착 위치 null 로 재고에서 사라지지 않게)", () => {
    const [payload] = buildInboundMovements(draft({ defaultStorage: "", rows: [row({ key: "a", quantity: "1" })] }))
    expect(payload.toLocation).toBe("창고")
    expect(payload.storageLocation).toBe("창고")
  })

  it("전송 키는 movements API readMovementInput 이 읽는 필드와 같다", () => {
    const [payload] = buildInboundMovements(draft({ rows: [row({ key: "a", quantity: "1" })] }))
    expect(Object.keys(payload).sort()).toEqual(MOVEMENT_KEYS)
    const route = readFileSync(join(process.cwd(), "app/api/admin/hardware/movements/route.ts"), "utf8")
    for (const key of MOVEMENT_KEYS) {
      expect(route).toContain(`body, "${key}"`)
    }
  })
})

describe("저장 결과·샘플 유닛 등록", () => {
  it("207 부분 실패를 행 키로 되돌리고, 저장된 줄은 서버가 준 품목·원장 id 를 쓴다", () => {
    const submission = buildInboundSubmission(
      draft({
        rows: [
          row({ key: "board", quantity: "40" }),
          row({ key: "s1", itemId: itemId("S1"), productName: "S1", quantity: "2", storage: "클래스인 사무실" }),
          row({ key: "new", itemId: undefined, productName: "신제품 X", quantity: "1", storage: "클래스인" }),
        ],
      })
    )
    const outcome = resolveInboundSaveOutcome(submission, [
      { index: 0, ok: true, movement: { id: "mv-board", item_id: itemId('86" IFP') } },
      { index: 1, ok: false, error: "수량은 1 이상 정수여야 합니다." },
      { index: 2, ok: true, movement: { id: "mv-new", item_id: "item-created" } },
    ])
    expect(outcome.failedErrors).toEqual({ s1: "수량은 1 이상 정수여야 합니다." })
    expect(outcome.savedUnits).toBe(41)
    expect(outcome.savedLines).toEqual([
      { rowKey: "board", itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 40, storage: "인천 더조은", movementId: "mv-board" },
      { rowKey: "new", itemId: "item-created", productName: "신제품 X", quantity: 1, storage: "클래스인", movementId: "mv-new" },
    ])
  })

  it("서버 결과가 빠진 줄은 성공으로 숨기지 않는다", () => {
    const submission = buildInboundSubmission(draft({ rows: [row({ key: "a", quantity: "1" })] }))
    expect(resolveInboundSaveOutcome(submission, []).failedErrors).toEqual({ a: "서버 응답에 이 줄의 결과가 없습니다." })
  })

  it("사무실 보관 줄만 office 유닛 등록 요청으로 바꾸고 서버 상한 60대씩 나눈다", () => {
    const payloads = buildSampleRegisterPayloads(
      [
        { rowKey: "a", itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 40, storage: "인천 더조은", movementId: "mv-a" },
        { rowKey: "b", itemId: itemId("T1"), productName: "T1", quantity: 130, storage: "클래스인 사무실", movementId: "mv-b" },
        { rowKey: "c", productName: "신제품 X", quantity: 1, storage: "ClassIn" },
      ],
      { lot: "C3", occurredAt: "2026-09-15", owner: "문" }
    )
    expect(payloads.map((payload) => [payload.productName, payload.count])).toEqual([
      ["T1", 60],
      ["T1", 60],
      ["T1", 10],
      ["신제품 X", 1],
    ])
    expect(payloads[0]).toEqual({
      action: "register",
      itemId: itemId("T1"),
      productName: "T1",
      count: 60,
      status: "office",
      occurredAt: "2026-09-15",
      movementRef: "mv-b",
      memo: "C3 입고 · 사무실 보관분 자동 등록",
      owner: "문",
    })
    expect(payloads[3]).not.toHaveProperty("itemId")
    expect(payloads[3]).not.toHaveProperty("movementRef")
  })

  it("등록 요청 키는 samples API register 가 읽는 필드와 같다", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/hardware/samples/route.ts"), "utf8")
    expect(route).toContain('"register"')
    for (const key of ["itemId", "productName", "count", "status", "occurredAt", "movementRef", "memo", "owner"]) {
      expect(route).toContain(`body, "${key}"`)
    }
    expect(route).toMatch(/statusValue !== "office"/)
  })
})

describe("키보드", () => {
  const base = { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false, keyCode: 13 }

  it("Enter 는 다음 행, Shift+Enter 는 이전 행, Cmd/Ctrl+Enter 는 저장", () => {
    expect(inboundGridKeyIntent(base)).toBe("next")
    expect(inboundGridKeyIntent({ ...base, shiftKey: true })).toBe("previous")
    expect(inboundGridKeyIntent({ ...base, metaKey: true })).toBe("save")
    expect(inboundGridKeyIntent({ ...base, ctrlKey: true })).toBe("save")
    expect(inboundGridKeyIntent({ ...base, key: "Tab" })).toBeNull()
  })

  it("한글 조합 중 Enter 는 무시한다", () => {
    expect(inboundGridKeyIntent({ ...base, isComposing: true })).toBeNull()
    expect(inboundGridKeyIntent({ ...base, keyCode: 229 })).toBeNull()
    expect(inboundGridKeyIntent({ ...base, metaKey: true, isComposing: true })).toBeNull()
  })
})

describe("행 만들기", () => {
  it("최근 단가가 있으면 제안 값으로 채운다", () => {
    const prices = lastUnitPriceByProduct(HISTORY)
    expect(createInboundRow({ key: "a", itemId: itemId("STD1"), productName: "STD1", lastPrices: prices })).toMatchObject({
      unitPrice: "155",
      unitPriceSuggested: true,
      pinned: false,
    })
    expect(createInboundRow({ key: "b", productName: "신제품 X", lastPrices: prices })).toMatchObject({
      unitPrice: "",
      unitPriceSuggested: false,
    })
  })
})

describe("InboundSheet 소스 계약", () => {
  const sheet = readFileSync(join(process.cwd(), "components/admin/hardware/inventory/InboundSheet.tsx"), "utf8")
  const model = readFileSync(join(process.cwd(), "components/admin/hardware/inventory/inbound-sheet-model.ts"), "utf8")

  it("클라이언트 컴포넌트이고 adminFetch 로 movements API 에 POST 한다", () => {
    expect(sheet.startsWith('"use client"')).toBe(true)
    expect(sheet).toContain('from "@/lib/admin-client"')
    expect(sheet).toMatch(/adminFetch\("\/api\/admin\/hardware\/movements",\s*\{\s*method: "POST"/)
    expect(sheet).toContain("JSON.stringify({ movements: submission.movements })")
    expect(sheet).toMatch(/adminFetchJson<[^>]*>\("\/api\/admin\/hardware\/samples",\s*\{\s*method: "POST"/)
  })

  it("UTC 날짜 자르기를 쓰지 않는다(한국 00~09시에 전날이 된다)", () => {
    for (const source of [sheet, model]) {
      expect(source).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/)
      expect(source).not.toMatch(/\btodayKey\(/)
    }
  })

  it("모델은 React 를 쓰지 않는다", () => {
    expect(model).not.toMatch(/from "react"/)
    expect(model).not.toContain('"use client"')
  })

  it("숫자 칸은 숫자 키패드를 띄우고 표 숫자는 tabular-nums 로 맞춘다", () => {
    expect(sheet).toContain('inputMode="numeric"')
    expect(sheet).toContain('inputMode="decimal"')
    expect(sheet).toContain("tabular-nums")
  })
})
