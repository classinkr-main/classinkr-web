/**
 * /admin/overview 운영 패널 문구 — 장부 의미의 화면 노출 '원장'은 '원본'으로(8e10868b 규칙). 같은 화면의 알림 메타
 * ('미확정 출고 원본')·기준 문구('원본 예정일 기준', 3418308c)와 '설치·배송 예정' 패널 주석이 같은 낱말을 쓴다.
 * 2026-10-19 09-mooni 병합 검토 후속 — 10월 줄기 파일(OverviewWorkspace)의 주석이 조화 커밋에서 빠졌었다.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { OverviewOperationsPanels } from "@/components/admin/overview/OverviewWorkspace"

function render() {
  return renderToStaticMarkup(
    createElement(OverviewOperationsPanels, {
      leads: null,
      leadState: "error",
      onLeadRetry: () => undefined,
      operations: null,
      loading: false,
      onRetry: () => undefined,
    })
  )
}

describe("현황 운영 패널 — 장부 의미 낱말", () => {
  it("설치·배송 예정 패널 주석은 '원본'이라 말하고 '원장'을 쓰지 않는다", () => {
    const html = render()
    expect(html).toContain("설치·배송 예정")
    expect(html).toContain("재고 원본에 남은 미확정 출고 전량")
    expect(html).toContain("예정일은 원본 기록이며 설치 확정일을 뜻하지 않습니다.")
    expect(html).not.toContain("원장")
  })
})
