import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/admin-client", () => ({ adminFetchJson: vi.fn() }))

import { CrmCustomerLink, OutboundTypeBadge, SampleReturnBadge, movementOutboundType } from "@/components/admin/hardware/inventory/OutboundMetaBadges"
import { BasketLineLotSelect, LotPickerField, OwnerField } from "@/components/admin/hardware/inventory/OutboundV2Fields"
import {
  draftNeedsLotLookup,
  formIsCustomerOutbound,
  lotEntryForDraft,
  processFieldErrors,
  validateProcessDraft,
  validateQuickCartProcess,
} from "@/components/admin/hardware/inventory/quick-record-process"
import { quickCartLineKey, type HardwareMovement, type HardwareMovementDraft } from "@/components/admin/hardware/inventory/shared"
import { lotLookupKey, lotRequirementFromEntry, type HardwareLotsCache, type LotLookupEntry } from "@/components/admin/hardware/inventory/use-hardware-lots"

function fakeLots(entries: Record<string, LotLookupEntry>): HardwareLotsCache {
  return {
    entries,
    ensure: vi.fn(),
    invalidate: vi.fn(),
    get: (itemId, productName, excludeMovementId) => entries[lotLookupKey(itemId, productName, excludeMovementId)],
  }
}

const ready = (lots: Array<{ lotNo: string; remaining: number }>, lotTracked = true): LotLookupEntry => ({
  status: "ready",
  data: { itemId: "ifp86", product: '86" IFP', lotTracked, lots, nextLotNo: null },
})

const draft = (patch: Partial<HardwareMovementDraft> = {}): HardwareMovementDraft => ({
  itemId: "ifp86",
  productName: '86" IFP',
  movementType: "outbound",
  quantity: 2,
  occurredAt: "2026-10-28",
  fromLocation: "창고",
  toLocation: "남명학원",
  owner: "김매니저",
  status: "설치 완료",
  referenceNo: "",
  memo: "",
  lotNo: "C1",
  unitPrice: null,
  amountUsd: null,
  amountCny: null,
  storageLocation: "",
  importer: "",
  serials: [],
  outboundType: "sales",
  customerId: "cust-1",
  ...patch,
})

describe("빠른 기록 시트 ↔ 프로세스 규칙", () => {
  const lots = fakeLots({ [lotLookupKey("ifp86", '86" IFP')]: ready([{ lotNo: "C1", remaining: 3 }]) })

  it("창고에서 나가는 출고만 로트를 조회한다", () => {
    expect(draftNeedsLotLookup(draft())).toBe(true)
    expect(draftNeedsLotLookup(draft({ fromLocation: "사무실" }))).toBe(false)
    expect(draftNeedsLotLookup(draft({ movementType: "inbound" }))).toBe(false)
    expect(lotEntryForDraft(lots, draft())?.status).toBe("ready")
    expect(lotEntryForDraft(lots, draft({ fromLocation: "사무실" }))).toBeUndefined()
  })

  it("단건 폼 — 고른 로트가 잔여 안이면 통과, 넘으면 칸 문구", () => {
    expect(validateProcessDraft(draft(), { lots, items: [] })).toBeNull()
    const errors = processFieldErrors(draft({ quantity: 4 }), { lots, items: [] })
    expect(errors.lotNo).toContain("C1 잔여는 3대")
  })

  it("바구니에 담을 때는 로트를 건너뛰고, 저장 직전 줄마다 본다", () => {
    const noLot = draft({ lotNo: "" })
    expect(validateProcessDraft(noLot, { lots, items: [], skipLot: true })).toBeNull()
    const errors = validateQuickCartProcess([draft(), noLot, draft({ outboundType: undefined, productName: "S1", itemId: "s1" })], { lots, items: [] })
    expect(Object.keys(errors)).toHaveLength(2)
    expect(errors[quickCartLineKey(noLot)]).toContain("물류번호를 골라야")
    expect(Object.values(errors).some((message) => message.includes("출고 유형"))).toBe(true)
  })

  it("입고·조정 추가 규칙도 같은 검사에 들어 있다", () => {
    const inbound = draft({ movementType: "inbound", toLocation: "창고", fromLocation: "", outboundType: undefined, customerId: undefined })
    expect(validateProcessDraft(inbound, { lots, items: [] })).toBe("입고는 유상/무상을 고르세요.")
    expect(validateProcessDraft({ ...inbound, isFree: false }, { lots, items: [] })).toBeNull()
  })

  it("조회 상태별 로트 요구 — 실패면 묻지 않고, 불러오는 중이면 필수만", () => {
    expect(lotRequirementFromEntry({ status: "error", message: "404" }, { lot_tracked: true })).toEqual({ lotTracked: false, lots: null })
    expect(lotRequirementFromEntry({ status: "loading" }, undefined)).toEqual({ lotTracked: true, lots: null })
    expect(lotRequirementFromEntry({ status: "loading" }, { lot_tracked: false })).toEqual({ lotTracked: false, lots: null })
    expect(lotRequirementFromEntry(undefined, undefined)).toEqual({ lotTracked: false, lots: null })
  })

  it("샘플 풀 프리셋은 고객 출고가 아니다", () => {
    expect(formIsCustomerOutbound({ movementType: "outbound", toLocation: "남명학원", activePresetKey: "sale" })).toBe(true)
    expect(formIsCustomerOutbound({ movementType: "outbound", toLocation: "샘플", activePresetKey: "sample" })).toBe(false)
    expect(formIsCustomerOutbound({ movementType: "outbound", toLocation: "남명학원", activePresetKey: "sample" })).toBe(false)
  })
})

