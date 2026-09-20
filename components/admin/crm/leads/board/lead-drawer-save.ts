/**
 * 리드 드로어 인라인 저장의 순수 규칙 — LeadDrawer.tsx 에서 분리해 단위 테스트가 닿게 한다.
 *
 *  - 상태 버튼은 대상 상태에 따라 갈 곳이 다르다(leads-03): "전환"은 convert-v2 확인 다이얼로그로만,
 *    "연락중"(신규에서)은 연락 기록 폼으로, "종료"는 단계 이탈 확인을 거친 뒤 PATCH.
 *  - 담당자 select 는 change 마다 서버에 쓰지 않고 잠깐 기다렸다가 커밋한다(leads-08).
 *  - 늦게 돌아온 응답은 세대 토큰으로 버린다(leads-01 — 실패 콜백이 최신 성공값을 덮던 문제).
 */
import type { LeadStatus } from "@/lib/repositories/leads"

export type StatusButtonAction = "noop" | "contact-log" | "convert" | "confirm-close" | "confirm-revert" | "patch"

/**
 * 상태 그리드 버튼 클릭이 실제로 해야 할 일. 현재 상태를 다시 누르면 아무것도 하지 않는다.
 *
 * 리뷰 발견(2026-09-15, minor): current가 "converted"일 때 target이 "closed"가 아닌 다른 상태로
 * 나가는 경로가 확인 없는 plain PATCH("patch")로 새 있었다 — 부모 전환 다이얼로그의 "전환 후에는
 * 리드로 되돌릴 수 없습니다" 문구와 모순. converted에서 나가는 모든 경로(자기 자신 제외)는 확인을 거친다.
 */
export function resolveStatusButtonAction(target: LeadStatus, current: LeadStatus): StatusButtonAction {
  if (target === current) return "noop"
  if (current === "converted") return "confirm-revert"
  // 전환은 고객·딜을 만드는 convert-v2 플로우(부모 확인 다이얼로그)로만 — status PATCH 우회 금지.
  if (target === "converted") return "convert"
  if (target === "contacted" && current === "new") return "contact-log"
  if (target === "closed") return "confirm-close"
  return "patch"
}

/** 담당자 select 변경 뒤 서버 커밋까지 기다리는 시간. 화살표 탐색 중 change 가 연달아 나도 마지막 값만 나간다. */
export const ASSIGNED_TO_COMMIT_DELAY_MS = 400

/**
 * "이 컨트롤이 마지막으로 보낸 요청"만 결과를 반영하게 하는 세대 토큰.
 *  begin() 이 돌려준 토큰이 isLatest() 에서 false 면 그 응답(성공·실패 모두)은 무시한다.
 */
export function createLatestRequestGuard() {
  let seq = 0
  return {
    begin(): number {
      seq += 1
      return seq
    },
    isLatest(token: number): boolean {
      return token === seq
    },
  }
}

export type LatestRequestGuard = ReturnType<typeof createLatestRequestGuard>

/** 닫기 전에 확인을 받아야 하는 미저장 항목 라벨. 순서는 드로어 화면 순서를 따른다. */
export function listUnsavedDrawerFields(input: {
  notesDirty: boolean
  ownerUnsaved: boolean
  followUpUnsaved: boolean
}): string[] {
  return [
    input.notesDirty ? "메모·행사 연결" : null,
    input.ownerUnsaved ? "담당자" : null,
    input.followUpUnsaved ? "팔로업 날짜" : null,
  ].filter((item): item is string => Boolean(item))
}

/**
 * 연락 기록 하나가 목록에서 사라진 뒤 포커스를 옮길 곳 — 다음 기록의 삭제 버튼, 없으면 이전 기록,
 * 그것도 없으면 섹션 heading(null 반환 → 호출부가 heading 으로).
 */
export function nextLogIdAfterRemoval(ids: readonly string[], removedId: string): string | null {
  const index = ids.indexOf(removedId)
  if (index === -1) return null
  return ids[index + 1] ?? ids[index - 1] ?? null
}

// ─── 빠른 배정 — 최근 배정 목록(Q4) ───────────────────────────────────
// 브라우저 전역(리드별이 아니라) localStorage 목록 — recent-customers.ts와 같은 패턴이다.
// 이 파일은 순수 데이터 규칙만 갖는다; 실제 localStorage 읽기/쓰기(try/catch, SSR 가드)는
// LeadDrawer.tsx가 한다.

export const RECENT_ASSIGNEES_STORAGE_KEY = "classin_crm_recent_assignees"
/** localStorage에 남기는 상한. */
export const RECENT_ASSIGNEES_MAX_STORED = 5
/** 칩 행에 보여주는 상한. */
export const RECENT_ASSIGNEES_MAX_SHOWN = 3

export interface RecentAssigneeEntry {
  ownerKey: string
  displayName: string
}

/** localStorage에서 읽은 임의의 JSON 값이 최근 배정 항목 모양인지 — 손상된 값을 조용히 걸러낸다. */
export function isRecentAssigneeEntry(value: unknown): value is RecentAssigneeEntry {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.ownerKey === "string" &&
    candidate.ownerKey.length > 0 &&
    typeof candidate.displayName === "string" &&
    candidate.displayName.length > 0
  )
}

/**
 * 배정 성공 시 앞에 추가 · 같은 담당(ownerKey) 중복 제거 · 최대 RECENT_ASSIGNEES_MAX_STORED 저장.
 * 표시용 3명 자르기는 호출부(LeadDrawer)가 한다 — 저장 상한과 표시 상한을 분리해, 화면에 보이는
 * 3명 중 하나를 배정 해제해도 나머지 저장된 항목이 곧바로 다음 칩으로 올라오게 한다.
 */
export function pushRecentAssignee(
  existing: readonly RecentAssigneeEntry[],
  entry: RecentAssigneeEntry
): RecentAssigneeEntry[] {
  if (!entry.ownerKey) return [...existing]
  const deduped = existing.filter((item) => item.ownerKey !== entry.ownerKey)
  return [entry, ...deduped].slice(0, RECENT_ASSIGNEES_MAX_STORED)
}
