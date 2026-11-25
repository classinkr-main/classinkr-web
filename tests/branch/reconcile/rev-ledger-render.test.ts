// 대조 보고서 그리기(lib/branch/reconcile/rev-ledger-render.ts) — 머리 글·절 제목·문구·CSV 모양을 고정한다.
import { describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))

import { reconcileRevLedger, type ReconcileReport } from "@/lib/branch/reconcile/rev-ledger-reconcile"
import {
  CAUSE_LABELS,
  MEASURE_LABELS,
  RECONCILE_CSV_HEADER,
  formatYuanExact,
  reconcileStatusLine,
  renderReconcileCsv,
  renderReconcileJson,
  renderReconcileMarkdown,
} from "@/lib/branch/reconcile/rev-ledger-render"
import {
  BASE_ROWS,
  NOW,
  SYNC_AT,
  entry,
  ledgerInput,
  mirrorDeals,
  revGrid,
  rowIdOf,
  sheetInput,
  type FixtureRow,
} from "./fixtures/rev-reconcile-fixtures"

// T2(장부 새 행) + T7(동기화 뒤 시트 변경) + T9(빨간 예정 칸) — 11/30 데이터를 12/1 에 읽는다.
function combinedReport(opts: { manager?: string; months?: string[] } = {}): ReconcileReport {
  const red9: FixtureRow = {
    customer: "예시학원9",
    manager: "예시C",
    rowId: rowIdOf(9),
    months: { "2026-12": { weeks: [{ amount: 100, color: "red" }, null, { amount: 200, color: "red" }] } },
  }
  const dbRows: FixtureRow[] = [...BASE_ROWS, red9]
  const liveRows: FixtureRow[] = [BASE_ROWS[0], BASE_ROWS[1], { ...BASE_ROWS[2], months: { "2026-12": { weeks: [450] } } }, red9]
  const deals = mirrorDeals(revGrid(dbRows), { today: "2026-11-30", syncedAt: SYNC_AT })
  return reconcileRevLedger(
    sheetInput(revGrid(liveRows)),
    ledgerInput(deals, {
      entries: [entry({ id: "7f3c0000aaaa", draftId: "91aa0000bbbb", customer: "예시학원5", manager: "예시A", month: "2026-12", amount: 10000 })],
    }),
    { fiscalYear: 2026, asOf: "2026-12-01", now: NOW, ...opts },
  )
}

describe("formatYuanExact", () => {
  it("¥ · 천 단위 쉼표 · U+2212 마이너스 · 부호 · 소수 둘째 자리", () => {
    expect(formatYuanExact(12345)).toBe("¥12,345")
    expect(formatYuanExact(-30)).toBe("−¥30")
    expect(formatYuanExact(1000, { signed: true })).toBe("+¥1,000")
    expect(formatYuanExact(0, { signed: true })).toBe("¥0")
    expect(formatYuanExact(-0)).toBe("¥0")
    expect(formatYuanExact(0.5)).toBe("¥0.5")
    expect(formatYuanExact(1234567.891)).toBe("¥1,234,567.89")
    expect(formatYuanExact(0.1 + 0.2)).toBe("¥0.3")
  })

  it("라벨", () => {
    expect(MEASURE_LABELS).toEqual({ total: "합계", confirmed: "확정", highConfidence: "고확도", expected: "예정" })
    expect(CAUSE_LABELS.sheet_changed).toBe("동기화 뒤 시트 변경")
    expect(CAUSE_LABELS.pending_rollover).toBe("시간 경과")
  })
})

