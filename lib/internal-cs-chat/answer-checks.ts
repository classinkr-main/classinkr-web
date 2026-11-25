/**
 * 모델 답 후검사(IC-04). 모델이 만든 글에서 사람이 꼭 봐야 할 것을 찾아 경고 목록으로 돌려준다.
 *
 * 찾는 것
 * - amount: 금액(원·위안·만원, 할인·수수료 같은 말 옆의 %)
 * - free_trial: 무료 체험·무상 제공 약속
 * - refund_promise: 환불 약속
 * - compensation_promise: 보상·배상·크레딧·기간 연장 약속
 * - cost_price: 원가·공급가·매입가·마진·도매가
 * - other_customer: 다른 고객의 기관 이름(호출부가 넘긴 목록에 있는 이름)
 * - case_id: 상담 번호·케이스 ID·UUID 같은 식별자
 * - account_id: UID·계정 ID·회원번호
 *
 * 규칙
 * - 경고는 차단이 아니다. 사람이 확인하라는 신호이고, 승인 여부는 검토자가 정한다(B4 의 검토 화면이 '확인했습니다'를 받는다).
 * - 코드에 고객 이름을 두지 않는다. 다른 고객 이름은 호출부가 근거(과거 상담 사례)에서 뽑아 넘긴다.
 * - 경고 글(excerpt)에도 식별정보를 다시 싣지 않는다. 계정·상담 번호는 종류만 적고, 나머지는 가림을 한 번 더 거친다.
 * - 순수 함수다. 서버와 브라우저 모두 쓸 수 있다(server-only 아님).
 */

import { redactInternalCsDraft } from "@/lib/internal-cs-chat/redact"

export type ReviewWarningCode =
  | "amount"
  | "free_trial"
  | "refund_promise"
  | "compensation_promise"
  | "cost_price"
  | "other_customer"
  | "case_id"
  | "account_id"

export type ReviewWarningSeverity = "high" | "medium"

export interface ReviewWarning {
  code: ReviewWarningCode
  severity: ReviewWarningSeverity
  /** 화면에 그대로 보일 한 줄 설명. */
  label: string
  /** 걸린 문장의 앞뒤(가림 적용, 최대 80자). 계정·상담 번호는 싣지 않는다. */
  excerpt: string
}

export interface AnswerCheckOptions {
  /** 이 상담의 고객 기관(허용). 다른 고객 이름 목록에 같은 이름이 있어도 경고하지 않는다. */
  allowedNames?: readonly string[]
  /** 다른 고객으로 알려진 기관 이름(과거 상담 사례의 기관 등). 호출부가 근거에서 뽑아 넘긴다. */
  otherCustomerNames?: readonly string[]
}

interface Rule {
  code: ReviewWarningCode
  severity: ReviewWarningSeverity
  label: string
  pattern: RegExp
  /** 설명 글에 매칭이 붙은 채 쓰이면 건너뛴다(예: '환불 가능 여부'). */
  skipWhen?: RegExp
  /** excerpt 를 싣지 않는 규칙(식별자). */
  hideExcerpt?: boolean
}

const FINANCE_WORD = "(?:할인|수수료|환불|요율|마진|이자|보상|감면|면제|인상|인하|위약|부가세|VAT)"

const RULES: Rule[] = [
  {
    code: "amount",
    severity: "medium",
    label: "금액이 적혀 있습니다. 근거 문서의 값과 같은지 확인하세요.",
    pattern: new RegExp(
      [
        "\\d[\\d,]*(?:\\.\\d+)?\\s*(?:만\\s*)?(?:원|위안|元|달러)",
        "(?:¥|￥|\\$|RMB|CNY|USD)\\s*\\d[\\d,]*(?:\\.\\d+)?",
        `${FINANCE_WORD}.{0,8}\\d+(?:\\.\\d+)?\\s*%`,
        `\\d+(?:\\.\\d+)?\\s*%.{0,8}${FINANCE_WORD}`,
      ].join("|"),
      "gi"
    ),
  },
  {
    code: "free_trial",
    severity: "high",
    label: "무료 체험·무상 제공을 약속하는 표현이 있습니다. 근거와 권한을 확인하세요.",
    pattern: /무료\s*체험|체험\s*(?:기간|권|계정|판)?\s*(?:을|를)?\s*(?:제공|드리|연장|가능)|무상\s*(?:체험|제공|지원|교체|설치)|무료\s*(?:제공|지원|설치|교체|사용\s*가능)/g,
  },
  {
    code: "refund_promise",
    severity: "high",
    label: "환불을 약속하는 표현이 있습니다. 계약·정책 근거 없이 보내지 마세요.",
    pattern: /전액\s*환불|환불\s*(?:해\s*드|해드|처리\s*(?:해|됩|하겠)|가능(?!\s*(?:여부|성|한지))|보장|됩니다)|(?:취소|해지)\s*수수료\s*(?:없이|면제|무료)/g,
  },
  {
    code: "compensation_promise",
    severity: "high",
    label: "보상·연장·크레딧을 약속하는 표현이 있습니다. 근거와 권한을 확인하세요.",
    pattern: /보상\s*(?:해\s*드|해드|가능|지급|드리)|배상\s*(?:해|가능|드리)|위로금|크레딧\s*(?:을\s*)?(?:지급|드리|제공)|(?:이용\s*)?기간\s*(?:을\s*)?(?:연장|추가)\s*(?:해\s*드|해드|제공|가능)|(?:무상|서비스)\s*연장/g,
  },
  {
    code: "cost_price",
    severity: "high",
    label: "원가·공급가 같은 내부 수치가 있습니다. 고객 문안에 옮기지 마세요.",
    pattern: /원가|공급가|매입가|도매가|납품가|마진|이익률|건당\s*\d[\d,]*\s*원/g,
  },
  {
    code: "case_id",
    severity: "high",
    label: "상담 번호·케이스 ID 같은 식별자가 있습니다. 다른 고객의 상담이 드러날 수 있습니다.",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|(?:케이스|case|ticket|티켓|상담\s*번호|userchat|INC)\s*[-_#:：]?\s*[A-Za-z0-9]{4,}/gi,
    hideExcerpt: true,
  },
  {
    code: "account_id",
    severity: "high",
    label: "UID·계정 ID 꼴이 있습니다. 고객 식별정보를 답에 복제하지 마세요.",
    pattern: /(?<![A-Za-z])(?:UID|User\s*ID|Account(?:\s*ID)?|계정\s*ID|회원\s*번호|아이디)\s*[:：#]?\s*[A-Za-z0-9_-]{5,}|계정\s*[:：#]?\s*\d{5,}/gi,
    hideExcerpt: true,
  },
]

const MAX_PER_CODE = 3
const EXCERPT_RADIUS = 28
const MAX_EXCERPT = 80

function excerptAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - EXCERPT_RADIUS)
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS)
  const piece = text.slice(start, end).replace(/\s+/g, " ").trim()
  return redactInternalCsDraft(piece).text.slice(0, MAX_EXCERPT)
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, "").toLowerCase()
}

