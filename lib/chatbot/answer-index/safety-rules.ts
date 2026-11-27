/**
 * 공개 답 안전 규칙(V-3): 식별 정보를 채팅에 적으라는 요구, 금액 숫자, 할인·환불 약속.
 * 자료 검사(scripts/answer-index/lib/text-rules.ts)와 런타임(shape.ts 가 글 꼴을 다듬은 뒤 다시 검사)이 같은 규칙을 쓴다.
 * 이 파일은 다른 모듈을 가져오지 않는다.
 */

export interface SafetyRule {
  key: "pii_request" | "price_amount" | "discount_promise" | "refund_promise"
  label: string
  pattern: RegExp
}

export const SAFETY_RULES: SafetyRule[] = [
  {
    key: "pii_request",
    label: "식별 정보(아이디·전화번호·비밀번호·카드 번호 등)를 채팅에 적으라는 요구",
    pattern:
      /(?:아이디|전화\s*번호|휴대폰\s*번호|핸드폰\s*번호|연락처|비밀번호|비번|카드\s*번호|주민\s*(?:등록\s*)?번호|계좌\s*번호|인증\s*코드|인증번호)(?:를|을|와|과|도|랑)?\s*(?:여기|채팅(?:창)?(?:에|으로)?|이\s*창에)?\s*(?:적어|남겨|입력해|알려|보내)\s*(?:주세요|줘|주시면|주십시오|주시겠어요)/,
  },
  {
    key: "price_amount",
    label: "금액 숫자",
    pattern: /\d[\d,.]*\s*(?:원|만\s*원|천\s*원|억\s*원|달러|usd|krw)(?![가-힣])|[₩$]\s*\d|\d[\d,.]*\s*만\s*원대/i,
  },
  {
    key: "discount_promise",
    label: "할인 약속",
    pattern: /\d+\s*%\s*(?:할인|dc|디씨)|할인(?:을|이)?\s*(?:해\s*드릴게요|해\s*드립니다|해\s*드려요|됩니다|돼요|받으실\s*수\s*있어요|보장)/i,
  },
  {
    key: "refund_promise",
    label: "환불 약속",
    pattern: /환불(?:을|이)?\s*(?:해\s*드릴게요|해\s*드립니다|해\s*드려요|됩니다|돼요|받으실\s*수\s*있어요|보장해|약속드립니다)|전액\s*환불/,
  },
]

export function findSafetyViolations(text: string) {
  return SAFETY_RULES.filter((rule) => rule.pattern.test(text))
}
