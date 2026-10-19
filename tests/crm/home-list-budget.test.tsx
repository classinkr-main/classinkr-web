import { Suspense } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// CrmTodayContactsPanel이 담당자 필터를 URL(?owner=)에 반영하면서 useRouter/useSearchParams를
// 쓴다 — renderToStaticMarkup은 App Router 컨텍스트 없이 렌더하므로 훅을 모킹하지 않으면 렌더
// 자체가 실패한다. CrmSubnav 테스트(tests/crm/crm-subnav-render.test.tsx)와 같은 패턴.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/crm",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import CrmWeekAheadPanel, { groupWeekAheadTasks } from "@/components/admin/crm/CrmWeekAheadPanel"
import CrmTodayContactsPanel, {
  CrmTodayContactsPanelSkeleton,
  TODAY_CONTACTS_PREVIEW_ROWS,
} from "@/components/admin/crm/home/CrmTodayContactsPanel"
import type { CrmTaskRecord } from "@/lib/repositories/crm-tasks"
import { WEEK_AHEAD_PREVIEW_ROWS, type WeekAheadBucket } from "@/lib/crm/week-ahead"

// CRM 홈은 "스크롤 목록"이 되면 안 되는 요약 표면 — 목록 패널은 전부 미리보기 상한을 갖는다.
// 여기서는 상한 기본값과 콜드 렌더(요청 전)가 깨지지 않는지만 지킨다. 실제 잘라내기 규칙은
// tests/crm/week-ahead.test.ts 의 budgetWeekAheadBuckets 케이스와
// tests/crm/today-contacts-panel.test.tsx 가 담당한다.

const NOW = Date.parse("2026-09-25T03:00:00.000Z") // 2026-09-25(금) 12:00 KST

function task(id: string, dueAt: string | null, status: CrmTaskRecord["status"] = "open"): CrmTaskRecord {
  return { id, status, dueAt } as unknown as CrmTaskRecord
}

describe("CRM 홈 목록 예산", () => {
  it("주간 조망 기본 미리보기는 6행", () => {
    expect(WEEK_AHEAD_PREVIEW_ROWS).toBe(6)
  })

  it("오늘 연락 첫 화면은 10행", () => {
    expect(TODAY_CONTACTS_PREVIEW_ROWS).toBe(10)
  })

  it("주간 조망 패널이 콜드 렌더에서 깨지지 않는다", () => {
    const html = renderToStaticMarkup(<CrmWeekAheadPanel compact />)
    expect(html).toContain("이번 주 해야 할 일")
    // 데이터 도착 전에는 미리보기 상한을 알릴 대상이 없다 — 더보기 버튼도 없다.
    expect(html).not.toContain("더 보기")
  })

  it("홈 주간 조망(hideBuckets 지연·오늘)은 '내일 이후 할 일'로 머리를 바꾼다", () => {
    const hidden: WeekAheadBucket[] = ["overdue", "today"]
    const html = renderToStaticMarkup(<CrmWeekAheadPanel compact hideBuckets={hidden} />)
    expect(html).toContain("내일 이후 할 일")
    expect(html).not.toContain("이번 주 해야 할 일")
  })

  it("groupWeekAheadTasks — 숨긴 버킷(지연·오늘)은 목록에서 빼고 건수만 센다", () => {
    const rows = [
      task("late", "2026-09-24T01:00:00.000Z"), // 지연
      task("today", "2026-09-25T08:00:00.000Z"), // 오늘 17:00 KST
      task("tomorrow", "2026-09-26T01:00:00.000Z"), // 내일 10:00 KST → 이번 주
      task("nodue", null),
      task("snoozed", "2026-09-26T00:00:00.000Z", "snoozed"),
    ]
    const hidden = new Set<WeekAheadBucket>(["overdue", "today"])
    const { groups, hiddenCount } = groupWeekAheadTasks(rows, NOW, hidden)
    expect(hiddenCount).toBe(2)
    expect(groups.overdue).toEqual([])
    expect(groups.today).toEqual([])
    expect(groups.week.map((item) => item.id)).toEqual(["tomorrow"])
    expect(groups.nodue.map((item) => item.id)).toEqual(["nodue"])
    expect(groups.snoozed.map((item) => item.id)).toEqual(["snoozed"])
    // 숨김이 없으면 기존 동작 그대로
    const all = groupWeekAheadTasks(rows, NOW)
    expect(all.hiddenCount).toBe(0)
    expect(all.groups.overdue.map((item) => item.id)).toEqual(["late"])
    expect(all.groups.today.map((item) => item.id)).toEqual(["today"])
  })

  it("작업대(오늘 연락) 패널이 콜드 렌더에서 깨지지 않는다", () => {
    // initialData가 없으면 CrmTodayContactsPanel은 이미 resolve된 RESOLVED_NULL_PROMISE를 React
    // use()로 소비한다. use()는 "이미 resolve된 promise"라도 React가 처음 보는 순간에는 최소 한 틱을
    // 서스펜드한다 — renderToStaticMarkup은 완전 동기 API라 <Suspense> 경계 없이는 에러를 던진다.
    // 실제 화면(CrmHomeClient.tsx)도 이 컴포넌트를 <Suspense>로 감싸므로 테스트도 같은 경계를 둔다 —
    // 동기 렌더는 항상 fallback(스켈레톤)을 보여준다.
    const html = renderToStaticMarkup(
      <Suspense fallback={<CrmTodayContactsPanelSkeleton />}>
        <CrmTodayContactsPanel />
      </Suspense>
    )
    expect(html).toContain("오늘 연락")
    expect(html).toContain("animate-pulse")
    // 데이터 도착 전에는 남은 건수를 알릴 대상이 없다 — 펼침 버튼도 없다.
    expect(html).not.toContain("더 보기")
  })
})
