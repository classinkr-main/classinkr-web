// 매출 장부 입력 속도 라운드(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4 P1-4)
// 단계 2 — 매트릭스 인라인 새 행(P1-4 본체) 회귀 가드.
//
//  (a) 순수 헬퍼 buildNewRowDraftInput(entry, context)가 buildPasteNewRowInputs와 같은 metadata
//      키 집합을 만들고 status를 싣지 않는다.
//  (b) buildPasteNewRowInputs가 내부적으로 이 헬퍼를 쓴다(DRY) — 기존
//      matrix-paste-name-match.test.ts는 이 파일과 무관하게 그대로 통과해야 한다.
//  (c) 워크벤치 인라인 저장이 createDraft(를 쓰고 status:"checked"를 싣지 않는다(3단 유지 —
//      레일 new-row와 같은 이유, 매트릭스 셀 커밋의 자가 체크(P0-2)와는 다른 경로).
//  (d) UI 마커(새 행 추가, aria-label, datalist list=, 확도 role="radiogroup").
// React 렌더 하네스가 없는 저장소 관례(vitest environment: "node")에 따라 (b)-(d)는 소스 스캔,
// (a)는 순수 함수를 직접 구동해 검증한다(matrix-paste-name-match.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import {
  buildNewRowDraftInput,
  buildPasteNewRowInputs,
  type MatrixPastePlan,
  type NewRowDraftContext,
  type NewRowDraftEntry,
} from "@/components/admin/branch/ledger/rev-matrix-logic"

const logicPath = join(process.cwd(), "components/admin/branch/ledger/rev-matrix-logic.ts")
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

// CRLF 정규화(autocrlf 체크아웃에서도 마커 슬라이스가 일치하도록) — 기존 소스 스캔 테스트와 동일 관례.
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

// buildPasteNewRowInputs(matrix-paste-name-match.test.ts)가 이미 고정한 metadata 키 집합과
// 완전히 같은 목록 — 새 헬퍼가 다른 계약을 만들지 않았는지 이 파일에서도 다시 고정한다.
const METADATA_KEYS = [
  "source",
  "origin",
  "lens",
  "period",
  "team",
  "operation",
  "productCategory",
  "fromMonth",
  "week",
  "weekly",
  "weeklyConfidence",
  "confidence",
  "quantity",
  "sourceDealId",
].sort()

describe("buildNewRowDraftInput — new-row 초안 입력 조립 단일 소스(a)", () => {
  const entry: NewRowDraftEntry = {
    customer: "새 학원",
    month: "2026-07",
    amount: 500_000,
    confidence: "expected",
    productCategory: "software",
  }
  const context: NewRowDraftContext = {
    team: "BD",
    manager: "김지사",
    lens: "rev",
    period: "2026",
    origin: "rev-matrix-inline",
  }

  it("kind:new-row, status 미포함, 기본 필드가 스펙과 일치한다", () => {
    const input = buildNewRowDraftInput(entry, context)
    expect(input.kind).toBe("new-row")
    expect(input.customer).toBe("새 학원")
    expect(input.manager).toBe("김지사")
    expect(input.team).toBe("BD")
    expect(input.month).toBe("2026-07")
    expect(input.amount).toBe(500_000)
    expect(input.note).toBe("")
    expect(input.sourceSheetRow).toBeNull()
    // status 생략 — new-row는 레일 new-row·붙여넣기 new-row와 동일하게 3단 게이트를 유지한다.
    expect(Object.prototype.hasOwnProperty.call(input, "status")).toBe(false)
  })

  it("customer는 trim된다", () => {
    const input = buildNewRowDraftInput({ ...entry, customer: "  새 학원  " }, context)
    expect(input.customer).toBe("새 학원")
  })

  it("metadata 키 집합이 buildPasteNewRowInputs가 만드는 것과 완전히 같다", () => {
    const input = buildNewRowDraftInput(entry, context)
    expect(Object.keys(input.metadata ?? {}).sort()).toEqual(METADATA_KEYS)
  })

  it("origin이 sourceSnapshot·metadata 양쪽에 그대로 실린다(붙여넣기·인라인 출처 구분)", () => {
    const pasteInput = buildNewRowDraftInput(entry, { ...context, origin: "rev-matrix-paste" })
    expect(pasteInput.sourceSnapshot).toMatchObject({ origin: "rev-matrix-paste", selectedMonth: "2026-07", week: "month" })
    expect(pasteInput.metadata).toMatchObject({ origin: "rev-matrix-paste" })

    const inlineInput = buildNewRowDraftInput(entry, { ...context, origin: "rev-matrix-inline" })
    expect(inlineInput.sourceSnapshot).toMatchObject({ origin: "rev-matrix-inline" })
    expect(inlineInput.metadata).toMatchObject({ origin: "rev-matrix-inline" })
  })

  it("금액·확도·상품군이 metadata/amount에 그대로 반영된다", () => {
    const input = buildNewRowDraftInput({ ...entry, amount: 1_234_000, confidence: "confirmed", productCategory: "hardware" }, context)
    expect(input.amount).toBe(1_234_000)
    expect(input.metadata).toMatchObject({ confidence: "confirmed", productCategory: "hardware" })
  })
})

