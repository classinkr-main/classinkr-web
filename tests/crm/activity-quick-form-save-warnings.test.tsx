// 병합 검토 후속(37c02226 지적 8) — 기록 입력 폼이 POST /api/admin/crm/events 의 부분 성공 경고를 보이는지.
// 컴포저 리드 콜·문자(연락 로그 경로, 8b3d7fde)는 연락중 전환·CRM 타임라인 미러가 실패하면 201 + `warning` 을 돌려준다.
// 폼이 taskQueueWarning 만 읽어 이 칸은 성공 토스트에 묻혔고, taskQueueWarning 도 workspace 변형에서만 보였다
// (360 드로어는 composer 변형). 저장소에 DOM 테스트 환경이 없어 (1) 순수 함수, (2) 정적 마크업, (3) 소스 계약으로 고정한다.
import { readFileSync } from "node:fs"
import path from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ActivitySaveWarnings, activitySaveWarnings } from "@/components/admin/crm/rail/ActivityQuickForm"

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../components/admin/crm/rail/ActivityQuickForm.tsx"),
  "utf8"
)

const CONTACT_WARNING = "연락 기록은 저장됐지만 리드 상태를 연락중으로 맞추지 못했습니다."
const TASK_WARNING = "기록은 저장됐지만 다음 액션을 할 일에 추가하지 못했습니다. 전체 로그에서 다음 액션을 확인해 주세요."

/** 앵커가 사라지면 조용히 통과하지 않게 — 없으면 바로 실패한다. */
function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start)
  expect(from, `anchor not found: ${start}`).toBeGreaterThanOrEqual(0)
  const to = source.indexOf(end, from + start.length)
  expect(to, `anchor not found: ${end}`).toBeGreaterThan(from)
  return source.slice(from, to)
}

describe("activitySaveWarnings — 응답의 부분 성공 경고", () => {
  it("연락 경로 warning 과 taskQueueWarning 을 둘 다 순서대로 올린다", () => {
    expect(
      activitySaveWarnings({ event: { id: "e" }, tasksCreated: 0, warning: CONTACT_WARNING, taskQueueWarning: TASK_WARNING })
    ).toEqual([CONTACT_WARNING, TASK_WARNING])
    expect(activitySaveWarnings({ warning: CONTACT_WARNING })).toEqual([CONTACT_WARNING])
    expect(activitySaveWarnings({ taskQueueWarning: TASK_WARNING })).toEqual([TASK_WARNING])
  })

  it("경고가 없거나 모양이 다르면 빈 목록", () => {
    expect(activitySaveWarnings({ event: { id: "e" }, tasksCreated: 1 })).toEqual([])
    expect(activitySaveWarnings({ warning: "  ", taskQueueWarning: 3 })).toEqual([])
    expect(activitySaveWarnings(null)).toEqual([])
    expect(activitySaveWarnings("warning")).toEqual([])
  })
})

describe("ActivitySaveWarnings — role=alert 문단", () => {
  it("경고마다 role=alert 문단을 그린다(DESIGN.md Danger 색)", () => {
    const html = renderToStaticMarkup(<ActivitySaveWarnings warnings={[CONTACT_WARNING, TASK_WARNING]} />)
    expect(html.match(/role="alert"/g)).toHaveLength(2)
    expect(html).toContain(`>${CONTACT_WARNING}</p>`)
    expect(html).toContain(`>${TASK_WARNING}</p>`)
    expect(html).toMatch(/text-\[#B43E3E\]/)
  })

  it("경고가 없으면 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(<ActivitySaveWarnings warnings={[]} />)).toBe("")
  })
})

describe("폼 배선(소스 계약)", () => {
  it("저장 성공 응답에서 경고를 activitySaveWarnings 로 읽는다 — taskQueueWarning 만 따로 읽지 않는다", () => {
    const submit = sliceBetween(SOURCE, "const handleSubmit = async", "const fieldHasValue")
    expect(submit).toMatch(/\bsetSaveWarnings\(activitySaveWarnings\(payload\)\)/)
    expect(submit).not.toMatch(/\bpayload\?\.taskQueueWarning\b/)
  })

  it.each([
    ["workspace", 'if (resolvedVariant === "workspace") {', "if (isComposer) {"],
    ["composer", "if (isComposer) {", "// ---- full / compact ----"],
    ["full / compact", "// ---- full / compact ----", "\n}\n"],
  ])("%s 변형이 경고 블록을 그린다", (_name, start, end) => {
    const variant = sliceBetween(SOURCE, start, end)
    expect(variant).toMatch(/<ActivitySaveWarnings warnings=\{saveWarnings\} \/>/)
  })
})
