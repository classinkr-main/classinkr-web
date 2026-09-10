import { describe, expect, it } from "vitest"

import { isNavActive, queryMatches, splitNavHref } from "@/components/admin/nav-active"

// nav active 판정은 AdminSidebar에서 nav-active.ts로 추출됐다 —
// CS 콘솔 가로 메뉴(components/admin/cs/CsConsoleNav.tsx)와 같은 판정을 공유한다.
// 이 테스트는 "추출 = 순수 이동"임을 고정한다: 사이드바가 의존하던 3가지 행동
//   (1) 쿼리 딥링크는 path+query가 모두 맞아야 active
//   (2) 쿼리 없는 항목은 같은 경로의 쿼리 딥링크 형제에게 양보
//   (3) 쿼리 없는 항목은 더 깊은 경로 형제에게도 양보
// 이 그대로 유지되는지 검증한다.

/** URLSearchParams는 next/navigation ReadonlyURLSearchParams와 같은 get() 계약을 만족한다. */
const params = (query: string) => new URLSearchParams(query)

describe("splitNavHref", () => {
  it("splits a query deep link into path and query", () => {
    expect(splitNavHref("/admin/docs?tab=gaps")).toEqual({ path: "/admin/docs", query: "tab=gaps" })
  })

  it("returns a null query for a plain path", () => {
    expect(splitNavHref("/admin/docs")).toEqual({ path: "/admin/docs", query: null })
  })

  it("keeps multi-param queries intact", () => {
    expect(splitNavHref("/admin/docs?tab=gaps&source=chatbot")).toEqual({
      path: "/admin/docs",
      query: "tab=gaps&source=chatbot",
    })
  })
})

describe("queryMatches (부분집합 매칭)", () => {
  it("matches when the current URL carries every wanted param", () => {
    expect(queryMatches("tab=gaps", params("tab=gaps&source=chatbot"))).toBe(true)
  })

  it("does not match when a wanted param has a different value", () => {
    expect(queryMatches("tab=gaps", params("tab=documents"))).toBe(false)
  })

  it("does not match when a wanted param is absent", () => {
    expect(queryMatches("tab=gaps", params(""))).toBe(false)
  })

  it("requires every wanted param, not just one", () => {
    expect(queryMatches("tab=gaps&source=chatbot", params("tab=gaps"))).toBe(false)
    expect(queryMatches("tab=gaps&source=chatbot", params("tab=gaps&source=chatbot"))).toBe(true)
  })
})

