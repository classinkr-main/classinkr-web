import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import ActivityDateGroups from "@/components/admin/crm/activity/ActivityDateGroups"
import type { ActivityDateGroup } from "@/lib/crm/activity-date-groups"

interface Row {
  id: string
  title: string
}

function makeGroups(): ActivityDateGroup<Row>[] {
  return [
    { dayKey: "2026-09-21", label: "오늘 · 9/21 (월)", rows: [{ id: "e1", title: "첫 기록" }] },
    {
      dayKey: "2026-09-20",
      label: "어제 · 9/20 (일)",
      rows: [
        { id: "e2", title: "둘째 기록" },
        { id: "e3", title: "셋째 기록" },
      ],
    },
  ]
}

describe("ActivityDateGroups (static render)", () => {
  it("그룹마다 aria-labelledby 섹션 + 스티키 헤더(날짜 라벨 + 건수)를 그린다", () => {
    const html = renderToStaticMarkup(
      <ActivityDateGroups groups={makeGroups()} renderRow={(row) => <p key={row.id}>{row.title}</p>} />
    )

    expect(html).toContain("오늘 · 9/21 (월)")
    expect(html).toContain("어제 · 9/20 (일)")
    // 건수 — tabular-nums 클래스가 붙은 요소로 표시된다
    expect(html).toContain("1건")
    expect(html).toContain("2건")
    expect(html).toContain('aria-labelledby="activity-day-2026-09-21"')
    expect(html).toContain('id="activity-day-2026-09-21"')
    expect(html).toContain("sticky")
  })

  it("행 순서를 그룹 등장 순서·그룹 내부 순서 그대로 유지한다", () => {
    const html = renderToStaticMarkup(
      <ActivityDateGroups groups={makeGroups()} renderRow={(row) => <p key={row.id}>{row.title}</p>} />
    )
    const firstIdx = html.indexOf("첫 기록")
    const secondIdx = html.indexOf("둘째 기록")
    const thirdIdx = html.indexOf("셋째 기록")
    expect(firstIdx).toBeGreaterThan(-1)
    expect(firstIdx).toBeLessThan(secondIdx)
    expect(secondIdx).toBeLessThan(thirdIdx)
  })

  it("그룹이 없으면 아무것도 그리지 않는다(null)", () => {
    const html = renderToStaticMarkup(<ActivityDateGroups groups={[]} renderRow={() => null} />)
    expect(html).toBe("")
  })
})