describe("buildPasteNewRowInputs — buildNewRowDraftInput을 내부적으로 쓴다(DRY, b)", () => {
  it("함수 본문이 buildNewRowDraftInput(을 호출한다(소스 스캔 — 중복 인라인 조립 금지)", () => {
    const source = read(logicPath)
    const body = sliceBetween(source, "export function buildPasteNewRowInputs(", "\nexport function dominantCellConfidence")
    expect(body).toContain("buildNewRowDraftInput(")
  })

  it("산출값이 buildNewRowDraftInput을 직접 호출한 것과 완전히 동일하다(회귀 방지)", () => {
    const plan: MatrixPastePlan = {
      anchorCustomer: "앵커",
      mode: "by-name",
      cells: [],
      applyCount: 0,
      lockedCount: 0,
      unchangedCount: 0,
      nonNumericCount: 0,
      outOfRangeCount: 0,
      matchedRowCount: 0,
      ambiguousNames: [],
      unmatched: [{ name: "신규 고객", cells: [{ month: "2026-07", amount: 300_000 }] }],
    }
    const context = {
      team: "BD",
      manager: "김지사",
      productCategory: "software" as const,
      confidence: "expected" as const,
      lens: "rev",
      period: "2026",
    }
    const [fromPaste] = buildPasteNewRowInputs(plan, ["신규 고객"], context)
    const fromHelper = buildNewRowDraftInput(
      { customer: "신규 고객", month: "2026-07", amount: 300_000, confidence: "expected", productCategory: "software" },
      { team: "BD", manager: "김지사", lens: "rev", period: "2026", origin: "rev-matrix-paste" },
    )
    expect(fromPaste).toEqual(fromHelper)
  })
})

describe("워크벤치 인라인 새 행 저장 — createDraft를 쓰고 status:\"checked\"를 싣지 않는다(3단 유지, c)", () => {
  const source = read(workbenchPath)

  function body() {
    return sliceBetween(
      source,
      "const saveInlineNewRow = useCallback(",
      "}, [createDraft, lens, managerFilter, newRowConfidence, newRowCustomer, newRowMonth, newRowParsedAmount, newRowProduct, newRowSaveDisabled, period, pushMatrixToast, team])",
    )
  }

  it("createDraft(를 호출한다", () => {
    expect(body()).toContain("createDraft(")
  })

  it("status:\"checked\"를 싣지 않는다(매트릭스 셀 커밋의 자가 체크와 다른 경로)", () => {
    expect(body()).not.toContain('status: "checked"')
  })

  it("배치 API(persistDraftsBatch)가 아니라 단건 경로를 쓴다(붙여넣기와 다른 저장 경로)", () => {
    expect(body()).not.toContain("persistDraftsBatch(")
  })

  it("buildNewRowDraftInput을 써서 초안 입력을 조립한다(중복 인라인 조립 금지)", () => {
    expect(body()).toContain("buildNewRowDraftInput(")
  })
})

describe("인라인 새 행 UI 마커(소스 스캔, d)", () => {
  const source = read(workbenchPath)

  it("'새 행 추가' 문구가 있다", () => {
    expect(source).toContain("새 행 추가")
  })

  it("고객 input에 레일과 별개인 datalist(list=)가 연결돼 있다", () => {
    expect(source).toContain('list="matrix-inline-customer-options"')
    expect(source).toContain('<datalist id="matrix-inline-customer-options">')
    // 레일 datalist(input-rail-customer-options)와 id가 겹치지 않는다(같은 DOM에 동시 렌더 가능).
    expect(source).not.toContain('id="matrix-inline-customer-options" id="input-rail-customer-options"')
  })

  it("고객·금액 입력에 aria-label이 있다", () => {
    expect(source).toContain('aria-label="새 행 고객명"')
    expect(source).toContain('aria-label="새 행 금액(원 단위)"')
  })

  it("확도 3-세그가 role=\"radiogroup\"이고 DRAFT_CONFIDENCE_OPTIONS를 순회한다", () => {
    const idx = source.indexOf('role="radiogroup" aria-label="새 행 확도"')
    expect(idx, "새 행 확도 radiogroup을 찾지 못함").toBeGreaterThan(-1)
    const nearby = source.slice(idx, idx + 700)
    expect(nearby).toContain("DRAFT_CONFIDENCE_OPTIONS.map")
    expect(nearby).toContain("option.hint")
  })

  it("표기 경고(findCustomerSpellingMatch)와 '그 표기로 맞추기' 원클릭이 있다", () => {
    expect(source).toContain("newRowSpellingMatch")
    expect(source).toContain("findCustomerSpellingMatch(newRowCustomer, customerOptions)")
    expect(source).toContain("그 표기로 맞추기")
  })

  it("월 select는 matrixMonths를 formatMonthLabel로 렌더한다", () => {
    expect(source).toContain("{matrixMonths.map((month) => (")
  })
})