describe("isNavActive", () => {
  // 사이드바 CS 섹션이 실제로 쓰던 조합 — 가이드 문서(쿼리 없음) vs 보강 큐(쿼리 딥링크).
  const docsSiblings = [{ href: "/admin/docs" }, { href: "/admin/docs?tab=gaps" }]

  it("keeps a query deep link inactive on the bare path", () => {
    expect(
      isNavActive("/admin/docs?tab=gaps", {
        pathname: "/admin/docs",
        searchParams: params(""),
        siblings: docsSiblings,
      })
    ).toBe(false)
  })

  it("activates a query deep link when path and query both match", () => {
    expect(
      isNavActive("/admin/docs?tab=gaps", {
        pathname: "/admin/docs",
        searchParams: params("tab=gaps"),
        siblings: docsSiblings,
      })
    ).toBe(true)
  })

  it("keeps the deep link active when extra params ride along (source 딥링크)", () => {
    expect(
      isNavActive("/admin/docs?tab=gaps", {
        pathname: "/admin/docs",
        searchParams: params("tab=gaps&source=internal_cs"),
        siblings: docsSiblings,
      })
    ).toBe(true)
  })

  it("activates the bare item when no sibling deep link matches", () => {
    expect(
      isNavActive("/admin/docs", {
        pathname: "/admin/docs",
        searchParams: params(""),
        siblings: docsSiblings,
      })
    ).toBe(true)
  })

  it("yields the bare item to a matching sibling deep link on the same path", () => {
    expect(
      isNavActive("/admin/docs", {
        pathname: "/admin/docs",
        searchParams: params("tab=gaps"),
        siblings: docsSiblings,
      })
    ).toBe(false)
  })

  it("stays active on nested routes of the same path", () => {
    expect(
      isNavActive("/admin/docs", {
        pathname: "/admin/docs/new",
        searchParams: params(""),
        siblings: docsSiblings,
      })
    ).toBe(true)
  })

  it("is inactive on an unrelated path", () => {
    expect(
      isNavActive("/admin/docs", {
        pathname: "/admin/chatbot",
        searchParams: params(""),
        siblings: docsSiblings,
      })
    ).toBe(false)
  })

  it.each([
    ["/admin/calendar", "/admin/events"],
    ["/admin/calendar", "/admin/events/new"],
    ["/admin/analytics", "/admin/traffic"],
    ["/admin/chatbot", "/admin/docs"],
    ["/admin/chatbot", "/admin/docs/new"],
    ["/admin/chatbot", "/admin/channel-talk"],
    ["/admin/chatbot", "/admin/cs-chatbot"],
  ])("activates absorbed parent %s on %s", (href, pathname) => {
    expect(
      isNavActive(href, {
        pathname,
        searchParams: params(""),
        siblings: [
          { href: "/admin/calendar" },
          { href: "/admin/analytics" },
          { href: "/admin/chatbot" },
        ],
      })
    ).toBe(true)
  })

  // KR Team(/admin/branch) vs 매출 장부(/admin/branch/ledger) — 동시 하이라이트 방지.
  const branchSiblings = [{ href: "/admin/branch" }, { href: "/admin/branch/ledger" }]

  it("yields a parent path to a deeper sibling route", () => {
    expect(
      isNavActive("/admin/branch", {
        pathname: "/admin/branch/ledger",
        searchParams: params(""),
        siblings: branchSiblings,
      })
    ).toBe(false)
    expect(
      isNavActive("/admin/branch/ledger", {
        pathname: "/admin/branch/ledger",
        searchParams: params(""),
        siblings: branchSiblings,
      })
    ).toBe(true)
  })

  it("keeps the parent active when the deeper sibling route is not open", () => {
    expect(
      isNavActive("/admin/branch", {
        pathname: "/admin/branch",
        searchParams: params(""),
        siblings: branchSiblings,
      })
    ).toBe(true)
  })

  // §5 "가이드 문서 그룹 매핑" — 콘솔은 documents·categories·redirects를 한 메뉴로 묶고,
  // 그 판정을 isNavActive 여러 번 호출로 구성한다(새 매칭 로직을 만들지 않는다).
  it("supports the console's group mapping via multiple hrefs", () => {
    const consoleSiblings = [
      { href: "/admin/docs?tab=documents" },
      { href: "/admin/docs?tab=categories" },
      { href: "/admin/docs?tab=redirects" },
      { href: "/admin/docs" },
      { href: "/admin/docs?tab=gaps" },
      { href: "/admin/docs?tab=quality" },
      { href: "/admin/docs?tab=recommended" },
    ]
    const groupHrefs = [
      "/admin/docs?tab=documents",
      "/admin/docs?tab=categories",
      "/admin/docs?tab=redirects",
      "/admin/docs",
    ]
    const groupActive = (search: string) =>
      groupHrefs.some((href) =>
        isNavActive(href, {
          pathname: "/admin/docs",
          searchParams: params(search),
          siblings: consoleSiblings,
        })
      )

    expect(groupActive("")).toBe(true)
    expect(groupActive("tab=documents")).toBe(true)
    expect(groupActive("tab=categories")).toBe(true)
    expect(groupActive("tab=redirects")).toBe(true)
    expect(groupActive("tab=gaps")).toBe(false)
    expect(groupActive("tab=quality")).toBe(false)
    expect(groupActive("tab=recommended")).toBe(false)
  })
})