describe("표시 칸", () => {
  const sample = {
    movement_type: "outbound",
    outbound_type: null,
    outbound_type_resolved: "sample",
    expected_return_at: "2020-01-01",
    customer_id: "cust-1",
    to_location: "남명학원",
    from_location: "창고",
  } as unknown as HardwareMovement

  it("유형 배지는 서버 판정 유형을 쓴다", () => {
    expect(movementOutboundType(sample)).toBe("sample")
    expect(movementOutboundType({ ...sample, movement_type: "inbound" })).toBeNull()
    expect(renderToStaticMarkup(<OutboundTypeBadge type="promotion" />)).toContain("프로모션")
    expect(renderToStaticMarkup(<OutboundTypeBadge type={null} />)).toBe("")
  })

  it("샘플 반납 예정일이 지나면 '지남'을 붙인다", () => {
    expect(renderToStaticMarkup(<SampleReturnBadge movement={sample} />)).toContain("지남")
    expect(renderToStaticMarkup(<SampleReturnBadge movement={{ ...sample, outbound_type_resolved: "sales" }} />)).toBe("")
  })

  it("CRM 고객 링크는 customer_id 가 있을 때만", () => {
    expect(renderToStaticMarkup(<CrmCustomerLink movement={sample} />)).toContain("/admin/crm/customers/unified?owner=&amp;q=")
    expect(renderToStaticMarkup(<CrmCustomerLink movement={{ ...sample, customer_id: null }} />)).toBe("")
  })

  it("물류번호 고르기는 잔여 1대 이상만 보이고 잔여를 적는다", () => {
    const html = renderToStaticMarkup(
      <LotPickerField entry={ready([{ lotNo: "C1", remaining: 0 }, { lotNo: "C2", remaining: 4 }])} value="" onChange={() => {}} quantity={5} />
    )
    expect(html).not.toContain(">C1 ·")
    expect(html).toContain("C2 · 잔여 4대 (부족)")
    expect(renderToStaticMarkup(<LotPickerField entry={ready([], false)} value="" onChange={() => {}} quantity={1} />)).toContain("수량만 관리")
    expect(renderToStaticMarkup(<LotPickerField entry={{ status: "error", message: "x" }} value="C9" onChange={() => {}} quantity={1} />)).toContain("서버가 잔여를 확인")
  })

  it("바구니 줄 물류번호 — 수량만 관리 품목은 그리지 않는다", () => {
    expect(renderToStaticMarkup(<BasketLineLotSelect entry={ready([], false)} value="" onChange={() => {}} quantity={1} productName="케이블" />)).toBe("")
    expect(renderToStaticMarkup(<BasketLineLotSelect entry={ready([{ lotNo: "C2", remaining: 4 }])} value="" onChange={() => {}} quantity={1} productName="S1" />)).toContain("물류번호 고르기 (필수)")
  })

  it("담당자 — 매니저는 본인 고정, 구응답은 자유 입력", () => {
    const fixed = renderToStaticMarkup(
      <OwnerField viewer={{ canFinalize: false, canManageInventory: false, userId: "u1", name: "김매니저" }} owner="김매니저" ownerUserId={null} onChange={() => {}} />
    )
    expect(fixed).toContain("김매니저")
    expect(fixed).toContain("다른 담당 지정은 입고관리 권한자만")
    const legacy = renderToStaticMarkup(<OwnerField viewer={{ canFinalize: true, name: "김매니저" }} owner="박" ownerUserId={null} onChange={() => {}} />)
    expect(legacy).toContain('value="박"')
  })
})
