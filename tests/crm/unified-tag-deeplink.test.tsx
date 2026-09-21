/**
 * 태그 관리 → 통합 고객 라벨 딥링크(?tag=) — 2026-09-21, CRM 기획 §10 후속.
 *
 * 태그 관리 화면(/admin/crm/customers/tags)의 태그 이름이 /admin/crm/customers/unified?tag=<인코딩>
 * 으로 가고, 통합 고객 클라이언트가 그 값을 라벨 필터로 읽어 ?view=와 같은 규약으로 URL 상태를
 * 유지한다. 저장소에 DOM 테스트 환경이 없어(tag-management-panel.test.tsx와 같은 사정) 클라이언트
 * 본체의 상태 전이는 소스 계약으로, URL 파싱·패치·칩 병합은 순수 함수의 실제 입력·출력으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CustomerSearchPanel from "@/components/admin/crm/unified/CustomerSearchPanel"
import {
  UNIFIED_CUSTOMERS_PATH,
  listUrl,
  parseTagParam,
  patchUnifiedListParams,
  tagChipsWithActive,
  unifiedCustomersTagHref,
  type CrmUnifiedCustomers,
} from "@/components/admin/crm/unified/shared"

const clientSource = readFileSync(
  resolve(process.cwd(), "components/admin/crm/CrmUnifiedCustomersClient.tsx"),
  "utf8"
).replace(/\r\n/g, "\n")

/** 딥링크 href → 착지 화면의 URL 파싱(useSearchParams().get("tag")) → 라벨 필터 값. */
function landedTag(href: string) {
  return parseTagParam(new URL(href, "https://admin.example").searchParams.get("tag"))
}

describe("parseTagParam — ?tag= 원문 → 라벨 필터 값", () => {
  it("없거나 공백뿐이면 빈 문자열(라벨 필터 없음)", () => {
    expect(parseTagParam(null)).toBe("")
    expect(parseTagParam(undefined)).toBe("")
    expect(parseTagParam("")).toBe("")
    expect(parseTagParam("   ")).toBe("")
  })

  it("저장 규칙(normalizeTag)과 같게 trim · 연속 공백 1칸 · 40자 컷", () => {
    expect(parseTagParam("  VIP ")).toBe("VIP")
    expect(parseTagParam("이탈   위험")).toBe("이탈 위험")
    expect(parseTagParam("가".repeat(50))).toBe("가".repeat(40))
  })
})

describe("unifiedCustomersTagHref — 태그 관리 화면의 딥링크", () => {
  it("통합 고객 경로에 인코딩한 ?tag= 를 붙인다", () => {
    expect(unifiedCustomersTagHref("VIP")).toBe(`${UNIFIED_CUSTOMERS_PATH}?tag=VIP`)
    expect(unifiedCustomersTagHref("데모 요청")).toBe(
      `/admin/crm/customers/unified?tag=${encodeURIComponent("데모 요청")}`
    )
  })

  it("쿼리 예약 문자(& # + = ? %)가 들어간 태그도 착지 화면에서 원래 값으로 되읽힌다", () => {
    for (const tag of ["A&B", "#1 고객", "C++", "a=b", "왜?", "100%", "데모 요청", "VIP"]) {
      expect(landedTag(unifiedCustomersTagHref(tag))).toBe(tag)
    }
  })

  it("빈 태그는 라벨 없는 통합 고객 경로로 떨어진다", () => {
    expect(unifiedCustomersTagHref("  ")).toBe(UNIFIED_CUSTOMERS_PATH)
  })

  it("착지한 라벨은 목록 API 요청(listUrl)에 그대로 실린다 — 서버 필터는 정확 일치", () => {
    const tag = landedTag(unifiedCustomersTagHref("이탈 위험"))
    const url = listUrl({
      query: "",
      source: "all",
      lifecycle: "all",
      owner: "",
      view: "all",
      tag,
      offset: 0,
    })
    expect(new URL(url, "https://admin.example").searchParams.get("tag")).toBe("이탈 위험")
  })
})

