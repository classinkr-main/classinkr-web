/**
 * 내부 CS 코파일럿의 지식·선례 검색이 같이 쓰는 질문 정규화.
 *
 * 글자 그대로 포함 여부만 보면 "56번 코드로 튕긴대", "녹화가 안 된다고 해요" 같은 구어체가
 * 키워드("코드 56", "녹화 안 됨")에 닿지 못한다. 그래서 질문 하나를 여러 변형(원문·조사 뗀 꼴·표준형 덧붙임)으로
 * 만들고, 키워드가 어느 변형에든 있으면 맞는 것으로 본다. 원문 일치는 언제나 변형 하나로 남으므로
 * 기존에 맞던 질문이 맞지 않게 되지는 않는다.
 */

export type MatchPunctuation = "keep" | "strip"

export interface MatchHaystack {
  mode: MatchPunctuation
  variants: string[]
  compact: string[]
}

// 어절 끝의 조사. 어절 길이 3 이상, 떼고 남은 길이 2 이상일 때만 뗀다("고객이"→"고객", "코드로"→"코드").
const TRAILING_PARTICLES = [
  "에서는", "으로는", "이라고", "에서", "에게", "으로", "이랑", "까지", "부터", "처럼", "보다", "라고", "이란", "라는",
  "은", "는", "이", "가", "을", "를", "에", "로", "의", "도", "만", "과", "와", "랑", "란",
]

export function normalizePlain(value: string, mode: MatchPunctuation) {
  const text = value.normalize("NFKC").toLocaleLowerCase("ko-KR")
  return (mode === "strip" ? text.replace(/[^\p{L}\p{N}]+/gu, " ") : text).replace(/\s+/g, " ").trim()
}

function stripParticles(text: string) {
  return text
    .split(" ")
    .map((token) => {
      if (token.length < 3) return token
      for (const particle of TRAILING_PARTICLES) {
        if (token.endsWith(particle) && token.length - particle.length >= 2) {
          return token.slice(0, token.length - particle.length)
        }
      }
      return token
    })
    .join(" ")
}

