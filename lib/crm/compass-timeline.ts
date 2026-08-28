/**
 * compass-timeline.ts — Compass(마케팅팀 앱) 활동을 고객 360 타임라인에 병합하는 순수 계층.
 *
 * 규약:
 *  - `system` 종류는 앱이 스스로 남긴 노이즈라 제외한다(2026-08-28 실측 1,000행 중 348행).
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

/** 화면에 올리는 활동 종류. system 은 의도적으로 빠져 있다. */
export const COMPASS_ACTIVITY_KIND_LABEL: Record<string, string> = {
  call: "콜",
  meeting: "미팅",
  note: "메모",
  inflow: "재유입",
  stage_change: "단계 변경",
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

/** 활동 행 → 타임라인 엔트리. 알 수 없는 종류·system 은 제외하고, 최신순으로 돌려준다. */
export function toCompassTimelineEntries(rows: CompassActivityLike[]): CompassTimelineEntry[] {
  const entries: CompassTimelineEntry[] = []
  for (const row of rows) {
    const kind = row.kind?.trim()
    if (!kind) continue
    const kindLabel = COMPASS_ACTIVITY_KIND_LABEL[kind]
    if (!kindLabel) continue
    if (!row.created_at) continue
    entries.push({
      id: `compass:${row.id}`,
      compassLeadId: row.lead_id,
      kind,
      kindLabel,
      body: row.body?.trim() || null,
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