describe("Markdown", () => {
  it("T2+T7+T9 묶음 — 머리 글·절 제목·문구", () => {
    expect(renderReconcileMarkdown(combinedReport())).toMatchInlineSnapshot(`
      "# REV 시트 ↔ 매출 장부 대조
      - 실행 2026-11-30 22:05 KST · FY26-27 · 월 FY26-27 열두 달 · 담당자 전체
      - 시트 '2. REV'!A1:CZ1000 · 읽은 행 6 · 고객 행 4 · 읽은 시각 2026-11-30 22:00 KST
      - 장부 DB 시트 미러(화면과 같은 원천 — 액티브 임포트 없음) · 행 4 · 데이터 날짜 2026-11-30(KST) · 마지막 REV 동기화 2026-11-30 21:39 KST
      - 장부 항목 적용 1 · 상쇄 0(제외) · 시트 쓰기로 흡수 0 · 항목 없는 적용 초안 0 · 겹친 정정 0(늦은 것만 셈) · 열린 초안 0(합계에 안 들어감)
      - 규칙 확도 = 앱 규칙(rev-confirmed.ts: 빨간 글자 확정 · 파란 글자 고확도 · 빨간 글자라도 그 주 시작 전은 예정 · 색 없는 행은 지난달까지 확정) · 읽는 날 2026-12-01(KST) · 음수(환불) 달 포함(시트 1행 SUM과 같음) · 차이 허용 ¥0.5
      - 차이 = 장부 입력(장부 − 장부 DB) + 동기화 뒤 시트 변경(장부 DB − 데이터 날짜로 읽은 시트) + 시간 경과(데이터 날짜로 읽은 시트 − 오늘 읽은 시트)
      - 결과 **막음 — 동기화 뒤 시트 변경 칸 2개(합계 −¥50)**

      ## 0. 시트 자체 점검 (시트 전체)
      | 열 | 시트 1행 SUM | 앱이 읽은 합 | 차이 | 원인 |
      |---|---:|---:|---:|---|
      | 10월 (AX) | ¥400 | ¥400 | ¥0 | 같음 |
      | 11월 (BD) | ¥1,000 | ¥1,000 | ¥0 | 같음 |
      | 12월 (BJ) | ¥970 | ¥970 | ¥0 | 같음 |
      - 금액 없는 열 9개(1행 SUM·앱 모두 ¥0)는 표에서 뺐다
      - 고객명 빈 행에 금액: 0
      - 숫자로 못 읽은 칸: 0
      - 월 칸 ≠ 주 칸 합: 0
      - Sum 열(M) 1행 = 월 열 1행 합: 같음
      - 범위: 읽은 6행 · 고객 행 4 — 잘림 없음
      - 머리: 정상(월 블록 12개)

      ## 1. 담당자 요약 (고른 달 합)
      | 담당자 | 시트 | 장부 | 차이 | 장부 입력 | 동기화 뒤 시트 변경 | 시간 경과 | 차이 칸 |
      |---|---:|---:|---:|---:|---:|---:|---:|
      | 예시A | ¥1,170 | ¥11,120 | +¥9,950 | +¥10,000 | −¥50 | ¥0 | 3 |
      | 예시B | ¥900 | ¥900 | ¥0 | ¥0 | ¥0 | ¥0 | 0 |
      | 예시C | ¥300 | ¥300 | ¥0 | ¥0 | ¥0 | ¥0 | 0 |
      | **전체** | ¥2,370 | ¥12,320 | +¥9,950 | +¥10,000 | −¥50 | ¥0 | 3 |
      합계(확도와 무관) 기준. 시간 경과는 합계를 바꾸지 않고 확도만 옮긴다 — 읽는 시점 판정이 맞으면 0이다.

      ## 2. 담당자 × 월 × 확도 — 차이 있는 칸만
      | 담당자 | 월 | 확도 | 시트 | 장부 | 차이 | 장부 입력 | 동기화 뒤 시트 변경 | 시간 경과 |
      |---|---|---|---:|---:|---:|---:|---:|---:|
      | 예시A | 2026-12 | 합계 | ¥670 | ¥10,620 | +¥9,950 | +¥10,000 | −¥50 | ¥0 |
      | 예시A | 2026-12 | 확정 | ¥100 | ¥10,100 | +¥10,000 | +¥10,000 | ¥0 | ¥0 |
      | 예시A | 2026-12 | 예정 | ¥520 | ¥470 | −¥50 | ¥0 | −¥50 | ¥0 |

      ## 3. 건별 차이
      장부 칸은 원인별로 다르다: 장부 새 행·정정 = 장부 항목 · 동기화 뒤 시트 변경·DB에만 있는 행 = 장부 DB · 시간 경과 = 데이터 날짜로 읽은 시트.

      | 담당자 | 고객 | 시트 행 | 월 | 시트 확정 / 고확도 / 예정 | 장부 확정 / 고확도 / 예정 | 원인 | 근거 |
      |---|---|---:|---|---:|---:|---|---|
      | 예시A | 예시학원5 | 새 | 2026-12 | — | ¥10,000 / ¥0 / ¥0 | 장부 새 행 | 항목 7f3c…aaaa · 초안 91aa…bbbb · 11-28 적용 · 시트 쓰기 없음 |
      | 예시A | 예시학원3 | 5 | 2026-12 | ¥0 / ¥0 / ¥450 | ¥0 / ¥0 / ¥400 | 동기화 뒤 시트 변경 | 데이터 날짜(2026-11-30) 뒤 시트에서 바뀜 — 다음 동기화(잠금 뒤에는 12/1 스냅샷 다시 읽기)가 가져온다 |

      ## 4. 잠금 전에 볼 것 (합계 차이와 별개)
      - 이중 입력 의심 0건
      - 정정 대상 못 찾음 0건
      - CNY 아닌 항목 0건
      - 담당자 빈 장부 항목 0건
      - 열린 초안 0건
      - **잠금 뒤 저절로 확정되지 않는 금액: 예정 ¥270 · 고확도 ¥50** (예시A 예정 ¥270 · 고확도 ¥50) — 시트가 고정되면 글자색을 바꿀 수 없다. 확정이 되려면 장부에서 확정으로 다시 입력한다.
        - 예시A · 예시학원1(3행) · 2026-11 · 예정 ¥200 · 고확도 ¥0
        - 예시A · 예시학원1(3행) · 2026-12 · 예정 ¥70 · 고확도 ¥50
      - 시간이 지나면 저절로 확정: 예시A ¥400 · 예시C ¥200 — 빨간 예정 칸 1칸(그 주 시작일에) · 색 없는 행 1칸(그 달이 끝나면). 동기화가 멈춰도 읽는 날 기준으로 바뀐다.
      - 화면 식 ↔ 서버 식: 같음

      ## 5. 담당자 이름
      | 정규 이름 | 시트 표기(행) | 장부 항목 표기(건) | 메모 |
      |---|---|---|---|
      | 예시A | 예시A(2) | 예시A(1) | 별칭 표에 없는 이름 — 오타인지 확인 |
      | 예시B | 예시B(1) | — | 별칭 표에 없는 이름 — 오타인지 확인 |
      | 예시C | 예시C(1) | — | 별칭 표에 없는 이름 — 오타인지 확인 |
      "
    `)
  })

  it("음수 월 열은 음수가 있을 때만", () => {
    expect(renderReconcileMarkdown(combinedReport())).not.toContain("음수 월")
    const rows: FixtureRow[] = [...BASE_ROWS, { customer: "예시학원11", manager: "예시A", rowId: rowIdOf(11), months: { "2026-10": { total: -30 } } }]
    const grid = revGrid(rows)
    const report = reconcileRevLedger(sheetInput(grid), ledgerInput(mirrorDeals(grid, { today: "2026-11-30", syncedAt: SYNC_AT })), {
      fiscalYear: 2026,
      asOf: "2026-11-30",
      now: NOW,
    })
    const md = renderReconcileMarkdown(report)
    expect(md).toContain("| 차이 칸 | 음수 월 |")
    expect(md).toContain("| 예시A | ¥1,090 | ¥1,090 | ¥0 | ¥0 | ¥0 | ¥0 | 0 | −¥30 |")
    expect(md).toContain("음수 월은 시트의 환불 달 합이고 합계에 들어 있다.")
  })

  it("담당 필터면 0절은 개수만 — 다른 담당의 행 번호·고객이 없다", () => {
    const md = renderReconcileMarkdown(combinedReport({ manager: "예시C", months: ["2026-12"] }))
    const section0 = md.slice(md.indexOf("## 0."), md.indexOf("## 1."))
    expect(section0).toContain("담당자 보기라 건별 내용은 뺐다")
    expect(section0).not.toMatch(/\d+행/)
    expect(md).not.toContain("예시학원3")
    expect(md).not.toContain("예시학원5")
    expect(md).toContain("담당자 예시C")
  })

  it("결과 줄 — 같음 · 설명됨 · 막음 · 불완전", () => {
    const grid = revGrid(BASE_ROWS)
    const deals = mirrorDeals(grid, { today: "2026-11-30", syncedAt: SYNC_AT })
    const same = reconcileRevLedger(sheetInput(grid), ledgerInput(deals), { fiscalYear: 2026, asOf: "2026-11-30", now: NOW })
    expect(reconcileStatusLine(same)).toBe("같음 — 차이 없음")
    const explained = reconcileRevLedger(
      sheetInput(grid),
      ledgerInput(deals, { entries: [entry({ id: "e1", customer: "예시학원1", manager: "예시A", month: "2026-12", amount: 10 })] }),
      { fiscalYear: 2026, asOf: "2026-11-30", now: NOW },
    )
    expect(reconcileStatusLine(explained)).toBe("차이 있음(설명됨) — 담당자 2명 중 1명 · 칸 2개 · 잠금을 막는 차이 없음")
    expect(reconcileStatusLine(combinedReport())).toBe("막음 — 동기화 뒤 시트 변경 칸 2개(합계 −¥50)")
    const incomplete = reconcileRevLedger(sheetInput(grid), ledgerInput(deals, { entriesHealthOk: false }), { fiscalYear: 2026, asOf: "2026-11-30", now: NOW })
    expect(reconcileStatusLine(incomplete)).toBe("불완전 — 장부 항목 표를 읽지 못했다(장부 입력을 셀 수 없음)")
  })

  it("고객 이름의 '|' 는 표를 깨지 않는다", () => {
    const rows: FixtureRow[] = [{ customer: "예시|학원", manager: "예시A", rowId: rowIdOf(50), months: { "2026-11": { weeks: [10] } } }]
    const grid = revGrid(rows)
    const report = reconcileRevLedger(
      sheetInput(grid),
      ledgerInput(mirrorDeals(grid, { today: "2026-11-30", syncedAt: SYNC_AT }), {
        entries: [entry({ id: "e9", customer: "예시|학원", manager: "예시A", month: "2026-11", amount: 5 })],
      }),
      { fiscalYear: 2026, asOf: "2026-11-30", now: NOW },
    )
    expect(renderReconcileMarkdown(report)).toContain("| 예시A | 예시\\|학원 | 새 |")
  })
})

