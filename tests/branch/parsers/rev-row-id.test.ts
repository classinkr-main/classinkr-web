/* '2. REV' 숨김 "Row ID" 열·주차 확도 글자(weeklyColors) 파싱 — 장부 반영의 시트 쓰기(ADR-011)가 행을 다시 찾고
 * 초안 baseline 을 만드는 근거다. ① 머리로 열 찾기 ② 없음·중복·형식 오류 ③ weeklyColors ④ 월 블록과 안 섞임
 * ⑤ 기존 결과 불변 ⑥ 동기화 경고 문구 ⑦ pipeline 행으로 옮기기 ⑧ 범위·색 판정 정본. */
import { describe, expect, it } from "vitest"
import fixture from "../fixtures/rev-sample.json"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { isBlueText as sheetsIsBlueText, isRedText as sheetsIsRedText } from "@/lib/branch/google-sheets"
import {
  parseRev,
  REV_RANGE,
  resolveRevRowIdColumn,
  revRowIdWarning,
  summarizeRevRowIds,
  type RevDealParsed,
} from "@/lib/branch/parsers/rev"
import { listRevRevenue, revRowIdentityFields } from "@/lib/branch/computations/pipeline"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { buildSheetBaseline } from "@/lib/branch/sheet-writeback/baseline"
import { isBlueText, isRedText } from "@/lib/branch/sheet-writeback/colors"
import { REV_WRITE_READ_RANGE } from "@/lib/branch/sheet-writeback/config"
import { a1LettersToCol, resolveRevLayout } from "@/lib/branch/sheet-writeback/layout"
import { parseRangeLastRow } from "@/lib/branch/sync/range-truncation"

const RED = { red: 1, green: 0, blue: 0 }
const BLUE = { red: 0, green: 0, blue: 1 }
const BLACK = { red: 0, green: 0, blue: 0 }
const ID_A = "r_0123456789ab"
const ID_B = "r_abcdefghjkmn"
const ID_C = "r_zzzzzzzzzzzz"

const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const colored = (value: number, fg: FormattedCell["fg"]): FormattedCell => ({ value, bg: null, fg })

// 실측 '2. REV' 2행 머리(84열, A~CF): 메타 13칸 + 월 블록 12개(합계 + w1~w5, 7월 다섯째 "5w", 2월 w1~w4).
const META_HEADER = ["Account", "Branch", "Location", "Scale", "Importance", "Team", "Manager", "Status", "Type", "Product", "First Payment", "Remark", "Sum"]
const FISCAL_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]

interface SheetShape {
  header: FormattedCell[]
  blocks: Record<string, { total: number; weeks: number[] }>
}

function realHeader(refFy = 2026): SheetShape {
  const header = META_HEADER.map(plain)
  const blocks: SheetShape["blocks"] = {}
  for (const month of FISCAL_MONTHS) {
    const ym = `${month >= 4 ? refFy : refFy + 1}-${String(month).padStart(2, "0")}`
    const total = header.length
    header.push(plain(String(month)))
    const weekCount = month === 2 ? 4 : 5
    const weeks: number[] = []
    for (let w = 1; w <= weekCount; w++) {
      weeks.push(header.length)
      header.push(plain(month === 7 && w === 5 ? "5w" : `w${w}`))
    }
    blocks[ym] = { total, weeks }
  }
  return { header, blocks }
}

function emptyRow(len: number): FormattedCell[] {
  return Array.from({ length: len }, () => plain(null))
}

function dataRow(len: number, customer: string | null, cells: Record<number, FormattedCell>): FormattedCell[] {
  const row = emptyRow(len)
  row[0] = plain(customer)
  for (const [index, cell] of Object.entries(cells)) row[Number(index)] = cell
  return row
}

const rawOf = (deal: RevDealParsed) => deal.raw as {
  row: unknown[]
  rowId: string | null
  rowIdIssue: string | null
  weeklyColors: Record<string, string>
  weeklyPayments: Record<string, number[]>
}

