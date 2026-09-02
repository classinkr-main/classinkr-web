import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * 결제창 무결제 "도입 신청" 어드민 축 — repository(상태 전이·jsonb 변환)와
 * API 라우트(GET 목록·PATCH 상태 전이)를 함께 검증한다.
 *
 * Supabase 는 tests/showroom/booking-admin.test.ts 와 같은 스타일로 모킹한다(체이닝하는
 * 가짜 쿼리 빌더, 테이블 하나만 흉내). 라우트 테스트는 @/lib/admin-auth 의 verifyAdmin 만
 * 통과로 목하고 @/lib/supabase/admin 은 같은 가짜 빌더를 쓴다 — 그래서 실제 repository ·
 * 실제 라우트 코드가 그대로 실행되고, 가짜는 진짜 외부 경계(Supabase)에만 있다.
 *
 * 검증 대상:
 *   - CHECKOUT_REQUEST_STATUSES 가 스키마 CHECK 목록과 정확히 같다
 *   - 미등록 status/kind 는 거부한다(저장소 400/타입가드, 라우트 400)
 *   - 없는 id 는 repository 에서 null, 라우트에서 404
 *   - items jsonb 가 CheckoutRequestItem[] 로 정확히·방어적으로 변환된다
 *   - from/to 필터가 desired_date 가 아니라 created_at(KST 자정 경계)을 거른다
 */

interface RequestRow {
  id: string
  kind: string
  items: unknown
  total_amount: number
  currency: string
  org: string
  name: string
  phone: string
  email: string | null
  install_type: string | null
  address: string | null
  desired_date: string
  memo: string | null
  source_page: string | null
  lead_id: string | null
  status: string
  created_at: string
  updated_at: string
}

function row(overrides: Partial<RequestRow> = {}): RequestRow {
  return {
    id: "req-1",
    kind: "hardware",
    items: [
      {
        sku: "hw-board-86",
        name: '86" Classin 전자칠판',
        qty: 2,
        unitAmount: 6_300_000,
        currency: "KRW",
        lineAmount: 12_600_000,
      },
    ],
    total_amount: 12_600_000,
    currency: "KRW",
    org: "행복학원",
    name: "김원장",
    phone: "010-1234-5678",
    email: "won@happy.co.kr",
    install_type: "wall",
    address: "서울시 강남구 테헤란로 123, 4층",
    desired_date: "2026-09-10",
    memo: null,
    source_page: "/product/hw",
    lead_id: null,
    status: "new",
    created_at: "2026-08-20T01:00:00.000Z",
    updated_at: "2026-08-20T01:00:00.000Z",
    ...overrides,
  }
}

/**
 * checkout_requests 한 테이블만 흉내 내는 최소 쿼리 빌더.
 * select().eq().maybeSingle() 과 update().eq().select().maybeSingle(),
 * 목록 조회(select().order().gte().lt().eq())를 지원한다.
 *
 * gte/lt 는 문자열이 아니라 Date.parse 로 비교한다 — created_at 비교값은 리포지토리가
 * 넘기는 KST 오프셋(+09:00) 문자열이고 픽스처는 Z 오프셋이라, 실제 Postgres 처럼
 * 절대 시각으로 비교해야 KST 자정 경계 로직이 제대로 검증된다.
 */
function makeSupabase(rows: RequestRow[]) {
  const updates: Record<string, unknown>[] = []

  function builder(mode: "select" | "update", patch?: Record<string, unknown>) {
    let matched = [...rows]
    const chain = {
      eq(column: string, value: unknown) {
        matched = matched.filter((item) => (item as unknown as Record<string, unknown>)[column] === value)
        return chain
      },
      gte(column: string, value: string) {
        matched = matched.filter(
          (item) =>
            Date.parse(String((item as unknown as Record<string, unknown>)[column])) >= Date.parse(value)
        )
        return chain
      },
      lt(column: string, value: string) {
        matched = matched.filter(
          (item) =>
            Date.parse(String((item as unknown as Record<string, unknown>)[column])) < Date.parse(value)
        )
        return chain
      },
      order(column: string, opts?: { ascending?: boolean }) {
        const ascending = opts?.ascending !== false
        matched = [...matched].sort((a, b) => {
          const av = String((a as unknown as Record<string, unknown>)[column])
          const bv = String((b as unknown as Record<string, unknown>)[column])
          if (av === bv) return 0
          const cmp = av < bv ? -1 : 1
          return ascending ? cmp : -cmp
        })
        return chain
      },
      select() {
        return chain
      },
      async maybeSingle() {
        const target = matched[0]
        if (!target) return { data: null, error: null }
        if (mode === "update" && patch) Object.assign(target, patch)
        return { data: target, error: null }
      },
      // 목록 조회는 빌더 자체를 await 한다(PostgREST 와 같은 thenable 규약).
      then(resolve: (value: { data: RequestRow[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: matched, error: null }))
      },
    }
    return chain
  }

  return {
    updates,
    createSupabaseAdminClient: vi.fn(() => ({
      from: () => ({
        select: () => builder("select"),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch)
          return builder("update", patch)
        },
      }),
    })),
  }
}

