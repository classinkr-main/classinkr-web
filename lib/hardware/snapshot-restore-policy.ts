/**
 * 시트 원장 복원은 시트·어드민 출고·오더 상태를 함께 대사해야 한다.
 * 기존 RPC와 취소 복구는 별도 호출이므로 현재는 원자성을 보장하지 못한다.
 * DB 트랜잭션·동시 이관·과거 감사 기록 대사를 검증하기 전에는 활성화하지 않는다.
 */
export const HARDWARE_SNAPSHOT_RESTORE_ENABLED: boolean = false
export const HARDWARE_SNAPSHOT_RESTORE_UNAVAILABLE =
  "시트 백업 복원은 출고·오더 대사와 동시 작업 안전성 검증 전까지 중단되어 있습니다. 관리자에게 문의하세요."