describe("CSV", () => {
  const csv = renderReconcileCsv(combinedReport())
  const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n")

  it("BOM · 머리 · CRLF", () => {
    expect(csv.startsWith("﻿")).toBe(true)
    expect(lines[0]).toBe("kind,manager,month,measure,sheet,ledger,delta,delta_entries,delta_sync,delta_time,customer,sheet_row,row_id,cause,detail")
    expect(lines[0].split(",")).toEqual([...RECONCILE_CSV_HEADER])
    expect(csv.endsWith("\r\n")).toBe(true)
  })

  it("숫자는 ¥·쉼표 없이 — 0 아닌 칸만 · kind 는 cell|row|check", () => {
    expect(lines).toContain("cell,예시A,2026-12,total,670,10620,9950,10000,-50,0,,,,,")
    expect(lines).toContain("cell,예시A,2026-12,expected,520,470,-50,0,-50,0,,,,,")
    expect(lines.some((line) => line.startsWith("cell,") && /,0,0,0,0,0,0,,,,,$/.test(line))).toBe(false)
    expect(new Set(lines.slice(1).map((line) => line.split(",")[0]))).toEqual(new Set(["cell", "row", "check"]))
    expect(csv).not.toContain("¥")
    const sheetChanged = lines.filter((line) => line.includes(",sheet_changed,"))
    expect(sheetChanged).toEqual([
      "row,예시A,2026-12,total,450,400,-50,,-50,,예시학원3,5,r_000000000003,sheet_changed,데이터 날짜(2026-11-30) 뒤 시트에서 바뀜 — 다음 동기화(잠금 뒤에는 12/1 스냅샷 다시 읽기)가 가져온다",
      "row,예시A,2026-12,expected,450,400,-50,,-50,,예시학원3,5,r_000000000003,sheet_changed,데이터 날짜(2026-11-30) 뒤 시트에서 바뀜 — 다음 동기화(잠금 뒤에는 12/1 스냅샷 다시 읽기)가 가져온다",
    ])
    expect(lines.filter((line) => line.includes(",ledger_new,")).map((line) => line.split(",").slice(0, 8).join(","))).toEqual([
      "row,예시A,2026-12,total,,10000,10000,10000",
      "row,예시A,2026-12,confirmed,,10000,10000,10000",
    ])
    expect(lines).toContain("check,예시C,2026-12,confirmed,,200,,,,,예시학원9,6,,auto_promote,빨간 예정 칸 2026-12-15")
  })

  it("글자 칸의 쉼표·따옴표는 감싸고, 수식처럼 보이는 글자는 ' 를 붙인다", () => {
    const rows: FixtureRow[] = [{ customer: '=예시,"학원"', manager: "예시A", rowId: rowIdOf(60), months: { "2026-11": { weeks: [10] } } }]
    const grid = revGrid(rows)
    const report = reconcileRevLedger(
      sheetInput(grid),
      ledgerInput(mirrorDeals(grid, { today: "2026-11-30", syncedAt: SYNC_AT }), {
        entries: [entry({ id: "e60", customer: '=예시,"학원"', manager: "예시A", month: "2026-11", amount: 5 })],
      }),
      { fiscalYear: 2026, asOf: "2026-11-30", now: NOW },
    )
    expect(renderReconcileCsv(report)).toContain(`,"'=예시,""학원""",`)
  })

  it("담당 필터면 시트 점검은 개수 한 줄", () => {
    const filtered = renderReconcileCsv(combinedReport({ manager: "예시C" }))
    expect(filtered).toContain(",sheet_self_check,")
    expect(filtered).not.toContain(",orphan_amount_row,")
    expect(filtered).not.toContain("예시학원3")
  })
})

describe("JSON", () => {
  it("보고서 객체 그대로", () => {
    const report = combinedReport()
    expect(JSON.parse(renderReconcileJson(report))).toEqual(JSON.parse(JSON.stringify(report)))
  })
})
