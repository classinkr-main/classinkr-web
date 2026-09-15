import { Suspense } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// CrmPriorityQueuePanel이 담당자 필터를 URL(?owner=)에 반영하면서 useRouter/useSearchParams를
// 쓰게 됐다(2026-09-07 감사 #3) — renderToStaticMarkup은 App Router 컨텍스트 없이 렌더하므로
// 훅을 모킹하지 않으면 렌더 자체가 실패한다. CrmSubnav 테스트(tests/crm/crm-subnav-render.test.tsx)
// 와 같은 패턴.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/crm",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import CrmWeekAheadPanel from "@/components/admin/crm/CrmWeekAheadPanel"
import CrmPriorityQueuePanel, {
  CrmPriorityQueuePanelSkeleton,
} from "@/components/admin/crm/CrmPriorityQueuePanel"
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
    // 2026-09-10 스트리밍 전환 — initialData가 없으면 CrmPriorityQueuePanel은 이미 resolve된
    // RESOLVED_NULL_PROMISE를 React use()로 소비한다. use()는 "이미 resolve된 promise"라도
    // React가 그 promise를 처음 보는 순간에는 최소 한 틱을 서스펜드한다(내부적으로 .then을
    // 붙여야 캐시할 수 있어서) — renderToStaticMarkup은 완전 동기 API라 이 서스펜드를
    // <Suspense> 경계 없이는 못 견디고 에러를 던진다. 실제 화면(CrmHomeClient.tsx)도 이제
    // 이 컴포넌트를 <Suspense>로 감싸므로, 테스트도 같은 경계를 둔다 — 동기 렌더는 항상
    // fallback을 보여준다(그 자체가 "콜드 렌더에서 깨지지 않는다"의 새 모양이다). 패널이
    // "오늘 전화할 N건" 카드로 재편되면서 로딩은 문장 대신 스켈레톤으로 그린다.
    const html = renderToStaticMarkup(
      <Suspense fallback={<CrmPriorityQueuePanelSkeleton />}>
        <CrmPriorityQueuePanel />
      </Suspense>
    )
    expect(html).toContain("오늘 전화할")
    expect(html).toContain("animate-pulse")
    // 데이터 도착 전에는 다음 후보를 알릴 대상이 없다 — 펼침 버튼도 없다.
    expect(html).not.toContain("더 보기")
  })
})