function isPlaceholderMatch(match: string) {
  return /\[[a-z_]+\]/i.test(match)
}

export function checkInternalCsAnswer(
  answer: string | null | undefined,
  options: AnswerCheckOptions = {}
): ReviewWarning[] {
  const text = answer ?? ""
  if (!text.trim()) return []
  const warnings: ReviewWarning[] = []

  for (const rule of RULES) {
    let found = 0
    for (const match of text.matchAll(rule.pattern)) {
      if (found >= MAX_PER_CODE) break
      const matched = match[0]
      if (isPlaceholderMatch(matched)) continue
      if (rule.skipWhen?.test(matched)) continue
      found += 1
      warnings.push({
        code: rule.code,
        severity: rule.severity,
        label: rule.label,
        excerpt: rule.hideExcerpt ? "" : excerptAround(text, match.index ?? 0, matched.length),
      })
    }
  }

  const allowed = new Set((options.allowedNames ?? []).map(normalizeName).filter(Boolean))
  const compact = normalizeName(text)
  const seenNames = new Set<string>()
  for (const name of options.otherCustomerNames ?? []) {
    const key = normalizeName(name)
    if (key.length < 2 || allowed.has(key) || seenNames.has(key)) continue
    seenNames.add(key)
    if (!compact.includes(key)) continue
    // 이름 자체를 경고에 다시 싣지 않는다.
    warnings.push({
      code: "other_customer",
      severity: "high",
      label: "이 상담의 고객이 아닌 다른 고객의 기관 이름이 있습니다. 사례를 일반화해서 쓰세요.",
      excerpt: "",
    })
    if (seenNames.size >= MAX_PER_CODE) break
  }

  return warnings
}

/** 경고가 있으면 고객 문안으로 보내기 전에 고쳐야 하는 종류(유출·약속·원가)가 있는지. */
export function hasBlockingWarning(warnings: readonly ReviewWarning[]) {
  return warnings.some((warning) => warning.severity === "high")
}

/** 같은 종류를 하나로 묶은 코드 목록(중복 없이). */
export function warningCodes(warnings: readonly ReviewWarning[]): ReviewWarningCode[] {
  return [...new Set(warnings.map((warning) => warning.code))]
}

/** 유출 종류(다른 고객·원가·식별자). 회귀 평가가 기준 답에 없던 유출을 잡을 때 쓴다. */
export const LEAK_WARNING_CODES: readonly ReviewWarningCode[] = [
  "other_customer",
  "cost_price",
  "case_id",
  "account_id",
]

const CUSTOMER_DRAFT_HEADING = /^(#{1,4})\s*.*(?:검토\s*전\s*초안|고객(?:용)?\s*(?:전달|안내|답변|문안)|customer\s*draft)/i

/**
 * 모델 답에서 고객 전달 초안 블록만 뽑는다. 제목 줄('## 고객 전달 초안(검토 전)' 같은 것)부터 같은 수준 이하의 다음 제목 앞까지.
 * 블록이 없으면 null.
 */
export function extractCustomerDraftBlock(answer: string | null | undefined): string | null {
  const lines = (answer ?? "").split(/\r?\n/)
  const startIndex = lines.findIndex((line) => CUSTOMER_DRAFT_HEADING.test(line.trim()))
  if (startIndex < 0) return null
  const level = (lines[startIndex].trim().match(/^#+/)?.[0].length) ?? 2
  const body: string[] = []
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const heading = lines[index].trim().match(/^(#{1,6})\s/)
    if (heading && heading[1].length <= level) break
    body.push(lines[index])
  }
  const block = body.join("\n").trim()
  return block || null
}

/** 근거 글에서 '기관 이름' 줄을 뽑는다(과거 상담 사례의 `기관 OOO` 맥락). 코드에 이름을 두지 않고 근거에서만 찾는다. */
export function extractInstitutionNames(contextText: string | null | undefined): string[] {
  const names = new Set<string>()
  for (const match of (contextText ?? "").matchAll(/(?:^|\s\/\s|맥락:\s*)기관\s+([^/\n]{2,60}?)(?=\s\/\s|\n|$)/g)) {
    const name = match[1].trim()
    if (name) names.add(name)
  }
  return [...names]
}
