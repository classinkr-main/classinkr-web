import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { LEDGER_VIEWS, LENS_TABS, LENSES } from "@/components/admin/branch/ledger/workbench-shared"

// 장부·REV 탭 통합(2026-10-26): 탭 줄에는 장부 하나, 그 안에서 월 요약 ↔ 주차 검수(REV 표)로 보기만 바꾼다.
// rev 렌즈 값과 ?lens=rev 딥링크는 그대로 살아 있어야 한다(CRM 매출시트·DSH 링크가 쓴다).

const workbench = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8").replace(/\r\n/g, "\n")

describe("장부·REV 탭 통합", () => {
  it("탭 줄에서 REV 가 빠지고 나머지 렌즈 순서는 그대로다", () => {
    expect(LENS_TABS.map((item) => item.id)).toEqual(["ledger", "dsh", "board", "cockpit"])
    expect(LENSES.some((item) => item.id === "rev")).toBe(true)
  })

  it("장부 탭 안 보기 전환은 월 요약(ledger) → 주차 검수(rev) 순서다", () => {
    expect(LEDGER_VIEWS.map((view) => [view.id, view.label])).toEqual([["ledger", "월 요약"], ["rev", "주차 검수"]])
  })

  it("주차 검수 보기에서도 장부 탭이 선택돼 보이고, 패널 이름표가 사라진 REV 탭을 가리키지 않는다", () => {
    expect(workbench).toContain('const tabActive = lens === item.id || (item.id === "ledger" && lens === "rev")')
    expect(workbench).toContain('aria-labelledby={`sales-ledger-lens-${lens === "rev" ? "ledger" : lens}`}')
    expect(workbench).toContain("{LENS_TABS.map((item, index) => {")
  })

  it("?lens=rev 딥링크는 여전히 rev 렌즈(주차 검수)로 연다", () => {
    expect(workbench).toContain('value === "dsh" || value === "rev" || value === "board" || value === "cockpit" ? value : "ledger"')
  })
})
