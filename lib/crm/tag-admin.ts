// 태그 관리 패널(§14 T4)의 순수 로직 — 이름 검증과 이름 변경·병합 미리보기 문구 계산만 담는다.
//
// DB 접근은 하지 않는다: 실제 건수(업데이트·중복 정리)는 서버(app/api/admin/crm/tags/route.ts →
// lib/repositories/crm-customer-tags.ts)가 계산해 돌려주고, 이 모듈은 그 입력을 검증하고 결과
// 숫자를 사람이 읽는 문구로 조립하는 역할만 한다. normalizeTag/isDuplicateTag는 고객 360 태그
// 칩(lib/crm/tag-suggestions.ts)과 같은 규칙을 그대로 쓴다 — 패널이 미리 보여주는 이름과 서버가
// 실제로 저장하는 이름이 어긋나지 않아야 한다.

import { isDuplicateTag, normalizeTag } from "@/lib/crm/tag-suggestions"
import type { AutoTagRuleType } from "@/lib/crm/auto-tag-rules"

// ── T6 범주 — 색 컬럼은 추가하지 않는다(DESIGN.md가 카테고리 색을 제한). 범주는 라벨/점으로만
// 구분하고, 신호색(Warning)은 risk 범주에만 쓴다(다른 4종은 웜 뉴트럴 텍스트).
export const TAG_CATEGORIES = ["segment", "stage", "risk", "product", "manual"] as const
export type TagCategory = (typeof TAG_CATEGORIES)[number]

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  segment: "세그먼트",
  stage: "단계",
  risk: "위험",
  product: "제품",
  manual: "수기",
}

export function isTagCategory(value: unknown): value is TagCategory {
  return typeof value === "string" && (TAG_CATEGORIES as readonly string[]).includes(value)
}

export type TagNameValidation = { ok: true; value: string } | { ok: false; error: string }

/** 단일 태그 이름 검증 — trim/공백 정규화 후 빈 문자열이면 거절. */
export function validateTagName(raw: string): TagNameValidation {
  const value = normalizeTag(raw)
  if (!value) return { ok: false, error: "태그 이름을 입력하세요." }
  return { ok: true, value }
}

export type RenameInputValidation = { ok: true; from: string; to: string } | { ok: false; error: string }

/** 이름 변경 입력 검증 — 대상이 비어있거나, 바꿀 이름이 비어있거나, 사실상 같은 이름이면 거절. */
export function validateRenameInput(fromRaw: string, toRaw: string): RenameInputValidation {
  const from = normalizeTag(fromRaw)
  if (!from) return { ok: false, error: "변경할 태그가 없습니다." }
  const target = validateTagName(toRaw)
  if (!target.ok) return target
  if (isDuplicateTag([from], target.value)) {
    return { ok: false, error: "같은 이름으로는 변경할 수 없습니다." }
  }
  return { ok: true, from, to: target.value }
}

export type MergeInputValidation = { ok: true; from: string[]; to: string } | { ok: false; error: string }

/**
 * 병합 입력 검증 — 원본 목록을 정규화·대소문자 무시 중복 제거한 뒤, 대상 이름과 사실상 같은
 * 항목을 걸러낸다(그 항목은 이미 목표 상태라 손댈 필요가 없다). 걸러내고 남는 것이 없으면
 * "변경 없음"이라 거절한다.
 */
export function validateMergeInput(fromListRaw: readonly string[], toRaw: string): MergeInputValidation {
  const target = validateTagName(toRaw)
  if (!target.ok) return target

  const seen = new Set<string>()
  const from: string[] = []
  for (const raw of fromListRaw) {
    const clean = normalizeTag(raw)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    from.push(clean)
  }
  if (from.length === 0) return { ok: false, error: "병합할 태그를 선택하세요." }

  const meaningful = from.filter((tag) => !isDuplicateTag([tag], target.value))
  if (meaningful.length === 0) return { ok: false, error: "선택한 태그가 이미 대상 이름과 같습니다." }

  return { ok: true, from, to: target.value }
}

/** 서버(rename/mergeCustomerTag)가 돌려주는 결과 — 미리보기(dryRun)와 실제 커밋이 같은 모양을 쓴다. */
export interface TagBulkOutcome {
  updated: number
  removedDuplicates: number
}

/** "A → B, N건 변경" — 중복 정리가 있으면 뒤에 붙인다. 이름 변경 미리보기·결과 캡션 공용. */
export function formatRenamePreviewLabel(from: string, to: string, outcome: TagBulkOutcome): string {
  const base = `${from} → ${to}, ${outcome.updated.toLocaleString("ko-KR")}건 변경`
  return outcome.removedDuplicates > 0
    ? `${base} · 중복 ${outcome.removedDuplicates.toLocaleString("ko-KR")}건 정리`
    : base
}

/** "A·B → C, N건, 중복 M건 정리" — 병합 미리보기·결과 캡션 공용. */
export function formatMergePreviewLabel(from: readonly string[], to: string, outcome: TagBulkOutcome): string {
  const source = from.join("·")
  const base = `${source} → ${to}, ${outcome.updated.toLocaleString("ko-KR")}건`
  return outcome.removedDuplicates > 0
    ? `${base}, 중복 ${outcome.removedDuplicates.toLocaleString("ko-KR")}건 정리`
    : base
}

// ── T5 자동 태그 규칙 — 관리 패널 조건 설명 문구 ───────────────────────────

export interface AutoTagRuleLike {
  ruleType: AutoTagRuleType
  params: { days?: unknown } | null | undefined
}

function ruleDays(params: AutoTagRuleLike["params"], fallback: number): number {
  const raw = params?.days
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback
}

/** 규칙 조건을 사람이 읽는 한 줄로 — 관리 패널 규칙 섹션·미리보기 라벨 공용. */
export function describeAutoTagRuleCondition(rule: AutoTagRuleLike): string {
  switch (rule.ruleType) {
    case "expiring_within_days":
      return `만료 ${ruleDays(rule.params, 30)}일 이내`
    case "health_risk":
      return "건강도 위험 밴드"
    case "dormant_days":
      return `최근 접촉 ${ruleDays(rule.params, 60)}일 이전 또는 없음`
    default:
      return "알 수 없는 조건"
  }
}

/** "N건 적용 · M건 제거" — dryRun 미리보기·규칙 섹션 요약 공용. */
export function formatAutoTagRuleOutcomeLabel(applied: number, removed: number): string {
  return `${applied.toLocaleString("ko-KR")}건 적용 · ${removed.toLocaleString("ko-KR")}건 제거`
}
