import { describe, expect, it } from "vitest"

import {
  EMPTY_COMPASS_DEMO_SOURCE,
  hydrateCompassDemoSource,
  serializeCompassDemoSource,
  type CompassDemoSource,
} from "@/lib/crm/compass-demo-signal"

// Data Cache(unstable_cache)는 값을 JSON으로 저장한다. Map이 든 CompassDemoSource를 그대로
// 캐시하면 적중 뒤 `.get is not a function`으로 우선순위 큐가 500을 냈다(2026-09-04).
// 캐시 경계의 직렬화/복원이 JSON 왕복을 견디는지 고정한다.
describe("CompassDemoSource ↔ JSON", () => {
  it("JSON 왕복 뒤에도 Map이 복원된다", () => {
    const source: CompassDemoSource = {
      demos: [{ id: 1, lead_id: 10, day: "2026-09-04", time: "10:00", title: "데모" } as unknown as CompassDemoSource["demos"][number]],
      phoneKeysByCompassLeadId: new Map([[10, ["01012345678"]]]),
      down: false,
    }
    const roundTripped = JSON.parse(JSON.stringify(serializeCompassDemoSource(source)))
    const hydrated = hydrateCompassDemoSource(roundTripped)
    expect(hydrated.phoneKeysByCompassLeadId).toBeInstanceOf(Map)
    expect(hydrated.phoneKeysByCompassLeadId.get(10)).toEqual(["01012345678"])
    expect(hydrated.demos).toHaveLength(1)
    expect(hydrated.down).toBe(false)
  })

  it("JSON 왕복으로 `{}`가 된 옛 캐시 엔트리도 빈 Map으로 복원한다(500 방지)", () => {
    const legacy = JSON.parse(JSON.stringify(EMPTY_COMPASS_DEMO_SOURCE)) // Map → {}
    const hydrated = hydrateCompassDemoSource(legacy)
    expect(hydrated.phoneKeysByCompassLeadId).toBeInstanceOf(Map)
    expect(hydrated.phoneKeysByCompassLeadId.size).toBe(0)
  })

  it("아직 Map인 값을 넘겨도(캐시를 안 거친 경로) 그대로 복원한다", () => {
    const hydrated = hydrateCompassDemoSource(
      EMPTY_COMPASS_DEMO_SOURCE as unknown as Parameters<typeof hydrateCompassDemoSource>[0]
    )
    expect(hydrated.phoneKeysByCompassLeadId).toBeInstanceOf(Map)
  })
})
