import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const heatmapRoute = readFileSync(
  join(process.cwd(), "app/api/admin/branch/heatmap/route.ts"),
  "utf8"
)
const heatmapClient = readFileSync(
  join(process.cwd(), "components/admin/branch/sections/BranchRegionHeatmap.tsx"),
  "utf8"
)
const mapSourceClient = readFileSync(
  join(process.cwd(), "components/admin/crm/CrmNaverMapSourceClient.tsx"),
  "utf8"
)

describe("KR 히트맵 ↔ CRM 지도 원천 연결", () => {
  it("지도 원천 실패를 REV 히트맵 실패로 승격하지 않는다", () => {
    expect(heatmapRoute).toContain("Promise.allSettled")
    expect(heatmapRoute).toContain('status: "unavailable" as const')
    expect(heatmapRoute).toContain("REV 매출 히트맵만 표시합니다.")
  })

  it("히트맵 응답에 지도 지역 집계를 포함한다", () => {
    expect(heatmapRoute).toContain("listCrmNaverMapSource()")
    expect(heatmapRoute).toContain("summary: mapSourceResult.value.summary")
    expect(heatmapRoute).toContain("return adminCachedJson({ rows, mapSource })")
  })

  it("선택한 지역을 지도 원천 검수 딥링크로 전달한다", () => {
    expect(heatmapClient).toContain("/admin/crm/customers/map?region=")
    expect(heatmapClient).toContain("url.searchParams.set(\"region\", label)")
    expect(heatmapClient).toContain("<RegionMapSourcePanel")
  })

  it("지도 원천은 지역 쿼리를 적용하고 같은 지역의 KR 히트맵으로 돌아간다", () => {
    expect(mapSourceClient).toContain('normalizeRegionLabel(searchParams.get("region"))')
    expect(mapSourceClient).toContain("/admin/branch?tab=heatmap")
    expect(mapSourceClient).toContain('url.searchParams.set("region", region)')
  })
})
