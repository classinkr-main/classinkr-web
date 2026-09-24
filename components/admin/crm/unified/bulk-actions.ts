// 통합 고객 선택 → 일괄 행동(태그·할 일·CSV) — 요청 조립·응답 요약의 순수 헬퍼와 호출 함수.
//
// 일괄 API 는 W3 라우트가 소유한다(이 파일은 계약대로 호출만 한다):
//  - POST /api/admin/crm/tags/bulk  { keys, label, action? }  → { applied, skipped, invalid, failed, action, label }
//  - POST /api/admin/crm/tasks/bulk { keys, title, dueAt?, note? } → { created, skipped, invalid, failed }
//  응답은 평평한 JSON(다른 CRM 쓰기 라우트와 같은 규약)이다. 혹시 { data: … } 봉투로 오더라도 풀어서 읽는다.
//  부분 실패도 200(failed 에 키) — 토스트에 "N건 실패"를 싣는다. 전부 실패면 500 → adminFetchJson 이 던진다.
// 선택은 현재 페이지 행만(조건 전체 선택은 이번 범위 밖).

import { adminFetchJson } from "@/lib/admin-client"
import { resolveTaskPresetDueAt, type TaskQuickPreset, type TaskQuickPresetDue } from "@/lib/crm/task-quick-presets"

export const BULK_TAG_MAX_KEYS = 500
export const BULK_TASK_MAX_KEYS = 200
export const BULK_TAG_MAX_LENGTH = 40
export const BULK_TASK_TITLE_MAX_LENGTH = 120

export interface BulkTagResult {
  applied: number
  skipped: number
  invalid: string[]
  failed: string[]
}

export interface BulkTaskResult {
  created: number
  skipped: number
  invalid: string[]
  failed: string[]
}

export interface BulkTaskPreset {
  id: string
  label: string
  due: TaskQuickPresetDue
}

/** 할 일 프리셋 — 제목과 기한(KST)을 한 번에 채운다. 기한 계산은 lib/crm/task-quick-presets.ts 정본. */
export const BULK_TASK_PRESETS: readonly BulkTaskPreset[] = [
  { id: "call_tomorrow", label: "내일 재통화", due: "tomorrow_10" },
  { id: "contact_this_week", label: "이번 주 연락", due: "this_friday_18" },
  { id: "contact_next_week", label: "다음 주 연락", due: "next_monday_10" },
]

export function resolveBulkTaskDueAt(preset: BulkTaskPreset, nowMs: number): string {
  const quick: TaskQuickPreset = { id: preset.id, label: preset.label, taskType: "call", due: preset.due }
  return resolveTaskPresetDueAt(quick, nowMs)
}

function toCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

/** 평평한 응답 또는 { data } 봉투 — 둘 다 받는다. */
function unwrap(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {}
  const record = body as Record<string, unknown>
  const inner = record.data
  if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>
  return record
}

export function normalizeBulkTagResult(body: unknown): BulkTagResult {
  const record = unwrap(body)
  return {
    applied: toCount(record.applied),
    skipped: toCount(record.skipped),
    invalid: toStringList(record.invalid),
    failed: toStringList(record.failed),
  }
}

export function normalizeBulkTaskResult(body: unknown): BulkTaskResult {
  const record = unwrap(body)
  return {
    created: toCount(record.created),
    skipped: toCount(record.skipped),
    invalid: toStringList(record.invalid),
    failed: toStringList(record.failed),
  }
}

function tailParts(result: { skipped: number; failed: string[]; invalid: string[] }) {
  const parts: string[] = []
  if (result.skipped > 0) parts.push(`건너뜀 ${result.skipped.toLocaleString("ko-KR")}`)
  if (result.failed.length > 0) parts.push(`${result.failed.length.toLocaleString("ko-KR")}건 실패`)
  if (result.invalid.length > 0) parts.push(`대상 아님 ${result.invalid.length.toLocaleString("ko-KR")}`)
  return parts
}

/** "12명에 '재계약' 태그 · 건너뜀 1 · 2건 실패" */
export function summarizeBulkTagResult(result: BulkTagResult, label: string): string {
  return [`${result.applied.toLocaleString("ko-KR")}명에 '${label}' 태그`, ...tailParts(result)].join(" · ")
}

/** "12명에 할 일 '내일 재통화' · 건너뜀 1" */
export function summarizeBulkTaskResult(result: BulkTaskResult, title: string): string {
  return [`${result.created.toLocaleString("ko-KR")}명에 할 일 '${title}'`, ...tailParts(result)].join(" · ")
}

/** 부분 실패가 있으면 오류 톤 — 성공처럼 보이지 않게. */
export function bulkResultTone(result: { failed: string[] }): "success" | "error" {
  return result.failed.length > 0 ? "error" : "success"
}

export function normalizeBulkTagLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}

/** 태그 입력 검증 — 통과면 null, 아니면 인라인 오류 문구. */
export function validateBulkTagLabel(label: string): string | null {
  if (!label) return "태그를 입력하세요."
  if (label.length > BULK_TAG_MAX_LENGTH) return `태그는 ${BULK_TAG_MAX_LENGTH}자 이하로 입력하세요.`
  return null
}

export function validateBulkTaskTitle(title: string): string | null {
  if (!title.trim()) return "할 일 제목을 입력하세요."
  if (title.trim().length > BULK_TASK_TITLE_MAX_LENGTH) return `제목은 ${BULK_TASK_TITLE_MAX_LENGTH}자 이하로 입력하세요.`
  return null
}

export async function postBulkTags(keys: readonly string[], label: string): Promise<BulkTagResult> {
  const body = await adminFetchJson<unknown>("/api/admin/crm/tags/bulk", {
    method: "POST",
    body: JSON.stringify({ keys: keys.slice(0, BULK_TAG_MAX_KEYS), label, action: "add" }),
  })
  return normalizeBulkTagResult(body)
}

export async function postBulkTasks(
  keys: readonly string[],
  input: { title: string; dueAt: string | null }
): Promise<BulkTaskResult> {
  const body = await adminFetchJson<unknown>("/api/admin/crm/tasks/bulk", {
    method: "POST",
    body: JSON.stringify({ keys: keys.slice(0, BULK_TASK_MAX_KEYS), title: input.title.trim(), dueAt: input.dueAt }),
  })
  return normalizeBulkTaskResult(body)
}
