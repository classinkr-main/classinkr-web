import { getBusinessDateParts } from "@/lib/business-time"

// 장부 상단 동기화 상태 한 줄의 문구 — 순수 함수(장부 상태 줄 LedgerStatusRail의 동기화 칸이 쓴다).
// summary.sync_health.rev(마지막 성공·연속 실패 일수·권한 오류)를 사람이 바로 행동할 수 있는
// 세 조각(무엇이·무엇 기준·어떻게 푸나)으로 바꾼다. 정상이면 null — 배너를 아예 그리지 않는다.

export interface SyncHealthInput {
  failedDays: number
  lastSuccessAt: string | null
  permissionDenied: boolean
  truncated: boolean
}

export interface SyncHealthCopy {
  tone: "danger" | "warning"
  title: string
  detail: string
  action: string
}

const DAY_MS = 86_400_000

export function describeSyncHealth(health: SyncHealthInput | undefined, now: Date): SyncHealthCopy | null {
  if (!health || health.failedDays <= 0) return null
  const days = health.truncated ? `${health.failedDays}일 이상` : `${health.failedDays}일째`
  const detail = health.lastSuccessAt
    ? `화면 수치는 ${getBusinessDateParts(new Date(health.lastSuccessAt)).date} 마지막 성공 기준입니다 (${Math.floor(
        (now.getTime() - Date.parse(health.lastSuccessAt)) / DAY_MS,
      )}일 전).`
    : "최근 기록에 성공한 동기화가 없습니다 — 화면 수치의 기준 시점을 확인할 수 없습니다."
  return {
    // 하루는 일시 장애일 수 있어 경고, 이틀째부터는 크론 알림과 같은 시점에 위험 톤.
    tone: health.failedDays >= 2 ? "danger" : "warning",
    title: `매출 시트 동기화 ${days} 실패`,
    detail,
    action: health.permissionDenied
      ? "시트 공유가 끊겼습니다 — 시트를 서비스 계정에 뷰어로 다시 공유해야 풀립니다."
      : "새로고침으로 다시 동기화해 보세요.",
  }
}
