import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const heatmapRoute = readFileSync(
  join(process.cwd(), "app/api/admin/branch/heatmap/route.ts"),
  "utf8"
)
const heatmapMapSourceRoute = readFileSync(
  join(process.cwd(), "app/api/admin/branch/heatmap/map-source/route.ts"),
  "utf8"
)
const heatmapClient = readFileSync(
  join(process.cwd(), "components/admin/branch/sections/BranchRegionHeatmap.tsx"),
  "utf8"
)
const mapSourceRepository = readFileSync(
  join(process.cwd(), "lib/repositories/crm-naver-map.ts"),
  "utf8"
)
const mapSourceClient = readFileSync(
  join(process.cwd(), "components/admin/crm/CrmNaverMapSourceClient.tsx"),
  "utf8"
)

describe("KR 히트맵 ↔ CRM 지도 원천 연결", () => {
  it("REV 히트맵 응답이 무거운 CRM 지도 매칭을 기다리지 않는다", () => {
    expect(heatmapRoute).not.toContain("listCrmNaverMapSource")
    expect(heatmapRoute).toContain("return adminCachedJson({ rows })")
  })

  it("지도 요약은 별도 API에서 읽고 실패를 REV 오류로 승격하지 않는다", () => {
    expect(heatmapMapSourceRoute).toContain("listCrmNaverMapSource()")
    expect(heatmapMapSourceRoute).toContain('status: "unavailable" as const')
    expect(heatmapMapSourceRoute).toContain("REV 매출 히트맵만 표시합니다.")
  })

  it("화면은 REV와 지도 요약 요청을 독립적으로 시작하고 지도 로딩 상태를 구분한다", () => {
    expect(heatmapClient).toContain('useBranchJson<HeatmapMapSource>(\n    "/api/admin/branch/heatmap/map-source"')
    expect(heatmapClient).toContain("CRM 지도 기회를 병렬로 불러오는 중입니다.")
    expect(heatmapClient).toContain("loading={mapSourceRequest.loading}")
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

  it("지도 전체 매칭은 단기 캐시·동시 요청 병합을 쓰고 mutation 때 무효화한다", () => {
    expect(mapSourceRepository).toContain("MAP_SOURCE_LIST_CACHE_TTL_MS = 45_000")
    expect(mapSourceRepository).toContain("mapSourceListInFlight")
    expect(mapSourceRepository).toContain("invalidateCrmNaverMapSourceCache()")
    expect(mapSourceRepository.match(/invalidateCrmNaverMapSourceCache\(\)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(mapSourceClient).toContain('clearAdminRequestCache("/api/admin/branch/heatmap/map-source")')
  })

  it("지도 목록의 오프스크린 카드는 초기 레이아웃·페인트를 지연한다", () => {
    expect(mapSourceClient).toContain("[content-visibility:auto]")
    expect(mapSourceClient).toContain("[contain-intrinsic-size:auto_210px]")
    expect(mapSourceClient).toContain("const MapSourceRow = memo(")
  })
})
