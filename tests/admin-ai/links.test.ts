import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"

import { ADMIN_AI_TOOLS, FORBIDDEN_ORDERS } from "@/lib/admin-ai/order-catalog"
import {
  ADMIN_AI_LINKS,
  findInternalLinkByHref,
  findLinks,
  getLinkById,
  internalHrefOf,
  isRegisteredInternalHref,
  toCustomerUrl,
  type CustomerLink,
  type InternalLink,
} from "@/lib/admin-ai/links"
import { isInternalPath } from "@/lib/internal-path"
import { BROCHURE_URL } from "@/lib/marketing-links"
import { PUBLIC_STATIC_ROUTES } from "@/lib/public-routes"
import { SITE_URL } from "@/lib/seo"

// 링크 목록(lib/admin-ai/links.ts) 시험 — 내비·공개 경로에서 파생된 줄이 실제 화면으로 풀리는지,
// 고객용 줄이 어드민 주소나 다른 도메인으로 새지 않는지, 목록 밖 id 가 거절되는지를 고정한다.

const internal = ADMIN_AI_LINKS.filter((entry): entry is InternalLink => entry.audience === "internal")
const customer = ADMIN_AI_LINKS.filter((entry): entry is CustomerLink => entry.audience === "customer")

function toPosix(path: string) {
  return sep === "/" ? path : path.split(sep).join("/")
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? walk(path) : [toPosix(path)]
  })
}

// app 아래 page.tsx 를 라우트 패턴으로 — [id]·[...slug] 는 낱말 매처, (그룹) 폴더는 주소에서 뺀다.
function pageRoutePatterns(root: string): RegExp[] {
  return walk(join(process.cwd(), root))
    .filter((path) => path.endsWith("/page.tsx"))
    .map((path) => {
      const route = toPosix(relative("app", path)).replace(/\/?page\.tsx$/, "")
      const segments = route
        .split("/")
        .filter((segment) => segment && !/^\(.*\)$/.test(segment))
        .map((segment) => {
          if (/^\[\.\.\..+\]$/.test(segment)) return ".+"
          if (/^\[.+\]$/.test(segment)) return "[^/]+"
          return segment.replace(/[.*+?^${}()|\\]/g, "\\$&")
        })
      return new RegExp(`^/${segments.join("/")}$`)
    })
}

const ADMIN_PAGES = pageRoutePatterns("app/admin")
const SITE_PAGES = pageRoutePatterns("app").filter((pattern) => !pattern.source.startsWith("^/admin"))

const stripQuery = (href: string) => href.split("?")[0]

