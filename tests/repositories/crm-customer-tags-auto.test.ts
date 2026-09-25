import { beforeEach, describe, expect, it, vi } from "vitest"

// 세그먼트 자동 태그 떼기(C안 ②, 2026-09-25) — created_by 마커("auto:seg:<id>") 행만 읽고 지운다.
//  - 수동 태그(같은 라벨·다른 created_by)는 절대 지우지 않는다.
//  - 비회원이거나 라벨 묶음이 바뀐(옛 라벨) 마커 행이 후보다.
//  - 후보가 상한을 넘으면 떼기를 전부 막는다(blocked). 계획(planSegmentAutoTagRemovals)은 읽기만, 지우기는 apply.
//  - 상한 분모는 계획 시점(붙이기 전)의 마커 행 수 — 계획 뒤에 붙은 행은 분모에 들어가지 않는다.
//  - 드라이런 붙이기 미리보기(previewCustomerTagForTargets)는 읽기만 한다.
// 사람 태그가 마커 행에 흡수되지 않는다(교차 리뷰 [8]·[33] 회귀):
//  - (target_type, target_id, tag) UNIQUE 라 사람이 같은 라벨을 붙이면 새 행이 생기지 않는다. 사람 경로(단건·일괄 추가,
//    이름 변경·병합)는 부딪힌 마커 행의 created_by 를 사람으로 바꿔(소유 이전) 자동 떼기 대상에서 뺀다.
//  - 자동 경로(actor = 마커)는 소유를 옮기지 않는다.
//  - 꺼지거나 보관된 세그먼트의 라벨(from)을 이름 변경·병합해 마커 행이 `to` 로 남으면 이름과 함께 소유도 실행한 사람으로
//    넘긴다 — 그 세그먼트를 다시 켜 떼기가 돌거나 detach 해도 사람이 정리한 라벨이 남는다([17] 후속 교차 리뷰 P3).

interface TagRow {
  id: string
  target_type: string
  target_id: string
  tag: string
  created_at: string
  created_by: string | null
}

type Filter = (row: TagRow) => boolean

let table: TagRow[] = []
let deleteCalls: Array<{ ids: string[]; createdBy: string | null }> = []
let updateCalls: Array<{ patch: Partial<TagRow>; likeCreatedBy: string | null }> = []
let writes = 0
let nextId = 1000

function row(id: string, target_type: string, target_id: string, tag: string, created_by: string | null): TagRow {
  return { id, target_type, target_id, tag, created_at: "2026-09-01T00:00:00Z", created_by }
}

function likeMatches(value: string | null, pattern: string): boolean {
  // 테스트에서 쓰는 모양은 "접두어%" 뿐이다.
  if (value == null) return false
  return pattern.endsWith("%") ? value.startsWith(pattern.slice(0, -1)) : value === pattern
}

/** eq·in·like 필터를 모으는 공용 빌더. */
function filterChain<T extends object>(target: T, filters: Filter[], onLike?: (pattern: string) => void) {
  return Object.assign(target, {
    eq(field: keyof TagRow, value: string | null) {
      filters.push((candidate) => candidate[field] === value)
      return target
    },
    in(field: keyof TagRow, values: string[]) {
      filters.push((candidate) => values.includes(candidate[field] as string))
      return target
    },
    like(field: keyof TagRow, pattern: string) {
      onLike?.(pattern)
      filters.push((candidate) => likeMatches(candidate[field] as string | null, pattern))
      return target
    },
  })
}

function selectBuilder(options?: { count?: string }) {
  const filters: Filter[] = []
  const matched = () => table.filter((candidate) => filters.every((filter) => filter(candidate)))
  const builder: Record<string, unknown> = {
    order() {
      return builder
    },
    async range(from: number, to: number) {
      const rows = matched()
      return {
        data: rows.slice(from, to + 1).map((candidate) => ({ ...candidate })),
        error: null,
        count: options?.count === "exact" ? rows.length : null,
      }
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: matched().map((candidate) => ({ ...candidate })), error: null }).then(resolve, reject)
    },
  }
  return filterChain(builder, filters)
}

