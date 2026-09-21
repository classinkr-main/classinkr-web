import { beforeEach, describe, expect, it, vi } from "vitest"

interface Row {
  target_type: string
  target_id: string
  tag: string
  created_at: string
}

// 인메모리 테이블 — select().order().range() 읽기와 update()/delete().eq()... 쓰기를 둘 다
// 지원해야 해서(leads.ts류 range 페이지네이션 + 실제 행 단위 변형) 범용 필터 빌더를 둔다.
let rows: Row[] = []

function makeFilterBuilder<T>(resolve: (matches: Record<string, string>) => T) {
  const matches: Record<string, string> = {}
  const builder: PromiseLike<T> & { eq: (field: string, value: string) => typeof builder } = {
    eq(field: string, value: string) {
      matches[field] = value
      return builder
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(resolve(matches)).then(onFulfilled, onRejected)
    },
  }
  return builder
}

const rangeSpy = vi.fn(async (start: number, end: number) => ({
  data: rows.slice(start, end + 1),
  error: null as { message: string } | null,
}))

const from = vi.fn(() => ({
  select: vi.fn(() => ({
    order: vi.fn(() => ({
      range: rangeSpy,
    })),
  })),
  update: vi.fn((patch: { tag: string }) =>
    makeFilterBuilder((matches) => {
      const row = rows.find(
        (r) => r.target_type === matches.target_type && r.target_id === matches.target_id && r.tag === matches.tag
      )
      if (row) row.tag = patch.tag
      return { error: null as { message: string } | null }
    })
  ),
  delete: vi.fn(() =>
    makeFilterBuilder((matches) => {
      rows = rows.filter(
        (r) => !(r.target_type === matches.target_type && r.target_id === matches.target_id && r.tag === matches.tag)
      )
      return { error: null as { message: string } | null }
    })
  ),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { listCustomerTagStats, mergeCustomerTags, renameCustomerTag } from "@/lib/repositories/crm-customer-tags"

function row(target_type: string, target_id: string, tag: string, created_at = "2026-09-01T00:00:00Z"): Row {
  return { target_type, target_id, tag, created_at }
}

describe("listCustomerTagStats", () => {
  beforeEach(() => {
    rows = []
    from.mockClear()
    rangeSpy.mockClear()
  })

  it("대소문자·공백을 무시해 묶고 최다 표기를 표시명으로 쓴다", async () => {
    rows = [
      row("lead", "l1", "VIP", "2026-09-01T00:00:00Z"),
      row("lead", "l2", "vip", "2026-09-02T00:00:00Z"),
      row("neo_account", "n1", "VIP", "2026-09-03T00:00:00Z"),
    ]
    const stats = await listCustomerTagStats()
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({
      tag: "VIP",
      count: 3,
      byTargetType: { lead: 2, neo_account: 1, customer: 0 },
      lastUsedAt: "2026-09-03T00:00:00Z",
    })
  })

  it("건수 내림차순, 동률이면 가나다 순으로 정렬한다", async () => {
    rows = [
      row("lead", "l1", "나"),
      row("lead", "l2", "가"),
      row("lead", "l3", "다"),
      row("lead", "l4", "다"),
    ]
    const stats = await listCustomerTagStats()
    expect(stats.map((s) => s.tag)).toEqual(["다", "가", "나"])
  })

  it("target_type이 lead/neo_account/customer가 아니면 총 건수에는 잡히되 분해에서는 빠진다", async () => {
    rows = [row("unknown", "u1", "미분류")]
    const stats = await listCustomerTagStats()
    expect(stats[0]).toMatchObject({
      tag: "미분류",
      count: 1,
      byTargetType: { lead: 0, neo_account: 0, customer: 0 },
    })
  })

  it("빈 테이블이면 빈 배열을 돌려준다", async () => {
    rows = []
    expect(await listCustomerTagStats()).toEqual([])
  })

  it("한 페이지(1000행)를 넘으면 range를 여러 번 불러 전량을 모은다", async () => {
    rows = Array.from({ length: 1001 }, (_, i) => row("lead", `l${i}`, "대량태그"))
    const stats = await listCustomerTagStats()
    expect(stats).toEqual([
      { tag: "대량태그", count: 1001, byTargetType: { lead: 1001, neo_account: 0, customer: 0 }, lastUsedAt: "2026-09-01T00:00:00Z" },
    ])
    expect(rangeSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe("renameCustomerTag", () => {
  beforeEach(() => {
    rows = []
    from.mockClear()
  })

  it("대상에 이미 to가 없으면 행을 바꾸고 updated=1을 돌려준다", async () => {
    rows = [row("lead", "l1", "VIP")]
    const result = await renameCustomerTag("VIP", "우수고객")
    expect(result).toEqual({ updated: 1, removedDuplicates: 0 })
    expect(rows).toEqual([row("lead", "l1", "우수고객")])
  })

  it("대상에 이미 to가 있으면 from 행을 중복 삭제한다", async () => {
    rows = [row("lead", "l1", "VIP"), row("lead", "l1", "우수고객")]
    const result = await renameCustomerTag("VIP", "우수고객")
    expect(result).toEqual({ updated: 0, removedDuplicates: 1 })
    expect(rows).toEqual([row("lead", "l1", "우수고객")])
  })

  it("여러 대상에 걸쳐 일괄 적용한다", async () => {
    rows = [row("lead", "l1", "VIP"), row("neo_account", "n1", "VIP"), row("neo_account", "n1", "우수고객")]
    const result = await renameCustomerTag("VIP", "우수고객")
    expect(result).toEqual({ updated: 1, removedDuplicates: 1 })
  })

  it("dryRun=true면 건수만 계산하고 실제로 바꾸지 않는다", async () => {
    rows = [row("lead", "l1", "VIP")]
    const result = await renameCustomerTag("VIP", "우수고객", { dryRun: true })
    expect(result).toEqual({ updated: 1, removedDuplicates: 0 })
    expect(rows).toEqual([row("lead", "l1", "VIP")])
  })

  it("대소문자만 다른 이름으로의 변경 요청은(사실상 같은 태그) 아무것도 바꾸지 않는다", async () => {
    rows = [row("lead", "l1", "VIP")]
    const result = await renameCustomerTag("VIP", "vip")
    expect(result).toEqual({ updated: 0, removedDuplicates: 0 })
    expect(rows).toEqual([row("lead", "l1", "VIP")])
  })
})

describe("mergeCustomerTags", () => {
  beforeEach(() => {
    rows = []
    from.mockClear()
  })

  it("여러 소스 태그를 하나로 합치고, 대상당 하나만 남긴다", async () => {
    rows = [row("lead", "l1", "VIP"), row("lead", "l1", "재계약")]
    const result = await mergeCustomerTags(["VIP", "재계약"], "우수고객")
    expect(result).toEqual({ updated: 1, removedDuplicates: 1 })
    expect(rows).toEqual([row("lead", "l1", "우수고객")])
  })

  it("대상에 이미 병합 결과 태그가 있으면 소스 행 전부를 중복 삭제한다", async () => {
    rows = [row("lead", "l1", "VIP"), row("lead", "l1", "재계약"), row("lead", "l1", "우수고객")]
    const result = await mergeCustomerTags(["VIP", "재계약"], "우수고객")
    expect(result).toEqual({ updated: 0, removedDuplicates: 2 })
    expect(rows).toEqual([row("lead", "l1", "우수고객")])
  })

  it("영향받지 않는 다른 대상의 태그는 그대로 둔다", async () => {
    rows = [row("lead", "l1", "VIP"), row("lead", "l2", "하드웨어")]
    const result = await mergeCustomerTags(["VIP", "재계약"], "우수고객")
    expect(result).toEqual({ updated: 1, removedDuplicates: 0 })
    expect(rows).toEqual([row("lead", "l1", "우수고객"), row("lead", "l2", "하드웨어")])
  })
})
