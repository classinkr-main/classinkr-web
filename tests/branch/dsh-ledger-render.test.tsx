import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DshMonthlyPace } from "@/components/admin/branch/ledger/DshMonthlyPace"
import { DshNumericGrid } from "@/components/admin/branch/ledger/DshNumericGrid"
import { DshProgressOverview } from "@/components/admin/branch/ledger/DshProgressOverview"
import { DshTeamGrid } from "@/components/admin/branch/ledger/DshTeamGrid"
import type { BranchDshLedgerInfo } from "@/components/admin/branch/ledger/dsh-derive"
import type { BranchDshBreakdownRow, BranchDshRow } from "@/components/admin/branch/types"
import { spliceDshWithLedger } from "@/lib/branch/computations/dsh-ledger-status"
import { scopeDshToManager } from "@/lib/branch/personal-scope"
import { dshFixture, FY, mergedDeals } from "./helpers/dsh-ledger-fixture"

// DSH 렌즈 네 카드의 시트 고정 뒤 표기(D4) — ledger 가 없으면 지금 그대로, 있으면 장부 달 표시·고정 달 비교·미배정.

const DEC20 = new Date("2026-12-20T03:00:00Z")
const JAN10 = new Date("2027-01-10T03:00:00Z")
const noop = () => {}

function data(today = "2026-12-20") {
  const { dsh, info } = spliceDshWithLedger({
    dsh: dshFixture(),
    deals: mergedDeals([], today),
    fiscalYear: FY,
    today,
    lockedAt: "2026-12-01",
    lockMonth: "2026-12",
  })
  return {
    breakdown: (dsh.breakdown ?? []) as BranchDshBreakdownRow[],
    rows: dsh.rows as BranchDshRow[],
    ledger: info as BranchDshLedgerInfo,
    dsh,
  }
}

function sheetOnly() {
  const dsh = dshFixture()
  return { breakdown: (dsh.breakdown ?? []) as BranchDshBreakdownRow[], rows: dsh.rows as BranchDshRow[] }
}

describe("ledger 가 없으면(null) 지금 표기 그대로", () => {
  const { breakdown, rows } = sheetOnly()

  it("네 카드 모두 ledger={null} 과 생략이 같은 마크업 · '장부'·'시트 DSH' 표기 없음", () => {
    const pairs: Array<[string, string]> = [
      [
        renderToStaticMarkup(<DshProgressOverview breakdown={breakdown} rows={rows} now={DEC20} />),
        renderToStaticMarkup(<DshProgressOverview breakdown={breakdown} rows={rows} now={DEC20} ledger={null} />),
      ],
      [
        renderToStaticMarkup(<DshNumericGrid breakdown={breakdown} view="status" onViewChange={noop} now={DEC20} />),
        renderToStaticMarkup(<DshNumericGrid breakdown={breakdown} view="status" onViewChange={noop} now={DEC20} ledger={null} />),
      ],
      [
        renderToStaticMarkup(<DshMonthlyPace breakdown={breakdown} now={DEC20} />),
        renderToStaticMarkup(<DshMonthlyPace breakdown={breakdown} now={DEC20} ledger={null} />),
      ],
      [
        renderToStaticMarkup(<DshTeamGrid rows={rows} now={DEC20} />),
        renderToStaticMarkup(<DshTeamGrid rows={rows} now={DEC20} ledger={null} />),
      ],
    ]
    for (const [omitted, explicitNull] of pairs) {
      expect(explicitNull).toBe(omitted)
      expect(omitted).not.toContain("장부")
      expect(omitted).not.toContain("시트 DSH")
      expect(omitted).not.toContain("시트 실적(비교)")
    }
    expect(pairs[0][0]).toContain("Team KR 전사 · 시트 ‘1. DSH’ 미러 · 팀 필터와 무관")
  })
})

