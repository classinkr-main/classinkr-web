// KR Team 개요 — 총 고객수 · 칠판(전자칠판) 판매 대수. GET /api/admin/branch/sales-counts 응답 계약(브라우저 안전).
// 큰 숫자는 회계연도(FY, 4월 시작) 누계, 옆에 작게 전체 누적(2026-11-25 결정).
//  - 고객수: REV 장부 고객(이름 공백·대소문자 무시) 중 그 기간에 납부 예정액이 있는 곳. confirmed = 확정액(REV 캐논)이 있는 곳.
//    팀·개인 범위를 따른다.
//  - 칠판: 하드웨어 판매대시보드(lib/repositories/hardware-sales-dashboard)의 전자칠판 묶음 — 세일즈 설치 완료만 센다
//    (배송 예정·프로모션은 따로). 하드웨어 원장에는 팀이 없어 늘 전사 수치다.

export interface BranchCustomerCounts {
  /** FY 누계: 납부 예정액이 있는 고객 */
  fy: number
  /** FY 누계: 확정액이 있는 고객 */
  fyConfirmed: number
  /** 이번 달 납부 예정액이 있는 고객 */
  month: number
  /** 전체 누적(장부에 있는 모든 달) */
  allTime: number
}

export interface BranchBoardCounts {
  state: "ready" | "unavailable"
  /** FY 누계 설치 완료(세일즈) */
  fy: number
  /** 이번 달 설치 완료(세일즈) */
  month: number
  /** FY 배송 예정(세일즈, 아직 안 나감) */
  fyPlanned: number
  /** FY 프로모션 설치 완료 — 판매 대수와 따로 */
  fyPromotion: number
  /** 전체 누적 설치 완료(세일즈, 기록이 있는 모든 FY) */
  allTime: number
}

export interface BranchSalesCounts {
  fy: number
  /** "FY2026" */
  fyLabel: string
  month: string
  scope: { team: string; manager: string | null }
  customers: BranchCustomerCounts
  boards: BranchBoardCounts
}
