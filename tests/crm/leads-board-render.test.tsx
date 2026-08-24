import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LEAD_FILTER_KEYS } from "@/lib/crm/leads-board-state"

// 분해 안전망 — LeadsBoardClient(3,000줄 초과)를 콘솔/보드로 쪼개는 동안
// 화면 골격이 조용히 사라지는 것을 막는다. 지금까지 tests/ 안에서 이 컴포넌트를
// import 하는 파일이 하나도 없어, 타입체크만 통과하면 통과처럼 보였다.
// 설계 정본: docs/active/crm-lead-console-board-design-2026-08-21.md §7
//
// 데이터는 마운트 후 fetch로 들어오는데 SSR에서는 effect가 돌지 않는다 —
// 따라서 여기서 검증하는 것은 "데이터 0건 상태의 골격"이고, 그게 분해로 깨지기 가장 쉬운 부분이다.
const routerState = vi.hoisted(() => ({ search: "" }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/crm/customers/leads",
  useSearchParams: () => new URLSearchParams(routerState.search),
}))

import LeadsBoardClient from "@/components/admin/crm/leads/LeadsBoardClient"

function render(search = "") {
  routerState.search = search
  return renderToStaticMarkup(<LeadsBoardClient />)
}

beforeEach(() => {
  routerState.search = ""
})

describe("리드 보드 골격 (SSR)", () => {
  it("헤더의 세 액션이 모두 남아 있다", () => {
    const html = render()
    expect(html).toContain("리드 등록")
    expect(html).toContain("CSV")
    expect(html).toContain("새로고침")
  })

  it("모아보기 렌즈 2종이 남아 있다", () => {
    const html = render()
    expect(html).toContain("전체 리드")
    expect(html).toContain("마케팅 리드")
  })

  it("필터 카운트 카드가 LEAD_FILTER_KEYS 전부를 덮는다", () => {
    // 숫자로 들어가는 창구는 이 카드 묶음 하나다 — 키가 늘었는데 카드가 안 늘면 진입점이 사라진다.
    const html = render()
    const labels = ["전체", "미확인", "신규", "응대 전", "24h+", "48h+", "미배정", "연락중", "전환", "종료"]
    expect(labels).toHaveLength(LEAD_FILTER_KEYS.length)
    for (const label of labels) expect(html).toContain(label)
  })

  it("단계·담당자 패널과 큐 앵커가 남아 있다", () => {
    const html = render()
    expect(html).toContain("단계별 현황")
    expect(html).toContain("담당자별 보유 리드")
    // /admin/crm 현황에서 넘어오는 딥링크 착지점
    expect(html).toContain('id="lead-queue"')
  })

  it("검색·정렬·미확인 토글이 남아 있다", () => {
    const html = render()
    expect(html).toContain("이름·기관·연락처")
    expect(html).toContain("우선순위")
    expect(html).toContain("미확인 포함")
  })

  it("데이터 0건이면 장애가 아니라 빈 상태로 말한다", () => {
    const html = render()
    expect(html).toContain("등록된 리드가 없습니다")
    expect(html).not.toContain("불러오지 못했습니다")
  })

  it("상태 축 딥링크로 들어와도 골격이 그대로 선다", () => {
    // ?filter=unconfirmed 는 확인 게이트 면제 필터 — 보드 뷰에서는 컬럼 포커스로 강등될 축이다.
    const html = render("filter=unconfirmed")
    expect(html).toContain("리드 등록")
    expect(html).toContain("미확인")
    expect(html).toContain('id="lead-queue"')
  })

  it("직교 필터 딥링크(24h 미응대)도 같은 골격을 낸다", () => {
    const html = render("filter=unresponded_24h&lens=all&sort=priority")
    expect(html).toContain("24h+")
    expect(html).toContain("단계별 현황")
  })
})

describe("뷰 축 — 콘솔 ↔ 보드", () => {
  it("기본은 콘솔이라 보드 컬럼이 서지 않는다", () => {
    const html = render()
    expect(html).toContain("단계별 현황")
    expect(html).not.toContain("리드 파이프라인 보드")
  })

  it("?view=board 면 5컬럼이 서고 콘솔 전용 패널은 내려간다", () => {
    const html = render("view=board")
    expect(html).toContain("리드 파이프라인 보드")
    for (const label of ["미확인", "신규", "연락중", "전환"]) expect(html).toContain(label)
    // 종료는 기본으로 접힌다 — 폭 예산에서 활성 컬럼 하나와 맞바꾸는 값이다.
    expect(html).toContain("종료 · 펼치기")
    // 단계가 컬럼으로 서므로 같은 축을 두 번 그리지 않는다.
    expect(html).not.toContain("단계별 현황")
    expect(html).not.toContain("담당자별 보유 리드")
  })

  it("보드에서도 헤더·필터 카드·검색은 그대로 남는다 — 전환이 상태를 리셋하지 않는다", () => {
    const html = render("view=board&filter=unresponded_24h&q=청담")
    expect(html).toContain("리드 등록")
    expect(html).toContain("24h+")
    expect(html).toContain("이름·기관·연락처")
    expect(html).toContain("리드 파이프라인 보드")
  })

  it("미확인 컬럼은 콘솔 게이트 밖임을 배지로 밝힌다", () => {
    // 보드가 확인 게이트를 통과시키므로 콘솔 목록 건수와 숫자가 달라질 수 있다 — 숨기지 않는다.
    const html = render("view=board")
    expect(html).toContain("게이트 밖")
  })

  it("모르는 view 값은 콘솔로 떨어진다", () => {
    const html = render("view=kanban")
    expect(html).toContain("단계별 현황")
    expect(html).not.toContain("리드 파이프라인 보드")
  })
})
