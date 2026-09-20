// 고객 360 태그 칩의 제안 목록·정규화·중복 판정 SSOT(§13 Q3). 순수 함수만 담아 서버
// (lib/repositories/crm-customer-tags.ts, "server-only")와 클라이언트 컴포넌트(CustomerTagChips)
// 양쪽에서 안전하게 쓴다.
//
// normalizeTag는 서버의 crm-customer-tags.ts normalizeTag와 동일한 규칙(trim → 연속 공백 1칸 →
// 40자 컷)을 유지한다 — 클라이언트가 미리 보여주는 형태가 서버가 실제로 저장할 형태와 어긋나지
// 않아야 하기 때문이다. 규칙이 바뀌면 두 파일을 함께 고친다.

/** 360 개요 "태그" 섹션이 원클릭 추가로 보여주는 제안 목록. */
export const SUGGESTED_TAGS: readonly string[] = ["재계약", "데모 요청", "VIP", "이탈 위험", "하드웨어", "업셀"]

const TAG_MAX_LENGTH = 40

/** trim + 연속 공백 1칸 + 40자 컷. 빈 문자열이 될 수 있다(호출부가 걸러야 함). */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, TAG_MAX_LENGTH)
}

/** 대소문자·공백 차이를 무시하고 candidate가 tags 안에 이미 있는지 판정한다. */
export function isDuplicateTag(tags: readonly string[], candidate: string): boolean {
  const target = normalizeTag(candidate).toLowerCase()
  if (!target) return false
  return tags.some((tag) => normalizeTag(tag).toLowerCase() === target)
}
