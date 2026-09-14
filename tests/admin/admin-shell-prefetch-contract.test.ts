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
    // 2026-09-10 2라운드(스트리밍 전환) — 공용 top-level generatedAt 필드는 없어지고,
    // 여섯 소스 각자가 openPrefetchLane이 돌려주는 DeferredPrefetch<T>(자기 generatedAt
    // 포함)를 그대로 들고 있다. T3 계약(값이 실제로 개시된 시각)은 레인을 연 시각으로
    // 동일하게 유지된다(lib/admin/prefetch-budget.ts의 openPrefetchLane 참고).
    expect(overviewPrefetch).toContain("openPrefetchLane")
    expect(overviewPrefetch).toContain("DeferredPrefetch")
    expect(overviewPrefetch).not.toMatch(/import\s*\{\s*settleWithinBudget\s*\}/)
  })

  it("lib/admin/crm/home-prefetch.ts", () => {
    // 2026-09-10 2라운드 — 역할 부족·미검증이면 이제 EMPTY_INITIAL_DATA(generatedAt: 0)가
    // 아니라 null을 돌려준다(CrmHomeClient가 이미 optional 계약이었어서 더 단순한 쪽을
    // 택했다 — Overview는 반대로 소비처가 non-null을 기대해 "항상 값, 필드만 비어있음"
    // 모양을 유지했다. 두 파일이 다른 원칙을 쓰는 게 아니라 각자의 기존 소비처 계약에
    // 맞춘 것 — 상세 근거는 각 파일 JSDoc 참고).
    expect(crmHomePrefetch).toContain("openPrefetchLane")
    expect(crmHomePrefetch).toContain("DeferredPrefetch")
    expect(crmHomePrefetch).not.toMatch(/import\s*\{\s*settleWithinBudget\s*\}/)
  })

  it("app/admin/branch/page.tsx", () => {
    // 횡단 인프라 개편(2026-09-10 스트리밍 전환) — KR Team도 openPrefetchLane으로 옮겨갔다.
    // generatedAt 계산은 page.tsx가 아니라 lib/admin/prefetch-budget.ts의 openPrefetchLane
    // 내부(레인을 연 시각)로 이동했다 — T3 계약(값이 실제로 개시된 시각)은 그대로 지켜진다.
    expect(branchPage).toContain("openPrefetchLane(prefetchBranchSummary)")
    expect(branchPage).toContain("generatedAt: lane.generatedAt")
    expect(branchPage).not.toMatch(/import\s*\{\s*settleWithinBudget\s*\}/)
  })

  it("app/admin/branch/ledger/page.tsx", () => {
    // 횡단 인프라 개편(2026-09-10 스트리밍 전환) — 장부도 openPrefetchLane으로 옮겨갔다.
    expect(ledgerPage).toContain("openPrefetchLane(prefetchLedgerRows)")
    expect(ledgerPage).toContain("generatedAt: lane.generatedAt")
    expect(ledgerPage).not.toMatch(/import\s*\{\s*settleWithinBudget\s*\}/)
  })

  it("app/admin/hardware/page.tsx", () => {
    // 횡단 인프라 개편(2026-09-10 스트리밍 전환) — 하드웨어는 openPrefetchLane으로 옮겨갔다.
    // generatedAt 계산 자체는 page.tsx가 아니라 lib/admin/prefetch-budget.ts의 openPrefetchLane
    // 내부(레인을 연 시각)로 이동했고, page.tsx는 그 값을 그대로 클라이언트에 넘기기만 한다 —
    // T3 계약(값이 실제로 개시/계산된 시각)은 여전히 지켜진다(lib/admin/prefetch-budget.ts 참고).
    expect(hardwarePage).toContain("openPrefetchLane(prefetchHardwareDashboard)")
    // (구현 코멘트가 예전 함수명을 설명 목적으로 언급할 수 있어 import문 자체만 부재를 확인한다)
    expect(hardwarePage).not.toMatch(/import\s*\{\s*settleWithinBudget\s*\}/)
  })
})

