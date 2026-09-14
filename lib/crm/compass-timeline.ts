/**
 * compass-timeline.ts — Compass(마케팅팀 앱) 활동을 고객 360 타임라인에 병합하는 순수 계층.
 *
 * 규약:
 *  - `system` 종류는 앱이 스스로 남긴 노이즈라 제외한다(2026-08-28 실측 1,000행 중 348행).
 *    예외는 메타 리드폼 **폼 답변**(본문이 `폼 답변\n` 으로 시작) 하나다 — 고객이 폼에 적은 답이라
 *    노이즈가 아니다(2026-09-14, Compass lib/metaLeadForm.ts FORM_ANSWERS_PREFIX 와 같은 머리).
 *  - 사전에 없는 종류는 조용히 버린다. 그래서 Compass 가 새로 쓰기 시작한 sms(문자 퀵기록)·memo·action
 *    (고객관리 컴포저)·alimtalk(웹훅 자동 발송)이 타임라인에서 빠져 있었다(Compass 감사 R3 T10 ③).
 *  - `actor`는 표시용 문자열일 뿐이다. Compass는 공용 비밀번호로 쓰는 앱이라 actor가
 *    누구인지 증명하지 못한다 — 어드민 계정과 매핑하지 않는다.
 *  - 병합은 시간 역순(최신 우선) 한 축뿐이다. 우리 기록과 Compass 기록을 섞되
 *    어느 쪽에서 왔는지는 항상 소스 라벨로 구분된다.
 */
import { compassLeadUrl } from "@/lib/compass/normalize"

/** 브리지 행에서 타임라인이 실제로 쓰는 필드만(구조적 호환 — server-only 모듈을 끌어오지 않는다). */
export interface CompassActivityLike {
  id: number
  lead_id: number
  kind: string | null
  body: string | null
  actor: string | null
  created_at: string
}

export const COMPASS_TIMELINE_SOURCE_LABEL = "Compass"

/** 화면에 올리는 활동 종류. system 은 의도적으로 빠져 있다(폼 답변만 compassActivityKindLabel 이 따로 올린다).
 *  라벨은 Compass lib/taxonomy/defs.ts ACTIVITY_KINDS 를 따르되, 기존 표시(call "콜")는 바꾸지 않았다. */
export const COMPASS_ACTIVITY_KIND_LABEL: Record<string, string> = {
  call: "콜",
  sms: "문자",
  meeting: "미팅",
  note: "메모",
  memo: "메모",
  action: "액션",
  alimtalk: "알림톡",
  inflow: "재유입",
  stage_change: "단계 변경",
}

/** Compass 폼 답변 본문 머리 — Compass lib/metaLeadForm.ts FORM_ANSWERS_PREFIX(kind='system', "폼 답변\n질문: 답…"). */
export const COMPASS_FORM_ANSWERS_PREFIX = "폼 답변"

function isFormAnswersBody(body: string | null | undefined): boolean {
  return (body ?? "").startsWith(`${COMPASS_FORM_ANSWERS_PREFIX}\n`)
}

/**
 * 활동 한 건의 표시 라벨. 올리지 않을 기록이면 null.
 *  - system 은 본문이 `폼 답변\n` 으로 시작할 때만 "폼 답변"(머리만 같고 줄바꿈이 없는 정비 로그는 제외).
 *  - 그 밖은 COMPASS_ACTIVITY_KIND_LABEL 사전 — 모르는 종류는 지어내지 않고 버린다.
 */
export function compassActivityKindLabel(
  kind: string | null | undefined,
  body: string | null | undefined
): string | null {
  const key = kind?.trim()
  if (!key) return null
  if (key === "system") return isFormAnswersBody(body) ? COMPASS_FORM_ANSWERS_PREFIX : null
  return COMPASS_ACTIVITY_KIND_LABEL[key] ?? null
}

/**
 * 어드민 타임라인 필터 축 — Compass 종류를 화면의 기존 축(메모·회의록·유입·그 밖)에 눕힌다.
 * 종류를 새로 만들지 않는다. 사전에 없는 종류는 other.
 */
export type CompassTimelineGroup = "memo" | "meeting" | "inflow" | "other"

const COMPASS_KIND_GROUP: Record<string, CompassTimelineGroup> = {
  note: "memo",
  memo: "memo",
  meeting: "meeting",
  inflow: "inflow",
  // 폼 답변 — system 중 올라오는 것은 이것뿐이다(유입 때 고객이 적은 답).
  system: "inflow",
}

export function compassTimelineGroup(kind: string): CompassTimelineGroup {
  return COMPASS_KIND_GROUP[kind] ?? "other"
}

export interface CompassTimelineEntry {
  id: string
  compassLeadId: number
  kind: string
  kindLabel: string
  body: string | null
  /** 표시용 문자열. 어드민 신원과 매핑하지 않는다. */
  actor: string | null
  occurredAt: string
  /** Compass 리드 상세 딥링크 */
  href: string
}

/** 활동 행 → 타임라인 엔트리. 알 수 없는 종류·system(폼 답변 제외)은 빼고, 최신순으로 돌려준다.
 *  폼 답변은 라벨이 머리를 이미 말하므로 본문에서 머리 줄을 뗀다("질문: 답" 줄만 남긴다). */
export function toCompassTimelineEntries(rows: CompassActivityLike[]): CompassTimelineEntry[] {
  const entries: CompassTimelineEntry[] = []
  for (const row of rows) {
    const kind = row.kind?.trim()
    if (!kind) continue
    const kindLabel = compassActivityKindLabel(kind, row.body)
    if (!kindLabel) continue
    if (!row.created_at) continue
    const body = kind === "system" ? (row.body ?? "").slice(COMPASS_FORM_ANSWERS_PREFIX.length + 1) : row.body
    entries.push({
      id: `compass:${row.id}`,
      compassLeadId: row.lead_id,
      kind,
      kindLabel,
      body: body?.trim() || null,
      actor: row.actor?.trim() || null,
      occurredAt: row.created_at,
      href: compassLeadUrl(row.lead_id),
    })
  }
  return entries.sort((a, b) => compareIsoDesc(a.occurredAt, b.occurredAt))
}

function toTime(value: string | null | undefined) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function compareIsoDesc(a: string, b: string) {
  return toTime(b) - toTime(a)
}

export type MergedTimelineItem<T> =
  | { kind: "crm"; at: string; event: T }
  | { kind: "compass"; at: string; entry: CompassTimelineEntry }

/**
 * 기존 CRM 활동 행과 Compass 엔트리를 시간 역순 한 줄로 합친다.
 * 동시각이면 CRM 기록을 먼저 둔다(우리 원장이 기준선).
 */
export function mergeCompassTimeline<T extends { occurredAt: string }>(
  crmRows: T[],
  compassEntries: CompassTimelineEntry[]
): Array<MergedTimelineItem<T>> {
  const merged: Array<MergedTimelineItem<T>> = [
    ...crmRows.map((event) => ({ kind: "crm" as const, at: event.occurredAt, event })),
    ...compassEntries.map((entry) => ({ kind: "compass" as const, at: entry.occurredAt, entry })),
  ]
  return merged.sort((a, b) => {
    const delta = toTime(b.at) - toTime(a.at)
    if (delta !== 0) return delta
    if (a.kind === b.kind) return 0
    return a.kind === "crm" ? -1 : 1
  })
}