function updateBuilder(patch: Partial<TagRow>) {
  writes += 1
  const filters: Filter[] = []
  let likeCreatedBy: string | null = null
  const run = () => {
    updateCalls.push({ patch, likeCreatedBy })
    const hit = table.filter((candidate) => filters.every((filter) => filter(candidate)))
    for (const candidate of hit) Object.assign(candidate, patch)
    return hit
  }
  const builder: Record<string, unknown> = {
    async select() {
      return { data: run().map((candidate) => ({ ...candidate })), error: null }
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve().then(() => {
        run()
        return { error: null }
      }).then(resolve, reject)
    },
  }
  return filterChain(builder, filters, (pattern) => {
    likeCreatedBy = pattern
  })
}

function deleteBuilder() {
  writes += 1
  const filters: Filter[] = []
  let ids: string[] = []
  let createdBy: string | null = null
  const run = () => {
    deleteCalls.push({ ids, createdBy })
    const removed = table.filter((candidate) => filters.every((filter) => filter(candidate)))
    table = table.filter((candidate) => !removed.includes(candidate))
    return removed
  }
  const builder: Record<string, unknown> = {
    async select() {
      return { data: run().map(({ id }) => ({ id })), error: null }
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve().then(() => {
        run()
        return { error: null }
      }).then(resolve, reject)
    },
  }
  const chain = filterChain(builder, filters)
  const baseIn = chain.in
  const baseEq = chain.eq
  chain.in = (field: keyof TagRow, values: string[]) => {
    if (field === "id") ids = values
    return baseIn(field, values)
  }
  chain.eq = (field: keyof TagRow, value: string | null) => {
    if (field === "created_by") createdBy = value
    return baseEq(field, value)
  }
  return chain
}

/** ON CONFLICT (target_type, target_id, tag) DO NOTHING — 들어간 행만 돌려준다. */
function upsertBuilder(input: Array<Omit<TagRow, "id" | "created_at">> | Omit<TagRow, "id" | "created_at">) {
  writes += 1
  const rows = Array.isArray(input) ? input : [input]
  const run = () => {
    const inserted: TagRow[] = []
    for (const candidate of rows) {
      const exists = table.some(
        (existing) =>
          existing.target_type === candidate.target_type &&
          existing.target_id === candidate.target_id &&
          existing.tag === candidate.tag
      )
      if (exists) continue
      nextId += 1
      const created = { ...candidate, id: `n${nextId}`, created_at: "2026-09-25T00:00:00Z" }
      table.push(created)
      inserted.push(created)
    }
    return inserted
  }
  return {
    async select() {
      return { data: run().map(({ target_type, target_id }) => ({ target_type, target_id })), error: null }
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve().then(() => {
        run()
        return { error: null }
      }).then(resolve, reject)
    },
  }
}

