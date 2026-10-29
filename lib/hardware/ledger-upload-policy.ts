// 재개하려면 미러 교체와 원장 이관을 동일 트랜잭션 및 동기화 잠금 아래 실행하고,
// 실패·동시 실행·대사 결과를 격리된 DB에서 검증해야 한다.
export const HARDWARE_LEDGER_UPLOAD_ENABLED = false
export const HARDWARE_LEDGER_UPLOAD_DISABLED_MESSAGE = "원본 파일 반영은 데이터 정합성 검증이 완료될 때까지 중단되었습니다."
