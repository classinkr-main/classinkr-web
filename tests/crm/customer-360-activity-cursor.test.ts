// 고객 360 상세 이력 큐의 "이전 기록 더 보기" 자기 기록 커서(병합 고정, 2026-10-19).
// 10월 줄기(f989a812)는 activity.pagination.nextOffset 으로 /timeline 을 이었고, 09-mooni CT9(ca59d81b)는
// 리드 시절·연락 로그 원본을 합치면 nextOffset=null 로 둔다(병합 결과의 offset 은 의미가 없다). 둘을 합친 뒤에도
// 자기 기록 더 보기가 끊기지 않도록 창 안 자기 행 수를 다음 offset 으로 쓴다.
import { describe, expect, it } from "vitest"

import { ownActivityCursor } from "@/components/admin/crm/Customer360DetailActivity"
import type { CrmCustomerEventRecord, ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"

function row(id: string, targetType: CrmCustomerEventRecord["targetType"] = "neo_account"): CrmCustomerEventRecord {
  return { id, targetType } as unknown as CrmCustomerEventRecord
}

function result(
  rows: CrmCustomerEventRecord[],
  pagination: Partial<ListCrmCustomerEventsResult["pagination"]>
): ListCrmCustomerEventsResult {
  return {
    generatedAt: "2026-10-19T00:00:00.000Z",
    health: { ok: true, message: null },
    summary: { total: rows.length, returned: rows.length, recordings: 0, risks: 0, openNextActions: 0 },
    pagination: { limit: 50, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null, ...pagination },
    rows,
  }
}

describe("ownActivityCursor", () => {
  it("병합이 없으면 저장소의 nextOffset 을 그대로 쓴다", () => {
    expect(ownActivityCursor(result([row("a"), row("b")], { hasMore: true, nextOffset: 2 }), "neo_account")).toBe(2)
  })

  it("더 볼 것이 없으면 null", () => {
    expect(ownActivityCursor(result([row("a")], { hasMore: false, nextOffset: null }), "neo_account")).toBeNull()
  })

  it("CT9 병합(nextOffset=null·hasMore)이면 리드 시절·연락 로그 원본 행을 뺀 자기 행 수부터 잇는다", () => {
    const rows = [
      row("own-1"),
      row("lead-era", "lead"),
      row("lead-contact-log:log-1", "lead"),
      row("own-2"),
    ]
    expect(ownActivityCursor(result(rows, { hasMore: true, nextOffset: null }), "neo_account")).toBe(2)
  })

  it("리드 360 은 target_type lead 행도 자기 기록이고 연락 로그 원본만 뺀다", () => {
    const rows = [row("own-1", "lead"), row("lead-contact-log:log-1", "lead"), row("own-2", "lead")]
    expect(ownActivityCursor(result(rows, { hasMore: true, nextOffset: null }), "lead")).toBe(2)
  })

  // 병합 검토 후속(37c02226 지적 7) — 첫 창(50건)이 전부 리드 시절·연락 로그 원본이면 자기 행이 0건이다. 이때 null 로
  // 두면 그보다 오래된 NEO 계정 자기 기록이 상세 화면에서 영영 안 보인다(병합 전 10월 줄기는 nextOffset 으로 닿았다).
  it("창에 자기 행이 하나도 없어도 더 볼 것이 있으면 자기 기록을 처음(0)부터 잇는다", () => {
    const leadRows = [row("lead-contact-log:log-1", "lead")]
    expect(ownActivityCursor(result(leadRows, { hasMore: true, nextOffset: null }), "lead")).toBe(0)
    const neoRows = [row("lead-era-1", "lead"), row("lead-contact-log:log-2", "lead")]
    expect(ownActivityCursor(result(neoRows, { hasMore: true, nextOffset: null }), "neo_account")).toBe(0)
  })

  it("자기 행이 0건이어도 더 볼 것이 없으면 null(더 보기 없음)", () => {
    const rows = [row("lead-era-1", "lead")]
    expect(ownActivityCursor(result(rows, { hasMore: false, nextOffset: null }), "neo_account")).toBeNull()
  })
})
