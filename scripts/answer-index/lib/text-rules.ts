/**
 * 답 글 규칙(V-3)과 inventory 자동 표시.
 *
 * 공개 답에 넣지 않는 것(lib/chatbot/pricing-policy.ts 의 "최종 견적과 구체 금액은 단정하지 않는다",
 * 플레이북 05 §8 공개 답변 안전성): 식별 정보를 채팅에 적으라는 요구, 금액 숫자, 할인·환불 약속.
 */
import { PRICE_FINAL_QUOTE_GUIDANCE } from "@/lib/chatbot/pricing-policy"

/** 규칙의 근거 문구(검사 출력에 함께 찍는다). */
export const SAFETY_RULE_BASIS = PRICE_FINAL_QUOTE_GUIDANCE

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

// ─── inventory 자동 표시 ────────────────────────────────────────────────

export const PERISHABLE_RULES: { key: string; pattern: RegExp }[] = [
  { key: "version", pattern: /\d+\.\d+\.\d+|버전\s*\d|\bv\d/i },
  { key: "plan", pattern: /\b(?:Pro|Enterprise|Business(?:\s*Consumption)?|Standard|Plus|Learning\s*Space)\b|비즈니스\s*요금제|프로\s*요금제/ },
  { key: "address", pattern: /(?:로|길)\s*\d+(?:-\d+)?|\d+\s*층|\d+\s*호(?![가-힣])|드림타워|목동동로/ },
  { key: "period", pattern: /\d+\s*(?:일|주|개월|달|년|시간|분)(?:\s*(?:동안|이내|간|까지|후|뒤|전|째))?(?![가-힣]{2})/ },
  { key: "price", pattern: /\d[\d,.]*\s*(?:원|만\s*원)(?![가-힣])|[₩$]\s*\d/ },
  { key: "number", pattern: /\d{2,}|\d+\s*(?:명|대|개|GB|TB|G\b|인치|%)/ },
]

export function perishableKinds(text: string) {
  return PERISHABLE_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.key)
}

/** '공개 안내에 없다' 류 부재 주장. */
export const ABSENCE_CLAIM_RE =
  /공개\s*(?:안내|문서|자료|된\s*자료)(?:에|에는|에서|로는)?\s*(?:없|나와\s*있지\s*않|정리돼\s*있지\s*않|정리되어\s*있지\s*않|확인되지\s*않|안내돼\s*있지\s*않)|안내돼\s*있지\s*않|찾지\s*못했|정해진\s*기준이\s*없/

/** '약속하지 않는다·단정하지 않는다' 류 정책 문장. */
export const NO_PROMISE_RE =
  /약속(?:드릴|드리기|할)\s*수\s*(?:없|는\s*없)|약속드리지\s*않|약속(?:하지|드리지)\s*(?:않|못)|단정(?:하지|할\s*수|하기|짓지|드리지)\s*(?:않|없|어렵)|장담(?:드리기|할\s*수|드릴\s*수)\s*(?:어렵|없)|추측(?:으로|해서)?\s*(?:말씀드리지|말하지|답하지)\s*않|확정(?:해서|하기|할\s*수)\s*(?:말씀드리기\s*)?(?:어렵|없)/

/** 상담 버튼 이름은 화면 이름이 아니다. */
export const CTA_LABELS = new Set(["실시간 상담 연결", "도입 상담 남기기", "상담원 연결", "상담 연결", "담당자 상담"])

export function screenNamesOf(text: string) {
  const names: string[] = []
  for (const match of text.matchAll(/\[([^[\]\n]{1,40})\]/g)) {
    const name = match[1].replace(/\s+/g, " ").trim()
    if (!name || CTA_LABELS.has(name) || /^\d+$/.test(name) || names.includes(name)) continue
    names.push(name)
  }
  return names
}
