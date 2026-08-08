import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CrmWeekAheadPanel from "@/components/admin/crm/CrmWeekAheadPanel"
import CrmPriorityQueuePanel from "@/components/admin/crm/CrmPriorityQueuePanel"
import { WEEK_AHEAD_PREVIEW_ROWS } from "@/lib/crm/week-ahead"

// CRM 홈은 "스크롤 목록"이 되면 안 되는 요약 표면 — 목록 패널은 전부 미리보기 상한을 갖는다.
// 여기서는 상한 기본값과 콜드 렌더(요청 전)가 깨지지 않는지만 지킨다. 실제 잘라내기 규칙은
// tests/crm/week-ahead.test.ts 의 budgetWeekAheadBuckets 케이스가 담당한다.

describe("CRM 홈 목록 예산", () => {
  it("주간 조망 기본 미리보기는 6행", () => {
    expect(WEEK_AHEAD_PREVIEW_ROWS).toBe(6)
  })

  it("주간 조망 패널이 콜드 렌더에서 깨지지 않는다", () => {
    const html = renderToStaticMarkup(<CrmWeekAheadPanel compact />)
    expect(html).toContain("이번 주 해야 할 일")
    // 데이터 도착 전에는 미리보기 상한을 알릴 대상이 없다 — 더보기 버튼도 없다.
    expect(html).not.toContain("더 보기")
  })

  it("작업대(오늘 전화) 패널이 콜드 렌더에서 깨지지 않는다", () => {
    // 패널이 "오늘 전화할 N건" 카드로 재편되면서 로딩은 문장 대신 스켈레톤으로 그린다.
    const html = renderToStaticMarkup(<CrmPriorityQueuePanel />)
    expect(html).toContain("오늘 전화할")
    expect(html).toContain("animate-pulse")
    // 데이터 도착 전에는 다음 후보를 알릴 대상이 없다 — 펼침 버튼도 없다.
    expect(html).not.toContain("더 보기")
  })
})
