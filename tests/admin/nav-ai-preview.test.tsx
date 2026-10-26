import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AdminShellSession } from "@/lib/admin-auth"

// 기획 결정 D13(docs/active/admin-ai-widget-remote-order-plan-2026-09-28.md §9) — 서버 1단계(조회)가
// 붙기 전에는 갈매봇 시안(샘플 데이터)을 운영에 올리지 않는다. 2026-10-19 통합 병합으로 코드는 들어왔고,
// 노출은 NEXT_PUBLIC_ADMIN_AI_PREVIEW === "1" 하나로만 켠다(lib/admin-ai/preview.ts). 이 파일이
// 꺼짐(기본)·켜짐 양쪽에서 런처·도킹 여백·사이드바·⌘K 원천·편집기·/admin/ai 화면을 함께 고정한다.
//
// ADMIN_NAV·DEFAULT_PRIMARY_HREFS 는 모듈을 불러올 때 스위치를 읽으므로(빌드 때 고정되는 값과 같은 모양)
// 스위치를 바꾼 뒤에는 vi.resetModules() 로 새로 불러온다.

const FLAG = "NEXT_PUBLIC_ADMIN_AI_PREVIEW"

const mocks = vi.hoisted(() => ({
  pathname: "/admin/overview",
  // 브라우저에 "열림·옆에 붙임"이 남아 있는 사람 — 꺼짐이면 본문을 밀면 안 된다.
  aiState: { open: true, size: "docked" as const },
  launcherRenders: 0,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  notFound: mocks.notFound,
}))

vi.mock("@/components/admin/ai/use-admin-ai", () => ({
  useAdminAiState: () => mocks.aiState,
  useAdminAiPageContext: () => ({ path: mocks.pathname, label: "Overview" }),
}))

// 런처 본체(패널·단축키)는 이 테스트의 관심이 아니다 — 셸이 올렸는지만 센다.
vi.mock("@/components/admin/ai/AdminAiLauncher", () => ({
  default: function AdminAiLauncherStub() {
    mocks.launcherRenders += 1
    return null
  },
}))

vi.mock("@/components/admin/ai/AdminAiWorkspace", () => ({
  default: function AdminAiWorkspaceStub() {
    return null
  },
}))

const SESSION: AdminShellSession = {
  role: "ADMIN",
  name: "테스터",
  email: "t@classin.com",
  navPreset: null,
  navOverrides: {},
  source: "supabase",
}

async function loadWithFlag(value: string) {
  vi.stubEnv(FLAG, value)
  vi.resetModules()
  const nav = await import("@/components/admin/admin-nav")
  const access = await import("@/components/admin/admin-nav-access")
  const routes = await import("@/components/admin/admin-nav-routes")
  const { default: AdminSidebar } = await import("@/components/admin/AdminSidebar")
  const { default: AdminShell } = await import("@/components/admin/AdminShell")
  const { default: AdminAiPage } = await import("@/app/admin/ai/page")
  return { nav, access, routes, AdminSidebar, AdminShell, AdminAiPage }
}

type Loaded = Awaited<ReturnType<typeof loadWithFlag>>

function renderSidebar({ AdminSidebar }: Loaded) {
  return renderToStaticMarkup(
    <AdminSidebar role="ADMIN" name="테스터" email="t@classin.com" navOverrides={{}} />
  )
}

function renderShell({ AdminShell }: Loaded) {
  mocks.launcherRenders = 0
  const markup = renderToStaticMarkup(
    <AdminShell initialSession={SESSION}>
      <p>본문</p>
    </AdminShell>
  )
  return { markup, launcherRenders: mocks.launcherRenders }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  mocks.notFound.mockClear()
  mocks.pathname = "/admin/overview"
})

describe("isAdminAiPreviewEnabled — 글자 그대로 \"1\" 만 켠다", () => {
  it.each([
    ["", false],
    ["0", false],
    ["true", false],
    [" 1", false],
    ["1", true],
  ])("%j → %s", async (value, expected) => {
    vi.stubEnv(FLAG, value)
    const { isAdminAiPreviewEnabled } = await import("@/lib/admin-ai/preview")
    expect(isAdminAiPreviewEnabled()).toBe(expected)
  })

  it("값이 아예 없으면 꺼짐이다(기본)", async () => {
    vi.stubEnv(FLAG, undefined)
    expect(process.env[FLAG]).toBeUndefined()
    const { isAdminAiPreviewEnabled } = await import("@/lib/admin-ai/preview")
    expect(isAdminAiPreviewEnabled()).toBe(false)
  })
})

