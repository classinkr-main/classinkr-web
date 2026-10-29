import { describe, expect, it } from "vitest"
import { computeManualLedgerGap, isSheetWriteAbsorbedByMirror } from "@/lib/admin-crm-revenue-sheet"

// 품질 감사 2026-09-10 — #1(P0, 이중 진실): CRM 매출시트 화면(/admin/crm/deals/rev-sheet)은
// branch_rev_deals(구글 REV 시트 동기화 산물)만 본다 — 장부 콕핏/입력 레일에서 적용까지 마친
// 수기 입력·정정(branch_sales_ledger_entries, entry_status='active')은 절대 반영되지 않는다.
// 서버 병합(두 서로 다른 식별자 체계 매칭)은 오매칭·이중계상 위험이 커 이번 범위에서 하지 않고,
// 대신 이 순수 집계 함수가 "화면 밖에 반영 안 된 매출이 N건 있다"를 세어 배지로 알린다.
describe("computeManualLedgerGap — 반영되지 않은 장부 수기 입력 집계", () => {
  it("빈 배열이면 count/amount 0, latestAppliedAt null", () => {
    expect(computeManualLedgerGap([])).toEqual({
      count: 0,
      amount: 0,
      latestAppliedAt: null,
      newCount: 0,
      newAmount: 0,
      editCount: 0,
    })
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

  // 라운드 5 S-7 — 정정(manual-edit)은 시트 행의 그 달 값을 대체하는 값이라 "빠진 매출"로 더하지 않는다.
  it("신규(manual-new)와 정정(manual-edit)을 나눠 세고, 신규 금액만 newAmount에 더한다", () => {
    const result = computeManualLedgerGap([
      { amount: 100_000, applied_at: "2026-09-01T00:00:00Z", entry_type: "manual-new" },
      { amount: 300_000, applied_at: "2026-09-02T00:00:00Z", entry_type: "manual-edit" },
      { amount: 50_000, applied_at: "2026-09-03T00:00:00Z", entry_type: "manual-new" },
    ])
    expect(result.newCount).toBe(2)
    expect(result.newAmount).toBe(150_000)
    expect(result.editCount).toBe(1)
    expect(result.count).toBe(3)
  })

  it("entry_type이 없는 입력은 신규로 센다 — 정정으로 세면 빠진 매출을 숨기게 된다", () => {
    const result = computeManualLedgerGap([{ amount: 70_000, applied_at: null }])
    expect(result.newCount).toBe(1)
    expect(result.newAmount).toBe(70_000)
    expect(result.editCount).toBe(0)
  })
})

// REV 시트 쓰기(ADR-011) — 반영 때 '2. REV' 에도 쓴 정정은 다음 REV 동기화가 미러(branch_rev_deals)로 들인다.
// 그 뒤로는 이 화면이 이미 그 값을 갖고 있으므로 "미반영"에서 뺀다(인자를 생략하면 기존과 같다).
describe("computeManualLedgerGap — 미러에 들어온 시트 쓰기 정정은 미반영에서 뺀다", () => {
  const rows = [
    { amount: 100_000, applied_at: "2026-10-20T00:00:00Z", entry_type: "manual-new", draft_id: "d-new" },
    { amount: 300_000, applied_at: "2026-10-22T00:00:00Z", entry_type: "manual-edit", draft_id: "d-absorbed" },
    { amount: 500_000, applied_at: "2026-10-21T00:00:00Z", entry_type: "manual-edit", draft_id: "d-pending" },
    { amount: 700_000, applied_at: "2026-10-19T00:00:00Z", entry_type: "manual-edit", draft_id: null },
  ]

  it("흡수된 초안 id 의 항목은 건수·금액·최근 적용 시각에서 모두 빠진다", () => {
    const result = computeManualLedgerGap(rows, new Set(["d-absorbed"]))
    expect(result).toEqual({
      count: 3,
      amount: 1_300_000,
      newCount: 1,
      newAmount: 100_000,
      editCount: 2,
      latestAppliedAt: "2026-10-21T00:00:00Z",
    })
  })

  it("인자를 생략하거나 빈 집합이면 기존과 같다", () => {
    const before = computeManualLedgerGap(rows)
    expect(before.count).toBe(4)
    expect(before.editCount).toBe(3)
    expect(before.latestAppliedAt).toBe("2026-10-22T00:00:00Z")
    expect(computeManualLedgerGap(rows, new Set())).toEqual(before)
  })

  it("draft_id 가 없는 항목은 흡수 집합과 무관하게 남는다", () => {
    const result = computeManualLedgerGap(rows, new Set(["d-absorbed", "d-pending", "d-new"]))
    expect(result.count).toBe(1)
    expect(result.amount).toBe(700_000)
  })
})

describe("isSheetWriteAbsorbedByMirror — written 이고 그 뒤에 시작한 REV 동기화가 성공했을 때만", () => {
  const sync = "2026-10-23T08:00:00.000Z"

  it("written + 동기화 시작 전에 씀 → 흡수", () => {
    expect(isSheetWriteAbsorbedByMirror({ status: "written", writtenAt: "2026-10-23T07:59:59.000Z" }, sync)).toBe(true)
  })

  it("동기화 시작과 같은 시각·뒤에 씀 → 아직 미러에 없다", () => {
    expect(isSheetWriteAbsorbedByMirror({ status: "written", writtenAt: sync }, sync)).toBe(false)
    expect(isSheetWriteAbsorbedByMirror({ status: "written", writtenAt: "2026-10-23T08:00:01.000Z" }, sync)).toBe(false)
  })

  it.each(["sending", "refused", "failed", "unknown"] as const)("status %s 는 시트에 확실히 쓴 것이 아니다 → 흡수 아님", (status) => {
    expect(isSheetWriteAbsorbedByMirror({ status, writtenAt: "2026-10-23T07:00:00.000Z" }, sync)).toBe(false)
  })

  it("동기화 기록 없음·written_at 없음·날짜 해석 불가 → 흡수 아님(기존 동작 쪽)", () => {
    expect(isSheetWriteAbsorbedByMirror({ status: "written", writtenAt: "2026-10-23T07:00:00.000Z" }, null)).toBe(false)
    expect(isSheetWriteAbsorbedByMirror({ status: "written", writtenAt: null }, sync)).toBe(false)
    expect(isSheetWriteAbsorbedByMirror({ status: "written", writtenAt: "garbage" }, sync)).toBe(false)
    expect(isSheetWriteAbsorbedByMirror({ status: "written", writtenAt: "2026-10-23T07:00:00.000Z" }, "garbage")).toBe(false)
  })
})
