import { describe, expect, it } from "vitest"
import { computeManualLedgerGap } from "@/lib/admin-crm-revenue-sheet"

// 품질 감사 2026-09-10 — #1(P0, 이중 진실): CRM 매출시트 화면(/admin/crm/deals/rev-sheet)은
// branch_rev_deals(구글 REV 시트 동기화 산물)만 본다 — 장부 콕핏/입력 레일에서 적용까지 마친
// 수기 입력·정정(branch_sales_ledger_entries, entry_status='active')은 절대 반영되지 않는다.
// 서버 병합(두 서로 다른 식별자 체계 매칭)은 오매칭·이중계상 위험이 커 이번 범위에서 하지 않고,
// 대신 이 순수 집계 함수가 "화면 밖에 반영 안 된 매출이 N건 있다"를 세어 배지로 알린다.
describe("computeManualLedgerGap — 반영되지 않은 장부 수기 입력 집계", () => {
  it("빈 배열이면 count/amount 0, latestAppliedAt null", () => {
    expect(computeManualLedgerGap([])).toEqual({ count: 0, amount: 0, latestAppliedAt: null })
  })

  it("건수·금액 합을 그대로 센다", () => {
    const result = computeManualLedgerGap([
      { amount: 100_000, applied_at: "2026-09-01T00:00:00Z" },
      { amount: 200_000, applied_at: "2026-09-05T00:00:00Z" },
    ])
    expect(result.count).toBe(2)
    expect(result.amount).toBe(300_000)
  })

  it("최근 적용 시각은 applied_at 중 최댓값 — 배열 순서와 무관하다", () => {
    const result = computeManualLedgerGap([
      { amount: 100_000, applied_at: "2026-09-05T00:00:00Z" },
      { amount: 200_000, applied_at: "2026-09-01T00:00:00Z" },
      { amount: 50_000, applied_at: "2026-09-08T12:00:00Z" },
    ])
    expect(result.latestAppliedAt).toBe("2026-09-08T12:00:00Z")
  })

  it("문자열 금액(DB numeric 컬럼)도 숫자로 정규화해 합산한다", () => {
    const result = computeManualLedgerGap([
      { amount: "150000" as unknown as number, applied_at: "2026-09-01T00:00:00Z" },
    ])
    expect(result.amount).toBe(150_000)
  })

  it("applied_at이 null인 행은 최근 적용 시각 계산에서 건너뛴다(카운트에는 포함)", () => {
    const result = computeManualLedgerGap([
      { amount: 100_000, applied_at: null },
      { amount: 200_000, applied_at: "2026-09-03T00:00:00Z" },
    ])
    expect(result.count).toBe(2)
    expect(result.amount).toBe(300_000)
    expect(result.latestAppliedAt).toBe("2026-09-03T00:00:00Z")
  })

  it("금액이 null/비정상 값이어도 0으로 취급해 합산이 깨지지 않는다", () => {
    const result = computeManualLedgerGap([
      { amount: null, applied_at: "2026-09-01T00:00:00Z" },
      { amount: 100_000, applied_at: "2026-09-02T00:00:00Z" },
    ])
    expect(result.amount).toBe(100_000)
  })
})
