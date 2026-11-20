// 견적·문서 화면 안 탭 — 전체 사이드바 계정만 다섯, 간소 계정은 견적서·계약서 둘 (2026-11-20 결정).
//
// 판정은 사이드바와 같은 hasFullAdminNav. 탭 줄에서만 거르고 DOCUMENT_TABS 는 그대로라
// 간소 계정도 ?tab= 주소로는 숨긴 탭의 패널이 열린다(그때는 그 탭이 줄에 남아 현재 위치가 보인다).
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// 패널은 각자 데이터를 불러오는 큰 화면이라 어느 것이 열렸는지만 보이는 대역으로 바꾼다.
vi.mock("@/components/admin/documents/HardwareQuotesPanel", () => ({ default: () => <div data-panel="hardware" /> }))
vi.mock("@/components/admin/documents/SoftwareQuoteCodesPanel", () => ({ default: () => <div data-panel="software" /> }))
vi.mock("@/components/admin/documents/ContractsPanel", () => ({ ContractsPanel: () => <div data-panel="contracts" /> }))
vi.mock("@/components/admin/documents/ReceiptsPanel", () => ({ ReceiptsPanel: () => <div data-panel="receipts" /> }))
vi.mock("@/components/admin/documents/DistributorReceivablesPanel", () => ({
  default: () => <div data-panel="receivables" />,
}))

import QuotesPage from "@/app/admin/quotes/page"
import {
  AdminNavPreferencesProvider,
  type AdminNavPreferencesValue,
} from "@/components/admin/admin-nav-preferences-context"

const SIMPLE: AdminNavPreferencesValue = { role: "ADMIN", navPreset: null, navOverrides: {} }
const FULL_BY_ROLE: AdminNavPreferencesValue = { role: "SUPER_ADMIN", navPreset: null, navOverrides: {} }
const FULL_BY_PRESET: AdminNavPreferencesValue = { role: "ADMIN", navPreset: "super", navOverrides: {} }

function render(value: AdminNavPreferencesValue | null, search = "") {
  // 페이지는 첫 렌더에 window.location.search 로 탭을 정한다(서버에서는 window 가 없어 견적서 탭).
  if (search) vi.stubGlobal("window", { location: { search } })
  const html = renderToStaticMarkup(
    <AdminNavPreferencesProvider value={value}>
      <QuotesPage />
    </AdminNavPreferencesProvider>
  )
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*aria-selected="(true|false)"[^>]*>.*?<\/button>/g)].map(
    (match) => ({
      label: match[0].replace(/<svg.*?<\/svg>/g, "").replace(/<[^>]+>/g, "").trim(),
      selected: match[1] === "true",
    })
  )
  const panels = [...html.matchAll(/data-panel="([a-z]+)"/g)].map((match) => match[1])
  return { tabs, labels: tabs.map((tab) => tab.label), selected: tabs.find((tab) => tab.selected)?.label, panels }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("견적·문서 탭 줄 — 전체 / 간소 계정", () => {
  it("간소 계정은 견적서·계약서 둘만 본다", () => {
    const view = render(SIMPLE)
    expect(view.labels).toEqual(["견적서", "계약서"])
    expect(view.selected).toBe("견적서")
    expect(view.panels).toEqual(["hardware"])
  })

  it("전체 계정(SUPER_ADMIN 또는 nav_preset=super)은 다섯을 모두 본다", () => {
    const all = ["견적서", "SW 견적 코드", "계약서", "영수증", "총판 미수금"]
    expect(render(FULL_BY_ROLE).labels).toEqual(all)
    expect(render(FULL_BY_PRESET).labels).toEqual(all)
  })

  it("세션 확인 전(컨텍스트 없음)은 간소로 읽는다 — 숨길 탭이 잠깐 비쳤다 사라지지 않는다", () => {
    expect(render(null).labels).toEqual(["견적서", "계약서"])
  })

  it("간소 계정이 ?tab=receivables 로 오면 총판 미수금 패널이 열리고, 그 탭이 줄에 남아 현재 위치가 보인다", () => {
    const view = render(SIMPLE, "?tab=receivables")
    expect(view.panels).toEqual(["receivables"])
    expect(view.labels).toEqual(["견적서", "계약서", "총판 미수금"])
    expect(view.selected).toBe("총판 미수금")
  })

  it.each([
    ["?tab=software", "software", "SW 견적 코드"],
    ["?tab=receipts", "receipts", "영수증"],
    ["?tab=distributor", "receivables", "총판 미수금"],
  ])("간소 계정의 %s 도 패널이 열린다", (search, panel, label) => {
    const view = render(SIMPLE, search)
    expect(view.panels).toEqual([panel])
    expect(view.selected).toBe(label)
    // 지금 있는 탭 하나만 더해진다 — 나머지 숨긴 탭은 여전히 줄에 없다.
    expect(view.labels).toHaveLength(3)
  })

  it("탭 정의는 지우지 않고 탭 줄에서만 거른다", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/quotes/page.tsx"), "utf8")
    for (const label of ["견적서", "SW 견적 코드", "계약서", "영수증", "총판 미수금"]) {
      expect(source).toContain(`label: "${label}"`)
    }
    expect(source).toContain("hasFullAdminNav({ role, preset: navPreset })")
  })
})
