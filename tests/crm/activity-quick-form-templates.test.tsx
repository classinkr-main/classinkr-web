import { readFileSync } from "node:fs"
import path from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import ActivityQuickForm, {
  UNLINKED_RECENT_LIMIT,
  recentCustomerToPick,
  recentCustomersForUnlinkedWarning,
  resolveActivitySubmitGate,
} from "@/components/admin/crm/rail/ActivityQuickForm"
import { MOBILE_TOUCH_TARGET_CLASS } from "@/components/admin/crm/home/shared"
import { ACTIVITY_TEMPLATES } from "@/lib/crm/activity-templates"
import type { RecentCustomer } from "@/lib/crm/recent-customers"

// 기획 §11.2 A2(템플릿 칩)·A3(미연결 경고 + 최근 고객 원클릭).
// 저장소에 DOM 테스트 환경(jsdom/happy-dom)이 없어 클릭 흐름은 (1) 내보낸 순수 게이트 함수, (2) 정적 마크업,
// (3) 소스 계약(핸들러 배선)으로 고정한다 — contact-evidence-contract.test.ts 와 같은 방식.

const SOURCE = readFileSync(
  path.resolve(__dirname, "../../components/admin/crm/rail/ActivityQuickForm.tsx"),
  "utf8"
)

function recent(overrides: Partial<RecentCustomer> = {}): RecentCustomer {
  return { key: "lead:lead-1", name: "프리셋 학원", sourceLabel: "리드", source: "lead", ...overrides }
}

describe("A3 저장 게이트 (resolveActivitySubmitGate)", () => {
  it("고객 미선택 상태에서 저장하면 경고(warn_unlinked)이고 저장하지 않는다", () => {
    expect(resolveActivitySubmitGate({ targetId: "", lockTarget: false, allowUnlinked: false })).toBe("warn_unlinked")
    expect(resolveActivitySubmitGate({ targetId: "   ", lockTarget: false, allowUnlinked: false })).toBe("warn_unlinked")
  })

  it("'미연결로 저장'을 명시적으로 확인한 뒤에만 unlinked 저장을 허용한다", () => {
    expect(resolveActivitySubmitGate({ targetId: "", lockTarget: false, allowUnlinked: true })).toBe("save")
  })

  it("고객이 이미 연결됐거나 부모가 대상을 고정한(lockTarget) 컨텍스트면 흐름 변화가 없다", () => {
    expect(resolveActivitySubmitGate({ targetId: "lead-1", lockTarget: false, allowUnlinked: false })).toBe("save")
    expect(resolveActivitySubmitGate({ targetId: "", lockTarget: true, allowUnlinked: false })).toBe("save")
  })
})

describe("A3 최근 고객 칩 데이터", () => {
  it("최근 고객은 피커와 같은 선택값(targetType/targetId/targetLabel)으로 바뀐다", () => {
    expect(recentCustomerToPick(recent())).toEqual({ targetType: "lead", targetId: "lead-1", targetLabel: "프리셋 학원" })
    expect(recentCustomerToPick(recent({ key: "neo:acc-9", source: "neo_account", name: "네오 학원" }))).toEqual({
      targetType: "neo_account",
      targetId: "acc-9",
      targetLabel: "네오 학원",
    })
  })

  it("최대 5명까지만 올리고 이름 없는 항목은 거른다", () => {
    const many = Array.from({ length: 8 }, (_, i) => recent({ key: `lead:l${i}`, name: `학원 ${i}` }))
    expect(UNLINKED_RECENT_LIMIT).toBe(5)
    expect(recentCustomersForUnlinkedWarning(many)).toHaveLength(5)
    expect(recentCustomersForUnlinkedWarning([recent({ name: " " }), recent({ key: "lead:l2", name: "유효" })])).toEqual([
      recent({ key: "lead:l2", name: "유효" }),
    ])
    expect(recentCustomersForUnlinkedWarning([])).toEqual([])
  })
})

