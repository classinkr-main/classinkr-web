/**
 * CRM 외부 동기화 "신선도" SSOT — 임계값·경과시간 계산·상대시간 문구를 한 곳에 둔다.
 *
 * 왜: 2026-09-07 감사(P0) — 외부 CRM 동기화가 6일 넘게 멈춰도 CRM 홈의 'Sync 날짜' 배지는
 * 절대시각만 중립 톤(text-[#1a1a1a]/50)으로 보여줘 정상처럼 보였다. 이미 올바르게 구현된
 * 대조군이 있다 — lib/repositories/crm-neo-customer-snapshots.ts(CUSTOMER_SYNC_FRESHNESS_HOURS=24
 * ·hoursSince·buildSyncHealth)가 24시간 임계로 isShroffAccountStale을 계산하고,
 * components/admin/crm/unified/shared.ts의 customerSourceTone()이 그 ok/partial 플래그를
 * 색으로 매핑하며, components/admin/crm/NeoCrmCustomersClient.tsx의 formatAgeHours가 그
 * 경과시간을 "N시간 전"으로 읽는다. 이 세 조각(임계값·경과시간 계산·상대시간 문구)을
 * 여기 하나로 모아 CRM 홈(서버 값이 절대시각 문자열만 내려주는 화면)에서도 같은 판정을
 * 재사용한다.
 *
 * "server-only"를 달지 않는다 — CRM 홈 배지는 클라이언트 컴포넌트(components/admin/crm/home/
 * CrmOperationsDashboard.tsx·CrmTeamKpiBoard.tsx)에서 이 값을 계산해야 한다. overview API
 * (lib/admin-crm-overview.ts, 이 작업에서는 읽기 전용)는 절대시각 문자열만 내려주고,
 * staleness 판정 자체를 서버 응답에 추가하려면 그 읽기 전용 파일을 고쳐야 해 범위 밖이다.
 * 대신 crm-neo-customer-snapshots.ts(서버 전용, 쓰기 가능)가 이 모듈의 순수 함수를
 * import해 자기 계산에 쓰게 해서 임계값이 두 곳에서 따로 정의되는 걸 막는다.
 */

/** 외부 CRM(잔액·만료·최근 수업) 동기화가 "오래됐다"고 판단하는 경과시간 임계(시간). */
export const CRM_SYNC_STALE_AFTER_HOURS = 24

/** ISO 문자열 → 경과시간(시간). 파싱 실패·값 없음은 null(신선도 미확인). */
export function hoursSinceIso(value: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, (nowMs - timestamp) / (60 * 60 * 1000))
}

/** 임계 초과 또는 값 없음(신선도 미확인)이면 stale — "모르면 정상"이 아니라 "모르면 경고". */
export function isSyncStale(
  value: string | null | undefined,
  thresholdHours: number = CRM_SYNC_STALE_AFTER_HOURS,
  nowMs: number = Date.now()
): boolean {
  const hours = hoursSinceIso(value, nowMs)
  return hours === null || hours > thresholdHours
}

/**
 * 경과시간(시간) → 상대시간 문구. NeoCrmCustomersClient.formatAgeHours와 같은 문구를 쓴다 —
 * 화면마다 다른 표현을 쓰면 같은 신선도가 다르게 읽힌다.
 */
export function formatAgeHours(hours: number | null | undefined): string {
  if (hours == null) return "확인 불가"
  if (hours < 1) return "1시간 이내"
  if (hours < 48) return `${Math.round(hours)}시간 전`
  return `${Math.round(hours / 24)}일 전`
}

export interface SyncFreshness {
  hours: number | null
  stale: boolean
  /** "3시간 전" 같은 상대시간 문구 — formatAgeHours(hours)와 동일. */
  relativeLabel: string
}

/** ISO 문자열 하나로 경과시간·stale 여부·상대시간 문구를 한 번에 구한다. */
export function getSyncFreshness(
  value: string | null | undefined,
  thresholdHours: number = CRM_SYNC_STALE_AFTER_HOURS,
  nowMs: number = Date.now()
): SyncFreshness {
  const hours = hoursSinceIso(value, nowMs)
  return {
    hours,
    stale: hours === null || hours > thresholdHours,
    relativeLabel: formatAgeHours(hours),
  }
}
