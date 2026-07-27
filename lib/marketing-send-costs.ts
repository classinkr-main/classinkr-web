/**
 * marketing-send-costs.ts — 발송 채널별 "예상" 단가 상수 (KRW)
 *
 * 예상 단가다 — solapi 공시 요금표 기준으로 UI 견적(발송 내역서) 표시에만 쓰고,
 * 실제 청구는 solapi 정산을 따른다. UI에는 반드시 "예상" 표기를 함께 붙인다.
 *
 * 정직 게이팅: 알림톡·문자는 대량 발송 백엔드가 아직 없다(알림톡=테스트 발송만,
 * 문자=운영 보류). 따라서 이 단가는 합계에 더하지 않고 "대량 발송 오픈 시 적용"
 * 각주로만 노출한다 — 안 나가는 비용을 견적에 얹지 않는다.
 */

export const SEND_UNIT_COST_KRW = {
  /** 이메일 — 현재 발송 경로(Resend/웹훅) 기준 건당 별도 과금 없음으로 취급 */
  email: 0,
  /** 카카오 알림톡 — solapi 요금표 기준 건당 예상 */
  kakaoAlimtalk: 9,
  /** 문자 LMS — solapi 요금표 기준 건당 예상 (본문 장문 기준) */
  lms: 30,
} as const

/** 원화 표기 공용 포매터 — 발송 센터 조각들이 같은 형식을 쓰도록 한 곳에 둔다. */
export const KRW_FORMAT = new Intl.NumberFormat("ko-KR")

export function formatKrw(amount: number): string {
  return `${KRW_FORMAT.format(amount)}원`
}