// 횡단 인프라 개편(2026-09-10 스트리밍 전환) — KR Team·장부·하드웨어 3개 페이지가 첫 바이트를
// 소스에 기다리지 않는다는 것을 소스 계약으로 고정한다(구현 지시 §9). 이 저장소엔
// @testing-library/react가 없어(tests/admin/overview-speed-round-2026-09-10.test.ts 코멘트
// 참고) 실제 렌더 대신 "await 없는 non-async page 함수 + Suspense 경계"라는 구조적 신호로
// 대신 고정한다 — 이 신호가 깨지면(누군가 다시 await settleWithinBudget으로 되돌리면) 세
// 페이지 모두 TTFB가 다시 콜드 소스에 종속된다.
describe("KR Team·장부·하드웨어 — 첫 바이트가 소스를 기다리지 않는다(스트리밍 전환)", () => {
  const pages: Array<[string, string, string, string]> = [
    ["app/admin/branch/page.tsx", branchPage, "BranchDashboardPage", "BranchDashboardClient"],
    ["app/admin/branch/ledger/page.tsx", ledgerPage, "BranchSalesLedgerPage", "SalesLedgerWorkbench"],
    ["app/admin/hardware/page.tsx", hardwarePage, "AdminHardwarePage", "HardwareInventoryClient"],
  ]

  it.each(pages)("%s — export default function(비동기 아님) + Suspense(AdminRouteLoading) 경계", (_path, source, exportName, clientName) => {
    // async가 아니다 — 이 함수 안에 await가 하나라도 남아있으면 그 await가 끝날 때까지
    // React가 이 세그먼트의 어떤 출력도 스트리밍을 시작할 수 없다(RSC 렌더 규칙). 검증(빠른
    // 쿠키 확인)은 각 소스의 run() 콜백(위의 별도 prefetchXxx 헬퍼) 안으로 옮겨갔으므로
    // exported 함수 자체는 동기다 — 그래서 아래는 파일 전체가 아니라 그 함수 "본문"만 자른다.
    const exportIdx = source.indexOf(`export default function ${exportName}()`)
    expect(exportIdx).toBeGreaterThan(-1)
    expect(source).not.toContain(`export default async function ${exportName}()`)
    const pageFnBody = source.slice(exportIdx)
    // openPrefetchLane 호출과 클라이언트 컴포넌트 렌더 사이에 await가 없다 — 즉시 반환.
    expect(pageFnBody).not.toMatch(/\bawait\b/)
    // 부모가 기존 라우트 스켈레톤(AdminRouteLoading)을 그대로 재사용해 새 로딩 UI를 발명하지
    // 않는다 — 화면 전체를 감싸는 단일 Suspense 경계(소스가 1개뿐이라 더 쪼갤 필요가 없다).
    expect(pageFnBody).toMatch(new RegExp(`<Suspense fallback=\\{<AdminRouteLoading\\s*/>\\}>[\\s\\S]*<${clientName}[\\s\\S]*</Suspense>`))
  })
})

describe("소비 컴포넌트가 isPrefetchFresh로 신선도를 판정한다(T3)", () => {
  // 2026-09-10 2라운드 — Overview는 소스 6개, CRM 홈은 3개가 각자 독립 레인으로 바뀌면서
  // "화면당 한 번" 신선도 판정 대신 "소스마다" 판정한다. Overview는 isPrefetchFresh를 직접
  // (shouldUsePrefetchedSource 경유 없이) 6번 부른다. CRM 홈은 기존 seedAdminRequestCache
  // 캐시-TTL 경로를 그대로 재사용해 소스별 generatedAt만 그 자리에 흘려보낸다(별도
  // isPrefetchFresh 호출 없이도 캐시 자체의 ttlMs/staleWhileRevalidateMs가 신선도를 대신
  // 판정 — CrmHomeClient는 원래도 이 경로였다).
  const consumers: Array<[string, string]> = [
    ["app/admin/overview/OverviewClient.tsx", "isPrefetchFresh"],
    ["components/admin/crm/home/CrmHomeClient.tsx", "initialData?.leadActionKpis.generatedAt"],
    ["components/admin/branch/BranchDashboardClient.tsx", "isPrefetchFresh"],
    ["components/admin/branch/SalesLedgerWorkbench.tsx", "isPrefetchFresh"],
    ["components/admin/hardware/HardwareInventoryClient.tsx", "isPrefetchFresh"],
  ]

  it.each(consumers)("%s references %s", (path, needle) => {
    const source = readFileSync(join(process.cwd(), path), "utf8")
    expect(source).toContain(needle)
  })
})
