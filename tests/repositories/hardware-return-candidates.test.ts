// 회수 등록 원 출고 후보(갭 문서 §7-3) — 거르기·정렬·남은 수량은 순수 함수로 확인한다.
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }))

import {
  filterReturnCandidateRows,
  toReturnCandidates,
  type ReturnCandidateRow,
} from "@/lib/repositories/hardware-inventory"

function row(overrides: Partial<ReturnCandidateRow>): ReturnCandidateRow {
  return {
    id: "out-1",
    product_name: "T1",
    quantity: 2,
    occurred_at: "2026-10-01",
    created_at: "2026-10-01T00:00:00Z",
    to_location: "대치학원",
    owner: "김매니저",
    status: "설치 완료",
    lot_no: "C1",
    source: "admin_manual",
    reference_no: null,
    memo: null,
    ...overrides,
  }
}

describe("filterReturnCandidateRows", () => {
  const rows = [
    row({ id: "a", occurred_at: "2026-09-01" }),
    row({ id: "b", occurred_at: "2026-10-20", to_location: "한빛 학원", customer_id: "c-2" }),
    row({ id: "planned", status: "배송 예정" }),
    row({ id: "office", to_location: "사무실" }),
    row({ id: "sheet", source: "sheet_import", lot_no: null, reference_no: "H8", to_location: "강남캠퍼스", memo: "세일즈" }),
  ]

  it("배송 예정·사무실 이동을 빼고 최근 출고부터", () => {
    expect(filterReturnCandidateRows(rows, {}).map((candidate) => candidate.id)).toEqual(["b", "sheet", "a"])
  })

  it("CRM 고객은 고객 id, id 가 없는 행은 이름(공백 무시)으로 맞춘다", () => {
    expect(filterReturnCandidateRows(rows, { customerId: "c-2", customerName: "무관" }).map((candidate) => candidate.id)).toEqual(["b"])
    expect(filterReturnCandidateRows(rows, { customerId: "c-9", customerName: "대치 학원" }).map((candidate) => candidate.id)).toEqual(["a"])
  })

  it("검색어는 품목·고객사·담당·물류번호(시트 행은 참조번호)에서 찾는다", () => {
    expect(filterReturnCandidateRows(rows, { q: "h8" }).map((candidate) => candidate.id)).toEqual(["sheet"])
    expect(filterReturnCandidateRows(rows, { q: "한빛" }).map((candidate) => candidate.id)).toEqual(["b"])
  })
})

describe("toReturnCandidates", () => {
  it("남은 수량이 있는 것만, 물류번호·유형을 채워 limit 개", () => {
    const rows = [row({ id: "done", quantity: 1 }), row({ id: "part", quantity: 3, memo: "샘플 · 데모" }), row({ id: "full" })]
    const returned = new Map([["done", 1], ["part", 1]])

    expect(toReturnCandidates(rows, returned, 1)).toEqual([
      expect.objectContaining({ id: "part", returned: 1, returnable: 2, lotNo: "C1", outboundType: "sample" }),
    ])
  })
})
