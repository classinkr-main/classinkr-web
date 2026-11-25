// DSH 실적 장부 교체(D4) 테스트 픽스처 — design-3 프로토타입(시트 고정 전 설계 검증)의 가명 데이터를 그대로 옮겼다.
// '1. DSH' 격자(Team KR · BD · MKT 블록 + 개인 블록) · 12/1 고정 시점의 REV 스냅샷 딜 · 12월에 적용된 장부 항목.
// 예시A~D · 예시학원1~7 은 전부 가명이다.

import type { FormattedCell } from "@/lib/branch/google-sheets"
import { mergeLedgerIntoDeals, type LedgerOverlayEntry } from "@/lib/branch/ledger-overlay"
import { parseDsh, type DshOutput } from "@/lib/branch/parsers/dsh"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

export const FY = 2026
const FISCAL = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
export const ymOf = (month: number) => `${month >= 4 ? FY : FY + 1}-${String(month).padStart(2, "0")}`
export const FY_KEYS = FISCAL.map(ymOf)
const QUARTERS = [[4, 5, 6], [7, 8, 9], [10, 11, 12], [1, 2, 3]]

const cell = (value: unknown): FormattedCell => ({ value: value as string | number | null, bg: null, fg: null })
const sumOf = (values: Record<number, number>, months: number[]) => months.reduce((sum, month) => sum + (values[month] ?? 0), 0)

// 한 줄: A 라벨 · B 구간 · C 분류 · D New/Renew · E 채널 · F 연간 · G~J 분기 · K~V 월 · W 비율
function line(a: string, b: string, category: string, statusType: string, channel: string, values: Record<number, number>) {
  return [
    cell(a), cell(b), cell(category), cell(statusType), cell(channel),
    cell(sumOf(values, FISCAL)),
    ...QUARTERS.map((months) => cell(sumOf(values, months))),
    ...FISCAL.map((month) => cell(values[month] ?? 0)),
    cell(""),
  ]
}
const flat = (value: number) => Object.fromEntries(FISCAL.map((month) => [month, value]))
// 11월까지 손으로 적은 실적 + 12/1 에 일부만 적힌 12월 값(그 뒤 고정).
const pre = (value: number, december: number) => ({ 4: value, 5: value, 6: value, 7: value, 8: value, 9: value, 10: value, 11: value, 12: december })
const person = (member: string, kind: "Goal" | "Status", values: Record<number, number>, label = "") => [
  cell(label), cell(""), cell(""), cell(member), cell(kind), ...line("", "", "", "", "", values).slice(5),
]

export function dshGrid(): FormattedCell[][] {
  const header = [cell("FY26-27"), cell(""), cell(""), cell(""), cell(""), cell("Year"), cell("Q1"), cell("Q2"), cell("Q3"), cell("Q4"), ...FISCAL.map((month) => cell(String(month))), cell("Ratio")]
  return [
    header,
    line("Team KR", "Goal", "Software", "New", "Direct", flat(40_000)),
    line("", "Goal", "Software", "Renew", "Direct", flat(30_000)),
    line("", "Goal", "Hardware", "Renew", "", flat(10_000)), // 시트 채널 공란 → "(미구분)"
    line("", "Status", "Software", "New", "Direct", pre(35_000, 5_000)),
    line("", "Status", "Software", "Renew", "Direct", pre(28_000, 7_000)),
    line("", "Status", "Software", "Sum", "", pre(63_000, 12_000)), // 소계 행(무시)
    line("", "Status", "Hardware", "Renew", "", pre(9_000, 0)),
    line("BD", "Goal", "Software", "New", "Direct", flat(30_000)),
    line("", "Goal", "Software", "Renew", "Direct", flat(20_000)),
    line("", "Status", "Software", "New", "Direct", pre(26_000, 4_000)),
    line("", "Status", "Software", "Renew", "Direct", pre(18_000, 5_000)),
    line("MKT", "Goal", "Software", "New", "Direct", flat(10_000)),
    line("", "Goal", "Software", "Renew", "Direct", flat(10_000)),
    line("", "Goal", "Hardware", "Renew", "", flat(10_000)),
    line("", "Status", "Software", "New", "Direct", pre(9_000, 1_000)),
    line("", "Status", "Software", "Renew", "Direct", pre(10_000, 2_000)),
    line("", "Status", "Hardware", "Renew", "", pre(9_000, 0)),
    person("예시A", "Goal", flat(30_000), "People"),
    person("예시A", "Status", pre(26_000, 4_000)),
    person("예시B", "Goal", flat(20_000)),
    person("예시B", "Status", pre(18_000, 5_000)),
    person("예시C", "Goal", flat(30_000)),
    person("예시C", "Status", pre(28_000, 3_000)),
  ]
}

