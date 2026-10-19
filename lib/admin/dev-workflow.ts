export const BUG_STATUS_VALUES = ["open", "in-progress", "resolved", "closed"] as const
export const BUG_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const
export const PATCH_NOTE_STATUS_VALUES = ["draft", "published"] as const

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T)
}

export function isBugStatus(value: unknown) {
  return isOneOf(value, BUG_STATUS_VALUES)
}

export function isBugSeverity(value: unknown) {
  return isOneOf(value, BUG_SEVERITY_VALUES)
}

export function isPatchNoteStatus(value: unknown) {
  return isOneOf(value, PATCH_NOTE_STATUS_VALUES)
}

/** 버그 리포트 칸 길이 상한 — 화면 입력을 넘는 값은 저장 전에 자른다(본문 통째 저장 방지). */
export const BUG_TITLE_MAX = 200
export const BUG_DESCRIPTION_MAX = 10_000
export const BUG_SHORT_FIELD_MAX = 200
export const BUG_TAGS_MAX = 20

export interface BugReportInput {
  title: string
  description: string
  severity: (typeof BUG_SEVERITY_VALUES)[number]
  reporter: string
  assignee?: string
  environment?: string
  tags: string[]
}

function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

/**
 * POST /api/admin/bugs 본문 → 저장할 칸만. 잘못된 모양이면 { error } (400 사유).
 * 예전 라우트는 본문을 그대로 펼쳐 저장소에 넘겨, severity 오타가 DB check 위반 500 이 되고
 * 신고자 이름도 클라이언트 값을 그대로 믿었다(2026-10-12). 신고자는 서버 세션 이름을 우선한다.
 */
export function sanitizeBugReportInput(
  body: unknown,
  sessionName?: string | null
): BugReportInput | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid JSON body" }
  const raw = body as Record<string, unknown>
  const title = optionalText(raw.title, BUG_TITLE_MAX)
  if (!title) return { error: "title is required" }
  if (raw.severity !== undefined && !isBugSeverity(raw.severity)) return { error: "Invalid bug severity" }
  const reporter = optionalText(sessionName, BUG_SHORT_FIELD_MAX) ?? optionalText(raw.reporter, BUG_SHORT_FIELD_MAX)
  if (!reporter) return { error: "reporter is required" }
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((tag) => optionalText(tag, 50)).filter((tag): tag is string => Boolean(tag)))].slice(0, BUG_TAGS_MAX)
    : []
  return {
    title,
    description: optionalText(raw.description, BUG_DESCRIPTION_MAX) ?? "",
    severity: (raw.severity as BugReportInput["severity"] | undefined) ?? "medium",
    reporter,
    assignee: optionalText(raw.assignee, BUG_SHORT_FIELD_MAX),
    environment: optionalText(raw.environment, BUG_SHORT_FIELD_MAX),
    tags,
  }
}