async function loadRepository(rows: RequestRow[]) {
  vi.resetModules()
  const supabase = makeSupabase(rows)
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: supabase.createSupabaseAdminClient,
  }))
  const mod = await import("@/lib/repositories/checkout-requests-admin")
  return { mod, updates: supabase.updates }
}

async function loadRoutes(rows: RequestRow[]) {
  vi.resetModules()
  const supabase = makeSupabase(rows)
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: supabase.createSupabaseAdminClient,
  }))
  // 인증은 항상 통과 — 가드가 실제로 존재/호출되는지는 tests/api/admin-route-guards.test.ts 가
  // 라우트 파일을 정적으로 수집해 별도로 검증한다. 여기서는 그 뒤의 비즈니스 로직만 본다.
  vi.doMock("@/lib/admin-auth", () => ({
    verifyAdmin: vi.fn(async () => undefined),
  }))
  const listRoute = await import("@/app/api/admin/checkout-requests/route")
  const detailRoute = await import("@/app/api/admin/checkout-requests/[id]/route")
  return { listRoute, detailRoute, updates: supabase.updates }
}

function getRequest(url: string) {
  return new NextRequest(url)
}

function patchRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("CHECKOUT_REQUEST_STATUSES / isCheckoutRequestStatus", () => {
  it("스키마 CHECK 목록과 정확히 같다", async () => {
    const { mod } = await loadRepository([])

    expect(mod.CHECKOUT_REQUEST_STATUSES).toEqual([
      "new",
      "contacted",
      "scheduled",
      "done",
      "canceled",
    ])
    for (const status of mod.CHECKOUT_REQUEST_STATUSES) {
      expect(mod.isCheckoutRequestStatus(status)).toBe(true)
    }
  })

  it("미등록 상태값은 거부한다", async () => {
    const { mod } = await loadRepository([])

    // showroom_bookings 의 상태값(confirmed 등)이나 오타·다른 대소문자가 섞여 들어오지
    // 않게 한다.
    expect(mod.isCheckoutRequestStatus("confirmed")).toBe(false)
    expect(mod.isCheckoutRequestStatus("NEW")).toBe(false)
    expect(mod.isCheckoutRequestStatus("pending")).toBe(false)
    expect(mod.isCheckoutRequestStatus("")).toBe(false)
    expect(mod.isCheckoutRequestStatus(null)).toBe(false)
    expect(mod.isCheckoutRequestStatus(1)).toBe(false)
  })
})

describe("CHECKOUT_REQUEST_KINDS / isCheckoutRequestKind", () => {
  it("스키마 CHECK 목록과 정확히 같다", async () => {
    const { mod } = await loadRepository([])

    expect(mod.CHECKOUT_REQUEST_KINDS).toEqual(["hardware", "software"])
    for (const kind of mod.CHECKOUT_REQUEST_KINDS) {
      expect(mod.isCheckoutRequestKind(kind)).toBe(true)
    }
    expect(mod.isCheckoutRequestKind("hw")).toBe(false)
    expect(mod.isCheckoutRequestKind(null)).toBe(false)
  })
})

describe("updateCheckoutRequestStatus", () => {
  it("스키마 CHECK 목록의 모든 상태로 전이하고, status 외 컬럼은 건드리지 않는다", async () => {
    const { mod, updates } = await loadRepository([row()])

    for (const status of mod.CHECKOUT_REQUEST_STATUSES) {
      const updated = await mod.updateCheckoutRequestStatus("req-1", { status })
      expect(updated?.status).toBe(status)
    }

    expect(updates).toHaveLength(mod.CHECKOUT_REQUEST_STATUSES.length)
    // assigned_to 컬럼이 없으니(스키마에 없음) status 하나만 실려야 한다.
    for (const patch of updates) {
      expect(Object.keys(patch)).toEqual(["status"])
    }
  })

  it("없는 id 는 null 이다(호출부가 404 로 말한다)", async () => {
    const { mod } = await loadRepository([row()])

    // showroom_bookings 와 달리 이 저장소는 confirmed_at 류 부가 로직이 없어 미리
    // 읽어 존재를 확인하지 않는다 — update(status).eq(id) 를 그대로 보내고(실제
    // Postgres 도 0행 매치 UPDATE 를 그냥 실행한다) 결과가 없으면 null 로 알린다.
    expect(await mod.updateCheckoutRequestStatus("nope", { status: "contacted" })).toBeNull()
  })
})

