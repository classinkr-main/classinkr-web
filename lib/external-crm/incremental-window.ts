// lib/external-crm/incremental-window.ts
// 외부 CRM(샤오쇼우이) 객체의 증분 동기화 계획 — 큰 객체(예: ResourceInformation__c 6.7만 행)를 매번 전량 읽지 않고
// 최근 변경분만 읽는다. 운영 크론(xiaoshouyi-sync.ts)과 로컬 MCP 스크립트(scripts/sync-neo-via-mcp.mjs)가 같이 쓴다.
//
// 켜는 법: crm_xiaoshouyi_query_catalog.metadata.incremental = { field, overlapHours, fullEveryDays }.
//
// 규칙:
//  - 증분 = 마지막으로 끝까지 읽은(cursor_value='complete') 성공 런의 시작 시각 − overlapHours 이후 변경분.
//  - 증분 런은 "이번에 못 본 행 = 삭제됨"을 판단할 수 없으므로 stale 표시를 하지 않는다(호출부 책임).
//  - 그래서 fullEveryDays 마다 한 번은 전량 런으로 돌려 삭제를 잡는다. 전량 런 기록이 없어도 전량.
//  - mode 칸이 없는 옛 런은 전량 런으로 본다(이 기능 전에는 전량만 있었다).
//
// 노드가 .mjs 에서 바로 import 하므로(타입 제거) 경로 별칭·enum·namespace 를 쓰지 않는다.

export interface IncrementalConfig {
  field: string
  overlapHours: number
  fullEveryDays: number
}

export interface SyncRunLike {
  started_at: string
  status: string | null
  cursor_value: string | null
  metadata: Record<string, unknown> | null
}

export type IncrementalPlan =
  | { mode: "full"; reason: string }
  | { mode: "incremental"; sinceMs: number; field: string }

const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function readIncrementalConfig(metadata: Record<string, unknown> | null | undefined): IncrementalConfig | null {
  const raw = metadata?.incremental
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const field = typeof r.field === "string" && FIELD_PATTERN.test(r.field) ? r.field : null
  if (!field) return null
  const overlapHours = Number(r.overlapHours)
  const fullEveryDays = Number(r.fullEveryDays)
  return {
    field,
    overlapHours: Number.isFinite(overlapHours) && overlapHours >= 0 ? overlapHours : 48,
    fullEveryDays: Number.isFinite(fullEveryDays) && fullEveryDays > 0 ? fullEveryDays : 7,
  }
}

function isComplete(run: SyncRunLike): boolean {
  return run.status === "success" && run.cursor_value === "complete"
}

/** runs 는 같은 객체의 최근 런(순서 무관). */
export function planIncrementalSync(
  config: IncrementalConfig | null,
  runs: readonly SyncRunLike[],
  now: Date,
): IncrementalPlan {
  if (!config) return { mode: "full", reason: "증분 설정 없음" }
  const complete = runs.filter(isComplete).sort((a, b) => b.started_at.localeCompare(a.started_at))
  const lastFull = complete.find((run) => run.metadata?.mode !== "incremental")
  if (!lastFull) return { mode: "full", reason: "전량 런 기록 없음" }
  if (now.getTime() - Date.parse(lastFull.started_at) >= config.fullEveryDays * 86_400_000) {
    return { mode: "full", reason: `마지막 전량 런이 ${config.fullEveryDays}일 이상 지남` }
  }
  const lastComplete = complete[0]
  return {
    mode: "incremental",
    field: config.field,
    sinceMs: Date.parse(lastComplete.started_at) - config.overlapHours * 3_600_000,
  }
}

/** 기존 where 절과 AND 로 묶는다. 값은 epoch ms 숫자(샤오쇼우이 updatedAt 형식). */
export function withIncrementalWhere(whereClause: string | null | undefined, plan: IncrementalPlan): string | null {
  const base = whereClause?.trim() || null
  if (plan.mode !== "incremental") return base
  const cond = `${plan.field} >= ${Math.floor(plan.sinceMs)}`
  return base ? `(${base}) AND ${cond}` : cond
}
