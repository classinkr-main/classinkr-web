import { describe, expect, it } from "vitest"

import {
  aggregateDshTotals,
  deriveDshMonthlyPace,
  deriveDshProgress,
  deriveDshSegments,
  deriveDshTeamProgress,
  dshActiveSheetCompare,
  dshCompareTitle,
  dshCurrentQuarterMonths,
  dshElapsed,
  dshLedgerErrorMessage,
  dshLedgerInferredNotes,
  dshLedgerSubtitle,
  dshMemberCompare,
  dshStatusSource,
  dshTeamLabel,
  dshTotalsFromRows,
  dshValueTitle,
  isDshLedgerMonth,
  type BranchDshLedgerInfo,
} from "@/components/admin/branch/ledger/dsh-derive"
import type { BranchDshBreakdownRow, BranchDshRow } from "@/components/admin/branch/types"
import { FY_KEYS } from "./helpers/dsh-ledger-fixture"

// dsh-derive — '오늘 → 달·분기' 를 KST 영업일로(F-10), 개인 범위 멤버 행 합계(F-24), 시트 고정 뒤 장부 표기(D4).

function numbers(perMonth: number) {
  const months = Object.fromEntries(FY_KEYS.map((ym) => [ym, perMonth]))
  return { annual: perMonth * 12, quarters: [perMonth * 3, perMonth * 3, perMonth * 3, perMonth * 3] as [number, number, number, number], months }
}

function breakdown(): BranchDshBreakdownRow[] {
  return [
    { kind: "goal", category: "Software", status_type: "New", channel: "Direct", ...numbers(1_000) },
    { kind: "status", category: "Software", status_type: "New", channel: "Direct", ...numbers(500) },
  ]
}

const memberRow = (member: string, kind: "goal" | "status", perMonth: number): BranchDshRow => ({
  level: "member",
  team: "BD",
  member,
  kind,
  ...numbers(perMonth),
})

describe("F-10 — '오늘'은 KST 영업일(매월 1일 00:00~08:59 KST 에도 이번 달·분기)", () => {
  const totals = aggregateDshTotals(breakdown())

  it("2026-11-30T15:05Z(= 12/1 00:05 KST): 12월 · Q3 · 월 경과 1일", () => {
    const now = new Date("2026-11-30T15:05:00Z")
    const progress = deriveDshProgress(totals, now)
    expect(progress.currentMonthKey).toBe("2026-12")
    expect(progress.currentQuarter).toBe(3)
    expect(progress.elapsed.todayLabel).toBe("12/1")
    expect(progress.elapsed.month.pct).toBeCloseTo(100 / 31, 5)
    expect(progress.elapsed.month.daysLeft).toBe(30)
    expect(dshCurrentQuarterMonths(now)).toEqual(["2026-10", "2026-11", "2026-12"])
    expect(deriveDshMonthlyPace(breakdown(), now)?.months.find((month) => month.isCurrent)?.ym).toBe("2026-12")
  })

  it("2026-12-31T15:05Z(= 1/1 KST): 1월 · Q4 · 분기 월은 1~3월", () => {
    const now = new Date("2026-12-31T15:05:00Z")
    const progress = deriveDshProgress(totals, now)
    expect(progress.currentMonthKey).toBe("2027-01")
    expect(progress.currentQuarter).toBe(4)
    expect(progress.elapsed.todayLabel).toBe("1/1")
    expect(dshCurrentQuarterMonths(now)).toEqual(["2027-01", "2027-02", "2027-03"])
    // 분기 값은 Q4(인덱스 3)에서 고른다 — UTC 로 읽으면 Q3 를 골랐다.
    const segments = deriveDshSegments(breakdown(), now, "Q")
    expect(segments[0].rows[0].goal).toBe(3_000)
    const [team] = deriveDshTeamProgress([memberRow("예시A", "goal", 100), { ...memberRow("예시A", "goal", 100), level: "team", team: "ALL" }], now, "M")
    expect(team.goal).toBe(100)
  })

  it("2027-03-31T15:05Z(= 4/1 KST): FY26-27 창 밖 — 이번 달 없음 · Q1 · 연 경과 100%", () => {
    const now = new Date("2027-03-31T15:05:00Z")
    const progress = deriveDshProgress(totals, now)
    expect(progress.currentMonthKey).toBeNull()
    expect(progress.currentQuarter).toBe(1)
    expect(progress.elapsed.year.pct).toBe(100)
    expect(dshElapsed(now, 2026).todayLabel).toBe("4/1")
  })
})

describe("F-24 — 개인 범위 합계: ALL 행이 없으면 멤버 행을 더한다", () => {
  it("summary 가 멤버 행만 보낸 개인 범위도 진도를 낸다", () => {
    const totals = dshTotalsFromRows([memberRow("예시A", "goal", 1_000), memberRow("예시A", "status", 400)])
    expect(totals?.goal.annual).toBe(12_000)
    expect(totals?.status.months["2026-12"]).toBe(400)
    expect(totals?.monthKeys).toEqual(FY_KEYS)
  })

  it("여러 멤버면 kind 별로 더한다 · 실적만 있는 멤버는 목표 0", () => {
    const totals = dshTotalsFromRows([memberRow("예시A", "goal", 1_000), memberRow("예시B", "status", 300), memberRow("예시A", "status", 200)])
    expect(totals?.goal.annual).toBe(12_000)
    expect(totals?.status.annual).toBe(6_000)
  })

  it("ALL 행이 있으면 ALL 행이 합계다(멤버 행을 더하지 않는다) · 행이 없으면 null", () => {
    const all = { ...memberRow("", "goal", 7), level: "team" as const, team: "ALL", member: undefined }
    expect(dshTotalsFromRows([all, memberRow("예시A", "goal", 1_000)])?.goal.annual).toBe(84)
    expect(dshTotalsFromRows([])).toBeNull()
  })
})

