/**
 * 지역 지도 패널의 부분 지도(원천 실패·절단) 표시와 갱신 경로 — 2026-10-19 09-mooni 병합 검토 후속.
 *
 * 서버는 첫 읽기(캐시 경로)에서 실패·절단 레이어에 failed·truncated 표시를 단 지도를 200으로 돌려준다. 화면이 이 표시를
 * 읽지 않으면 실패한 원천이 '0 / 0 · 0%'·'커버리지 0% — 표본 데이터'로, 즉 실제 0건처럼 보인다. 그래서
 *  - 레이어 탭·커버리지 바는 failed 를 "모름"(숫자 대신 —), truncated 를 "부분값"으로 보인다.
 *  - 부분 지도는 요청 캐시에 남기지 않는다(서버 no-store 와 같은 판정).
 *  - force(?force=1)는 화면에 완전한 분포가 있을 때만 — 오류 화면의 '다시 시도'·60초 갱신이 force 로 던져지는
 *    오류에 갇히지 않게 캐시 경로로 부른다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  LayerTab,
  RegionCoverageBar,
  dropIncompleteRegionMap,
  regionCountText,
  regionMapRefreshUrl,
} from "@/components/admin/crm/map/CrmRegionMapPanel"
import { emptyRegionTally, tallyRegionValue, toRegionLayer, type CrmRegionLayer } from "@/lib/crm/region-map-summary"
import type { CrmRegionMap } from "@/lib/repositories/crm-region-map"

function layerWith(state: { failed?: boolean; truncated?: boolean } = {}): CrmRegionLayer {
  const tally = emptyRegionTally()
  if (!state.failed) {
    for (let i = 0; i < 3; i++) tallyRegionValue(tally, "서울", { id: `s${i}`, name: `서울 학원${i}` })
    tallyRegionValue(tally, null, { id: "u", name: "미상 학원" })
  }
  return toRegionLayer("customer", "고객", "NEO 고객 계정", tally, [], { ...state, rowLimit: 50_000 })
}

function mapWith(...layers: CrmRegionLayer[]): CrmRegionMap {
  return { generatedAt: "2026-10-19T00:00:00.000Z", provinces: ["서울"], layers, topCustomersByRegion: {}, ownerStats: {} }
}

const renderTab = (layer: CrmRegionLayer) =>
  renderToStaticMarkup(createElement(LayerTab, { layer, active: false, onSelect: () => undefined }))
const renderBar = (layer: CrmRegionLayer) => renderToStaticMarkup(createElement(RegionCoverageBar, { layer }))

describe("지역 지도 — 원천 실패 레이어는 0건이 아니라 모름", () => {
  it("레이어 탭: failed 는 '모름' 배지와 '원천 조회 실패' — '0 / 0 · 0%'를 그리지 않는다", () => {
    const html = renderTab(layerWith({ failed: true }))
    expect(html).toContain("모름")
    expect(html).toContain("원천 조회 실패")
    expect(html).not.toMatch(/0 \/ 0/)
    expect(html).not.toMatch(/\b0%/)
  })

  it("레이어 탭: truncated 는 '부분값' 배지 + 받은 만큼의 숫자", () => {
    const html = renderTab(layerWith({ truncated: true }))
    expect(html).toContain("부분값")
    expect(html).toMatch(/3 \/ 4/)
    expect(html).not.toContain("모름")
  })

  it("레이어 탭: 정상 레이어에는 상태 배지가 없다", () => {
    const html = renderTab(layerWith())
    expect(html).toMatch(/3 \/ 4/)
    expect(html).not.toContain("모름")
    expect(html).not.toContain("부분값")
  })

  it("커버리지 바: failed 는 숫자 대신 —, '커버리지 0% — 표본 데이터'가 아니라 모름 안내", () => {
    const html = renderBar(layerWith({ failed: true }))
    expect(html).toContain("모름 · 원천을 읽지 못했습니다(0건이 아닙니다)")
    expect(html).not.toContain("표본 데이터")
    expect(html).not.toContain("커버리지 0%")
    expect(html).not.toMatch(/>0<\/strong>/)
  })

  it("커버리지 바: truncated 는 '부분값' 안내를 커버리지와 함께 단다", () => {
    const html = renderBar(layerWith({ truncated: true }))
    expect(html).toContain("부분값 · 조회 상한에 걸려 일부만 셌습니다")
    expect(html).toContain("커버리지 75%")
    expect(html).not.toContain("모름")
  })

  it("건수 표기는 failed 레이어에서만 —", () => {
    expect(regionCountText({ failed: true }, 0)).toBe("—")
    expect(regionCountText({}, 1234)).toBe("1,234")
  })
})

describe("지역 지도 — 부분 지도의 캐시와 갱신 경로", () => {
  it("화면에 분포가 없거나 부분 지도면 캐시 경로, 완전한 분포가 있을 때만 force", () => {
    expect(regionMapRefreshUrl(null)).toBe("/api/admin/crm/region-map")
    expect(regionMapRefreshUrl(mapWith(layerWith(), layerWith({ failed: true })))).toBe("/api/admin/crm/region-map")
    expect(regionMapRefreshUrl(mapWith(layerWith({ truncated: true })))).toBe("/api/admin/crm/region-map")
    expect(regionMapRefreshUrl(mapWith(layerWith(), layerWith()))).toBe("/api/admin/crm/region-map?force=1")
  })

  it("부분 지도만 요청 캐시에서 지운다", () => {
    const clear = vi.fn()
    expect(dropIncompleteRegionMap(mapWith(layerWith({ failed: true })), clear)).toBe(true)
    expect(clear).toHaveBeenCalledWith("/api/admin/crm/region-map:owner-scope-v1")
    clear.mockClear()
    expect(dropIncompleteRegionMap(mapWith(layerWith()), clear)).toBe(false)
    expect(dropIncompleteRegionMap(null, clear)).toBe(false)
    expect(clear).not.toHaveBeenCalled()
  })

  it("새로고침·60초 갱신·'다시 시도'는 regionMapRefreshUrl 로 주소를 고른다(고정 ?force=1 금지)", () => {
    const source = readFileSync(join(process.cwd(), "components/admin/crm/map/CrmRegionMapPanel.tsx"), "utf8")
    const start = source.indexOf("const refresh = async () => {")
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf("useVisibleInterval(", start)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)
    expect(body).toMatch(/\bregionMapRefreshUrl\(data\)/)
    expect(body).toMatch(/\bdropIncompleteRegionMap\(next\)/)
    expect(body).not.toMatch(/\$\{ENDPOINT\}\?force=1/)
    // '다시 시도'와 60초 갱신이 같은 refresh 를 부른다.
    expect(source).toMatch(/onClick=\{refresh\}[\s\S]{0,400}다시 시도/)
    expect(source.slice(end, end + 120)).toMatch(/\bvoid refresh\(\)/)
  })
})
