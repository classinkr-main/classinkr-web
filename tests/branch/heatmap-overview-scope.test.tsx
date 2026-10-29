import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ useBranchJson: vi.fn() }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock("@/components/admin/branch/client-api", () => ({ useBranchJson: mocks.useBranchJson }))

import BranchRegionHeatmap from "@/components/admin/branch/sections/BranchRegionHeatmap"

describe("overview heatmap isolation", () => {
  beforeEach(() => {
    mocks.useBranchJson.mockReset().mockReturnValue({ data: { rows: [] }, loading: false, error: null, stale: false, staleSince: null })
  })

  it("개인 데이터만 캐시 없이 조회하고 전체 CRM 지도 렌즈를 비활성화한다", () => {
    renderToStaticMarkup(createElement(BranchRegionHeatmap, {
      team: "ALL", period: "Y", selectedMonth: "", refreshKey: 0, manager: "__me",
      includeMapSource: false, syncSelectionToUrl: false, noStore: true,
    }))
    expect(mocks.useBranchJson.mock.calls[0][0]).toContain("manager=__me")
    expect(mocks.useBranchJson.mock.calls[0][2]).toEqual({ noStore: true })
    expect(mocks.useBranchJson.mock.calls[1][0]).toContain("/heatmap/map-source")
    expect(mocks.useBranchJson.mock.calls[1][2]).toEqual({ enabled: false })
  })
})
