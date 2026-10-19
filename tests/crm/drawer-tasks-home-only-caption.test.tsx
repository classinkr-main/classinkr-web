/**
 * 고객 360 드로어 할 일 추가 폼의 Home 전용 캡션(R3-drawer, 2026-09-26 교차 리뷰 후속).
 * Compass 가 주 쓰기 면인 리드(드로어 resolveCrmWriteSurface → surface=compass = compassPrimary)에서도 할 일 추가는
 * 그대로 쓰되(오늘 연락이 Home 할 일을 읽는다), 이 할 일이 Home 에만 남고 Compass 담당자에게 가지 않는다는 사실을
 * 폼에서 밝힌다 — 컴포저·추천 카드와 같은 HomeOnlyCaption.
 * DOM 환경이 없어 정적 마크업 + 소스 계약(드로어가 판정값을 넘기는지)으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/admin/crm/useCrmOwners", () => ({
  useCrmOwners: () => ({ owners: [] }),
}))

import DrawerTasksSection, { TASK_HOME_ONLY_CAPTION_ID } from "@/components/admin/crm/drawer/DrawerTasksSection"
import { HOME_ONLY_CAPTION } from "@/lib/crm/write-surface"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

const noop = () => undefined

function make360(): Customer360 {
  return { tasks: { summary: { total: 0 }, rows: [] } } as unknown as Customer360
}

function render(options: { formOpen: boolean; compassPrimary?: boolean }) {
  return renderToStaticMarkup(
    <DrawerTasksSection
      data={make360()}
      actingId={null}
      taskFormOpen={options.formOpen}
      onTaskFormOpenChange={noop}
      taskTitle=""
      onTaskTitleChange={noop}
      taskType="call"
      onTaskTypeChange={noop}
      taskDue=""
      onTaskDueChange={noop}
      taskOwner={null}
      onTaskOwnerChange={noop}
      onAddTask={noop}
      onCompleteTask={noop}
      onCsMotion={noop}
      {...(options.compassPrimary === undefined ? {} : { compassPrimary: options.compassPrimary })}
    />
  )
}

function count(html: string, needle: string) {
  return html.split(needle).length - 1
}

describe("DrawerTasksSection — Compass 정본 리드의 할 일 추가 폼", () => {
  it("compassPrimary 면 폼에 Home 전용 캡션 — 제목 입력·추가 버튼이 aria-describedby 로 가리킨다", () => {
    const html = render({ formOpen: true, compassPrimary: true })
    expect(html).toContain(HOME_ONLY_CAPTION)
    expect(html).toContain('data-testid="c360-home-only-caption"')
    expect(html).toContain(`id="${TASK_HOME_ONLY_CAPTION_ID}"`)
    expect(count(html, `aria-describedby="${TASK_HOME_ONLY_CAPTION_ID}"`)).toBe(2)
    // 할 일 추가 기능은 그대로 둔다.
    expect(html).toContain("내 할 일로 추가")
    expect(html).toContain('aria-label="새 할 일 제목"')
    // 상태가 아니라 늘 참인 안내 — 신호색·채움 없이 보조 글자색.
    expect(html).not.toMatch(/c360-home-only-caption"[^>]*bg-\[#/)
  })

  it("Home 정본(compassPrimary=false)·생략이면 캡션 없음 — 지금 화면 그대로", () => {
    for (const html of [render({ formOpen: true, compassPrimary: false }), render({ formOpen: true })]) {
      expect(html).not.toContain(HOME_ONLY_CAPTION)
      expect(html).not.toContain("aria-describedby")
      expect(html).toContain("내 할 일로 추가")
    }
  })

  it("폼을 닫은 동안에는 캡션을 그리지 않는다(추가 버튼만)", () => {
    const html = render({ formOpen: false, compassPrimary: true })
    expect(html).not.toContain(HOME_ONLY_CAPTION)
    expect(html).toContain("할 일 추가")
  })

  it("소스 계약 — 드로어는 컴포저·추천 카드와 같은 판정값(compassPrimary)을 넘긴다", () => {
    const drawer = readFileSync(join(process.cwd(), "components/admin/crm/Customer360Drawer.tsx"), "utf8")
    expect(drawer).toContain("const compassPrimary = writeSurface?.surface === \"compass\"")
    const section = drawer.slice(drawer.indexOf("<DrawerTasksSection"), drawer.indexOf("/>", drawer.indexOf("<DrawerTasksSection")))
    expect(section).toContain("compassPrimary={compassPrimary}")
  })
})
