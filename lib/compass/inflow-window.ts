// Compass 리드의 "기간 안 유입" — 신규(created_at)와 재유입(last_inflow_at)을 함께 본다. 순수 모듈.
//
// 왜(2026-09-14, Compass 감사 R2 F12): Compass 는 신규 리드를 넣을 때 last_inflow_at 을 비워 두고
// (웹훅·시트·수동 등록·BD 설명회 insert 모두), 같은 연락처가 다시 들어올 때만 채운다. 어드민 쪽
// public.leads 는 last_inflow_at 을 created_at 으로 백필해 둔 테이블이라, 같은 전제로 compass_leads_v 를
// last_inflow_at 만으로 조회하면 **Compass 신규 리드가 전부 빠지고 재유입만 "오늘 유입"으로 잡혔다.**
// 뷰에 latest_inflow_at 컬럼을 더하려면 마이그레이션이 필요해서, 기존 뷰 컬럼 두 개(created_at·
// last_inflow_at)를 OR 로 묶어 읽는다.

/** 기간 판정 결과 — 신규면 생성 시각, 재유입이면 최신 재유입 시각. */
export type CompassInflowKind = "new" | "reinflow"

export interface CompassInflowEvent {
  kind: CompassInflowKind
  at: string
  atMs: number
}

export interface CompassInflowTimes {
  created_at: string | null | undefined
  last_inflow_at: string | null | undefined
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** ISO 시각을 PostgREST 필터 값으로 쓰기 전에 Date 로 한 번 통과시킨다 — 형식이 어긋난 문자열(쉼표·괄호가
 *  섞인 값)이 필터 구문에 그대로 끼어들지 않게. 잘못된 값이면 던진다(브리지가 down 으로 바꾼다). */
function canonicalIso(value: string, name: string): string {
  const ms = timeOf(value)
  if (ms == null) throw new RangeError(`compass inflow window: invalid ${name}`)
  return new Date(ms).toISOString()
}

/**
 * compass_leads_v `.or()` 필터 — 생성 시각 또는 최신 재유입 시각이 [fromIso, toIso] 안인 리드.
 * toIso 가 없으면 하한만 건다. 반환값 예:
 *   and(created_at.gte.2026-09-13T15:00:00.000Z,created_at.lte.…),and(last_inflow_at.gte.…,last_inflow_at.lte.…)
 * ISO 값을 따옴표 없이 싣는 모양은 lib/repositories/blog.ts publishedAtVisibleFilter 와 같다(운영 사용 중).
 */
export function compassInflowWindowFilter(fromIso: string, toIso?: string): string {
  const from = canonicalIso(fromIso, "fromIso")
  const to = toIso ? canonicalIso(toIso, "toIso") : null
  const inWindow = (column: "created_at" | "last_inflow_at") =>
    to ? `and(${column}.gte.${from},${column}.lte.${to})` : `${column}.gte.${from}`
  return `${inWindow("created_at")},${inWindow("last_inflow_at")}`
}

/**
 * 한 리드가 창 [fromMs, toMs] 안에 유입했는가, 했다면 신규인가 재유입인가.
 *  - 생성 시각이 창 안이면 신규(같은 창 안에서 다시 들어왔어도 최초 유입 1건) — 시각은 생성 시각.
 *  - 아니면 최신 재유입 시각이 창 안일 때 재유입 — 시각은 재유입 시각.
 *  - 둘 다 창 밖이거나 시각이 깨졌으면 null.
 * 한계: last_inflow_at 은 **최신** 재유입만 담는다. 어제 재유입한 리드가 오늘 또 들어오면 어제 창에서는
 * 보이지 않는다(활동 이력을 읽지 않는 한 복원 불가 — 어제 대비 델타가 재유입만큼 약간 커질 수 있다).
 */
export function compassInflowInWindow(
  lead: CompassInflowTimes,
  fromMs: number,
  toMs: number
): CompassInflowEvent | null {
  const created = timeOf(lead.created_at)
  if (created != null && lead.created_at && created >= fromMs && created <= toMs) {
    return { kind: "new", at: lead.created_at, atMs: created }
  }
  const inflow = timeOf(lead.last_inflow_at)
  if (inflow != null && lead.last_inflow_at && inflow >= fromMs && inflow <= toMs) {
    return { kind: "reinflow", at: lead.last_inflow_at, atMs: inflow }
  }
  return null
}
