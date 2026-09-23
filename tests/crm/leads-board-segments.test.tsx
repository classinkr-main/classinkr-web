import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// S1(세그먼트 칩)·S2(검색 강화)의 리드 보드 배선 — 골격·딥링크는 SSR로, 이펙트 뒤에서만
// 갈리는 동작(Compass 다운·IME 조합 등)은 jsdom이 없는 이 저장소 관례대로 소스 계약으로 고정한다
// (tests/crm/lead-contact-action-contract.test.ts와 같은 패턴). Compass 판정 자체는
// tests/crm/lead-segments.test.ts가 순수 함수로 이미 덮는다.
// 정본: docs/active/crm-tab-develop-plan-2026-09-12.md §13.2 (S1·S2)
const routerState = vi.hoisted(() => ({ search: "" }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/crm/customers/leads",
  useSearchParams: () => new URLSearchParams(routerState.search),
}))

import LeadsBoardClient from "@/components/admin/crm/leads/LeadsBoardClient"

function render(search = "") {
  routerState.search = search
  return renderToStaticMarkup(<LeadsBoardClient />)
}

// "lead-segment-chips" 컨테이너만 정확히 잘라 본다 — 뒤이은 필터 카드(같은 "전체" 라벨과
// aria-pressed를 쓴다)까지 함께 세어 우연히 맞아떨어지는 검증을 피한다. 컨테이너 안에는
// <button>/<span>만 있고 중첩 <div>가 없으므로, 여는 태그 뒤 첫 </div>가 곧 닫는 태그다.
function segmentChipsHtml(html: string) {
  const idAttrIdx = html.indexOf('id="lead-segment-chips"')
  expect(idAttrIdx).toBeGreaterThan(-1)
  const containerStart = html.lastIndexOf("<div", idAttrIdx)
  const closeIdx = html.indexOf("</div>", idAttrIdx)
  expect(closeIdx).toBeGreaterThan(-1)
  return html.slice(containerStart, closeIdx + "</div>".length)
}

beforeEach(() => {
  routerState.search = ""
})

describe("세그먼트 칩 골격 (SSR)", () => {
  it("role=group aria-label과 5개 칩(전체·메타 광고·인계·기존·고객)이 선다", () => {
    const chips = segmentChipsHtml(render())
    expect(chips).toContain('role="group"')
    expect(chips).toContain('aria-label="리드 세그먼트"')
    for (const label of ["전체", "메타 광고", "인계", "기존", "고객"]) {
      expect(chips).toContain(label)
    }
    expect(chips.split("<button").length - 1).toBe(5)
  })

  it("기본값(all)은 전체 칩만 눌려 있다 — 나머지 4개는 해제 상태", () => {
    const chips = segmentChipsHtml(render())
    // 전체 칩은 aria-pressed="true", 나머지 4개는 false.
    expect(chips.match(/aria-pressed="true"/g)?.length).toBe(1)
    expect(chips.match(/aria-pressed="false"/g)?.length).toBe(4)
  })

  it("Compass가 아직 끊기지 않은 기본 렌더에서는 인계·기존 칩이 비활성화되지 않는다", () => {
    const chips = segmentChipsHtml(render())
    expect(chips).not.toContain("disabled")
    expect(chips).not.toContain("연결 끊김")
  })
})

describe("세그먼트 딥링크", () => {
  it("?segment=meta_ads 로 들어오면 그 칩만 aria-pressed=true다", () => {
    const chips = segmentChipsHtml(render("segment=meta_ads"))
    expect(chips).toMatch(/<button[^>]*aria-pressed="true"[^>]*>메타 광고/)
    expect(chips).toMatch(/<button[^>]*aria-pressed="false"[^>]*>전체/)
  })

  it("모르는 segment 값은 전체로 떨어진다", () => {
    const chips = segmentChipsHtml(render("segment=won"))
    expect(chips).toMatch(/<button[^>]*aria-pressed="true"[^>]*>전체/)
  })

  it("세그먼트가 보드 뷰에도 그대로 적용된다 — 뷰 전환이 상태를 리셋하지 않는다", () => {
    const html = render("view=board&segment=meta_ads")
    expect(html).toContain("리드 파이프라인 보드")
    const chips = segmentChipsHtml(html)
    expect(chips).toMatch(/<button[^>]*aria-pressed="true"[^>]*>메타 광고/)
  })

  it("다른 필터(24h 미응대)와 세그먼트가 함께 유지된다", () => {
    const html = render("filter=unresponded_24h&segment=customer")
    expect(html).toContain("24h+")
    const chips = segmentChipsHtml(html)
    expect(chips).toMatch(/<button[^>]*aria-pressed="true"[^>]*>고객/)
  })
})