const from = vi.fn(() => ({
  select: (_columns: string, options?: { count?: string }) => selectBuilder(options),
  upsert: (input: Parameters<typeof upsertBuilder>[0]) => upsertBuilder(input),
  update: (patch: Partial<TagRow>) => updateBuilder(patch),
  delete: () => deleteBuilder(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

async function loadRepo() {
  vi.resetModules()
  return import("@/lib/repositories/crm-customer-tags")
}

const MARKER = "auto:seg:seg-1"
const keep = (...keys: string[]) => new Set(keys)
const noLimit = () => Number.MAX_SAFE_INTEGER
const labelsOf = (targetType: string, targetId: string) =>
  table.filter((candidate) => candidate.target_type === targetType && candidate.target_id === targetId).map((candidate) => candidate.tag)

beforeEach(() => {
  table = []
  deleteCalls = []
  updateCalls = []
  writes = 0
  nextId = 1000
  from.mockClear()
})

describe("planSegmentAutoTagRemovals", () => {
  it("조건에서 빠진 대상의 마커 행만 떼고, 같은 라벨의 수동 태그는 그대로 둔다", async () => {
    table = [
      row("r1", "lead", "a", "만료임박", MARKER),
      row("r2", "lead", "b", "만료임박", MARKER),
      row("r3", "lead", "b", "만료임박 ", "김담당"),
      row("r4", "neo_account", "N1", "만료임박", "김담당"),
      row("r5", "lead", "c", "만료임박", "auto:seg:other"),
    ]
    const { planSegmentAutoTagRemovals } = await loadRepo()
    const plan = await planSegmentAutoTagRemovals({
      marker: MARKER,
      label: "만료임박",
      keepStorageKeys: keep("lead:a"),
      limitFor: noLimit,
    })
    expect(plan).toMatchObject({ markerRows: 2, candidates: 1, blocked: false })
    // 계획은 읽기만 — 지우기는 apply 에서.
    expect(writes).toBe(0)
    expect(await plan.apply()).toEqual({ removed: 1, failed: 0 })
    expect(table.map((candidate) => candidate.id).sort()).toEqual(["r1", "r3", "r4", "r5"])
    // 삭제 요청도 created_by 마커를 한 번 더 건다.
    expect(deleteCalls).toEqual([{ ids: ["r2"], createdBy: MARKER }])
    // 한 번만 지운다.
    expect(await plan.apply()).toEqual({ removed: 0, failed: 0 })
    expect(deleteCalls).toHaveLength(1)
  })

  it("라벨을 바꾼 뒤의 옛 라벨 마커 행은 회원이어도 뗀다(대소문자·공백은 같은 묶음)", async () => {
    table = [
      row("r1", "lead", "a", "옛라벨", MARKER),
      row("r2", "lead", "a", "새 라벨", MARKER),
      row("r3", "lead", "b", "새  라벨", MARKER),
    ]
    const { planSegmentAutoTagRemovals } = await loadRepo()
    const plan = await planSegmentAutoTagRemovals({
      marker: MARKER,
      label: "새 라벨",
      keepStorageKeys: keep("lead:a", "lead:b"),
      limitFor: noLimit,
    })
    expect((await plan.apply()).removed).toBe(1)
    expect(table.map((candidate) => candidate.id).sort()).toEqual(["r2", "r3"])
  })

  it("후보가 상한을 넘으면 떼기를 전부 막는다(blocked) — apply 도 쓰기 0", async () => {
    table = Array.from({ length: 10 }, (_, index) => row(`r${index}`, "lead", `t${index}`, "L", MARKER))
    const { planSegmentAutoTagRemovals } = await loadRepo()
    const limitFor = vi.fn(() => 3)
    const plan = await planSegmentAutoTagRemovals({ marker: MARKER, label: "L", keepStorageKeys: keep(), limitFor })
    expect(limitFor).toHaveBeenCalledWith(10)
    expect(plan).toMatchObject({ markerRows: 10, candidates: 10, blocked: true })
    expect(await plan.apply()).toEqual({ removed: 0, failed: 0 })
    expect(writes).toBe(0)
    expect(table).toHaveLength(10)
  })

  it("상한 분모는 계획 시점의 마커 행 수 — 계획 뒤에 붙은 행은 분모·후보 어디에도 들어가지 않는다", async () => {
    // 어제 붙인 60행(t0..t59) → 오늘 회원은 완전히 다른 60명(n0..n59).
    table = Array.from({ length: 60 }, (_, index) => row(`old${index}`, "lead", `t${index}`, "L", MARKER))
    const members = Array.from({ length: 60 }, (_, index) => `lead:n${index}`)
    const { planSegmentAutoTagRemovals } = await loadRepo()
    const limitFor = vi.fn((count: number) => Math.max(20, Math.ceil(count * 0.5)))
    const plan = await planSegmentAutoTagRemovals({ marker: MARKER, label: "L", keepStorageKeys: keep(...members), limitFor })
    // 계획 뒤 붙이기가 60행을 더 넣어도(분모가 120 이었다면 상한 60 으로 통과했을 것) 판정은 그대로 막힘.
    table.push(...members.map((key, index) => row(`new${index}`, "lead", key.slice("lead:".length), "L", MARKER)))
    expect(limitFor).toHaveBeenCalledWith(60)
    expect(plan).toMatchObject({ markerRows: 60, candidates: 60, blocked: true })
    expect(await plan.apply()).toEqual({ removed: 0, failed: 0 })
    expect(table).toHaveLength(120)
  })
})

describe("detachSegmentAutoTags · previewCustomerTagForTargets", () => {
  it("세그먼트가 붙인 자동 태그를 전부 떼고 수동 태그는 남긴다", async () => {
    table = [
      row("r1", "lead", "a", "L", MARKER),
      row("r2", "neo_account", "N1", "L", MARKER),
      row("r3", "lead", "a", "L2", "김담당"),
    ]
    const { detachSegmentAutoTags } = await loadRepo()
    expect(await detachSegmentAutoTags(MARKER, { dryRun: true })).toEqual({ candidates: 2, removed: 0, failed: 0 })
    expect(writes).toBe(0)
    expect(await detachSegmentAutoTags(MARKER)).toEqual({ candidates: 2, removed: 2, failed: 0 })
    expect(table.map((candidate) => candidate.id)).toEqual(["r3"])
  })

  it("붙이기 미리보기 — 같은 묶음 태그가 이미 있는 대상은 skipped, 쓰기 0", async () => {
    table = [row("r1", "lead", "a", "vip", "김담당")]
    const { previewCustomerTagForTargets } = await loadRepo()
    const result = await previewCustomerTagForTargets(
      [
        { key: "lead:a", targetType: "lead", targetId: "a" },
        { key: "lead:b", targetType: "lead", targetId: "b" },
        { key: "lead:b", targetType: "lead", targetId: "b" },
      ],
      "VIP"
    )
    expect(result).toEqual({ wouldApply: 1, skipped: 1 })
    expect(writes).toBe(0)
  })
})

describe("수동 태그는 절대 지우지 않는다 — 사람 라벨이 자동 태그 마커 행에 흡수되지 않는다([8]·[33])", () => {
  it("병합 to = 자동 라벨: 대상의 to 가 마커 행뿐이면 그 행을 사람 소유로 넘기고 사람 행을 정리 → 떼기·detach 뒤에도 라벨이 남는다", async () => {
    table = [
      // X: 사람 행 + 같은 묶음의 자동 마커 행
      row("h1", "lead", "x", "만료 임박 고객", "김매니저"),
      row("m1", "lead", "x", "만료임박", MARKER),
      // Y: 사람 행만 — 이름만 바뀐다(사람 소유 그대로)
      row("h2", "lead", "y", "만료 임박 고객", "박담당"),
      // Z: 자동 마커 행만 — 병합과 무관, 그대로 자동 소유
      row("m2", "lead", "z", "만료임박", MARKER),
    ]
    const { mergeCustomerTags, detachSegmentAutoTags, planSegmentAutoTagRemovals } = await loadRepo()

    const preview = await mergeCustomerTags(["만료 임박 고객"], "만료임박", { dryRun: true, actor: "관리자" })
    expect(preview).toEqual({ updated: 1, removedDuplicates: 1, claimedAutoTags: 1 })
    expect(writes).toBe(0)

    const result = await mergeCustomerTags(["만료 임박 고객"], "만료임박", { actor: "관리자" })
    expect(result).toEqual({ updated: 1, removedDuplicates: 1, claimedAutoTags: 1 })
    // 마커 행은 원래 사람 행의 작성자 소유가 됐다.
    expect(table.find((candidate) => candidate.id === "m1")?.created_by).toBe("김매니저")
    expect(labelsOf("lead", "x")).toEqual(["만료임박"])
    expect(table.find((candidate) => candidate.id === "h2")).toMatchObject({ tag: "만료임박", created_by: "박담당" })

    // X 가 조건에서 빠져도(keep 비움) 자동 떼기 후보가 아니다 — Z 의 마커 행만 후보.
    const plan = await planSegmentAutoTagRemovals({ marker: MARKER, label: "만료임박", keepStorageKeys: keep(), limitFor: noLimit })
    expect(plan).toMatchObject({ markerRows: 1, candidates: 1 })
    // 끄면서 "붙은 자동 태그 떼기"를 골라도 X·Y 의 라벨은 남는다.
    expect(await detachSegmentAutoTags(MARKER)).toEqual({ candidates: 1, removed: 1, failed: 0 })
    expect(labelsOf("lead", "x")).toEqual(["만료임박"])
    expect(labelsOf("lead", "y")).toEqual(["만료임박"])
    expect(labelsOf("lead", "z")).toEqual([])
  })

  it("이름 변경 to = 자동 라벨도 같다 — 사람 행에 작성자가 없으면 실행한 사람(actor)이 소유자", async () => {
    table = [row("h1", "lead", "x", "재접촉요망", null), row("m1", "lead", "x", "재접촉", MARKER)]
    const { renameCustomerTag, detachSegmentAutoTags } = await loadRepo()
    expect(await renameCustomerTag("재접촉요망", "재접촉", { actor: "관리자" })).toEqual({
      updated: 0,
      removedDuplicates: 1,
      claimedAutoTags: 1,
    })
    expect(table).toEqual([expect.objectContaining({ id: "m1", tag: "재접촉", created_by: "관리자" })])
    expect((await detachSegmentAutoTags(MARKER)).removed).toBe(0)
    expect(labelsOf("lead", "x")).toEqual(["재접촉"])
  })

  it("to 에 사람 행이 이미 있으면 소유 이전 없이 예전처럼 중복만 정리한다", async () => {
    table = [row("h1", "lead", "x", "A", "김매니저"), row("h2", "lead", "x", "B", "박담당"), row("m1", "lead", "x", "b", MARKER)]
    const { mergeCustomerTags } = await loadRepo()
    expect(await mergeCustomerTags(["A"], "B", { actor: "관리자" })).toEqual({ updated: 0, removedDuplicates: 1 })
    expect(updateCalls).toEqual([])
    expect(table.map((candidate) => candidate.id).sort()).toEqual(["h2", "m1"])
  })

  it("to 가 없는 대상에 사람 행과 옛 마커 행이 함께 from 이면 사람 행을 남긴다(마커 행이 이름을 물려받지 않는다)", async () => {
    table = [row("m1", "lead", "x", "옛자동", "auto:seg:old"), row("h1", "lead", "x", "수동", "김매니저")]
    const { mergeCustomerTags, detachSegmentAutoTags } = await loadRepo()
    expect(await mergeCustomerTags(["옛자동", "수동"], "정리됨", { actor: "관리자" })).toEqual({ updated: 1, removedDuplicates: 1 })
    expect(table).toEqual([expect.objectContaining({ id: "h1", tag: "정리됨", created_by: "김매니저" })])
    expect((await detachSegmentAutoTags("auto:seg:old")).removed).toBe(0)
    expect(labelsOf("lead", "x")).toEqual(["정리됨"])
  })

  it("이름 변경 from = 꺼진 세그먼트의 라벨(마커 행뿐): 이름과 소유를 함께 넘긴다 → 다시 켜 떼기·detach 뒤에도 남는다", async () => {
    // 세그먼트 S(라벨 '재접촉')는 자동 태그를 떼지 않고 껐다 — 마커 행이 남아 있다(from 409 대상 아님).
    table = [
      row("m1", "lead", "a", "재접촉", MARKER),
      row("m2", "neo_account", "N1", "재접촉", MARKER),
      // 같은 라벨의 사람 행 — 원래 작성자를 유지한다.
      row("h1", "lead", "c", "재접촉", "김매니저"),
    ]
    const { renameCustomerTag, planSegmentAutoTagRemovals, detachSegmentAutoTags } = await loadRepo()

    const preview = await renameCustomerTag("재접촉", "재접촉-9월", { dryRun: true, actor: "관리자" })
    expect(preview).toEqual({ updated: 3, removedDuplicates: 0, claimedAutoTags: 2 })
    expect(writes).toBe(0)

    expect(await renameCustomerTag("재접촉", "재접촉-9월", { actor: "관리자" })).toEqual(preview)
    expect(table.find((candidate) => candidate.id === "m1")).toMatchObject({ tag: "재접촉-9월", created_by: "관리자" })
    expect(table.find((candidate) => candidate.id === "m2")).toMatchObject({ tag: "재접촉-9월", created_by: "관리자" })
    expect(table.find((candidate) => candidate.id === "h1")).toMatchObject({ tag: "재접촉-9월", created_by: "김매니저" })
    // 이름과 소유는 한 번의 update 로 — 이름만 바뀐 채 마커가 남는 중간 상태가 없다. 사람 행은 이름만.
    expect(updateCalls.map((call) => call.patch)).toEqual([
      { tag: "재접촉-9월", created_by: "관리자" },
      { tag: "재접촉-9월", created_by: "관리자" },
      { tag: "재접촉-9월" },
    ])

    // (a) S 를 라벨 '재접촉'·떼기 켬으로 다시 켠다 — 회원이 아무도 없어도 '재접촉-9월' 은 옛 라벨 마커 행이 아니다.
    const plan = await planSegmentAutoTagRemovals({ marker: MARKER, label: "재접촉", keepStorageKeys: keep(), limitFor: noLimit })
    expect(plan).toMatchObject({ markerRows: 0, candidates: 0, blocked: false })
    // (b) S 를 보관하며 "붙은 자동 태그 떼기"를 골라도 지울 행이 없다.
    expect(await detachSegmentAutoTags(MARKER)).toEqual({ candidates: 0, removed: 0, failed: 0 })
    expect(labelsOf("lead", "a")).toEqual(["재접촉-9월"])
    expect(labelsOf("neo_account", "N1")).toEqual(["재접촉-9월"])
    expect(labelsOf("lead", "c")).toEqual(["재접촉-9월"])
  })

  it("병합 from = 옛 자동 라벨 여러 개(마커 행뿐, to 없음): 남는 한 행이 사람 소유가 되고 나머지는 중복 정리", async () => {
    table = [
      row("m1", "lead", "x", "옛A", "auto:seg:old-a"),
      row("m2", "lead", "x", "옛B", "auto:seg:old-b"),
      // Y: to 가 이미 다른 세그먼트의 마커 행 — 사람이 새로 만든 행이 없으니 to 소유는 그 세그먼트에 그대로 둔다.
      row("m3", "lead", "y", "옛A", "auto:seg:old-a"),
      row("m4", "lead", "y", "정리", MARKER),
    ]
    const { mergeCustomerTags, detachSegmentAutoTags } = await loadRepo()
    expect(await mergeCustomerTags(["옛A", "옛B"], "정리", { actor: "관리자" })).toEqual({
      updated: 1,
      removedDuplicates: 2,
      claimedAutoTags: 1,
    })
    expect(labelsOf("lead", "x")).toEqual(["정리"])
    expect(table.find((candidate) => candidate.target_id === "x")?.created_by).toBe("관리자")
    expect(table.find((candidate) => candidate.id === "m4")?.created_by).toBe(MARKER)
    // 옛 세그먼트들을 detach 해도 X 의 '정리' 는 남는다.
    expect((await detachSegmentAutoTags("auto:seg:old-a")).removed).toBe(0)
    expect((await detachSegmentAutoTags("auto:seg:old-b")).removed).toBe(0)
    expect(labelsOf("lead", "x")).toEqual(["정리"])
  })

  it("이름 변경 소유 이전 — 실행한 사람이 없으면 작성자 없음(사람 행)으로, 자동 경로(actor = 마커)면 소유를 옮기지 않는다", async () => {
    table = [row("m1", "lead", "a", "재접촉", MARKER)]
    const first = await loadRepo()
    expect(await first.renameCustomerTag("재접촉", "재접촉-9월")).toEqual({ updated: 1, removedDuplicates: 0, claimedAutoTags: 1 })
    expect(table[0]).toMatchObject({ tag: "재접촉-9월", created_by: null })
    expect((await first.detachSegmentAutoTags(MARKER)).removed).toBe(0)

    table = [row("m2", "lead", "b", "재접촉", MARKER)]
    updateCalls = []
    const second = await loadRepo()
    expect(await second.renameCustomerTag("재접촉", "재접촉-9월", { actor: "auto:seg:other" })).toEqual({ updated: 1, removedDuplicates: 0 })
    expect(updateCalls.map((call) => call.patch)).toEqual([{ tag: "재접촉-9월" }])
    expect(table[0]).toMatchObject({ tag: "재접촉-9월", created_by: MARKER })
  })

  it("일괄 추가(사람): 같은 라벨이 마커 행으로만 있던 대상은 그 행을 사람 소유로 넘긴다(claimed) → detach 뒤에도 남는다", async () => {
    table = [
      row("m1", "lead", "a", "VIP", MARKER),
      row("m2", "lead", "b", "vip", MARKER),
      row("h1", "lead", "b", "Vip", "박담당"),
    ]
    const { addCustomerTagToTargets, detachSegmentAutoTags } = await loadRepo()
    const result = await addCustomerTagToTargets(
      [
        { key: "lead:a", targetType: "lead", targetId: "a" },
        { key: "lead:b", targetType: "lead", targetId: "b" },
        { key: "lead:c", targetType: "lead", targetId: "c" },
      ],
      "VIP",
      "김매니저"
    )
    // a: 마커 행 소유 이전(skipped 로 셈) · b: 이미 사람 행이 있어 그대로(skipped) · c: 새로 붙음(applied)
    expect(result).toEqual({ applied: 1, skipped: 2, failed: [], claimed: 1 })
    expect(table.find((candidate) => candidate.id === "m1")?.created_by).toBe("김매니저")
    // b 의 마커 행은 사람 행이 따로 있어 손대지 않는다.
    expect(table.find((candidate) => candidate.id === "m2")?.created_by).toBe(MARKER)
    expect(updateCalls).toEqual([{ patch: { created_by: "김매니저" }, likeCreatedBy: "auto:%" }])
    await detachSegmentAutoTags(MARKER)
    expect(labelsOf("lead", "a")).toEqual(["VIP"])
    expect(labelsOf("lead", "b")).toEqual(["Vip"])
    expect(labelsOf("lead", "c")).toEqual(["VIP"])
  })

  it("일괄 추가(자동 경로 — actor 가 마커)는 소유를 옮기지 않는다", async () => {
    table = [row("m1", "lead", "a", "VIP", "auto:seg:other")]
    const { addCustomerTagToTargets } = await loadRepo()
    const result = await addCustomerTagToTargets([{ key: "lead:a", targetType: "lead", targetId: "a" }], "VIP", MARKER)
    expect(result).toEqual({ applied: 0, skipped: 1, failed: [] })
    expect(updateCalls).toEqual([])
    expect(table[0].created_by).toBe("auto:seg:other")
  })

  it("단건 추가(사람): 같은 라벨의 마커 행이 있으면 사람 소유로 넘긴다 · 자동 경로는 넘기지 않는다", async () => {
    table = [row("m1", "lead", "a", "VIP", MARKER)]
    const { addCustomerTag, planSegmentAutoTagRemovals } = await loadRepo()
    expect(await addCustomerTag("lead", "a", "VIP", "김매니저")).toEqual(["VIP"])
    expect(table).toEqual([expect.objectContaining({ id: "m1", created_by: "김매니저" })])
    expect(updateCalls).toEqual([{ patch: { created_by: "김매니저" }, likeCreatedBy: "auto:%" }])
    const plan = await planSegmentAutoTagRemovals({ marker: MARKER, label: "VIP", keepStorageKeys: keep(), limitFor: noLimit })
    expect(plan).toMatchObject({ markerRows: 0, candidates: 0 })

    table = [row("m2", "lead", "b", "VIP", "auto:seg:other")]
    updateCalls = []
    await addCustomerTag("lead", "b", "VIP", MARKER)
    expect(updateCalls).toEqual([])
    expect(table[0].created_by).toBe("auto:seg:other")
  })

  it("planAutoTagClaims — 같은 묶음이 전부 마커 행인 대상만, 사람 행이 하나라도 있으면 제외", async () => {
    const { planAutoTagClaims, isAutoTagCreatedBy } = await loadRepo()
    const claims = planAutoTagClaims(
      [
        { id: "1", target_type: "lead", target_id: "a", tag: "VIP", created_by: MARKER },
        { id: "2", target_type: "lead", target_id: "a", tag: "vip", created_by: "auto:seg:other" },
        { id: "3", target_type: "lead", target_id: "b", tag: "VIP", created_by: MARKER },
        { id: "4", target_type: "lead", target_id: "b", tag: "VIP ", created_by: null },
        { id: "5", target_type: "lead", target_id: "c", tag: "다른라벨", created_by: MARKER },
      ],
      " vip"
    )
    expect([...claims.entries()]).toEqual([["lead:a", ["1", "2"]]])
    expect(isAutoTagCreatedBy(MARKER)).toBe(true)
    expect(isAutoTagCreatedBy("김매니저")).toBe(false)
    expect(isAutoTagCreatedBy(null)).toBe(false)
  })
})
