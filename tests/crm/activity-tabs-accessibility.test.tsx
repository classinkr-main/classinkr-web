import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  path.resolve(__dirname, "../../components/admin/crm/CrmActivityClient.tsx"),
  "utf8"
)

describe("CrmActivityClient — 기록 범위 탭 UI 및 접근성 계약", () => {
  it("기록 범위 탭 컨테이너가 role='tablist'와 aria-label='기록 범위'를 가진다", () => {
    expect(source).toContain('role="tablist"')
    expect(source).toContain('aria-label="기록 범위"')
  })

  it("업무 기록과 전체 이벤트 탭이 각각 role='tab', aria-selected, aria-controls를 갖춘다", () => {
    expect(source).toContain('role="tab"')
    expect(source).toContain('id={`activity-scope-tab-${option.key}`}')
    expect(source).toContain("aria-selected={isActive}")
    expect(source).toContain('aria-controls="activity-scope-panel"')
    expect(source).toContain("tabIndex={isActive ? 0 : -1}")
  })

  it("활성 탭은 Classin Green 하단 보더(-mb-px, border-b-2, border-[#084734])와 카운트 배지를 표시한다", () => {
    expect(source).toContain("border-[#084734] text-[#084734]")
    expect(source).toContain("-mb-px")
    expect(source).toContain("border-b-2")
    expect(source).toContain("data.summary.total.toLocaleString")
  })

  it("기록 목록 영역이 id='activity-scope-panel', role='tabpanel', aria-labelledby로 탭과 연결된다", () => {
    expect(source).toContain('id="activity-scope-panel"')
    expect(source).toContain('role="tabpanel"')
    expect(source).toContain("aria-labelledby={`activity-scope-tab-${activityScope}`}")
  })

  it("좌우 방향키를 통한 탭 전환(handleScopeKeyDown) 핸들러를 배선한다", () => {
    expect(source).toContain("handleScopeKeyDown")
    expect(source).toContain('event.key === "ArrowRight"')
    expect(source).toContain('event.key === "ArrowLeft"')
  })

  it("기간 및 분위기 필터 칩에 식별 레이블과 아이콘이 배치된다", () => {
    expect(source).toContain('aria-label="기간 필터"')
    expect(source).toContain('aria-label="분위기 필터"')
    expect(source).toContain("기간")
    expect(source).toContain("분위기")
  })
})
