import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { LEDGER_VIEWS, LENS_TABS, LENSES } from "@/components/admin/branch/ledger/workbench-shared"
import { lensTabOf } from "@/components/admin/branch/ledger/ledger-lens-tabs"

// 장부·REV 탭 통합(2026-10-26): 탭 줄에는 장부 하나, 그 안에서 보기만 바꾼다.
// 2026-11-23: 기본 화면이 건별 시트가 되면서 보기 선택은 건별 · 기관별 · 매니저별이고, 주차 검수(REV 표)는 접힌 패널의 버튼으로 연다.
// rev 렌즈 값과 ?lens=rev 딥링크는 그대로 살아 있어야 한다(CRM 매출시트·DSH 링크가 쓴다).

const workbench = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8").replace(/\r\n/g, "\n")
const topBar = readFileSync(join(process.cwd(), "components/admin/branch/ledger/LedgerTopBar.tsx"), "utf8").replace(/\r\n/g, "\n")

describe("장부·REV 탭 통합", () => {
  it("탭 줄에서 REV 가 빠지고 순서는 DSH · 장부 · 보드 · 콕핏이다(2026-11-23)", () => {
    expect(LENS_TABS.map((item) => item.id)).toEqual(["dsh", "ledger", "board", "cockpit"])
    expect(LENSES.some((item) => item.id === "rev")).toBe(true)
  })

  it("주차 검수(rev)의 라벨은 그대로다 — 월 요약(ledger) → 주차 검수(rev) 순서", () => {
    expect(LEDGER_VIEWS.map((view) => [view.id, view.label])).toEqual([["ledger", "월 요약"], ["rev", "주차 검수"]])
  })

  it("주차 검수 보기에서도 장부 탭이 선택돼 보이고, 패널 이름표가 사라진 REV 탭을 가리키지 않는다", () => {
    // 탭 줄은 머리줄(ledger/LedgerTopBar)로 올라갔다 — 선택 탭은 lensTabOf 가 정한다(rev → 장부).
    expect(lensTabOf("rev")).toBe("ledger")
    expect(workbench).toContain("activeTab={lensTabOf(lens)}")
    expect(workbench).toContain('aria-labelledby={`sales-ledger-lens-${lens === "rev" ? "ledger" : lens}`}')
    expect(topBar).toContain("id={`sales-ledger-lens-${tab.id}`}")
  })

  it("주차 검수는 접힌 패널의 버튼으로 열고, 보는 중에는 보기 선택에 그 칸이 남는다", () => {
    expect(workbench).toContain('onClick={() => selectLens("rev")}')
    expect(workbench).toContain('...(lens === "rev" ? LEDGER_VIEWS.filter((view) => view.id === "rev")')
  })

  it("?lens=rev 딥링크는 여전히 rev 렌즈(주차 검수)로 연다", () => {
    expect(workbench).toContain('value === "dsh" || value === "rev" || value === "board" || value === "cockpit" ? value : "ledger"')
  })
})