describe("DshProgressOverview — 장부 실적", () => {
  it("12/20: 부제가 실적 출처를 달로 밝히고, 12월 막대에 시트 비교 눈금·이번 달 카드에 시트 비교 줄", () => {
    const { breakdown, rows, ledger } = data()
    const html = renderToStaticMarkup(<DshProgressOverview breakdown={breakdown} rows={rows} ledger={ledger} now={DEC20} />)
    expect(html).toContain("Team KR 전사 · 목표 시트 ‘1. DSH’ · 실적 11월까지 시트 · 12월부터 장부 확정 · 팀 필터와 무관")
    expect(html).toContain("시트 DSH(12월 비교)")
    expect(html).toContain("12월 시트 DSH 실적 ¥12,000 — 시트 ‘1. DSH’에 적힌 값(잠금 뒤 고정)")
    expect(html).toContain("실적 ¥57,000 (장부 확정)")
    expect(html).toContain("시트 DSH ¥1.2만 · 장부와 차이 +¥4.5만")
    expect(html).toContain(", 시트 DSH ¥1.2만")
    // 팀 달성의 미배정 행과 구성별 추정 각주.
    expect(html).toContain("DSH 밖 담당 · 미배정")
    expect(html).toContain("(미구분) = 장부 새 행에 유형(Direct/Channel)이 없음 · 1건")
    // 히어로 주 보기 캡션(F-48)은 월~일 KST 주다.
    expect(html).not.toContain("월요일 시작 캘린더 주")
  })

  it("1/10: 비교값이 사라진다(장부 달 표기는 남는다)", () => {
    const { breakdown, rows, ledger } = data()
    const html = renderToStaticMarkup(<DshProgressOverview breakdown={breakdown} rows={rows} ledger={ledger} now={JAN10} />)
    expect(html).not.toContain("시트 DSH(12월 비교)")
    expect(html).not.toContain("시트 DSH 실적")
    expect(html).not.toContain("장부와 차이")
    expect(html).toContain("12월부터 장부 확정")
  })

  it("장부 실적 계산 실패면 경고 줄을 보이고 시트 부제로 돌아간다", () => {
    const { breakdown, rows } = sheetOnly()
    const ledger: BranchDshLedgerInfo = { lockedAt: "2026-12-01", lockMonth: "2026-12", ledgerMonths: [], error: "ledger_status_failed" }
    const html = renderToStaticMarkup(<DshProgressOverview breakdown={breakdown} rows={rows} ledger={ledger} now={DEC20} />)
    expect(html).toContain("장부 실적을 계산하지 못해 12월 이후도 시트 ‘1. DSH’ 값을 보여 줍니다")
    expect(html).toContain("Team KR 전사 · 시트 ‘1. DSH’ 미러 · 팀 필터와 무관")
  })

  it("개인 범위(F-24): summary 가 멤버 행만 보내도 진도를 그리고, 비교값은 그 멤버의 시트 실적", () => {
    const { dsh, ledger } = data()
    const memberRows = scopeDshToManager(dsh, "예시A").rows.filter((row) => row.level === "member") as BranchDshRow[]
    const html = renderToStaticMarkup(
      <DshProgressOverview breakdown={[]} rows={memberRows} ledger={ledger} personalManager="예시A" now={DEC20} />,
    )
    expect(html).not.toContain("DSH 진도를 계산할 데이터가 없습니다")
    expect(html).toContain("개인 DSH · 예시A · 목표 시트 개인 행 · 실적 12월부터 장부 확정")
    // 12월: 장부 19,000 vs 시트 4,000.
    expect(html).toContain("시트 DSH ¥4,000 · 장부와 차이 +¥1.5만")
  })
})