describe("patchUnifiedListParams — 화면 URL 상태(?view= · ?tag=) 패치", () => {
  it("라벨을 싣고 다른 쿼리(?account= 드로어 · ?q=)는 그대로 둔다", () => {
    const next = new URLSearchParams(patchUnifiedListParams("account=lead%3A1&q=acme", { tag: "VIP" }))
    expect(next.get("tag")).toBe("VIP")
    expect(next.get("account")).toBe("lead:1")
    expect(next.get("q")).toBe("acme")
  })

  it("빈 라벨은 ?tag= 를 지우고, 라벨 값은 정규화해 싣는다", () => {
    expect(patchUnifiedListParams("tag=VIP&view=priority", { tag: "" })).toBe("view=priority")
    expect(new URLSearchParams(patchUnifiedListParams("", { tag: "  이탈  위험 " })).get("tag")).toBe("이탈 위험")
  })

  it("view=all 은 ?view= 를 지우고, 넘기지 않은 키는 건드리지 않는다", () => {
    expect(patchUnifiedListParams("view=priority&tag=VIP", { view: "all" })).toBe("tag=VIP")
    expect(patchUnifiedListParams("tag=VIP", { view: "hot_lead" })).toBe("tag=VIP&view=hot_lead")
  })

  it("필터 초기화는 저장 뷰·라벨을 한 번의 패치로 함께 지운다", () => {
    expect(patchUnifiedListParams("view=priority&tag=VIP&account=neo%3A9", { view: "all", tag: "" })).toBe(
      "account=neo%3A9"
    )
  })
})

describe("tagChipsWithActive — 라벨 칩 목록", () => {
  it("걸린 라벨이 응답 목록에 있으면 순서를 그대로 둔다", () => {
    expect(tagChipsWithActive(["VIP", "업셀"], "업셀")).toEqual(["VIP", "업셀"])
  })

  it("걸린 라벨이 응답 목록에 없으면(이름 바뀐 태그 딥링크 등) 맨 앞에 붙여 해제 경로를 남긴다", () => {
    expect(tagChipsWithActive(["VIP"], "옛 태그")).toEqual(["옛 태그", "VIP"])
    expect(tagChipsWithActive(undefined, "옛 태그")).toEqual(["옛 태그"])
  })

  it("라벨이 없으면 응답 목록 그대로(원본 배열은 바꾸지 않는다)", () => {
    const available = ["VIP"]
    expect(tagChipsWithActive(available, "")).toEqual(["VIP"])
    expect(tagChipsWithActive(undefined, "")).toEqual([])
    tagChipsWithActive(available, "새 태그")
    expect(available).toEqual(["VIP"])
  })
})

