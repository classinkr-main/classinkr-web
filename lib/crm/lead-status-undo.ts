// 리드 상태 변경 되돌리기 — 순수 로직(서버 의존 없음, 단위 테스트 대상).
//
// Compass(마케팅팀 앱)의 부재중 "-1"처럼, 상태 보드에서 실수로 바꾼 상태를 그 자리에서
// 되돌릴 수 있어야 한다. 이 모듈은 "무엇으로 되돌릴지" 계획을 세우고 사람이 읽을 문구를
// 만드는 부분만 맡는다 — 실제 PATCH 호출과 토스트 표시는 LeadsBoardClient가 한다.

import type { LeadStatus } from "@/lib/repositories/leads"

/** 상태 변경 한 건 — 되돌리기 계획을 만들 때 넘기는 입력 단위. */
export interface LeadStatusChange {
  id: string
  previous: LeadStatus
  next: LeadStatus
}

/** 되돌리기 실행 시 보낼 PATCH 대상 — id별로 복원할 status 하나. */
export interface LeadStatusUndoRequest {
  id: string
  status: LeadStatus
}

/**
 * 상태 변경 목록에서 되돌리기 계획을 만든다.
 * - 같은 id가 여러 번 나오면 마지막 변경만 기준으로 삼는다(청크 재시도 등으로 한 id가
 *   두 번 잡혀도 이중으로 되돌리지 않는다).
 * - previous === next(실질 변경이 없던 건)는 되돌릴 게 없으므로 계획에서 뺀다.
 */
export function buildStatusUndoPlan(changes: LeadStatusChange[]): LeadStatusUndoRequest[] {
  const lastById = new Map<string, LeadStatusChange>()
  for (const change of changes) lastById.set(change.id, change)

  const plan: LeadStatusUndoRequest[] = []
  for (const change of lastById.values()) {
    if (change.previous === change.next) continue
    plan.push({ id: change.id, status: change.previous })
  }
  return plan
}

/**
 * 되돌리기 버튼에 쓸 문구를 만든다. 계획의 복원 대상 status가 하나로 모이면 그 라벨을
 * 밝히고("3건을 "신규"로 되돌립니다"), 벌크 되돌리기라 대상이 여럿(리드마다 직전 상태가
 * 달랐던 경우)이면 라벨을 하나로 못 밝히니 뭉뚱그려 안내한다.
 */
export function describeStatusUndo(
  plan: LeadStatusUndoRequest[],
  labels: Record<LeadStatus, string>
): string {
  if (plan.length === 0) return ""

  const targets = new Set(plan.map((entry) => entry.status))
  const uniformLabel = targets.size === 1 ? labels[plan[0].status] : null

  if (plan.length === 1) {
    return uniformLabel ? `"${uniformLabel}"로 되돌리기` : "되돌리기"
  }
  return uniformLabel
    ? `${plan.length}건을 "${uniformLabel}"로 되돌립니다`
    : `${plan.length}건을 이전 상태로 되돌립니다`
}