describe("장부 표기 도우미(D4)", () => {
  const ledger: BranchDshLedgerInfo = {
    lockedAt: "2026-12-01",
    lockMonth: "2026-12",
    ledgerMonths: ["2026-12", "2027-01", "2027-02", "2027-03"],
    sheetCompare: { month: "2026-12", total: 12_000, byCombo: {}, byTeam: { ALL: 12_000 }, byMember: { Han: 4_000 } },
    inferred: { channelUnknown: 2, statusInferred: 1 },
  }

  it("장부 달 · 출처(시트/장부/섞임)", () => {
    expect(isDshLedgerMonth(ledger, "2026-12")).toBe(true)
    expect(isDshLedgerMonth(ledger, "2026-11")).toBe(false)
    expect(isDshLedgerMonth(null, "2026-12")).toBe(false)
    expect(isDshLedgerMonth({ ...ledger, error: "ledger_status_failed" }, "2026-12")).toBe(false)
    expect(dshStatusSource(ledger, ["2026-12"])).toBe("ledger")
    expect(dshStatusSource(ledger, ["2026-10", "2026-11", "2026-12"])).toBe("mixed")
    expect(dshStatusSource(ledger, ["2026-11"])).toBe("sheet")
    expect(dshStatusSource(null, ["2026-12"])).toBe("sheet")
  })

  it("원값 title — 시트 원값은 지금 문구 그대로", () => {
    expect(dshValueTitle(1_234)).toBe("¥1,234 · 시트 원값 · 반올림 없음")
    expect(dshValueTitle(1_234, "ledger")).toBe("¥1,234 · 장부 확정 · 반올림 없음")
    expect(dshValueTitle(1_234, "mixed")).toBe("¥1,234 · 시트 원값 + 장부 확정 · 반올림 없음")
    expect(dshCompareTitle(57_000, 12_000)).toBe("장부 ¥57,000 · 시트 DSH ¥12,000(잠금 뒤 고정) · 차이 +¥45,000")
    expect(dshCompareTitle(1_000, 3_000)).toBe("장부 ¥1,000 · 시트 DSH ¥3,000(잠금 뒤 고정) · 차이 −¥2,000")
  })

  it("비교값은 고정 달(KST 영업월) 동안만 — 12/1 00:05 KST 부터, 1/1 KST 부터 사라진다", () => {
    expect(dshActiveSheetCompare(ledger, new Date("2026-11-30T15:05:00Z"))?.total).toBe(12_000)
    expect(dshActiveSheetCompare(ledger, new Date("2026-12-31T14:59:00Z"))?.total).toBe(12_000)
    expect(dshActiveSheetCompare(ledger, new Date("2026-12-31T15:05:00Z"))).toBeNull()
    expect(dshActiveSheetCompare({ ...ledger, sheetCompare: undefined }, new Date("2026-12-20T03:00:00Z"))).toBeNull()
    expect(dshMemberCompare(ledger.sheetCompare ?? null, "han")).toBe(4_000)
    expect(dshMemberCompare(ledger.sheetCompare ?? null, "예시Z")).toBeNull()
  })

  it("부제 · 팀 라벨 · 오류 안내 · 추정 각주", () => {
    expect(dshLedgerSubtitle(ledger, FY_KEYS, false, "")).toBe(
      "Team KR 전사 · 목표 시트 ‘1. DSH’ · 실적 11월까지 시트 · 12월부터 장부 확정 · 팀 필터와 무관",
    )
    expect(dshLedgerSubtitle(ledger, FY_KEYS, true, "Han")).toBe("개인 DSH · Han · 목표 시트 개인 행 · 실적 12월부터 장부 확정")
    expect(dshTeamLabel("ALL")).toBe("Team KR")
    expect(dshTeamLabel("미배정")).toBe("DSH 밖 담당 · 미배정")
    expect(dshTeamLabel("BD")).toBe("BD")
    expect(dshLedgerErrorMessage(null)).toBeNull()
    expect(dshLedgerErrorMessage({ ...ledger, ledgerMonths: [], error: "ledger_status_failed" })).toBe(
      "장부 실적을 계산하지 못해 12월 이후도 시트 ‘1. DSH’ 값을 보여 줍니다 — 새로고침하거나 관리자에게 알려 주세요.",
    )
    expect(dshLedgerInferredNotes(ledger)).toEqual([
      "(미구분) = 장부 새 행에 유형(Direct/Channel)이 없음 · 2건",
      "New/Renew 추정 1건(첫 결제일 없음)",
    ])
    expect(dshLedgerInferredNotes(null)).toEqual([])
  })
})