describe("getCheckoutRequest / listCheckoutRequests — items jsonb 변환", () => {
  it("정상 jsonb 배열을 CheckoutRequestItem[] 로 그대로 옮긴다", async () => {
    const { mod } = await loadRepository([
      row({
        items: [
          {
            sku: "hw-board-86",
            name: '86" Classin 전자칠판',
            qty: 2,
            unitAmount: 6_300_000,
            currency: "KRW",
            lineAmount: 12_600_000,
          },
          { sku: "hw-cam-1", name: "AI 카메라", qty: 1, unitAmount: 890_000, currency: "KRW", lineAmount: 890_000 },
        ],
      }),
    ])

    const record = await mod.getCheckoutRequest("req-1")

    expect(record?.items).toEqual([
      {
        sku: "hw-board-86",
        name: '86" Classin 전자칠판',
        qty: 2,
        unitAmount: 6_300_000,
        currency: "KRW",
        lineAmount: 12_600_000,
      },
      { sku: "hw-cam-1", name: "AI 카메라", qty: 1, unitAmount: 890_000, currency: "KRW", lineAmount: 890_000 },
    ])
  })

  it("모양이 어긋난 원소는 걸러내고 정상 원소는 보존한다", async () => {
    const { mod } = await loadRepository([
      row({
        items: [
          {
            sku: "sw-business-recharge",
            name: "충전형 Business",
            qty: 1,
            unitAmount: 2_000_000,
            currency: "KRW",
            lineAmount: 2_000_000,
          },
          { sku: "broken-qty", name: "수량이 문자열", qty: "2", unitAmount: 1000, currency: "KRW", lineAmount: 2000 },
          { sku: "broken-currency", name: "미등록 통화", qty: 1, unitAmount: 1000, currency: "EUR", lineAmount: 1000 },
          { name: "sku 없음", qty: 1, unitAmount: 1000, currency: "KRW", lineAmount: 1000 },
          "그냥 문자열",
          null,
          42,
        ],
      }),
    ])

    const record = await mod.getCheckoutRequest("req-1")

    expect(record?.items).toEqual([
      {
        sku: "sw-business-recharge",
        name: "충전형 Business",
        qty: 1,
        unitAmount: 2_000_000,
        currency: "KRW",
        lineAmount: 2_000_000,
      },
    ])
  })

  it("items 가 배열이 아니면(null 등) 빈 배열로 처리하고 예외를 던지지 않는다", async () => {
    const { mod } = await loadRepository([row({ items: null })])

    const record = await mod.getCheckoutRequest("req-1")

    expect(record?.items).toEqual([])
  })

  it("snake_case 행을 camelCase 도메인 타입으로 옮긴다", async () => {
    const { mod } = await loadRepository([
      row({
        total_amount: 12_600_000,
        install_type: "wall",
        desired_date: "2026-09-10",
        source_page: "/product/hw",
        lead_id: "lead-9",
      }),
    ])

    const record = await mod.getCheckoutRequest("req-1")

    expect(record).toMatchObject({
      totalAmount: 12_600_000,
      installType: "wall",
      desiredDate: "2026-09-10",
      sourcePage: "/product/hw",
      leadId: "lead-9",
    })
  })

  it("없는 id 는 null 이다", async () => {
    const { mod } = await loadRepository([row()])

    expect(await mod.getCheckoutRequest("nope")).toBeNull()
  })
})

