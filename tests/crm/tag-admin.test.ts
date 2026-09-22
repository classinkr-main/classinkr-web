import { describe, expect, it } from "vitest"

import {
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  describeAutoTagRuleCondition,
  formatAutoTagRuleOutcomeLabel,
  formatMergePreviewLabel,
  formatRenamePreviewLabel,
  isTagCategory,
  validateMergeInput,
  validateRenameInput,
  validateTagName,
} from "@/lib/crm/tag-admin"

// T4 태그 관리 패널 — 순수 검증·미리보기 문구 계산. 실제 건수(updated/removedDuplicates)는
// 서버가 계산해 돌려주므로 여기서는 그 결과를 문구로 조립하는 부분과 입력 검증만 고정한다.

describe("validateTagName", () => {
  it("정규화 후 값을 돌려준다", () => {
    expect(validateTagName("  VIP  ")).toEqual({ ok: true, value: "VIP" })
  })

  it("공백만 있으면 거절한다", () => {
    expect(validateTagName("   ")).toEqual({ ok: false, error: "태그 이름을 입력하세요." })
  })
})

describe("validateRenameInput", () => {
  it("정규화된 from/to를 돌려준다", () => {
    expect(validateRenameInput(" 재계약 ", "재계약  요청")).toEqual({
      ok: true,
      from: "재계약",
      to: "재계약 요청",
    })
  })

  it("from이 비어있으면 거절한다", () => {
    expect(validateRenameInput("   ", "VIP")).toEqual({ ok: false, error: "변경할 태그가 없습니다." })
  })

  it("to가 비어있으면 거절한다", () => {
    expect(validateRenameInput("VIP", "   ")).toEqual({ ok: false, error: "태그 이름을 입력하세요." })
  })

  it("대소문자·공백만 다른 같은 이름이면 거절한다", () => {
    expect(validateRenameInput("VIP", "vip")).toEqual({ ok: false, error: "같은 이름으로는 변경할 수 없습니다." })
    expect(validateRenameInput("이탈 위험", "이탈   위험")).toEqual({
      ok: false,
      error: "같은 이름으로는 변경할 수 없습니다.",
    })
  })
})

describe("validateMergeInput", () => {
  it("소스 목록을 정규화·중복 제거해 돌려준다", () => {
    expect(validateMergeInput(["VIP", " vip ", "재계약"], "우수고객")).toEqual({
      ok: true,
      from: ["VIP", "재계약"],
      to: "우수고객",
    })
  })

  it("소스가 비어있으면 거절한다", () => {
    expect(validateMergeInput([], "우수고객")).toEqual({ ok: false, error: "병합할 태그를 선택하세요." })
    expect(validateMergeInput(["   "], "우수고객")).toEqual({ ok: false, error: "병합할 태그를 선택하세요." })
  })

  it("대상 이름이 비어있으면 거절한다", () => {
    expect(validateMergeInput(["VIP"], "  ")).toEqual({ ok: false, error: "태그 이름을 입력하세요." })
  })

  it("선택한 태그가 이미 전부 대상과 같으면 거절한다", () => {
    expect(validateMergeInput(["VIP", "vip"], "VIP")).toEqual({
      ok: false,
      error: "선택한 태그가 이미 대상 이름과 같습니다.",
    })
  })

  it("일부만 대상과 같아도 나머지가 있으면 통과한다(대상과 같은 항목도 from에 남는다)", () => {
    expect(validateMergeInput(["VIP", "재계약"], "VIP")).toEqual({
      ok: true,
      from: ["VIP", "재계약"],
      to: "VIP",
    })
  })
})

describe("formatRenamePreviewLabel", () => {
  it("중복 정리가 없으면 변경 건수만 표기한다", () => {
    expect(formatRenamePreviewLabel("VIP", "우수고객", { updated: 3, removedDuplicates: 0 })).toBe(
      "VIP → 우수고객, 3건 변경"
    )
  })

  it("중복 정리가 있으면 뒤에 붙인다", () => {
    expect(formatRenamePreviewLabel("VIP", "우수고객", { updated: 3, removedDuplicates: 2 })).toBe(
      "VIP → 우수고객, 3건 변경 · 중복 2건 정리"
    )
  })
})

describe("formatMergePreviewLabel", () => {
  it("소스 태그를 가운뎃점으로 이어 붙이고 건수를 표기한다", () => {
    expect(formatMergePreviewLabel(["VIP", "재계약"], "우수고객", { updated: 5, removedDuplicates: 0 })).toBe(
      "VIP·재계약 → 우수고객, 5건"
    )
  })

  it("중복 정리가 있으면 뒤에 붙인다", () => {
    expect(formatMergePreviewLabel(["VIP", "재계약"], "우수고객", { updated: 5, removedDuplicates: 1 })).toBe(
      "VIP·재계약 → 우수고객, 5건, 중복 1건 정리"
    )
  })
})

// ── T6 범주 ──────────────────────────────────────────────────────────────

describe("TAG_CATEGORIES / isTagCategory", () => {
  it("범주는 정확히 5종(segment·stage·risk·product·manual)이다", () => {
    expect(TAG_CATEGORIES).toEqual(["segment", "stage", "risk", "product", "manual"])
  })

  it("5종 모두 라벨을 갖는다", () => {
    for (const category of TAG_CATEGORIES) {
      expect(typeof TAG_CATEGORY_LABELS[category]).toBe("string")
      expect(TAG_CATEGORY_LABELS[category].length).toBeGreaterThan(0)
    }
  })

  it("isTagCategory는 5종만 참으로 판정한다", () => {
    for (const category of TAG_CATEGORIES) expect(isTagCategory(category)).toBe(true)
    expect(isTagCategory("color")).toBe(false)
    expect(isTagCategory(123)).toBe(false)
    expect(isTagCategory(null)).toBe(false)
    expect(isTagCategory(undefined)).toBe(false)
  })
})

// ── T5 자동 태그 규칙 문구 ──────────────────────────────────────────────────

describe("describeAutoTagRuleCondition", () => {
  it("expiring_within_days: params.days가 있으면 그 값을 쓴다", () => {
    expect(describeAutoTagRuleCondition({ ruleType: "expiring_within_days", params: { days: 30 } })).toBe(
      "만료 30일 이내"
    )
  })

  it("expiring_within_days: params.days가 없으면 기본값 30을 쓴다", () => {
    expect(describeAutoTagRuleCondition({ ruleType: "expiring_within_days", params: {} })).toBe("만료 30일 이내")
  })

  it("health_risk: 고정 문구", () => {
    expect(describeAutoTagRuleCondition({ ruleType: "health_risk", params: {} })).toBe("건강도 위험 밴드")
  })

  it("dormant_days: params.days가 없으면 기본값 60을 쓴다", () => {
    expect(describeAutoTagRuleCondition({ ruleType: "dormant_days", params: {} })).toBe(
      "최근 접촉 60일 이전 또는 없음"
    )
  })
})

describe("formatAutoTagRuleOutcomeLabel", () => {
  it("적용·제거 건수를 함께 표기한다", () => {
    expect(formatAutoTagRuleOutcomeLabel(3, 1)).toBe("3건 적용 · 1건 제거")
  })

  it("0건도 그대로 표기한다(생략하지 않는다)", () => {
    expect(formatAutoTagRuleOutcomeLabel(0, 0)).toBe("0건 적용 · 0건 제거")
  })
})