describe("A2 템플릿 칩 마크업", () => {
  it.each([
    ["composer", { variant: "composer" as const }],
    ["compact", { compact: true }],
    ["full", {}],
  ])("%s 변형에 템플릿 칩 행이 모드 칩 아래에 있고 텍스트 버튼·44px 터치 타깃·포커스 링을 갖는다", (_name, props) => {
    const html = renderToStaticMarkup(<ActivityQuickForm {...props} />)
    expect(html).toContain('data-testid="activity-template-row"')
    expect(html).toContain('aria-label="기록 템플릿"')
    for (const template of ACTIVITY_TEMPLATES) expect(html).toContain(`>${template.label}</button>`)
    // 모드 칩 그룹이 템플릿 행보다 먼저 온다.
    expect(html.indexOf('aria-label="기록 종류 선택"')).toBeLessThan(html.indexOf('aria-label="기록 템플릿"'))
    // 텍스트 버튼(칩 채움 없음): 초기 상태 칩은 상호작용 텍스트색만 쓰고 aria-pressed=false.
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('aria-pressed="true"')
    const templateRow = html.slice(html.indexOf('data-testid="activity-template-row"'), html.indexOf('aria-label="기록 템플릿"') + 800)
    expect(templateRow).toContain("text-[#31302E]")
    expect(templateRow).toContain("focus-visible:ring-2")
    // 정적 마크업은 class 속성의 & 를 &amp; 로 이스케이프한다.
    expect(templateRow).toContain(MOBILE_TOUCH_TARGET_CLASS.replaceAll("&", "&amp;"))
    // 덮어쓰기 확인·미연결 경고는 초기에 닫혀 있다.
    expect(html).not.toContain("본문을 바꿀까요?")
    expect(html).not.toContain('role="alert"')
    // 차가운 색 없음(DESIGN.md).
    expect(html).not.toMatch(/#(1d4ed8|2563eb|3b82f6|0ea5e9|6366f1)/i)
  })

  it("고객 미선택 안내가 '조용히 미연결 저장' 대신 '저장 전 확인'으로 바뀐다", () => {
    const composer = renderToStaticMarkup(<ActivityQuickForm variant="composer" />)
    expect(composer).toContain("고객을 고르지 않으면 저장 전에 확인합니다.")
    expect(composer).not.toContain("고객 미선택 시 미연결 기록으로 저장됩니다.")
    const full = renderToStaticMarkup(<ActivityQuickForm />)
    expect(full).toContain("고르지 않으면 저장 전에 확인합니다.")
    expect(full).not.toContain("직접 입력하면 미연결 기록으로 저장됩니다.")
    // 이미 연결된 경우의 안내는 그대로(드로어 quick-log 테스트와 같은 문구).
    const linked = renderToStaticMarkup(
      <ActivityQuickForm variant="composer" defaultTargetType="lead" defaultTargetId="lead-1" defaultTargetLabel="프리셋 학원" />
    )
    expect(linked).toContain("고객 360 타임라인에 연결됩니다.")
  })
})

describe("A2·A3 핸들러 배선(소스 계약)", () => {
  it("템플릿 칩 클릭은 applyActivityTemplate 을 거쳐 mode·body·sentiment 를 채우고, 본문이 있으면 확인 블록만 연다", () => {
    expect(SOURCE).toContain("onClick={() => handleTemplateClick(template)}")
    const handler = SOURCE.slice(SOURCE.indexOf("const handleTemplateClick"), SOURCE.indexOf("const handleSubmit"))
    expect(handler).toContain("applyActivityTemplate(template, { body })")
    expect(handler).toContain("setPendingTemplate(template)")
    expect(handler).toContain("applyTemplate(template)")
    const apply = SOURCE.slice(SOURCE.indexOf("const applyTemplate"), SOURCE.indexOf("const handleTemplateClick"))
    expect(apply).toContain("setMode(prefill.mode)")
    expect(apply).toContain("setBody(prefill.body)")
    expect(apply).toContain("setSentiment(prefill.sentiment)")
    // 확인 블록: 확인/취소 두 버튼 + 바깥 클릭·Esc 닫힘.
    expect(SOURCE).toContain("onClick={() => applyTemplate(pendingTemplate)}")
    expect(SOURCE).toContain("onClick={() => setPendingTemplate(null)}")
    expect(SOURCE).toContain("useDismissOnOutside(templateConfirmRef, pendingTemplate != null, () => setPendingTemplate(null))")
  })

  it("handleSubmit 은 FormData 를 만들기 전에 게이트를 지나고, 경고면 저장(adminFetch) 없이 return 한다", () => {
    const submit = SOURCE.slice(SOURCE.indexOf("const handleSubmit"), SOURCE.indexOf("const fieldHasValue"))
    const gateAt = submit.indexOf("resolveActivitySubmitGate({")
    const formDataAt = submit.indexOf("new FormData()")
    const fetchAt = submit.indexOf("adminFetch(EVENTS_URL")
    expect(gateAt).toBeGreaterThan(0)
    expect(gateAt).toBeLessThan(formDataAt)
    expect(formDataAt).toBeLessThan(fetchAt)
    const gateBlock = submit.slice(gateAt, formDataAt)
    expect(gateBlock).toContain('if (gate === "warn_unlinked")')
    expect(gateBlock).toContain("setUnlinkedWarning({ recents: recentCustomersForUnlinkedWarning(getRecentCustomers()) })")
    expect(gateBlock).toContain("submitInFlightRef.current = false")
    expect(gateBlock).toContain("return")
    // 경고로 되돌아간 뒤에는 잠금이 풀려 있어야 재시도(칩·미연결 저장)가 가능하다.
  })

  it("'미연결로 저장'은 allowUnlinked 명시 확인으로만 저장하고, 최근 고객 칩은 연결 후 곧바로 저장한다", () => {
    expect(SOURCE).toContain("onClick={() => void handleSubmit({ allowUnlinked: true })}")
    const chipStart = SOURCE.indexOf('aria-label="최근 고객"')
    const chip = SOURCE.slice(chipStart, SOURCE.indexOf("미연결로 저장", chipStart))
    expect(chip).toContain("const pick = recentCustomerToPick(recent)")
    expect(chip).toContain("setTargetId(pick.targetId)")
    expect(chip).toContain("void handleSubmit({ targetOverride: pick })")
    // override 가 FormData 의 targetType/targetId/targetLabel 에 쓰인다(state 반영을 기다리지 않음).
    expect(SOURCE).toContain('formData.append("targetType", effectiveTargetType)')
    expect(SOURCE).toContain('appendFormValue(formData, "targetId", effectiveTargetId)')
    expect(SOURCE).toContain('appendFormValue(formData, "targetLabel", effectiveTargetLabel)')
  })

  it("경고 블록은 role=alert 로 낭독되고 바깥 클릭·Esc 에 닫히며, 최근 고객이 없으면 한 줄 안내를 낸다", () => {
    const block = SOURCE.slice(SOURCE.indexOf("const unlinkedWarningBlock"), SOURCE.indexOf("// ---- composer"))
    expect(block).toContain('role="alert"')
    expect(block).toContain("연결된 고객이 없습니다")
    expect(block).toContain("최근 고객 없음 · 위 검색으로 연결")
    expect(block).toContain("onClick={() => setUnlinkedWarning(null)}")
    expect(block).toContain("STATUS_TONE_CLASS.warning")
    expect(SOURCE).toContain("useDismissOnOutside(unlinkedWarningRef, unlinkedWarning != null, () => setUnlinkedWarning(null))")
    const dismiss = SOURCE.slice(SOURCE.indexOf("function useDismissOnOutside"), SOURCE.indexOf("export default function ActivityQuickForm"))
    expect(dismiss).toContain('event.key !== "Escape"')
    expect(dismiss).toContain('document.addEventListener("mousedown", onMouseDown)')
  })

  it("⌘/Ctrl+Enter 저장은 같은 handleSubmit(게이트 포함)을 탄다", () => {
    const keyHandler = SOURCE.slice(SOURCE.indexOf("const onBodyKeyDown"), SOURCE.indexOf("const appliedTemplate"))
    expect(keyHandler).toContain("event.metaKey || event.ctrlKey")
    expect(keyHandler).toContain("void handleSubmit()")
    expect((SOURCE.match(/onKeyDown=\{onBodyKeyDown\}/g) ?? []).length).toBe(2)
  })
})
