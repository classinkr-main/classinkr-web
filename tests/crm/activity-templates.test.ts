import { describe, expect, it } from "vitest"

import {
  ACTIVITY_TEMPLATES,
  activityTemplatePrefill,
  applyActivityTemplate,
  findActivityTemplate,
} from "@/lib/crm/activity-templates"
import { MODE_OPTIONS, SENTIMENT_FILTERS } from "@/components/admin/crm/rail/activity-contract"

// 기획 §11.2 A2 — 템플릿 칩 SSOT와 적용 순수 함수.

describe("ACTIVITY_TEMPLATES", () => {
  it("최소 6개이며 id·라벨이 유일하다", () => {
    expect(ACTIVITY_TEMPLATES.length).toBeGreaterThanOrEqual(6)
    expect(new Set(ACTIVITY_TEMPLATES.map((t) => t.id)).size).toBe(ACTIVITY_TEMPLATES.length)
    expect(new Set(ACTIVITY_TEMPLATES.map((t) => t.label)).size).toBe(ACTIVITY_TEMPLATES.length)
  })

  it("기획이 요구한 여섯 템플릿을 포함한다", () => {
    const labels = ACTIVITY_TEMPLATES.map((t) => t.label)
    for (const required of ["재계약 콜", "데모 요청", "불만 접수", "방문 회의록", "미응답 문자", "결제 확인"]) {
      expect(labels).toContain(required)
    }
  })

  it("mode 는 컴포저가 실제로 쓰는 FormMode 값이고, sentiment 는 기존 감정 enum 값이다", () => {
    const modes = new Set(MODE_OPTIONS.map((option) => option.key))
    const sentiments = new Set(SENTIMENT_FILTERS.map((filter) => filter.key).filter((key) => key !== "all"))
    for (const template of ACTIVITY_TEMPLATES) {
      expect(modes.has(template.mode)).toBe(true)
      if (template.sentiment) expect(sentiments.has(template.sentiment)).toBe(true)
      expect(template.body.trim().length).toBeGreaterThan(0)
      // 커서 마커 같은 치환 토큰은 두지 않는다 — 본문은 그대로 textarea 에 들어간다.
      expect(template.body).not.toContain("{{")
    }
  })

  it("불만 접수는 리스크, 방문 회의록은 회의록 모드다", () => {
    expect(findActivityTemplate("complaint")?.sentiment).toBe("risk")
    expect(findActivityTemplate("visit_minutes")?.mode).toBe("meeting_minutes")
    expect(findActivityTemplate("nope")).toBeNull()
  })
})

describe("applyActivityTemplate", () => {
  const template = findActivityTemplate("renewal_call")!

  it("본문이 비어 있으면(공백만 있어도) 모드·본문·감정을 그대로 채운다", () => {
    const empty = applyActivityTemplate(template, { body: "" })
    expect(empty).toEqual({ needsConfirm: false, mode: "call", body: template.body, sentiment: "neutral" })
    const blank = applyActivityTemplate(template, { body: "   \n " })
    expect(blank.needsConfirm).toBe(false)
  })

  it("본문이 비어 있지 않으면 앞에 붙이거나 덮어쓰지 않고 needsConfirm 만 돌려준다", () => {
    const result = applyActivityTemplate(template, { body: "이미 적은 메모" })
    expect(result).toEqual({ needsConfirm: true })
  })

  it("감정이 없는 템플릿은 중립으로 되돌린다(이전 템플릿의 감정이 남지 않게)", () => {
    const prefill = activityTemplatePrefill({ id: "x", label: "x", mode: "manual_note", body: "b" })
    expect(prefill.sentiment).toBe("neutral")
  })
})