describe("꺼짐(기본) — 시안이 운영 화면 어디에도 드러나지 않는다", () => {
  it("ADMIN_NAV·상시 목록에 AI 올인원이 없다 — 17개, 상시 9", async () => {
    const { nav, access } = await loadWithFlag("")
    const hrefs = nav.ADMIN_NAV.map((item) => item.href)
    expect(hrefs).not.toContain("/admin/ai")
    expect(nav.ADMIN_NAV).toHaveLength(17)
    expect(access.DEFAULT_PRIMARY_HREFS).not.toContain("/admin/ai")
    expect(access.DEFAULT_PRIMARY_HREFS).toHaveLength(9)
  })

  it("사이드바 자리·⌘K 원천(accessible)·편집기 행 어디에도 없다", async () => {
    const { access } = await loadWithFlag("")
    const resolved = access.resolveAdminNavAccess({ role: "SUPER_ADMIN", overrides: {} })
    expect(resolved.primary.map((item) => item.href)).toEqual([
      "/admin/overview",
      "/admin/calendar",
      "/admin/branch",
      "/admin/branch/ledger",
      "/admin/crm",
      "/admin/quotes",
      "/admin/hardware",
      "/admin/chatbot",
      "/admin/blog",
    ])
    const accessible = access.getAccessibleAdminNavItems(resolved).map((item) => item.href)
    expect(accessible).toHaveLength(17)
    expect(accessible).not.toContain("/admin/ai")
    const rows = access.buildNavPreferenceRows({ role: "SUPER_ADMIN", overrides: {} })
    expect(rows.map((row) => row.item.href)).not.toContain("/admin/ai")
  })

  it("사이드바가 AI 올인원 링크를 그리지 않는다", async () => {
    const markup = renderSidebar(await loadWithFlag(""))
    expect(markup).toContain('href="/admin/overview"')
    expect(markup).not.toContain('href="/admin/ai"')
    expect(markup).not.toContain("AI 올인원")
  })

  it("셸이 런처를 올리지 않고, 남아 있는 '옆에 붙임' 상태로 본문을 밀지도 않는다", async () => {
    const { markup, launcherRenders } = renderShell(await loadWithFlag(""))
    expect(markup).toContain("본문")
    expect(launcherRenders).toBe(0)
    expect(markup).not.toContain("xl:mr-[420px]")
  })

  it("/admin/ai 화면은 notFound() 다", async () => {
    const { AdminAiPage } = await loadWithFlag("")
    await expect(AdminAiPage({ searchParams: Promise.resolve({ tab: "orders" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    )
    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })
})

describe("켜짐(NEXT_PUBLIC_ADMIN_AI_PREVIEW=1) — 시안 미리보기", () => {
  it("AI 올인원이 Overview 바로 아래 home 범주로 들어온다 — 18개, 범주 연속 블록 유지", async () => {
    const { nav } = await loadWithFlag("1")
    expect(nav.ADMIN_NAV).toHaveLength(18)
    expect(nav.ADMIN_NAV.slice(0, 2).map((item) => item.href)).toEqual(["/admin/overview", "/admin/ai"])
    const ai = nav.ADMIN_NAV[1]
    expect(ai?.category).toBe("home")
    expect(ai?.badge).toBe("시안")
    expect(ai?.maturity).toBe("wip")
    const blocks: string[] = []
    for (const item of nav.ADMIN_NAV) {
      const category = item.category ?? "system"
      if (blocks[blocks.length - 1] !== category) blocks.push(category)
    }
    expect(blocks).toEqual(["home", "customer", "growth", "system"])
  })

  it("상시 10 / 기타 6 / 숨김 2 — 상시 첫 묶음(home)이 Overview·AI 올인원이다", async () => {
    const { access } = await loadWithFlag("1")
    expect(access.DEFAULT_PRIMARY_HREFS).toHaveLength(10)
    expect(access.DEFAULT_PRIMARY_HREFS[1]).toBe("/admin/ai")
    const resolved = access.resolveAdminNavAccess({ role: "ADMIN", overrides: {} })
    expect(resolved.primary).toHaveLength(10)
    expect(resolved.primaryGroups[0]?.items.map((item) => item.href)).toEqual([
      "/admin/overview",
      "/admin/ai",
    ])
    expect(resolved.folded.flatMap((group) => group.items)).toHaveLength(6)
    expect(resolved.hidden).toHaveLength(2)
    expect(access.getAccessibleAdminNavItems(resolved).map((item) => item.href)).toContain("/admin/ai")
  })

  it("/admin/ai 화면이 자기 nav 부모를 갖고, 사이드바가 링크를 그린다", async () => {
    const loaded = await loadWithFlag("1")
    const parentHrefs = loaded.nav.ADMIN_NAV.map((item) => item.href)
    expect(loaded.routes.resolveAdminNavParentHref("/admin/ai", parentHrefs)).toBe("/admin/ai")
    expect(renderSidebar(loaded)).toContain('href="/admin/ai"')
  })

  it("셸이 런처를 올리고, 옆에 붙이면 본문을 그 폭만큼 민다", async () => {
    const { markup, launcherRenders } = renderShell(await loadWithFlag("1"))
    expect(launcherRenders).toBe(1)
    expect(markup).toContain("xl:mr-[420px]")
  })

  it("/admin/ai 화면이 열리고 ?tab= 을 그대로 넘긴다", async () => {
    const { AdminAiPage } = await loadWithFlag("1")
    const element = await AdminAiPage({ searchParams: Promise.resolve({ tab: "orders" }) })
    expect(mocks.notFound).not.toHaveBeenCalled()
    expect((element.props as { initialTab?: string }).initialTab).toBe("orders")
  })
})