function customersFixture(availableTags: string[]): CrmUnifiedCustomers {
  return {
    generatedAt: "2026-09-21T00:00:00.000Z",
    sources: { leadsOk: true, neoAccountsOk: true, warnings: [], statuses: [] },
    summary: { total: 0, leadCount: 0, accountCount: 0, highPriorityCount: 0, ownerCount: 0, availableTags },
    pagination: { limit: 50, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    owners: [],
    rows: [],
  }
}

function renderPanel(tagFilter: string, availableTags: string[]) {
  const noop = () => {}
  return renderToStaticMarkup(
    <CustomerSearchPanel
      query=""
      onQueryChange={noop}
      source="all"
      onSourceChange={noop}
      lifecycle="all"
      onLifecycleChange={noop}
      owner=""
      onOwnerChange={noop}
      currentOwner={null}
      currentOwnerCount={0}
      ownerOptions={[]}
      tagFilter={tagFilter}
      onTagFilterChange={noop}
      includeUnconfirmed={false}
      onIncludeUnconfirmedChange={noop}
      data={customersFixture(availableTags)}
      loading={false}
    />
  )
}

describe("CustomerSearchPanel — ?tag= 로 착지한 라벨 칩", () => {
  it("딥링크 라벨이 응답 목록에 있으면 그 칩이 눌린 상태(aria-pressed)로 그려지고 초기화가 보인다", () => {
    const html = renderPanel("VIP", ["VIP", "업셀"])
    expect(html).toMatch(/aria-pressed="true"[^>]*>VIP</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>업셀</)
    expect(html).toContain(">초기화<")
  })

  it("응답 목록에 없는 라벨도 눌린 칩으로 보여 해제할 수 있다", () => {
    const html = renderPanel("옛 태그", [])
    expect(html).toContain(">라벨<")
    expect(html).toMatch(/aria-pressed="true"[^>]*>옛 태그</)
    expect(html).toContain(">초기화<")
  })

  it("라벨도 응답 태그도 없으면 라벨 줄 자체를 그리지 않는다", () => {
    expect(renderPanel("", [])).not.toContain(">라벨<")
  })
})

describe("CrmUnifiedCustomersClient ?tag= URL 상태 계약(소스)", () => {
  it("라벨 필터 초기값을 마운트 시점 URL(?tag=)에서 읽는다 — 딥링크 첫 요청부터 라벨이 실린다", () => {
    expect(clientSource).toContain('const [tagFilter, setTagFilter] = useState(() => parseTagParam(searchParams.get("tag")))')
    // useSearchParams는 그 초기화보다 먼저 호출돼야 한다.
    expect(clientSource.indexOf("const searchParams = useSearchParams()")).toBeLessThan(
      clientSource.indexOf("const [tagFilter, setTagFilter]")
    )
    // 프리페치 시드 URL도 같은 라벨로 만든다(서버 buildUnifiedPrefetchUrl과 정합).
    expect(clientSource).toContain('tag: searchParams.get("tag") ?? undefined,')
  })

  it("?tag= 착지 effect는 값이 실제로 바뀔 때만 라벨을 맞춘다(드로어 ?account= 변경에는 불변)", () => {
    const start = clientSource.indexOf("const lastTagParamRef = useRef<string | null>(null)")
    expect(start).toBeGreaterThan(-1)
    const block = clientSource.slice(start, clientSource.indexOf("}, [searchParams])", start))
    expect(block).toContain('parseTagParam(searchParams.get("tag"))')
    expect(block).toContain("if (tag === lastTagParamRef.current) return")
    expect(block).toContain("setTagFilter(tag)")
  })

  it("?view= 착지 effect는 더 이상 라벨을 비우지 않는다(?view=…&tag=… 착지에서 URL과 어긋남 방지)", () => {
    const start = clientSource.indexOf("const lastViewParamRef = useRef<string | null>(null)")
    const block = clientSource.slice(start, clientSource.indexOf("}, [searchParams])", start))
    expect(block).toContain("setSavedView(")
    expect(block).not.toContain("setTagFilter")
  })

  it("라벨 칩·해제는 state와 URL을 함께 바꾸는 changeTagFilter로만 흐른다", () => {
    expect(clientSource).toContain("onTagFilterChange={changeTagFilter}")
    expect(clientSource).not.toContain("onTagFilterChange={setTagFilter}")
    const start = clientSource.indexOf("const changeTagFilter = useCallback(")
    const block = clientSource.slice(start, clientSource.indexOf("[replaceListParams]", start))
    expect(block).toContain("setTagFilter(tag)")
    expect(block).toContain("replaceListParams({ tag })")
    // 잔존 필터 '해제'도 URL을 같이 비운다.
    const clearStart = clientSource.indexOf("const clearLingeringFilters = useCallback(")
    expect(clientSource.slice(clearStart, clientSource.indexOf("}, [", clearStart))).toContain('changeTagFilter("")')
  })

  it("URL 쓰기는 라우터 경유 replace 하나로, ref를 라우터 호출보다 먼저 갱신한다", () => {
    const start = clientSource.indexOf("const replaceListParams = useCallback(")
    const block = clientSource.slice(start, clientSource.indexOf("[router, pathname, searchParams]", start))
    const refUpdate = block.indexOf("lastTagParamRef.current = parseTagParam(patch.tag)")
    expect(refUpdate).toBeGreaterThan(-1)
    expect(refUpdate).toBeLessThan(block.indexOf("router.replace("))
    expect(block).toContain("patchUnifiedListParams(searchParams.toString(), patch)")
    expect(clientSource).not.toContain("window.history.replaceState")
  })

  it("필터 초기화는 저장 뷰·라벨 URL을 한 번의 replace로 비운다", () => {
    const start = clientSource.indexOf("const resetFilters = useCallback(")
    const block = clientSource.slice(start, clientSource.indexOf("}, [", start))
    expect(block).toContain('replaceListParams({ view: "all", tag: "" })')
    expect(block).not.toContain("syncViewParam(")
  })
})
