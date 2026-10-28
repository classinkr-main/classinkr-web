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
  checkInboundLot,
  createInboundRow,
  DEFAULT_IMPORTER_CHOICES,
  INBOUND_STORAGE_CHOICES,
  INBOUND_UNLISTED_PRODUCT_MESSAGE,
  findInboundItem,
  formatMonthDay,
  inboundGridKeyIntent,
  inboundMovementDateKey,
  inboundMovementLot,
  inboundPickerGroup,
  inboundDraftNeedsLot,
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
  resolveInboundNextLot,
  resolveInboundSaveOutcome,
  roundUsd,
  shiftDateKey,
  summarizeInboundDraft,
  validateInboundDraft,
  type InboundDraft,
  type InboundDraftRow,
  type InboundHistoryMovement,
  type InboundLotContext,
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
    lotTracked: true,
    isFree: null,
    memo: "",
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
    isFree: false,
    rows: [],
    ...overrides,
  }
}

// 대시보드 이력의 물류번호 + 다음 신규 번호(전역 C 순번: C1·C2 다음은 C3).
const LOT_CONTEXT: InboundLotContext = {
  knownLots: buildInboundLotChoices(HISTORY, 0).map((choice) => choice.lot),
  nextLot: "C3",
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

describe("물류번호 후보·순번", () => {
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

  it("다음 신규 번호는 공용 nextLotNo(전역 C 순번)다 — H·FY·Sample 번호는 순번에 안 들어간다", () => {
    expect(resolveInboundNextLot(buildInboundLotChoices(HISTORY, 0).map((choice) => choice.lot))).toBe("C3")
    expect(resolveInboundNextLot(["H8", "H7(과사람)", "Sample", "FY24-25"])).toBe("C1")
    expect(resolveInboundNextLot([])).toBe("C1")
  })

  it("서버(/lots)의 nextLotNo 가 화면 이력보다 앞서 있으면 서버 값을 쓴다(대시보드는 최근 2,000건만 본다)", () => {
    expect(resolveInboundNextLot(["C1", "C2"], "C5")).toBe("C5")
    // 화면이 방금 저장한 번호가 더 크면 그쪽을 따른다.
    expect(resolveInboundNextLot(["C1", "C2", "C3"], "C3")).toBe("C4")
    expect(resolveInboundNextLot(["C1"], null)).toBe("C2")
    expect(resolveInboundNextLot(["C1"], "이상한 값")).toBe("C2")
  })

  it("물류번호는 기존 번호이거나 다음 순번만 — 건너뛴 번호·없는 번호·형식 밖 새 번호는 막는다", () => {
    expect(checkInboundLot("C3", LOT_CONTEXT)).toEqual({ ok: true, kind: "new", lot: "C3" })
    expect(checkInboundLot(" c3 ", LOT_CONTEXT)).toEqual({ ok: true, kind: "new", lot: "C3" })
    expect(checkInboundLot("c2", LOT_CONTEXT)).toEqual({ ok: true, kind: "existing", lot: "C2" })
    // 옛 H 번호·특수 번호에도 추가 입고할 수 있다(표기는 원장 그대로).
    expect(checkInboundLot("h7(과사람)", LOT_CONTEXT)).toEqual({ ok: true, kind: "existing", lot: "H7(과사람)" })
    expect(checkInboundLot("C5", LOT_CONTEXT)).toEqual({ ok: false, error: "C5은(는) 번호를 건너뜁니다. 다음 신규 물류번호는 C3입니다." })
    expect(checkInboundLot("C0", LOT_CONTEXT)).toMatchObject({ ok: false })
    expect(checkInboundLot("H9", LOT_CONTEXT)).toEqual({
      ok: false,
      error: "새 물류번호는 다음 순번 C3만 쓸 수 있습니다. 기존 번호는 목록에서 고르세요.",
    })
    expect(checkInboundLot("  ", LOT_CONTEXT)).toEqual({ ok: false, error: "물류번호를 고르세요." })
  })

  it("InboundSheet 는 자체 번호 추천 대신 공용 규칙을 쓴다", () => {
    const sheet = readFileSync(join(process.cwd(), "components/admin/hardware/inventory/InboundSheet.tsx"), "utf8")
    const model = readFileSync(join(process.cwd(), "components/admin/hardware/inventory/inbound-sheet-model.ts"), "utf8")
    expect(sheet).not.toContain("suggestNextLot")
    expect(model).not.toContain("suggestNextLot")
    expect(model).toContain('from "@/lib/hardware/inventory-process"')
    expect(sheet).toContain("resolveInboundNextLot")
    expect(sheet).toContain("checkInboundLot")
  })
})

describe("보관처·수입자 후보", () => {
  it("보관 장소는 고정 3종이다 — 이력의 옛 표기·직접 입력 값은 후보가 되지 않는다", () => {
    expect(INBOUND_STORAGE_CHOICES).toEqual(["오산 창고", "인천 더조은", "클래스인 사무실"])
    expect(buildStorageChoices()).toEqual([...INBOUND_STORAGE_CHOICES])
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
    // 고정 목록 밖 보관처(옛 직접 입력)는 기본값으로 되살리지 않고 그 다음 최근 값을 본다.
    expect(
      recentInboundStorage([
        movement({ source: "admin_manual", storage_location: "오산창고", occurred_at: "2026-09-10" }),
        movement({ source: "admin_manual", storage_location: "평택 물류", occurred_at: "2026-09-12" }),
      ])
    ).toBe("오산 창고")
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
      lotTracked: true,
      isFree: null,
      memo: "",
      quantity: "",
      unitPrice: "2500",
      unitPriceSuggested: true,
      storage: "",
      serials: "",
      pinned: true,
    })
    // 물류번호 관리 칸(lot_tracked)이 false 인 품목은 수량만 행으로 만든다.
    const accessoryRows = buildFeaturedInboundRows(ITEMS.map((item) => (item.name === "S1" ? { ...item, lot_tracked: false } : item)))
    expect(accessoryRows.find((featured) => featured.productName === "S1")?.lotTracked).toBe(false)
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
        { productName: "S1", quantity: 1, storage: "클래스인사무실" },
        { productName: "OPS", quantity: 2, unitPrice: 80 },
        { productName: "신제품 X", quantity: 3 },
      ],
      { items: ITEMS, lastPrices: prices, makeKey: sequenceKeys() }
    )
    const byName = Object.fromEntries(next.map((line) => [line.productName, line]))
    expect(byName['86" IFP']).toMatchObject({ quantity: "40", unitPrice: "2500", unitPriceSuggested: true, storage: "", pinned: true })
    expect(byName.S1).toMatchObject({ quantity: "1", storage: "클래스인 사무실", pinned: true })
    expect(byName.OPS).toMatchObject({ key: "k1", itemId: itemId("OPS"), quantity: "2", unitPrice: "80", unitPriceSuggested: false, pinned: false, lotTracked: true })
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
  it("헤더: 물류번호 순번, 날짜 형식, 수량 입력 품목 없음", () => {
    const result = validateInboundDraft(draft({ lot: " ", occurredAt: "2026-02-30", rows: [row({ key: "a" })] }), LOT_CONTEXT)
    expect(result.headerErrors).toEqual(["입고일을 YYYY-MM-DD 형식으로 입력하세요.", "수량을 입력한 품목이 없습니다."])
    expect(result.rowErrors).toEqual({})
    const skipped = validateInboundDraft(draft({ lot: "C4", rows: [row({ key: "a", quantity: "1" })] }), LOT_CONTEXT)
    expect(skipped.headerErrors).toEqual(["C4은(는) 번호를 건너뜁니다. 다음 신규 물류번호는 C3입니다."])
    const blank = validateInboundDraft(draft({ lot: "", rows: [row({ key: "a", quantity: "1" })] }), LOT_CONTEXT)
    expect(blank.headerErrors).toEqual(["물류번호를 고르세요."])
  })

  it("물류번호 관리 안 하는 품목(액세서리·터치펜)만 있으면 물류번호를 묻지 않는다", () => {
    const accessoryOnly = draft({ lot: "", rows: [row({ key: "pen", itemId: itemId("A1"), productName: "A1", lotTracked: false, quantity: "10" })] })
    expect(inboundDraftNeedsLot(accessoryOnly)).toBe(false)
    expect(validateInboundDraft(accessoryOnly, LOT_CONTEXT).headerErrors).toEqual([])
    const mixed = draft({
      lot: "",
      rows: [row({ key: "pen", itemId: itemId("A1"), productName: "A1", lotTracked: false, quantity: "10" }), row({ key: "b", quantity: "1" })],
    })
    expect(inboundDraftNeedsLot(mixed)).toBe(true)
    expect(validateInboundDraft(mixed, LOT_CONTEXT).headerErrors).toEqual(["물류번호를 고르세요."])
  })

  it("유상·무상은 필수 — 표 값이 없으면 줄마다 정해야 한다", () => {
    const missing = validateInboundDraft(draft({ isFree: null, rows: [row({ key: "a", quantity: "1" })] }), LOT_CONTEXT)
    expect(missing.headerErrors).toEqual(["유상·무상을 고르세요(표 전체 또는 줄마다)."])
    const perRow = validateInboundDraft(
      draft({ isFree: null, rows: [row({ key: "a", quantity: "1", isFree: true }), row({ key: "b", quantity: "2", isFree: false })] }),
      LOT_CONTEXT
    )
    expect(perRow.headerErrors).toEqual([])
    const warned = validateInboundDraft(draft({ isFree: true, rows: [row({ key: "a", quantity: "1", unitPrice: "100" })] }), LOT_CONTEXT)
    expect(warned.rowWarnings).toEqual({ a: "무상 입고인데 단가가 있습니다 — 단가는 원가 기록으로만 남습니다." })
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
      }),
      LOT_CONTEXT
    )
    expect(result.headerErrors).toEqual([])
    expect(result.rowErrors).toEqual({
      zero: "수량은 1 이상 정수로 입력하세요.",
      fraction: "수량은 1 이상 정수로 입력하세요.",
      "negative-price": "단가는 0 이상 숫자로 입력하세요.",
      "serial-mismatch": "시리얼 2개와 수량 3대가 다릅니다.",
    })
  })

  it("보관처가 비면 헤더 오류, 고정 목록 밖 보관처·목록에 없는 품목은 저장을 막는다", () => {
    const missing = validateInboundDraft(draft({ defaultStorage: "", rows: [row({ key: "a", quantity: "1" })] }), LOT_CONTEXT)
    expect(missing.headerErrors).toEqual(["기본 보관처를 고르거나 행마다 보관처를 정하세요."])

    const blocked = validateInboundDraft(
      draft({
        rows: [
          row({ key: "custom-storage", quantity: "1", storage: "평택 물류" }),
          row({ key: "new-product", quantity: "1", itemId: undefined, productName: "신제품 X" }),
        ],
      }),
      LOT_CONTEXT
    )
    expect(blocked.headerErrors).toEqual([])
    expect(blocked.rowErrors).toEqual({
      "custom-storage": "보관 장소는 오산 창고·인천 더조은·클래스인 사무실 중에서 고르세요.",
      "new-product": INBOUND_UNLISTED_PRODUCT_MESSAGE,
    })
  })

  it("서버 배치 상한(50줄)을 넘으면 막는다 — 직배송은 줄마다 두 줄로 센다", () => {
    const rows = Array.from({ length: 51 }, (_, index) => row({ key: `r${index}`, quantity: "1" }))
    expect(validateInboundDraft(draft({ rows }), LOT_CONTEXT).headerErrors).toEqual(["한 번에 최대 50줄까지 저장할 수 있습니다."])
    const directRows = Array.from({ length: 26 }, (_, index) => row({ key: `d${index}`, quantity: "1" }))
    expect(
      validateInboundDraft(draft({ delivery: "direct", directCustomer: { id: "c1", name: "수학의정석" }, directOutboundType: "sales", rows: directRows }), LOT_CONTEXT)
        .headerErrors
    ).toEqual(["직배송은 줄마다 입고·출고 두 줄이 저장돼 한 번에 최대 25품목까지 저장할 수 있습니다."])
  })

  it("직배송은 CRM 고객이 있어야 하고 보관처를 묻지 않는다", () => {
    const noCustomer = validateInboundDraft(draft({ delivery: "direct", defaultStorage: "", rows: [row({ key: "a", quantity: "1" })] }), LOT_CONTEXT)
    expect(noCustomer.headerErrors).toEqual(["직배송 받을 고객사를 CRM 고객 목록에서 고르세요.", "직배송 출고 유형을 고르세요."])
    const ok = validateInboundDraft(
      draft({ delivery: "direct", defaultStorage: "", directCustomer: { id: "c1", name: "수학의정석" }, directOutboundType: "promotion", rows: [row({ key: "a", quantity: "1" })] }),
      LOT_CONTEXT
    )
    expect(ok.headerErrors).toEqual([])
    expect(ok.rowErrors).toEqual({})
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
  // 기존 movements API readMovementInput 이 읽는 키.
  const LEGACY_KEYS = [
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
  // 재고관리 프로세스 계약(갭 문서 §7-3)에서 새로 받는 키.
  const PROCESS_KEYS = ["customerId", "isFree", "outboundType"]

  function inboundBase(overrides: Record<string, unknown> = {}) {
    return {
      itemId: itemId('86" IFP'),
      productName: '86" IFP',
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
      isFree: false,
      unitPrice: null,
      amountUsd: null,
      amountCny: null,
      storageLocation: "인천 더조은",
      importer: "클래스인",
      serials: [],
      ...overrides,
    }
  }

  it("수량 있는 행만, 보관처 라벨을 toLocation·storageLocation 양쪽에 싣고 유상·무상·메모를 보낸다", () => {
    const submission = buildInboundSubmission(
      draft({
        owner: " 문 ",
        rows: [
          row({ key: "board", quantity: "40", unitPrice: "2500", unitPriceSuggested: true, memo: " 1차 선적 " }),
          row({ key: "empty", itemId: itemId('75" IFP'), productName: '75" IFP', quantity: "" }),
          row({ key: "s1", itemId: itemId("S1"), productName: "S1", quantity: "2", unitPrice: "155.555", storage: "클래스인 사무실", serials: "SN1, SN2", isFree: true }),
        ],
      })
    )
    expect(submission.rowKeys).toEqual(["board", "s1"])
    expect(submission.movements).toEqual([
      inboundBase({ quantity: 40, memo: "1차 선적", unitPrice: 2500, amountUsd: 100000 }),
      inboundBase({
        itemId: itemId("S1"),
        productName: "S1",
        quantity: 2,
        toLocation: "클래스인 사무실",
        storageLocation: "클래스인 사무실",
        isFree: true,
        unitPrice: 155.555,
        amountUsd: 311.11,
        serials: ["SN1", "SN2"],
      }),
    ])
    expect(buildInboundMovements(draft({ rows: [row({ key: "x", quantity: "1" })] }))).toHaveLength(1)
  })

  it("물류번호 관리 안 하는 품목은 lotNo 를 싣지 않는다", () => {
    const [pen] = buildInboundMovements(
      draft({ rows: [row({ key: "pen", itemId: itemId("A1"), productName: "A1", lotTracked: false, quantity: "10" })] })
    )
    expect(pen).not.toHaveProperty("lotNo")
    expect(pen).toMatchObject({ productName: "A1", quantity: 10, isFree: false })
  })

  it("유상·무상이 끝내 비면 그 줄을 보내지 않는다(유상으로 추정하지 않는다)", () => {
    expect(buildInboundMovements(draft({ isFree: null, rows: [row({ key: "a", quantity: "1" })] }))).toEqual([])
  })

  it("고객사 직배송: 줄마다 고객사 직송 입고 바로 뒤에 같은 날짜·물류번호의 설치 완료 출고를 붙인다", () => {
    const submission = buildInboundSubmission(
      draft({
        owner: "문",
        delivery: "direct",
        defaultStorage: "",
        directCustomer: { id: "cust-1", name: "수학의정석 학원" },
        directOutboundType: "sales",
        rows: [
          row({ key: "board", quantity: "2", unitPrice: "2500", memo: "직납" }),
          row({ key: "pen", itemId: itemId("A1"), productName: "A1", lotTracked: false, quantity: "4" }),
        ],
      })
    )
    expect(submission.rowKeys).toEqual(["board", "board", "pen", "pen"])
    expect(submission.movements.map((line) => line.movementType)).toEqual(["inbound", "outbound", "inbound", "outbound"])
    expect(submission.movements[0]).toEqual(
      inboundBase({ quantity: 2, toLocation: "고객사 직송", storageLocation: "고객사 직송", memo: "직납", unitPrice: 2500, amountUsd: 5000 })
    )
    expect(submission.movements[1]).toEqual({
      itemId: itemId('86" IFP'),
      productName: '86" IFP',
      movementType: "outbound",
      quantity: 2,
      occurredAt: "2026-09-15",
      fromLocation: "고객사 직송",
      toLocation: "수학의정석 학원",
      customerId: "cust-1",
      outboundType: "sales",
      owner: "문",
      status: "설치 완료",
      referenceNo: "",
      memo: "직납",
      lotNo: "C3",
      unitPrice: null,
      amountUsd: null,
      amountCny: null,
      storageLocation: "",
      importer: "",
      serials: [],
    })
    expect(submission.movements[3]).not.toHaveProperty("lotNo")
    expect(submission.movements[3]).toMatchObject({ movementType: "outbound", fromLocation: "고객사 직송", quantity: 4, customerId: "cust-1" })
  })

  it("입고만 저장된 직배송 줄은 다시 저장할 때 출고 줄만 보낸다", () => {
    const submission = buildInboundSubmission(
      draft({
        delivery: "direct",
        directCustomer: { id: "cust-1", name: "수학의정석 학원" },
        directOutboundType: "as",
        rows: [row({ key: "board", quantity: "2", inboundSaved: true })],
      })
    )
    expect(submission.rowKeys).toEqual(["board"])
    expect(submission.movements).toHaveLength(1)
    expect(submission.movements[0]).toMatchObject({ movementType: "outbound", outboundType: "as" })
  })

  it("보관처가 끝내 비어 있으면 창고로 보낸다(도착 위치 null 로 재고에서 사라지지 않게)", () => {
    const [payload] = buildInboundMovements(draft({ defaultStorage: "", rows: [row({ key: "a", quantity: "1" })] }))
    expect(payload.toLocation).toBe("창고")
    expect(payload.storageLocation).toBe("창고")
  })

  it("전송 키는 movements API 가 읽는 필드다(§7-3 새 필드 포함)", () => {
    const [payload] = buildInboundMovements(draft({ rows: [row({ key: "a", quantity: "1" })] }))
    expect(Object.keys(payload).sort()).toEqual([...LEGACY_KEYS, "isFree"].sort())
    const route = readFileSync(join(process.cwd(), "app/api/admin/hardware/movements/route.ts"), "utf8")
    for (const key of [...LEGACY_KEYS, ...PROCESS_KEYS]) {
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
          row({ key: "t1", itemId: itemId("T1"), productName: "T1", quantity: "1", storage: "클래스인 사무실" }),
        ],
      })
    )
    const outcome = resolveInboundSaveOutcome(submission, [
      { index: 0, ok: true, movement: { id: "mv-board", item_id: itemId('86" IFP') } },
      { index: 1, ok: false, error: "수량은 1 이상 정수여야 합니다." },
      { index: 2, ok: true, movement: { id: "mv-t1", item_id: itemId("T1") } },
    ])
    expect(outcome.failedErrors).toEqual({ s1: "수량은 1 이상 정수여야 합니다." })
    expect(outcome.savedUnits).toBe(41)
    expect(outcome.inboundOnlyRowKeys).toEqual([])
    expect(outcome.savedLines).toEqual([
      { rowKey: "board", itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 40, storage: "인천 더조은", movementId: "mv-board" },
      { rowKey: "t1", itemId: itemId("T1"), productName: "T1", quantity: 1, storage: "클래스인 사무실", movementId: "mv-t1" },
    ])
  })

  it("서버 결과가 빠진 줄은 성공으로 숨기지 않는다", () => {
    const submission = buildInboundSubmission(draft({ rows: [row({ key: "a", quantity: "1" })] }))
    expect(resolveInboundSaveOutcome(submission, []).failedErrors).toEqual({ a: "서버 응답에 이 줄의 결과가 없습니다." })
  })

  it("직배송: 입고·출고가 모두 저장돼야 저장된 행이고, 입고만 저장되면 출고 재시도 대상으로 돌려준다", () => {
    const submission = buildInboundSubmission(
      draft({
        delivery: "direct",
        directCustomer: { id: "cust-1", name: "수학의정석 학원" },
        directOutboundType: "sales",
        rows: [row({ key: "board", quantity: "2" }), row({ key: "t1", itemId: itemId("T1"), productName: "T1", quantity: "3" })],
      })
    )
    const outcome = resolveInboundSaveOutcome(submission, [
      { index: 0, ok: true, movement: { id: "in-board", item_id: itemId('86" IFP') } },
      { index: 1, ok: true, movement: { id: "out-board" } },
      { index: 2, ok: true, movement: { id: "in-t1" } },
      { index: 3, ok: false, error: "T1 C3 잔여는 0대입니다(요청 3대)." },
    ])
    expect(outcome.savedUnits).toBe(5)
    expect(outcome.savedLines.map((line) => [line.rowKey, line.storage])).toEqual([["board", "고객사 직송"]])
    expect(outcome.inboundOnlyRowKeys).toEqual(["t1"])
    expect(outcome.failedErrors.t1).toContain("입고는 저장했고 직배송 출고가 실패했습니다: T1 C3 잔여는 0대입니다(요청 3대).")

    // 다시 저장(출고만) 성공 → 그 행도 끝난다.
    const retry = buildInboundSubmission(
      draft({
        delivery: "direct",
        directCustomer: { id: "cust-1", name: "수학의정석 학원" },
        directOutboundType: "sales",
        rows: [row({ key: "t1", itemId: itemId("T1"), productName: "T1", quantity: "3", inboundSaved: true })],
      })
    )
    const retried = resolveInboundSaveOutcome(retry, [{ index: 0, ok: true, movement: { id: "out-t1" } }])
    expect(retried.failedErrors).toEqual({})
    expect(retried.savedUnits).toBe(0)
    expect(retried.savedLines.map((line) => line.rowKey)).toEqual(["t1"])
  })

  it("사무실 보관 줄만 office 유닛 등록 요청으로 바꾸고 서버 상한 60대씩 나눈다", () => {
    const payloads = buildSampleRegisterPayloads(
      [
        { rowKey: "a", itemId: itemId('86" IFP'), productName: '86" IFP', quantity: 40, storage: "인천 더조은", movementId: "mv-a" },
        { rowKey: "b", itemId: itemId("T1"), productName: "T1", quantity: 130, storage: "클래스인 사무실", movementId: "mv-b" },
        { rowKey: "c", productName: "신제품 X", quantity: 1, storage: "ClassIn" },
        { rowKey: "d", itemId: itemId("S1"), productName: "S1", quantity: 1, storage: "고객사 직송" },
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
      lotTracked: true,
      isFree: null,
      memo: "",
    })
    expect(createInboundRow({ key: "c", itemId: itemId("A1"), productName: "A1", lotTracked: false })).toMatchObject({ lotTracked: false })
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