describe("① Row ID 열은 2행 머리로 찾는다", () => {
  it("실측 84열 뒤 CG(84)의 \"Row ID\" 머리 — 시트 쓰기 layout 과 같은 열을 본다", () => {
    const { header } = realHeader()
    expect(header).toHaveLength(84)
    const withId = [...header, plain("Row ID")]
    expect(resolveRevRowIdColumn(withId)).toEqual({ col: 84, headerCols: [84] })
    const layout = resolveRevLayout(withId.map((c) => c.value), 2026)
    expect("error" in layout ? layout : layout.rowIdCol).toBe(84)
  })

  it("앞뒤 공백·대소문자는 무시하고 글자는 정확히 맞아야 한다", () => {
    const { header } = realHeader()
    expect(resolveRevRowIdColumn([...header, plain("  row id ")]).col).toBe(84)
    expect(resolveRevRowIdColumn([...header, plain("ROW ID")]).col).toBe(84)
    for (const near of ["RowID", "Row ID 2", "Row_ID", "Row  ID", "ID"]) {
      expect(resolveRevRowIdColumn([...header, plain(near)]), near).toEqual({ col: null, headerCols: [] })
    }
  })

  it("열 위치가 아니라 머리 글자로 찾는다(뒤에 다른 열이 끼어도 그 열)", () => {
    const { header } = realHeader()
    const shifted = [...header, plain("Memo"), plain(null), plain("Row ID")]
    expect(resolveRevRowIdColumn(shifted).col).toBe(86)
    const grid = [[plain("REV")], shifted, dataRow(87, "학원A", { 86: plain(ID_A), 84: plain("메모") })]
    expect(rawOf(parseRev(grid, { refFy: 2026, today: "2026-10-23" })[0]).rowId).toBe(ID_A)
  })

  it("월 영역 앞(A~M 메타)의 \"Row ID\" 머리는 보지 않는다 — layout 도 월 영역부터 본다", () => {
    const header = realHeader().header.map((c, i) => (i === 4 ? plain("Row ID") : c))
    expect(resolveRevRowIdColumn(header)).toEqual({ col: null, headerCols: [] })
  })

  it("\"Row ID\" 머리가 둘이면 어느 열도 믿지 않는다(col null) — 시트 쓰기도 layout_changed", () => {
    const { header } = realHeader()
    const twice = [...header, plain("Row ID"), plain("row id")]
    expect(resolveRevRowIdColumn(twice)).toEqual({ col: null, headerCols: [84, 85] })
    const grid = [[plain("REV")], twice, dataRow(86, "학원A", { 84: plain(ID_A), 85: plain(ID_B) })]
    const [deal] = parseRev(grid, { refFy: 2026, today: "2026-10-23" })
    expect(rawOf(deal).rowId).toBeNull()
    expect(rawOf(deal).rowIdIssue).toBeNull()
    expect(resolveRevLayout(twice.map((c) => c.value), 2026)).toMatchObject({ error: "layout_changed" })
  })
})

describe("② 행 ID — 없음 null · 중복 duplicate · 형식 오류 invalid", () => {
  const { header } = realHeader()
  const head = [...header, plain("Row ID")]
  const parse = (rows: FormattedCell[][]) => parseRev([[plain("REV")], head, ...rows], { refFy: 2026, today: "2026-10-23" })

  it("Row ID 열이 없으면 모든 행 rowId null · rowIdIssue null", () => {
    const out = parseRev([[plain("REV")], header, dataRow(84, "학원A", {}), dataRow(84, "학원B", {})], { refFy: 2026, today: "2026-10-23" })
    expect(out.map((d) => [rawOf(d).rowId, rawOf(d).rowIdIssue])).toEqual([[null, null], [null, null]])
  })

  it("열은 있는데 칸이 비면(빈 문자열·공백 포함) null · 이슈 없음", () => {
    const out = parse([dataRow(85, "학원A", {}), dataRow(85, "학원B", { 84: plain("   ") }), dataRow(85, "학원C", { 84: plain("") })])
    expect(out.map((d) => [rawOf(d).rowId, rawOf(d).rowIdIssue])).toEqual([[null, null], [null, null], [null, null]])
  })

  it("형식 맞는 ID 는 그대로 — 앞뒤 공백은 지운다(쓰기 직전 행 찾기도 trim 한 값을 본다)", () => {
    const out = parse([dataRow(85, "학원A", { 84: plain(ID_A) }), dataRow(85, "학원B", { 84: plain(` ${ID_B} `) })])
    expect(out.map((d) => [rawOf(d).rowId, rawOf(d).rowIdIssue])).toEqual([[ID_A, null], [ID_B, null]])
  })

  it("형식이 틀리면 rowId null · invalid (대문자·길이·금지 글자·숫자)", () => {
    const bad = ["R_0123456789AB", "r_0123456789a", "r_0123456789abc", "r_i123456789ab", "x_0123456789ab", 12345]
    const out = parse(bad.map((v, i) => dataRow(85, `학원${i}`, { 84: plain(v) })))
    for (const [i, deal] of out.entries()) {
      expect([rawOf(deal).rowId, rawOf(deal).rowIdIssue], String(bad[i])).toEqual([null, "invalid"])
    }
  })

  it("같은 ID 가 두 행에 있으면 두 행 모두 duplicate 이고 rowId 는 null — 다른 행은 영향 없음", () => {
    const out = parse([
      dataRow(85, "학원A", { 84: plain(ID_A) }),
      dataRow(85, "학원B", { 84: plain(ID_B) }),
      dataRow(85, "학원C", { 84: plain(` ${ID_A}`) }),
    ])
    expect(out.map((d) => [d.customer_name, rawOf(d).rowId, rawOf(d).rowIdIssue])).toEqual([
      ["학원A", null, "duplicate"],
      ["학원B", ID_B, null],
      ["학원C", null, "duplicate"],
    ])
  })

  it("고객명이 빈 행의 같은 ID 도 중복으로 센다 — 서버 행 찾기가 3행부터 모든 행을 본다", () => {
    const out = parse([dataRow(85, "학원A", { 84: plain(ID_C) }), dataRow(85, null, { 84: plain(ID_C) })])
    expect(out).toHaveLength(1)
    expect([rawOf(out[0]).rowId, rawOf(out[0]).rowIdIssue]).toEqual([null, "duplicate"])
  })

  it("형식 오류 칸끼리 같아도 duplicate 가 아니라 invalid(형식이 먼저)", () => {
    const out = parse([dataRow(85, "학원A", { 84: plain("dup") }), dataRow(85, "학원B", { 84: plain("dup") })])
    expect(out.map((d) => rawOf(d).rowIdIssue)).toEqual(["invalid", "invalid"])
  })
})