export function dshFixture(): DshOutput {
  return parseDsh(dshGrid(), FY)
}

function deal(overrides: Partial<BranchRevDeal> & Pick<BranchRevDeal, "id" | "customer_name">): BranchRevDeal {
  return {
    sheet_row: 10,
    branch_contact: null,
    team: "BD",
    manager: null,
    deal_type: null,
    status: null,
    first_payment: null,
    product_version: null,
    region: null,
    importance: null,
    note: null,
    contract_target: null,
    monthly_payments: {},
    monthly_red: {},
    monthly_confirmed: {},
    monthly_high_conf: {},
    raw: {},
    synced_at: "2026-12-01T00:00:00.000Z",
    ...overrides,
  }
}

/** 12/1 고정 스냅샷의 REV 딜. 예시D 는 DSH 멤버가 아니다(미배정). d5 는 환불(음수) 달. */
export function snapshotDeals(): BranchRevDeal[] {
  return [
    deal({
      id: "d1", sheet_row: 11, customer_name: "예시학원1", manager: "예시A", team: "BD", deal_type: "Direct", status: "New",
      first_payment: "2026-06-03", product_version: "ClassIn 연간 구독",
      monthly_payments: { "2026-12": 20_000, "2027-01": 20_000 }, monthly_confirmed: { "2026-12": 0 },
    }),
    deal({
      id: "d2", sheet_row: 12, customer_name: "예시학원2", manager: "예시B", team: "BD", deal_type: "Direct", status: "Renew",
      first_payment: "2025-05-10", product_version: "Learning Space",
      monthly_payments: { "2026-12": 15_000 }, monthly_confirmed: { "2026-12": 15_000 }, monthly_red: { "2026-12": true },
    }),
    deal({
      id: "d3", sheet_row: 13, customer_name: "예시학원3", manager: "예시C", team: "MKT", deal_type: "Channel", status: "Renew",
      first_payment: "2024-09-01", product_version: "전자칠판 75 IFP",
      monthly_payments: { "2026-12": 8_000 }, monthly_confirmed: { "2026-12": 8_000 }, monthly_red: { "2026-12": true },
    }),
    deal({
      id: "d4", sheet_row: 14, customer_name: "예시학원4", manager: "예시D", team: "BD", deal_type: "Direct", status: "New",
      first_payment: "2026-11-20", product_version: "ClassIn 플랜",
      monthly_payments: { "2026-12": 6_000 }, monthly_confirmed: { "2026-12": 6_000 }, monthly_red: { "2026-12": true },
    }),
    deal({
      id: "d5", sheet_row: 15, customer_name: "예시학원5", manager: "예시A", team: "BD", deal_type: "Direct", status: "Renew",
      first_payment: "2025-01-15", product_version: "ClassIn",
      monthly_payments: { "2026-12": -3_000 }, monthly_confirmed: { "2026-12": -3_000 }, monthly_red: { "2026-12": true },
    }),
  ]
}

function entry(overrides: Partial<LedgerOverlayEntry> & Pick<LedgerOverlayEntry, "id">): LedgerOverlayEntry {
  return {
    draftId: `draft-${overrides.id}`,
    entryType: "manual-new",
    entryStatus: "active",
    sourceSheetRow: null,
    sourceSnapshot: {},
    customer: "",
    manager: "",
    team: "BD",
    month: "2026-12",
    amount: 0,
    note: "",
    appliedAt: "2026-12-10T01:00:00.000Z",
    metadata: { confidence: "confirmed", week: "month" },
    ...overrides,
  }
}

/** 12월에 적용된 장부 항목 — 정정 1(예시학원1 20,000 → 22,000 확정) · 새 행 확정 1 · 새 행 예정 1(실적 아님). */
export function decemberEntries(): LedgerOverlayEntry[] {
  return [
    entry({
      id: "e-edit", entryType: "manual-edit", sourceDealId: "d1", sourceSheetRow: 11,
      customer: "예시학원1", manager: "예시A", team: "BD", amount: 22_000,
    }),
    entry({ id: "e-new", customer: "예시학원6", manager: "예시C", team: "MKT", amount: 9_000 }),
    entry({
      id: "e-forecast", customer: "예시학원7", manager: "예시B", team: "BD", amount: 50_000,
      metadata: { confidence: "expected", week: "month" },
    }),
  ]
}

/** D1 딜 — 스냅샷 + 장부 항목(lib/branch/ledger-overlay mergeLedgerIntoDeals, 서버와 같은 함수). */
export function mergedDeals(extraEntries: LedgerOverlayEntry[] = [], today = "2026-12-20"): BranchRevDeal[] {
  return mergeLedgerIntoDeals(snapshotDeals(), { ledgerEntries: [...decemberEntries(), ...extraEntries], todayYm: today }).deals
}

export { entry as ledgerEntry }
