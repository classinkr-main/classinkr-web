import { describe, expect, it } from "vitest"
import { countFirstPaymentAccountsByMonth, type FirstPaymentAccountRow } from "@/lib/crm/revenue-performance"

// 전환 계정 수 = 계정별 "최초 결제월"에만 1회(Compass lib/adReport.ts의 paidAccounts
// 규칙 이식: "전환은 그 계정이 처음 결제한 달 한 번, 매달 내는 구독을 달마다 세면 중복").
// 순수 함수만 검증한다 — getCrmRevenuePerformance의 실제 호출부는 회계연도 전체 이력을
// (표시 구간보다 넓게) 이 함수에 넘겨야 아래 "창 경계" 케이스가 실제로 성립한다.

function row(accountKey: string, month: string, amount: number): FirstPaymentAccountRow {
  return { accountKey, month, amount }
}

describe("countFirstPaymentAccountsByMonth", () => {
  it("갱신 3개월 계정은 최초 달에만 1회 센다", () => {
    const rows = [
      row("academy-a", "2026-04", 1000),
      row("academy-a", "2026-05", 1000), // 갱신 — 중복 계상 금지
      row("academy-a", "2026-06", 1000), // 갱신 — 중복 계상 금지
    ]
    const result = countFirstPaymentAccountsByMonth(rows)
    expect(result.get("2026-04")).toBe(1)
    expect(result.get("2026-05")).toBeUndefined()
    expect(result.get("2026-06")).toBeUndefined()
  })

  it("두 계정이 각자 다른 달에 최초 결제하면 각 달에 따로 집계된다", () => {
    const rows = [row("academy-a", "2026-04", 1000), row("academy-b", "2026-05", 2000)]
    const result = countFirstPaymentAccountsByMonth(rows)
    expect(result.get("2026-04")).toBe(1)
    expect(result.get("2026-05")).toBe(1)
  })

  it("amount 0/음수 행은 결제로 치지 않는다 — 그 뒤 첫 양수 달이 최초가 된다", () => {
    const rows = [
      row("academy-a", "2026-04", 0), // 무시
      row("academy-a", "2026-05", -500), // 무시(음수)
      row("academy-a", "2026-06", 1000), // 실제 최초 결제
    ]
    const result = countFirstPaymentAccountsByMonth(rows)
    expect(result.get("2026-04")).toBeUndefined()
    expect(result.get("2026-05")).toBeUndefined()
    expect(result.get("2026-06")).toBe(1)
  })

  it("0/음수만 있는 계정은 어느 달에도 집계되지 않는다", () => {
    const rows = [row("academy-a", "2026-04", 0), row("academy-a", "2026-05", -100)]
    const result = countFirstPaymentAccountsByMonth(rows)
    expect(result.size).toBe(0)
  })

  it("창 경계 — 창 밖(조회 구간 이전)에 결제 이력이 있으면 창 안 어느 달에도 신규로 잡히지 않는다", () => {
    // "2026-01"은 화면 표시 구간(예: 2026-04~2026-09) 이전의 과거 결제라고 가정한다.
    // 호출부(getCrmRevenuePerformance)는 표시할 monthKeys만 이 Map에서 읽으므로,
    // 이 계정은 표시 구간 안 어느 달에도 집계되지 않아야 한다.
    const rows = [
      row("academy-a", "2026-01", 500), // 창 밖 최초 결제
      row("academy-a", "2026-05", 500), // 창 안에서는 갱신일 뿐, 신규가 아니다
    ]
    const result = countFirstPaymentAccountsByMonth(rows)
    const displayMonths = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    for (const month of displayMonths) {
      expect(result.get(month) ?? 0).toBe(0)
    }
    // 함수 자체는 월을 자르지 않는다 — 실제 최초 달(창 밖)에는 정상적으로 잡혀 있다.
    expect(result.get("2026-01")).toBe(1)
  })

  it("같은 계정·같은 달에 딜이 여러 개(행 여러 개)여도 최초 판정은 한 번만 반영된다", () => {
    // 한 딜을 MK/BD가 나눠 갖는 경우(Compass 원장의 "입시탑과학 HW" 같은 케이스) 대비.
    const rows = [
      row("academy-a", "2026-04", 300), // MK 몫
      row("academy-a", "2026-04", 700), // BD 몫 — 같은 계정, 같은 달, 다른 딜
    ]
    const result = countFirstPaymentAccountsByMonth(rows)
    expect(result.get("2026-04")).toBe(1)
  })

  it("빈 accountKey 행은 무시한다", () => {
    const result = countFirstPaymentAccountsByMonth([row("", "2026-04", 1000)])
    expect(result.size).toBe(0)
  })
})