describe("③ weeklyColors — 그 달 주차 칸 순서의 확도 글자", () => {
  const { header, blocks } = realHeader()
  const oct = blocks["2026-10"]
  const feb = blocks["2027-02"]

  it("값>0 칸은 글자색(r 빨강·b 파랑·k 검정/색 없음), 값 없는 칸은 '-'", () => {
    const row = dataRow(84, "학원A", {
      [oct.weeks[0]]: colored(100, RED),
      [oct.weeks[1]]: colored(200, BLUE),
      [oct.weeks[2]]: colored(300, BLACK),
      [oct.weeks[4]]: plain(50),
    })
    const [deal] = parseRev([[plain("REV")], header, row], { refFy: 2026, today: "2026-10-23" })
    expect(rawOf(deal).weeklyColors).toEqual({ "2026-10": "rbk-k" })
    expect(rawOf(deal).weeklyPayments["2026-10"]).toEqual([100, 200, 300, 0, 50])
  })

  it("판정은 colors.ts 임계(google-sheets 와 같은 식) — #EB4336 빨강, #1155CC 파랑, 갈색 #B45F06 은 k", () => {
    const row = dataRow(84, "학원A", {
      [oct.weeks[0]]: colored(1, { red: 0.92, green: 0.26, blue: 0.21 }),
      [oct.weeks[1]]: colored(1, { red: 0.07, green: 0.33, blue: 0.8 }),
      [oct.weeks[2]]: colored(1, { red: 0.71, green: 0.37, blue: 0.02 }),
    })
    const [deal] = parseRev([[plain("REV")], header, row], { refFy: 2026, today: "2026-10-23" })
    expect(rawOf(deal).weeklyColors["2026-10"]).toBe("rbk--")
  })

  it("값이 0·음수인 칸은 '-'(빨간 0·환불 칸) — baseline 은 값 있는 칸(>0)의 색만 비교한다", () => {
    const row = dataRow(84, "학원A", {
      [oct.weeks[0]]: colored(0, RED),
      [oct.weeks[1]]: colored(-100, RED),
      [oct.weeks[2]]: colored(300, RED),
    })
    const [deal] = parseRev([[plain("REV")], header, row], { refFy: 2026, today: "2026-10-23" })
    expect(rawOf(deal).weeklyColors["2026-10"]).toBe("--r--")
  })

  it("배경 빨강(옛 표기)은 확정 집계에만 — 글자는 글자색만 본다(쓰기 직전 비교도 글자색만)", () => {
    const row = dataRow(84, "학원A", { [oct.weeks[0]]: { value: 700, bg: { red: 0.95, green: 0.2, blue: 0.2 }, fg: null } })
    const [deal] = parseRev([[plain("REV")], header, row], { refFy: 2026, today: "2026-10-23" })
    expect(deal.monthly_confirmed["2026-10"]).toBe(700)
    expect(rawOf(deal).weeklyColors["2026-10"]).toBe("k----")
  })

  it("4칸인 달(2월)은 4글자, 키는 weekly_payments 와 같다(합계만 있는 달·빈 달은 없음)", () => {
    const row = dataRow(84, "학원A", {
      [feb.weeks[3]]: colored(900, BLUE),
      [blocks["2026-04"].total]: plain(5000),
      [blocks["2026-05"].weeks[0]]: colored(0, RED),
    })
    const [deal] = parseRev([[plain("REV")], header, row], { refFy: 2026, today: "2026-10-23" })
    expect(rawOf(deal).weeklyColors).toEqual({ "2027-02": "---b", "2026-05": "-----" })
    expect(Object.keys(rawOf(deal).weeklyColors).sort()).toEqual(Object.keys(deal.weekly_payments).sort())
    expect(deal.monthly_payments["2026-04"]).toBe(5000)
  })
})