// "56번 코드", "코드56", "에러 56", "error code 4001" 같은 말을 키워드가 쓰는 표준형으로 모은다.
const CODE_AFTER_LABEL = /(?:코드|code|에러|오류|error)\s*(?:번호|넘버|no\.?)?\s*[#:]?\s*(\d{2,4})(?!\d)/g
const CODE_BEFORE_LABEL = /(?<![\d.])(\d{2,4})\s*번?\s*(?:코드|code|에러|오류)/g

function canonicalCodes(text: string) {
  const extras: string[] = []
  for (const pattern of [CODE_AFTER_LABEL, CODE_BEFORE_LABEL]) {
    for (const match of text.matchAll(pattern)) {
      const code = match[1]
      extras.push(`코드 ${code}`, `code ${code}`, `error code ${code}`, `에러코드 ${code}`)
    }
  }
  return extras
}

// 구어체 어미·변형을 지식 키워드가 쓰는 말로 되돌리는 표. 새 말투는 여기에 한 줄 더한다.
const COLLOQUIAL_RULES: ReadonlyArray<{ pattern: RegExp; canon: readonly string[] }> = [
  { pattern: /튕(?:김|기|긴|겨|겼|길|깁|기는|기고|겨요)/, canon: ["튕김"] },
  {
    pattern: /(?=[^]*(?:수업|접속|입실|인터넷|네트워크|와이파이|wifi|회선|줌|화상))(?=[^]*끊(?:김|기|긴|겨|겼|어지|어져|길|깁))/,
    canon: ["끊김", "네트워크 끊김"],
  },
  {
    pattern: /녹화(?:가|는|를|이|도|본이|본은|본을|본)?\s*(?:자꾸\s*|전혀\s*|하나도\s*)?(?:안\s*(?:돼|되|됨|된|됩|돌|생|남|만들|저장|보|나와|나오)|못|미생성|실패|누락)/,
    canon: ["녹화 안 됨", "녹화 미생성"],
  },
  { pattern: /녹화(?:가|는|를|이|도|본이|본은|본을|본)?\s*(?:파일이\s*)?(?:없|사라|날아|증발)/, canon: ["녹화 안 됨", "녹화 없음", "녹화본 없음"] },
  {
    pattern: /(?:카메라|캠)(?:가|는|를|이|도)?\s*(?:안\s*(?:잡|잡혀|잡혀요|보|떠|나와|나오|돼|되)|인식\s*(?:이\s*)?(?:안|못)|못\s*(?:찾|잡)|연결\s*(?:이\s*)?(?:안|실패))/,
    canon: ["카메라 인식"],
  },
  { pattern: /최대화(?:가|는|를|이)?\s*(?:풀|해제|안\s*유지)/, canon: ["최대화 풀림", "최대화 해제"] },
  // "특수문자 포함", "한글 문자가 깨져요"의 문자는 글자(character)다. 발송 문자(SMS)를 가리킬 때만 표준형을 붙인다.
  { pattern: /(?<!특수|한글|영문|숫자|외계|글)(?:문자|sms).{0,6}(?:얼마|가격|단가|원가|요금|비용|건당)/, canon: ["문자 요금", "문자 단가"] },
  { pattern: /(?<!특수|한글|영문|숫자|외계|글)(?:문자|sms).{0,6}(?:몇\s*(?:건|개|통)|건수|포함\s*(?:돼|되|된|이))/, canon: ["문자 건수", "문자 포함 건수"] },
  { pattern: /(?:회사|기관|본사).{0,4}(?:몇\s*(?:곳|개)|숫자|규모)/, canon: ["기관 수"] },
]

function canonicalColloquial(text: string) {
  const extras: string[] = []
  for (const rule of COLLOQUIAL_RULES) {
    if (rule.pattern.test(text)) extras.push(...rule.canon)
  }
  return extras
}

export function buildMatchHaystack(text: string, mode: MatchPunctuation): MatchHaystack {
  const base = normalizePlain(text, mode)
  const stripped = stripParticles(base)
  const extras = Array.from(new Set([
    ...canonicalCodes(base),
    ...canonicalCodes(stripped),
    ...canonicalColloquial(base),
    ...canonicalColloquial(stripped),
  ]))
  const variants = Array.from(new Set([base, stripped, extras.map((extra) => normalizePlain(extra, mode)).join(" ")]))
    .filter(Boolean)
  return { mode, variants, compact: variants.map((variant) => variant.replace(/\s+/g, "")) }
}

const keywordRegexCache = new Map<string, RegExp | null>()

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function keywordRegex(keyword: string) {
  const cached = keywordRegexCache.get(keyword)
  if (cached !== undefined) return cached
  let regex: RegExp | null = null
  if (keyword) {
    const left = /^[a-z0-9]/.test(keyword) ? "(?<![a-z0-9])" : ""
    // 숫자로 끝나는 키워드("코드 56")는 뒤에 숫자가 이어지면("560") 다른 값이다. 짧은 영문 키워드("lan", "ops")는 낱말 경계를 본다.
    const right = /\d$/.test(keyword)
      ? "(?!\\d)"
      : /[a-z]$/.test(keyword) && keyword.length < 4
        ? "(?![a-z])"
        : ""
    regex = new RegExp(`${left}${escapeRegex(keyword)}${right}`)
  }
  keywordRegexCache.set(keyword, regex)
  return regex
}

/** 키워드가 질문 변형 어디에든 있으면 true. 공백을 뺀 꼴("녹화안됨")은 길이 4 이상 키워드에만 쓴다. */
export function matchesKeyword(haystack: MatchHaystack, keyword: string) {
  const normalized = normalizePlain(keyword, haystack.mode)
  const direct = keywordRegex(normalized)
  if (!direct) return false
  if (haystack.variants.some((variant) => direct.test(variant))) return true
  const compactKeyword = normalized.replace(/\s+/g, "")
  if (compactKeyword.length < 4 || compactKeyword === normalized) return false
  const compact = keywordRegex(compactKeyword)
  return Boolean(compact && haystack.compact.some((variant) => compact.test(variant)))
}