describe("세그먼트 캡션 — 중복 없이 기존 캡션에 합친다", () => {
  it("세그먼트만 선택해도 '현재 조건' 캡션이 뜨고 세그먼트 라벨을 담는다", () => {
    const html = render("segment=meta_ads")
    expect(html).toContain("현재 조건 0건")
    expect(html).toContain("세그먼트 ‘메타 광고’")
  })

  it("검색어가 있으면 캡션 리드 문구가 '검색 N건'으로 바뀐다", () => {
    const html = render("q=%EA%B0%95%EB%82%A8")
    expect(html).toContain("검색 0건")
  })

  it("캡션은 한 줄뿐 — '현재 조건'과 '검색' 문구가 동시에 나오지 않는다", () => {
    const html = render("segment=meta_ads&q=%EA%B0%95%EB%82%A8")
    expect(html).toContain("검색 0건")
    expect(html).not.toContain("현재 조건 0건")
  })
})

describe("검색창 — '/' 힌트와 Esc 지우기", () => {
  it("placeholder에 '/' 포커스 힌트가 남아 있다", () => {
    expect(render()).toContain("/ 로 포커스")
  })
})

// jsdom이 없어 keydown/isComposing, fetch 이후의 compass.down 전환은 실제 이벤트로 재현할 수 없다.
// 대신 소스 계약으로 고정한다(위 헤더 코멘트 참조) — Compass 판정 자체는 lead-segments.test.ts가 덮는다.
describe("소스 계약 — SSR로 못 미치는 배선", () => {
  const board = readFileSync(
    join(process.cwd(), "components/admin/crm/leads/LeadsBoardClient.tsx"),
    "utf8"
  )
  const rankingLib = readFileSync(join(process.cwd(), "lib/crm/lead-ranking.ts"), "utf8")

  it("'/' 단축키는 IME 조합 중이면 무시한다", () => {
    expect(board).toContain('if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return')
    expect(board).toContain("if (event.isComposing) return")
  })

  it("검색이 Compass 매칭 리드의 학원명·이름까지 haystack에 얹는다(S2)", () => {
    expect(board).toContain("entry ? [entry.academy, entry.name] : []")
    expect(board).toContain("matchesLeadSearch(lead, searchTokens, { extraTerms: compassSearchTerms(lead) })")
    expect(rankingLib).toContain("extraTerms?: Array<string | null | undefined>")
    expect(rankingLib).toContain("...(options?.extraTerms ?? [])")
  })

  it("기존 buildLeadSearchHaystack/matchesLeadSearch 호출 시그니처(옵션 없이)는 그대로 컴파일된다", () => {
    // lead-ranking.test.ts가 옵션 없는 호출로 그대로 통과하는 것 자체가 이 계약의 런타임 증거다.
    expect(rankingLib).toMatch(/export function buildLeadSearchHaystack\(lead: LeadRecord, options\?: LeadSearchHaystackOptions\)/)
    expect(rankingLib).toMatch(/export function matchesLeadSearch\(lead: LeadRecord, tokens: string\[\], options\?: LeadSearchHaystackOptions\)/)
  })

  it("Compass 다운이면 필터를 통과시키고(무음 0건 금지) 인계·기존 칩을 비활성화한다", () => {
    expect(board).toContain("segmentBlockedByCompassDown ||")
    expect(board).toContain("Compass 연결이 끊겨 인계·기존 리드를 가릴 수 없습니다 — 전체로 표시")
    expect(board).toContain("const compassBlocked = item.needsCompass && compass.down")
    expect(board).toContain("disabled={compassBlocked}")
  })

  it("세그먼트 칩 카운트는 세그먼트만 뺀 나머지 필터 모집단에서 countLeadSegments로 한 번에 낸다", () => {
    expect(board).toContain("const segmentScope = statusFiltered.filter(")
    expect(board).toContain("matchesLeadScopeFilters(lead, scopeCriteria) && matchesSearch(lead)")
    expect(board).toContain("countLeadSegments(segmentScope, (lead) => compass.lookup(lead), compass.down)")
  })

  it("segment 상태가 URL(?segment=)과 왕복 동기화된다", () => {
    expect(board).toContain("readLeadSegmentParam(searchParams.get(LEAD_SEGMENT_PARAM))")
    expect(board).toContain('apply(LEAD_SEGMENT_PARAM, segment, "all")')
  })

  it("보드 모집단(boardPopulation)이 matchesSubFilters를 그대로 쓴다 — 세그먼트가 board에도 적용", () => {
    expect(board).toContain("const boardPopulation = lensLeads.filter((lead) => matchesSubFilters(lead))")
    expect(board).toContain(
      "matchesLeadScopeFilters(lead, scopeCriteria, options) && matchesSearch(lead) && matchesSegmentFor(lead)"
    )
  })

  it("필터 초기화·빈 상태 리셋 버튼이 세그먼트도 함께 되돌린다", () => {
    const resetBlocks = board.match(/setTrackingKey\(null\)\s*\n\s*setSegment\("all"\)/g) ?? []
    expect(resetBlocks.length).toBeGreaterThanOrEqual(2)
  })
})