describe("④ Row ID 열은 월 블록에 섞이지 않는다", () => {
  it("3월(마지막 블록) 바로 뒤 CG 의 ID 는 3월 주차·합계가 되지 않는다", () => {
    const { header, blocks } = realHeader()
    const mar = blocks["2027-03"]
    const head = [...header, plain("Row ID")]
    const row = dataRow(85, "학원A", { [mar.weeks[4]]: colored(400, RED), 84: plain(ID_A) })
    const [deal] = parseRev([[plain("REV")], head, row], { refFy: 2026, today: "2027-03-30" })
    expect(deal.weekly_payments["2027-03"]).toEqual([0, 0, 0, 0, 400])
    expect(deal.monthly_payments).toEqual({ "2027-03": 400 })
    expect(rawOf(deal).weeklyColors).toEqual({ "2027-03": "----r" })
    expect(rawOf(deal).rowId).toBe(ID_A)
  })

  it("숫자처럼 보이는 Row ID 칸(형식 오류)도 금액으로 읽지 않는다", () => {
    const { header } = realHeader()
    const head = [...header, plain("Row ID")]
    const [deal] = parseRev([[plain("REV")], head, dataRow(85, "학원A", { 84: plain(123456) })], { refFy: 2026, today: "2026-10-23" })
    expect(deal.monthly_payments).toEqual({})
    expect(deal.weekly_payments).toEqual({})
    expect(rawOf(deal).rowIdIssue).toBe("invalid")
  })
})

describe("⑤ 기존 결과 불변 — raw 새 키(rowId·rowIdIssue·weeklyColors)만 더해진다", () => {
  const base = fixture as unknown as FormattedCell[][]
  const NEW_RAW_KEYS = new Set(["rowId", "rowIdIssue", "weeklyColors"])
  const withoutNewRaw = (deal: RevDealParsed) => {
    const restRaw = Object.fromEntries(Object.entries(deal.raw).filter(([key]) => !NEW_RAW_KEYS.has(key) && key !== "row"))
    return { ...deal, raw: { ...restRaw, row: (deal.raw.row as unknown[]).slice(0, 16) } }
  }

  it("Row ID 열을 붙여도 금액·확도·메타·raw 기존 키가 같다", () => {
    const before = parseRev(base, { refFy: 2026, today: "2026-10-23" })
    const appended = base.map((row, r) => [...row, r === 1 ? plain("Row ID") : r === 2 ? plain(ID_A) : r === 3 ? plain(ID_B) : plain(null)])
    const after = parseRev(appended, { refFy: 2026, today: "2026-10-23" })
    expect(after.map(withoutNewRaw)).toEqual(before.map(withoutNewRaw))
    expect(after.map((d) => rawOf(d).rowId)).toEqual([ID_A, ID_B])
    expect(rawOf(after[0]).row).toEqual([...rawOf(before[0]).row, ID_A])
  })

  it("raw 키는 기존 넷 + 새 셋뿐이다", () => {
    const [deal] = parseRev(base, { refFy: 2026, today: "2026-10-23" })
    expect(Object.keys(deal.raw).sort()).toEqual(
      ["monthlyPending", "pendingWeeks", "row", "rowId", "rowIdIssue", "weeklyColors", "weeklyPayments"].sort(),
    )
    expect([rawOf(deal).rowId, rawOf(deal).rowIdIssue]).toEqual([null, null])
  })
})