describe("listCheckoutRequests — from/to 는 접수일(created_at) 축, KST 자정 경계", () => {
  it("from 은 KST 자정 이상만, to 는 그날 KST 23:59:59 까지 포함한다", async () => {
    const { mod } = await loadRepository([
      row({ id: "before", created_at: "2026-08-19T14:59:59.999Z" }), // KST 8/19 23:59:59.999 — from=8/20 에서 제외
      row({ id: "at-start", created_at: "2026-08-19T15:00:00.000Z" }), // KST 8/20 00:00:00 — from=8/20 경계, 포함
      row({ id: "mid", created_at: "2026-08-20T05:00:00.000Z" }), // KST 8/20 14:00 — 포함
      row({ id: "at-end", created_at: "2026-08-20T14:59:59.999Z" }), // KST 8/20 23:59:59.999 — to=8/20 경계, 포함
      row({ id: "after", created_at: "2026-08-20T15:00:00.000Z" }), // KST 8/21 00:00:00 — to=8/20 다음날, 제외
    ])

    const records = await mod.listCheckoutRequests({ from: "2026-08-20", to: "2026-08-20" })

    expect(records.map((r) => r.id).sort()).toEqual(["at-end", "at-start", "mid"])
  })

  it("status·kind 필터를 함께 적용한다", async () => {
    const { mod } = await loadRepository([
      row({ id: "a", status: "new", kind: "hardware" }),
      row({ id: "b", status: "contacted", kind: "hardware" }),
      row({ id: "c", status: "new", kind: "software" }),
    ])

    const records = await mod.listCheckoutRequests({ status: "new", kind: "hardware" })

    expect(records.map((r) => r.id)).toEqual(["a"])
  })

  it("필터가 없으면 접수일 최신순(내림차순) 전량을 돌려준다", async () => {
    const { mod } = await loadRepository([
      row({ id: "old", created_at: "2026-08-01T00:00:00.000Z" }),
      row({ id: "new", created_at: "2026-08-20T00:00:00.000Z" }),
    ])

    const records = await mod.listCheckoutRequests()

    expect(records.map((r) => r.id)).toEqual(["new", "old"])
  })
})

describe("GET /api/admin/checkout-requests", () => {
  it("미등록 status 는 400", async () => {
    const { listRoute } = await loadRoutes([row()])

    const res = await listRoute.GET(getRequest("https://classin.kr/api/admin/checkout-requests?status=bogus"))

    expect(res.status).toBe(400)
  })

  it("미등록 kind 는 400", async () => {
    const { listRoute } = await loadRoutes([row()])

    const res = await listRoute.GET(getRequest("https://classin.kr/api/admin/checkout-requests?kind=bogus"))

    expect(res.status).toBe(400)
  })

  it("형식이 어긋난 from/to 는 400", async () => {
    const { listRoute } = await loadRoutes([row()])

    const res = await listRoute.GET(
      getRequest("https://classin.kr/api/admin/checkout-requests?from=2026-13-40")
    )

    expect(res.status).toBe(400)
  })

  it("from 이 to 보다 뒤면 400", async () => {
    const { listRoute } = await loadRoutes([row()])

    const res = await listRoute.GET(
      getRequest("https://classin.kr/api/admin/checkout-requests?from=2026-08-20&to=2026-08-01")
    )

    expect(res.status).toBe(400)
  })

  it("정상 조회는 200 과 필터된 목록을 돌려준다", async () => {
    const { listRoute } = await loadRoutes([
      row({ id: "req-1", status: "new" }),
      row({ id: "req-2", status: "contacted" }),
    ])

    const res = await listRoute.GET(
      getRequest("https://classin.kr/api/admin/checkout-requests?status=contacted")
    )
    const body = (await res.json()) as Array<{ id: string }>

    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe("req-2")
  })
})

describe("PATCH /api/admin/checkout-requests/[id]", () => {
  it("미등록 status 는 400", async () => {
    const { detailRoute } = await loadRoutes([row({ id: "req-1" })])

    const res = await detailRoute.PATCH(
      patchRequest("https://classin.kr/api/admin/checkout-requests/req-1", { status: "bogus" }),
      { params: Promise.resolve({ id: "req-1" }) }
    )

    expect(res.status).toBe(400)
  })

  it("없는 id 는 404", async () => {
    const { detailRoute } = await loadRoutes([row({ id: "req-1" })])

    const res = await detailRoute.PATCH(
      patchRequest("https://classin.kr/api/admin/checkout-requests/nope", { status: "contacted" }),
      { params: Promise.resolve({ id: "nope" }) }
    )

    expect(res.status).toBe(404)
  })

  it("정상 전이는 200 과 갱신된 레코드를 돌려준다", async () => {
    const { detailRoute } = await loadRoutes([row({ id: "req-1", status: "new" })])

    const res = await detailRoute.PATCH(
      patchRequest("https://classin.kr/api/admin/checkout-requests/req-1", { status: "scheduled" }),
      { params: Promise.resolve({ id: "req-1" }) }
    )
    const body = (await res.json()) as { status: string; id: string }

    expect(res.status).toBe(200)
    expect(body.status).toBe("scheduled")
    expect(body.id).toBe("req-1")
  })
})
