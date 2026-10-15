import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { GaugeRing } from "@/components/admin/viz/GaugeRing"
import { ProgressRoadmap } from "@/components/admin/viz/ProgressRoadmap"

describe("복원한 진행 차트의 실제 달성률", () => {
  it.each([-20, 250])("그림 범위와 무관하게 실제 %s%%를 표시한다", (actual) => {
    const ring = renderToStaticMarkup(<GaugeRing value={actual} goal={100} />)
    const roadmap = renderToStaticMarkup(<ProgressRoadmap actual={actual} goal={100} label="매출 로드맵" />)
    expect(ring).toContain(`>${actual}<`)
    expect(roadmap).toContain(`${actual}%`)
    expect(roadmap).not.toContain("width:-")
    expect(ring + roadmap).not.toMatch(/NaN|Infinity/)
  })
})
