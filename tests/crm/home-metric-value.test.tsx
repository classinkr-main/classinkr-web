import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  METRIC_UNAVAILABLE_LABEL,
  metricValue,
  resolveMetricState,
} from "@/components/admin/crm/home/metric-value"
import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

// home-01·home-05 공용 "0 대신 확인 불가" 3분기 — 히어로 카드와 리드 요약 힌트가 같은 헬퍼를 쓴다.
describe("home/metric-value", () => {
  it("resolveMetricState: 로딩·실패·부분 실패·정상을 구분한다", () => {
    expect(resolveMetricState({ loading: true, hasData: false })).toBe("loading")
    expect(resolveMetricState({ loading: false, hasData: false })).toBe("unavailable")
    expect(resolveMetricState({ loading: true, hasData: true, partialFailure: true })).toBe("unavailable")
    expect(resolveMetricState({ loading: false, hasData: true, partialFailure: false })).toBe("ready")
    // 캐시를 보여주며 백그라운드 재검증 중(loading && hasData)인 경우는 ready — 스켈레톤으로 덮지 않는다.
    expect(resolveMetricState({ loading: true, hasData: true })).toBe("ready")
  })

  it("loading 은 스켈레톤을 그리고 포맷터를 호출하지 않는다", () => {
    let called = 0
    const html = renderToStaticMarkup(
      <>{metricValue("loading", () => { called += 1; return "0" }, { skeletonClassName: "h-3 w-6" })}</>
    )
    expect(called).toBe(0)
    expect(html).toContain("animate-pulse")
    expect(html).toContain("h-3 w-6")
  })

  it("unavailable 은 danger 톤 '—'(또는 지정 문구)와 SR 라벨을 그리고 0을 내지 않는다", () => {
    let called = 0
    const dash = renderToStaticMarkup(<>{metricValue("unavailable", () => { called += 1; return "0" })}</>)
    expect(called).toBe(0)
    expect(dash).toContain("—")
    expect(dash).not.toContain(">0<")
    expect(dash).toContain(STATUS_TONE_TEXT_CLASS.danger)
    expect(dash).toContain(`aria-label="${METRIC_UNAVAILABLE_LABEL}"`)
    expect(dash).toContain('data-metric-state="unavailable"')
    expect(dash).not.toContain("#B85C33")

    const worded = renderToStaticMarkup(
      <>{metricValue("unavailable", () => "0", { unavailableText: METRIC_UNAVAILABLE_LABEL })}</>
    )
    expect(worded).toContain(`>${METRIC_UNAVAILABLE_LABEL}<`)
  })

  it("ready 는 포맷터 결과를 그대로 낸다", () => {
    const html = renderToStaticMarkup(<>{metricValue("ready", () => "1,234")}</>)
    expect(html).toBe("1,234")
  })
})
