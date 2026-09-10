import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Admin 속도 레버 A(탭 재방문·hover 프리페치의 RSC 왕복 제거) 소스 계약.
//
// /admin은 layout.tsx가 force-dynamic이라 전 페이지가 dynamic이다. next.config.ts의
// staleTimes.dynamic=180이 클라이언트 라우터 캐시에 그 RSC 응답을 180초 보관하게 하고,
// AdminSidebar/CrmSubnav의 hover FULL 프리페치가 그 서버 왕복을 클릭 이전으로 앞당긴다.
// 재사용된 payload는 각 서버 프리페치 모듈의 generatedAt으로 신선도를 표시해야
// isPrefetchFresh(lib/admin/prefetch-freshness.ts)가 판정할 수 있다.
//
// 이 테스트가 실제로 8개가 아니라 5개 모듈만 검사하는 이유: app/admin/crm/matching·
// app/admin/crm/capture는 page.tsx가 URL 파라미터만 클라이언트로 넘기고 서버 데이터
// 프리페치를 하지 않는다(initialData 없음). app/admin/crm/deals/kpi는 서버에서 데이터를
// 만들긴 하지만(listPartnerWorkspacesData) settleWithinBudget/CLICK_SKIP_WARMUP_URLS
// 체계 밖의 다른 파트(lib/partners-data.ts) 소유라 이 레버의 범위에 넣지 않았다 —
// 커밋 메시지·PR 설명에 근거를 남긴다.

const nextConfig = readFileSync(join(process.cwd(), "next.config.ts"), "utf8")
const sidebar = readFileSync(join(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8")
const crmSubnav = readFileSync(join(process.cwd(), "components/admin/crm/CrmSubnav.tsx"), "utf8")
const overviewPrefetch = readFileSync(join(process.cwd(), "lib/admin/overview/prefetch.ts"), "utf8")
const crmHomePrefetch = readFileSync(join(process.cwd(), "lib/admin/crm/home-prefetch.ts"), "utf8")
const branchPage = readFileSync(join(process.cwd(), "app/admin/branch/page.tsx"), "utf8")
const ledgerPage = readFileSync(join(process.cwd(), "app/admin/branch/ledger/page.tsx"), "utf8")
const hardwarePage = readFileSync(join(process.cwd(), "app/admin/hardware/page.tsx"), "utf8")

describe("next.config.ts — staleTimes.dynamic", () => {
  it("declares experimental.staleTimes with dynamic: 180", () => {
    expect(nextConfig).toContain("staleTimes:")
    expect(nextConfig).toContain("dynamic: 180")
  })

  it("does not remove the existing optimizePackageImports config", () => {
    expect(nextConfig).toContain('optimizePackageImports: ["framer-motion", "lucide-react"]')
  })
})

describe("AdminSidebar.tsx — hover FULL prefetch", () => {
  it("imports the runtime PrefetchKind enum", () => {
    expect(sidebar).toContain(
      'import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"'
    )
  })

  it("calls router.prefetch with PrefetchKind.FULL", () => {
    expect(sidebar).toMatch(/router\.prefetch\(\s*href\s*,\s*\{\s*kind:\s*PrefetchKind\.FULL\s*\}\s*\)/)
  })

  it("does not fire the FULL prefetch on click", () => {
    const fnStart = sidebar.indexOf("const warmAdminTab = useCallback(")
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = sidebar.slice(fnStart, sidebar.indexOf("\n  }, [prefetchAdminRoute, prefetchAdminRouteFull])"))
    expect(fnBody).toContain('if (trigger !== "click")')
  })

  it("keeps the once-per-href AUTO prefetch (prefetchedHrefs) untouched by the new FULL throttle", () => {
    expect(sidebar).toContain("const prefetchedHrefs = useRef(new Set<string>())")
    expect(sidebar).toContain("const fullPrefetchThrottleRef = useRef(new Map<string, number>())")
  })
})

describe("CrmSubnav.tsx — hover FULL prefetch", () => {
  it("imports PrefetchKind and useRouter, and calls router.prefetch with FULL", () => {
    expect(crmSubnav).toContain(
      'import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"'
    )
    expect(crmSubnav).toContain("useRouter")
    expect(crmSubnav).toMatch(/router\.prefetch\(\s*href\s*,\s*\{\s*kind:\s*PrefetchKind\.FULL\s*\}\s*\)/)
  })

  it("keeps warming the shared NAV_WARMUP_REQUESTS table (SSOT), not a local copy", () => {
    expect(crmSubnav).toContain("NAV_WARMUP_REQUESTS")
    expect(crmSubnav).not.toContain("SUBTAB_WARMUP_REQUESTS")
  })
})

describe("서버 프리페치 모듈의 generatedAt(T3) — 5개 예산제 프리페치", () => {
  it("lib/admin/overview/prefetch.ts", () => {
    expect(overviewPrefetch).toContain("generatedAt: number")
    expect(overviewPrefetch).toContain("generatedAt: 0")
    expect(overviewPrefetch).toContain("generatedAt: Date.now()")
  })

  it("lib/admin/crm/home-prefetch.ts", () => {
    expect(crmHomePrefetch).toContain("generatedAt: number")
    expect(crmHomePrefetch).toContain("generatedAt: 0")
    expect(crmHomePrefetch).toContain("generatedAt: Date.now()")
  })

  it("app/admin/branch/page.tsx", () => {
    expect(branchPage).toContain("generatedAt: Date.now()")
  })

  it("app/admin/branch/ledger/page.tsx", () => {
    expect(ledgerPage).toContain("generatedAt: Date.now()")
  })

  it("app/admin/hardware/page.tsx", () => {
    expect(hardwarePage).toContain("generatedAt: Date.now()")
  })
})

describe("소비 컴포넌트가 isPrefetchFresh로 신선도를 판정한다(T3)", () => {
  const consumers: Array<[string, string]> = [
    ["app/admin/overview/OverviewClient.tsx", "shouldUsePrefetchedSource"],
    ["components/admin/crm/home/CrmHomeClient.tsx", "generatedAt: initialData.generatedAt"],
    ["components/admin/branch/BranchDashboardClient.tsx", "isPrefetchFresh"],
    ["components/admin/branch/SalesLedgerWorkbench.tsx", "isPrefetchFresh"],
    ["components/admin/hardware/HardwareInventoryClient.tsx", "isPrefetchFresh"],
  ]

  it.each(consumers)("%s references %s", (path, needle) => {
    const source = readFileSync(join(process.cwd(), path), "utf8")
    expect(source).toContain(needle)
  })
})
