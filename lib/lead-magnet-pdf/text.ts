// 리드마그넷 PDF 텍스트 헬퍼 — 글꼴 없이 테스트할 수 있는 순수 함수만 둔다.
// 줄바꿈 규칙은 scripts/generate-lead-magnet-pdfs.py 의 wrap_text 를 그대로 옮겼다:
// 공백 단위(어절)로 채우고, 한 어절이 한 줄보다 길면 글자 단위로 자른다.

import type { LeadMagnet } from "@/lib/lead-magnets"

/** 문자열 폭(pt)을 재는 함수. 렌더러는 글꼴·크기를 묶어 넘긴다. */
export type MeasureText = (text: string) => number

/** None·nbsp·연속 공백을 정리한다(Python clean_text). */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).replace(/ /g, " ").replace(/\s+/g, " ").trim()
}

/** 가장 긴 접두(글자 단위)로 maxWidth 안에 들어가는 부분. 한 글자도 안 들어가면 "". */
function fittingPrefix(chars: readonly string[], measure: MeasureText, maxWidth: number) {
  let chunk = ""
  for (const char of chars) {
    if (measure(`${chunk}${char}`) <= maxWidth) chunk += char
    else break
  }
  return chunk
}

/**
 * 측정 폭 기준 줄바꿈. 공백만 버리고 글자는 하나도 버리지 않는다.
 * 한 글자가 maxWidth 보다 넓은 극단값만 그 글자 하나를 한 줄로 둔다.
 */
export function wrapText(value: unknown, measure: MeasureText, maxWidth: number): string[] {
  const text = cleanText(value)
  if (!text) return []

  const lines: string[] = []
  let current = ""

  const appendToken = (token: string) => {
    const candidate = `${current}${token}`
    if (measure(candidate) <= maxWidth) {
      current = candidate
      return
    }

    if (current.trim()) {
      lines.push(current.trimEnd())
      current = token.trimStart()
    } else {
      current = ""
      for (const char of Array.from(token)) {
        if (measure(`${current}${char}`) <= maxWidth) {
          current += char
        } else {
          if (current) lines.push(current)
          current = char
        }
      }
    }

    // 새 어절 자체가 한 줄보다 길면 맞는 만큼씩 잘라 낸다.
    while (current && measure(current) > maxWidth) {
      const chars = Array.from(current)
      const chunk = fittingPrefix(chars, measure, maxWidth)
      if (!chunk) {
        // 한 글자도 안 들어가는 폭 — 글자를 잃지 않도록 한 글자씩 내보낸다.
        lines.push(chars[0])
        current = chars.slice(1).join("").trimStart()
        continue
      }
      lines.push(chunk)
      current = chars.slice(Array.from(chunk).length).join("").trimStart()
    }
  }

  for (const token of text.split(/(\s+)/)) {
    if (token) appendToken(token)
  }

  if (current.trim()) lines.push(current.trimEnd())
  return lines
}

/** 폭을 넘는 한 줄을 말줄임(…)으로 줄인다. 머리글처럼 한 줄만 허용되는 자리에 쓴다. */
export function truncateToWidth(value: unknown, measure: MeasureText, maxWidth: number, ellipsis = "…") {
  const text = cleanText(value)
  if (measure(text) <= maxWidth) return text
  const chars = Array.from(text)
  while (chars.length > 0 && measure(`${chars.join("").trimEnd()}${ellipsis}`) > maxWidth) chars.pop()
  return chars.length > 0 ? `${chars.join("").trimEnd()}${ellipsis}` : ""
}

const CATEGORY_LABELS: Record<string, string> = {
  operations: "운영",
  hardware: "하드웨어",
  software: "소프트웨어",
  "case-study": "사례",
  security: "보안",
}

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category
}

export function tierLabel(tier: string) {
  return tier === "advanced" ? "심화" : "기본"
}

export function countChecklistItems(magnet: Pick<LeadMagnet, "sections">) {
  return (magnet.sections ?? []).reduce((total, section) => total + (section.items?.length ?? 0), 0)
}

/** 작업표 hint("ON · 필요 시 · …")가 열 수와 정확히 맞으면 칸별 예시값으로 나눈다. */
export function splitWorksheetHint(hint: unknown, columnCount: number): string[] | null {
  const text = cleanText(hint)
  if (!text || columnCount <= 0) return null
  const parts = text.split(/\s+·\s+/).map((part) => part.trim())
  return parts.length === columnCount && parts.every(Boolean) ? parts : null
}