describe("DshNumericGrid — 장부 달 머리·고정 달 비교", () => {
  it("Status 뷰: 장부 달 머리에 '장부' · 12월 칸 아래 시트 실적(천 단위) · 장부 확정 title", () => {
    const { breakdown, ledger } = data()
    const html = renderToStaticMarkup(<DshNumericGrid breakdown={breakdown} view="status" onViewChange={noop} ledger={ledger} now={DEC20} />)
    expect(html.match(/>장부</g)?.length).toBe(4)
    expect(html).toContain("12월부터 실적은 장부 확정(목표는 시트)")
    // Team KR · Total 12월: 57 (장부) 아래 시트 12.
    expect(html).toContain("57<span class=\"block text-[10px] font-normal text-[#A39E98]\">시트 12</span>")
    expect(html).toContain("장부 ¥57,000 · 시트 DSH ¥12,000(잠금 뒤 고정) · 차이 +¥45,000")
    expect(html).toContain("¥0 · 장부 확정 · 반올림 없음")
    // 음수(환불)는 Status 뷰에서 빨강이 아니다(D2).
    expect(html).not.toContain("text-[#B43E3E]")
  })

  it("Goal 뷰는 시트 원값 title · 비교 줄 없음 · 1월이면 비교 줄 없음", () => {
    const { breakdown, ledger } = data()
    const goal = renderToStaticMarkup(<DshNumericGrid breakdown={breakdown} view="goal" onViewChange={noop} ledger={ledger} now={DEC20} />)
    expect(goal).not.toContain("시트 12")
    expect(goal).not.toContain("장부 확정 · 반올림 없음")
    const january = renderToStaticMarkup(<DshNumericGrid breakdown={breakdown} view="status" onViewChange={noop} ledger={ledger} now={JAN10} />)
    expect(january).not.toContain("시트 12")
  })
})

describe("DshMonthlyPace — 시트 실적(비교) 행", () => {
  it("고정 달 동안만 '시트 실적(비교)' 행이 있고 12월 칸만 채운다", () => {
    const { breakdown, ledger } = data()
    const december = renderToStaticMarkup(<DshMonthlyPace breakdown={breakdown} ledger={ledger} now={DEC20} />)
    expect(december).toContain("시트 실적(비교)")
    expect(december).toContain("시트 ‘1. DSH’에 적힌 12월 실적 — 12월 한 달만 비교로 보여 줍니다")
    expect(december).toContain("장부 ¥57,000 · 시트 DSH ¥12,000(잠금 뒤 고정) · 차이 +¥45,000")
    expect(december).toContain("12월부터 실적은 장부 확정(목표는 시트)")
    const january = renderToStaticMarkup(<DshMonthlyPace breakdown={breakdown} ledger={ledger} now={JAN10} />)
    expect(january).not.toContain("시트 실적(비교)")
    expect(january).toContain("장부")
  })
})

describe("DshTeamGrid — 미배정 · 고정 달 비교", () => {
  it("미배정 팀은 설명 라벨·title 이고 'REV에서 보기' 링크가 없다", () => {
    const { rows, ledger } = data()
    const html = renderToStaticMarkup(<DshTeamGrid rows={rows} ledger={ledger} now={DEC20} />)
    expect(html).toContain("DSH 밖 담당 · 미배정")
    expect(html).toContain("장부 담당자가 시트 DSH 멤버에 없거나 비어 있는 매출 — Team KR 합계에는 들어갑니다")
    // REV 링크는 BD·MKT 두 팀만(Team KR·미배정 제외).
    expect(html.match(/REV에서 보기/g)?.length).toBe(2)
    // Status 뷰 12월: BD 34 아래 시트 9.
    expect(html).toContain("34<span class=\"block text-[10px] font-normal text-[#A39E98]\">시트 9</span>")
  })

  it("1월이면 비교 줄이 없다", () => {
    const { rows, ledger } = data()
    const html = renderToStaticMarkup(<DshTeamGrid rows={rows} ledger={ledger} now={JAN10} />)
    expect(html).not.toContain("시트 9")
    expect(html).toContain("DSH 밖 담당 · 미배정")
  })
})