describe("링크 목록 — 구조", () => {
  it("id 는 겹치지 않고 모든 줄에 audience 와 검색어가 있다", () => {
    const ids = ADMIN_AI_LINKS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of ADMIN_AI_LINKS) {
      expect(["internal", "customer"], entry.id).toContain(entry.audience)
      expect(entry.label.trim(), entry.id).not.toBe("")
      expect(entry.keywords.trim(), entry.id).not.toBe("")
      expect(entry.id, entry.id).toMatch(entry.audience === "internal" ? /^admin:/ : /^public:/)
    }
  })

  it("내부용 href 는 같은 주소가 두 줄로 들어가지 않는다", () => {
    const hrefs = internal.map((entry) => entry.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("내비(ADMIN_NAV)·CRM 하위 탭·팔레트 자식에서 온 줄이 들어 있다", () => {
    for (const id of [
      "admin:crm",
      "admin:quotes",
      "admin:hardware",
      "admin:crm-customers-leads",
      "admin:crm-matching",
      "admin:docs",
      "admin:cs-chatbot",
      "admin:quotes-tab-hardware-action-new",
    ]) {
      expect(getLinkById(id), id).toBeTruthy()
    }
    expect(internal.length).toBeGreaterThanOrEqual(40)
  })
})

describe("링크 목록 — 내부용은 실제 어드민 화면으로 풀린다", () => {
  it("모든 internal href(쿼리 제거)가 app/admin 의 page.tsx 로 해석된다", () => {
    expect(ADMIN_PAGES.length).toBeGreaterThan(40)
    const unresolved = internal
      .filter((entry) => !ADMIN_PAGES.some((pattern) => pattern.test(stripQuery(entry.href))))
      .map((entry) => `${entry.id} → ${entry.href}`)
    expect(unresolved).toEqual([])
  })

  it("내부용 경로는 isInternalPath 가 참이다", () => {
    for (const entry of internal) {
      expect(isInternalPath(stripQuery(entry.href)), entry.id).toBe(true)
    }
  })

  it("회원 관리는 최고 관리자 역할이 필요하다고 알린다", () => {
    expect(getLinkById("admin:settings-tab-members")?.requires).toEqual(["SUPER_ADMIN"])
  })

  it("갈매봇 AI 도구 바로가기와 금지 오더 화면이 모두 목록에 있다", () => {
    for (const tool of ADMIN_AI_TOOLS) {
      expect(isRegisteredInternalHref(tool.href), tool.href).toBe(true)
    }
    for (const entry of FORBIDDEN_ORDERS) {
      expect(entry.href, entry.label).not.toBe("")
      expect(internalHrefOf(entry.linkId), entry.label).toBe(entry.href)
      expect(isRegisteredInternalHref(entry.href), entry.label).toBe(true)
    }
  })
})

describe("링크 목록 — 고객용은 공개 주소만", () => {
  it("모든 customer href 가 공개 page 로 풀린다(소개서 하나는 SITE_URL 밖의 상수)", () => {
    expect(SITE_PAGES.length).toBeGreaterThan(10)
    const pages = customer.filter((entry) => !entry.external)
    expect(pages.length).toBe(PUBLIC_STATIC_ROUTES.length)
    const unresolved = pages
      .filter((entry) => !SITE_PAGES.some((pattern) => pattern.test(entry.href)))
      .map((entry) => `${entry.id} → ${entry.href}`)
    expect(unresolved).toEqual([])
  })

  it("공개 경로는 내부 경로 판정이 거짓이고 어드민·결제·영수증 경로가 없다", () => {
    for (const entry of customer.filter((item) => !item.external)) {
      expect(isInternalPath(entry.href), entry.id).toBe(false)
      expect(entry.href, entry.id).not.toMatch(/^\/(admin|api|checkout|receipt)(\/|$)/)
    }
  })

  it("절대 주소의 호스트는 SITE_URL 하나이고, 예외는 소개서 한 줄뿐이다", () => {
    const siteHost = new URL(SITE_URL).host
    for (const entry of customer.filter((item) => !item.external)) {
      const url = new URL(entry.url)
      expect(url.host, entry.id).toBe(siteHost)
      expect(url.protocol, entry.id).toBe(new URL(SITE_URL).protocol)
      expect(entry.url, entry.id).toBe(toCustomerUrl(entry.href))
    }
    const external = customer.filter((entry) => entry.external)
    expect(external.map((entry) => entry.id)).toEqual(["public:brochure"])
    expect(external[0].url).toBe(BROCHURE_URL)
    expect(external[0].href).toBe(BROCHURE_URL)
  })

  it("고객용 주소에는 어드민 경로·쿼리·토큰이 없다", () => {
    for (const entry of customer) {
      expect(entry.url, entry.id).not.toMatch(/\/admin|token=|[?&]t=/)
    }
  })

  it("가격표는 /pricing 의 고객용 절대 주소다", () => {
    const pricing = getLinkById("public:pricing") as CustomerLink
    expect(pricing).toMatchObject({ audience: "customer", href: "/pricing", label: "가격표" })
    expect(pricing.url).toBe(`${SITE_URL}/pricing`)
  })
})

describe("링크 목록 — 목록 밖 값은 거절", () => {
  it("모르는 id·문자열이 아닌 값·프로토타입 이름은 undefined", () => {
    for (const bad of ["", "admin:nope", "https://evil.example/x", "/admin/crm", "__proto__", "constructor", "toString", 7, null, undefined, {}]) {
      expect(getLinkById(bad), String(bad)).toBeUndefined()
    }
  })

  it("어드민 주소는 목록에 있는 것(쿼리 포함 정확히 일치)만 통과한다", () => {
    expect(isRegisteredInternalHref("/admin/crm")).toBe(true)
    expect(isRegisteredInternalHref("/admin/quotes?tab=hardware&action=new")).toBe(true)
    expect(isRegisteredInternalHref("/admin/crm?x=1")).toBe(false)
    expect(isRegisteredInternalHref("/admin/not-a-page")).toBe(false)
    expect(isRegisteredInternalHref("https://classin.co.kr/admin/crm")).toBe(false)
    expect(isRegisteredInternalHref("javascript:alert(1)")).toBe(false)
    expect(isRegisteredInternalHref(undefined)).toBe(false)
    expect(findInternalLinkByHref("/admin/crm")?.id).toBe("admin:crm")
  })

  it("고객용 id 로는 어드민 주소를 꺼낼 수 없다", () => {
    expect(internalHrefOf("public:pricing")).toBeUndefined()
    expect(internalHrefOf("admin:crm")).toBe("/admin/crm")
  })
})

describe("링크 찾기(결정형 검색)", () => {
  it("'가격표 링크' 는 링크를 청하는 말을 빼고 가격표를 맨 앞에 낸다", () => {
    expect(findLinks("가격표 링크")[0]?.id).toBe("public:pricing")
    expect(findLinks("가격표 링크 알려 줘")[0]?.id).toBe("public:pricing")
  })

  it("소개서는 고객용 소개서 줄을 찾는다", () => {
    expect(findLinks("소개서", { audience: "customer" })[0]?.id).toBe("public:brochure")
  })

  it("audience 로 거르고 limit 을 지킨다", () => {
    const hits = findLinks("견적", { audience: "internal", limit: 3 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThanOrEqual(3)
    expect(hits.every((entry) => entry.audience === "internal")).toBe(true)
  })

  it("견적서 만드는 화면은 빠른 견적 작성이 나온다", () => {
    expect(findLinks("견적 작성", { audience: "internal" }).map((entry) => entry.id)).toContain(
      "admin:quotes-tab-hardware-action-new"
    )
  })

  it("낱말이 없거나 청하는 말뿐이면 빈 목록, 없는 낱말도 빈 목록", () => {
    expect(findLinks("")).toEqual([])
    expect(findLinks("링크 알려 줘")).toEqual([])
    expect(findLinks("zzzz없는낱말")).toEqual([])
  })
})

describe("공개 정적 경로 — sitemap 과 같은 집합", () => {
  it("lib/public-routes.ts 의 경로 집합은 app/sitemap.ts 의 staticRoutes 와 같다", () => {
    const source = readFileSync(join(process.cwd(), "app/sitemap.ts"), "utf8")
    const block = source.slice(source.indexOf("const staticRoutes"), source.indexOf("export const revalidate"))
    const fromSitemap = Array.from(block.matchAll(/\{\s*path:\s*"([^"]+)"/g), (match) => match[1])
    expect(fromSitemap.length).toBeGreaterThan(20)
    expect([...PUBLIC_STATIC_ROUTES.map((route) => route.path)].sort()).toEqual([...fromSitemap].sort())
  })

  it("경로는 겹치지 않고 사람이 읽는 이름과 검색어가 있다", () => {
    const paths = PUBLIC_STATIC_ROUTES.map((route) => route.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const route of PUBLIC_STATIC_ROUTES) {
      expect(route.path.startsWith("/"), route.path).toBe(true)
      expect(route.label.trim(), route.path).not.toBe("")
      expect(route.keywords.trim(), route.path).not.toBe("")
    }
  })
})