describe("⑥ 동기화 경고 — 실패로 치지 않고 문구만", () => {
  const { header } = realHeader()
  const head = [...header, plain("Row ID")]

  it("Row ID 열이 없으면 고정 문구", () => {
    const grid = [[plain("REV")], header, dataRow(84, "학원A", {})]
    const summary = summarizeRevRowIds(grid, parseRev(grid, { refFy: 2026, today: "2026-10-23" }))
    expect(summary).toEqual({ column: "missing", missing: 0, duplicate: 0, invalid: 0 })
    expect(revRowIdWarning(summary)).toBe("Row ID 열 없음 — 시트 쓰기 불가(행 ID 스크립트 필요)")
  })

  it("머리가 둘이면 '여럿' 문구", () => {
    const grid = [[plain("REV")], [...head, plain("Row ID")], dataRow(86, "학원A", {})]
    const summary = summarizeRevRowIds(grid, parseRev(grid, { refFy: 2026, today: "2026-10-23" }))
    expect(summary.column).toBe("ambiguous")
    expect(revRowIdWarning(summary)).toBe("Row ID 열이 여럿 — 시트 쓰기 불가(관리자 확인 필요)")
  })

  it("없음·중복·형식 오류 건수 — 0 인 항목은 뺀다", () => {
    const grid = [
      [plain("REV")],
      head,
      dataRow(85, "학원A", { 84: plain(ID_A) }),
      dataRow(85, "학원B", { 84: plain(ID_B) }),
      dataRow(85, "학원C", { 84: plain(ID_B) }),
      dataRow(85, "학원D", { 84: plain("bad") }),
      dataRow(85, "학원E", {}),
      dataRow(85, "학원F", {}),
    ]
    const summary = summarizeRevRowIds(grid, parseRev(grid, { refFy: 2026, today: "2026-10-23" }))
    expect(summary).toEqual({ column: "present", missing: 2, duplicate: 2, invalid: 1 })
    expect(revRowIdWarning(summary)).toBe("Row ID 없음 2 · 중복 2 · 형식 오류 1")
    expect(revRowIdWarning({ column: "present", missing: 0, duplicate: 3, invalid: 0 })).toBe("Row ID 중복 3")
    expect(revRowIdWarning({ column: "present", missing: 0, duplicate: 0, invalid: 4 })).toBe("Row ID 형식 오류 4")
  })

  it("모든 행에 고유 ID 가 있으면 경고 없음", () => {
    const grid = [[plain("REV")], head, dataRow(85, "학원A", { 84: plain(ID_A) }), dataRow(85, "학원B", { 84: plain(ID_B) })]
    const summary = summarizeRevRowIds(grid, parseRev(grid, { refFy: 2026, today: "2026-10-23" }))
    expect(summary).toEqual({ column: "present", missing: 0, duplicate: 0, invalid: 0 })
    expect(revRowIdWarning(summary)).toBeUndefined()
  })
})

function dealFromParsed(p: RevDealParsed, id = "deal-1"): BranchRevDeal {
  return {
    id, sheet_row: p.sheet_row, customer_name: p.customer_name, branch_contact: p.branch_contact,
    team: p.team, manager: p.manager, deal_type: p.deal_type, status: p.status, first_payment: p.first_payment,
    product_version: p.product_version, region: p.region, importance: p.importance, note: p.note,
    contract_target: p.contract_target == null ? "" : String(p.contract_target),
    monthly_payments: p.monthly_payments, monthly_red: p.monthly_red, monthly_confirmed: p.monthly_confirmed,
    monthly_high_conf: p.monthly_high_conf, raw: p.raw, synced_at: "2026-10-23T08:00:00.000Z",
  } as unknown as BranchRevDeal
}

