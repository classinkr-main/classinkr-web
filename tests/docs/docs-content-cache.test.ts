import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// lib/docs-content.ts 의 서버 메모이제이션 전용 테스트.
//
// 배경(2026-09-02 프로덕션 pg_stat_statements): docs_articles 전문 20컬럼 로드가 12,359콜 × 138ms
// = 1,710초로 단일 문장 1위였다. getDocsContent 는 React cache()(요청 스코프)만 써서 문서·사이트맵·
// 챗봇 폴백 요청마다 발행 문서 전부(본문 포함)를 다시 읽었다. 여기서는 오직 캐시 레이어만 본다:
// 반복 호출을 원격 조회 1회로 접는지, TTL 뒤에는 다시 읽는지, 명시 무효화가 즉시 반영되는지,
// 동시 호출이 진행 중 promise 를 공유하는지, 실패는 캐시하지 않는지.

let fromMock: ReturnType<typeof vi.fn>

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}))

import {
  __resetDocsContentCacheForTests,
  getDocsContent,
  invalidateDocsContentCache,
} from "@/lib/docs-content"

// 구현 내부 TTL 상수(lib/docs-content.ts, export 되지 않음)를 미러링한다.
const TTL_MS = 60_000

type Result = { data: unknown; error: unknown }

/** select/eq/in/order 를 어떤 순서로 체이닝해도 await 시점에 result 를 돌려주는 thenable 체인. */
function thenableChain(result: Result) {
  const chain: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return chain
}

const categoryRows = [{ id: "start", title: "시작하기", description: "d", order_index: 1 }]
const articleRows = [
  {
    id: "a1",
    category_id: "start",
    slug: "memo-test-article",
    title: "메모 테스트",
    description: "설명",
    audience: ["teacher"],
    tags: [],
    keywords: [],
    chatbot_summary: null,
    content_markdown: "# 제목\n\n본문",
    content_json: null,
    featured: false,
    visibility: "public",
    noindex: false,
    seo_title: null,
    seo_description: null,
    canonical_path: null,
    last_reviewed_at: null,
    published_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  },
]

function healthyFrom() {
  return vi.fn((table: string) => {
    if (table === "docs_categories") return thenableChain({ data: categoryRows, error: null })
    if (table === "docs_articles") return thenableChain({ data: articleRows, error: null })
    if (table === "docs_article_relations") return thenableChain({ data: [], error: null })
    throw new Error(`unexpected table ${table}`)
  })
}

beforeEach(() => {
  process.env.USE_SUPABASE_DOCS = "true"
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"))
  fromMock = healthyFrom()
  __resetDocsContentCacheForTests()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  delete process.env.USE_SUPABASE_DOCS
})

describe("getDocsContent — 서버 메모이제이션", () => {
  it("(a) TTL 안의 반복 호출은 Supabase 를 한 번만 읽는다", async () => {
    const first = await getDocsContent()
    const second = await getDocsContent()

    // 한 번의 로드 = docs_categories · docs_articles · docs_article_relations 3회.
    expect(fromMock).toHaveBeenCalledTimes(3)
    expect(first.docs.some((doc) => doc.slug === "memo-test-article")).toBe(true)
    expect(second).toBe(first)
  })

  it("(b) TTL 이 지나면 다시 읽는다", async () => {
    await getDocsContent()
    vi.setSystemTime(new Date(Date.now() + TTL_MS + 1))
    await getDocsContent()

    expect(fromMock).toHaveBeenCalledTimes(6)
  })

  it("(c) invalidateDocsContentCache 뒤의 첫 호출은 즉시 다시 읽는다", async () => {
    await getDocsContent()
    invalidateDocsContentCache()
    await getDocsContent()

    expect(fromMock).toHaveBeenCalledTimes(6)
  })

  it("(d) 동시 호출은 진행 중 로드를 공유한다", async () => {
    const [first, second] = await Promise.all([getDocsContent(), getDocsContent()])

    expect(fromMock).toHaveBeenCalledTimes(3)
    expect(second).toBe(first)
  })

  it("(e) 로드 실패는 캐시하지 않고 정적 폴백을 돌려준 뒤 다음 호출에서 재시도한다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    fromMock = vi.fn(() => thenableChain({ data: null, error: { message: "boom" } }))

    const fallback = await getDocsContent()
    expect(fallback.docs.some((doc) => doc.slug === "memo-test-article")).toBe(false)

    fromMock = healthyFrom()
    const recovered = await getDocsContent()
    expect(recovered.docs.some((doc) => doc.slug === "memo-test-article")).toBe(true)
    warn.mockRestore()
  })
})