describe("⑦ pipeline 행(RevRevenueRow·BranchPipelineRow)으로 옮긴다", () => {
  it("parseRev → listRevRevenue → buildSheetBaseline: 행 ID·주차 값·색이 그대로 이어진다", () => {
    const { header, blocks } = realHeader()
    const oct = blocks["2026-10"]
    const row = dataRow(85, "학원A", { [oct.weeks[0]]: colored(100, RED), [oct.weeks[2]]: colored(300, BLUE), 84: plain(ID_A) })
    const [parsed] = parseRev([[plain("REV")], [...header, plain("Row ID")], row], { refFy: 2026, today: "2026-10-23" })
    const [pipelineRow] = listRevRevenue([dealFromParsed(parsed)])
    expect(pipelineRow.rowId).toBe(ID_A)
    expect(pipelineRow.weeklyColors).toEqual({ "2026-10": "r-b--" })
    expect("rowIdIssue" in pipelineRow).toBe(false)
    const baseline = buildSheetBaseline(pipelineRow, "2026-10", "2026-10-23T09:00:00.000Z")
    expect(baseline).toMatchObject({
      rowId: ID_A,
      customer: "학원A",
      weeks: [{ value: 100, color: "r" }, { value: 0, color: "k" }, { value: 300, color: "b" }, { value: 0, color: "k" }, { value: 0, color: "k" }],
    })
  })

  it("재동기화 전 레거시 raw(새 키 없음)는 키를 싣지 않는다 — 기존 행 모양 그대로", () => {
    expect(revRowIdentityFields({ weeklyPayments: { "2026-04": [1, 0, 0, 0, 0] } })).toEqual({})
    expect(revRowIdentityFields(null)).toEqual({})
    expect(revRowIdentityFields(["r_0123456789ab"])).toEqual({})
    const [row] = listRevRevenue([dealFromParsed({ ...parseRev(fixture as unknown as FormattedCell[][], { refFy: 2026 })[0], raw: { row: [] } })])
    for (const key of ["rowId", "rowIdIssue", "weeklyColors"]) expect(key in row, key).toBe(false)
  })

  it("새 raw 라도 값이 없으면 키를 싣지 않는다(Row ID 없음·주차 값 없음 → 빈 맵을 내보내지 않음)", () => {
    expect(revRowIdentityFields({ rowId: null, rowIdIssue: null, weeklyColors: {} })).toEqual({})
    expect(revRowIdentityFields({ weeklyColors: { "2026-10": "x" } })).toEqual({})
    // 주차 칸 없이 월 합계만 있는 행 — parseRev 의 raw.weeklyColors 는 {} 다.
    const { header, blocks } = realHeader()
    const [parsed] = parseRev([[plain("REV")], header, dataRow(84, "학원A", { [blocks["2026-04"].total]: plain(5000) })], { refFy: 2026, today: "2026-10-23" })
    expect(rawOf(parsed).weeklyColors).toEqual({})
    const [row] = listRevRevenue([dealFromParsed(parsed)])
    for (const key of ["rowId", "rowIdIssue", "weeklyColors"]) expect(key in row, key).toBe(false)
  })

  it("DB raw 를 믿지 않는다 — 틀린 ID·글자·달 키는 버리고, 이슈가 있으면 rowId 를 싣지 않는다", () => {
    expect(revRowIdentityFields({ rowId: "R_BAD", rowIdIssue: null })).toEqual({})
    expect(revRowIdentityFields({ rowId: ID_A, rowIdIssue: "duplicate" })).toEqual({ rowIdIssue: "duplicate" })
    expect(revRowIdentityFields({ rowId: null, rowIdIssue: "invalid" })).toEqual({ rowIdIssue: "invalid" })
    expect(revRowIdentityFields({ rowId: ID_A, rowIdIssue: "weird" })).toEqual({ rowId: ID_A })
    expect(
      revRowIdentityFields({ weeklyColors: { "2026-10": "rb-k", "2026-11": "rxk", "2026-13": "r", "2026-12": "rrrrrr", "2027-01": "", "2027-02": 5 } }),
    ).toEqual({ weeklyColors: { "2026-10": "rb-k" } })
  })
})

describe("⑧ 범위·색 판정 정본", () => {
  it("REV_RANGE 는 시트 쓰기 다시 읽기 범위와 같고 Row ID 열(CG)까지 덮는다 · 행 상한 1000 그대로", () => {
    expect(REV_RANGE).toBe(REV_WRITE_READ_RANGE)
    const end = REV_RANGE.match(/:([A-Z]+)\d+$/)?.[1] ?? ""
    expect(a1LettersToCol(end)).toBeGreaterThanOrEqual(84)
    expect(parseRangeLastRow(REV_RANGE)).toBe(1000)
  })

  it("google-sheets 의 isRedText·isBlueText 는 colors.ts 재수출이다(사본 없음)", () => {
    expect(sheetsIsRedText).toBe(isRedText)
    expect(sheetsIsBlueText).toBe(isBlueText)
  })
})
