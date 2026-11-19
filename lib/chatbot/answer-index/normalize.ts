/**
 * 답 색인 정규화(사양 §3.3 ①②): 질문·변형·우주 질문·카드 글을 같은 규칙으로 다듬는다.
 *
 * 한 줄 질문 → prepareText()
 *   1. 브랜드 낱말 지우기(클래스인·classin·class in) — 라우팅 풀이보다 먼저 한다("class in" 이 "수업 in" 이 되지 않게).
 *   2. 라우팅 풀이 glossForIndex = tone.ts glossForRouting 과 같은 표·같은 결과(변형 10만 줄을 빨리 돌리려고 정규식을 미리 만든다).
 *   3. normalizeText: NFC, 전각→반각, 소문자, 문장부호 → 공백, 감탄 자모(ㅠㅠ·ㅋㅋ) 지우기, 공백 하나로.
 *   4. detectAskType: 꼬리를 떼기 전에 묻는 꼴을 적는다.
 *   5. stripQuestionTail: '있나요·되나요·가능한가요·할 수 있나요·알려주세요…' 꼬리를 뗀다(다 떼서 빈 글이 되면 떼지 않는다).
 *
 * 정규화한 글의 공백은 낱말 경계 정보로만 쓰고, 특징(n-gram)은 공백을 지운 글(compact)에서 뽑는다.
 * 네트워크·모델 호출 없음. 같은 입력이면 같은 출력.
 */
import { COMPOUND_QUESTION_RE } from "@/lib/chatbot/quick-answers-basics"
import { ROUTING_GLOSSES, SLANG_GLOSSES } from "@/lib/chatbot/tone"
import type { AskType } from "./types"

// ─── 브랜드·라우팅 풀이 ──────────────────────────────────────────────────

/** 브랜드 낱말(질문 뜻에 보탬이 없고 모든 변형에 흔하다). "클래스 인원"의 '클래스 인'은 지우지 않는다. */
const BRAND_RE = /클래스인|클래스\s+인(?=$|[\s\p{P}]|[은는이가을를의에도와과로랑])|class\s*-?\s*in(?![a-z])|eeo\s*classin/giu

export function stripBrand(text: string) {
  return text.replace(BRAND_RE, " ")
}

const ROUTING_GLOBAL: [RegExp, string][] = ROUTING_GLOSSES.map(([pattern, korean]) => [
  new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`),
  korean,
])
// 라우팅 풀이 표가 모두 영문 정규식이면 영문 글자가 없는 글은 건너뛴다(결과는 같다). 한글 정규식이 들어오면 건너뛰지 않는다.
const ROUTING_ASCII_ONLY = ROUTING_GLOSSES.every(([pattern]) => /^[\x00-\x7f]*$/.test(pattern.source))
const ASCII_LETTER_RE = /[a-z]/i

/** tone.ts glossForRouting 과 같은 결과. 줄임말 표를 먼저, 영문 라우팅 표를 다음에 적용한다. */
export function glossForIndex(text: string) {
  let out = text
  for (const [pattern, replacement] of SLANG_GLOSSES) out = out.replace(pattern, replacement)
  if (ROUTING_ASCII_ONLY && !ASCII_LETTER_RE.test(out)) return out
  for (const [pattern, korean] of ROUTING_GLOBAL) out = out.replace(pattern, korean)
  return out
}

// ─── 글자 정규화 ─────────────────────────────────────────────────────────

const FULLWIDTH_RE = /[！-～]/g
const EMOTIVE_JAMO_RE = /[ㅠㅜㅋㅎ]{2,}|[ㅠㅜ]+/g
const NON_WORD_RE = /[^\p{L}\p{N}\s]+/gu

/** NFC, 전각→반각, 소문자, 브랜드 지우기, 문장부호 → 공백, 감탄 자모 지우기, 공백 하나로. 꼬리는 떼지 않는다. */
export function normalizeText(text: string) {
  return stripBrand(
    text
      .normalize("NFC")
      .replace(FULLWIDTH_RE, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/　/g, " ")
      .toLowerCase()
  )
    .replace(EMOTIVE_JAMO_RE, " ")
    .replace(NON_WORD_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function compactOf(text: string) {
  return text.replace(/\s+/g, "")
}

// ─── 묻는 꼴 ─────────────────────────────────────────────────────────────

/**
 * 증상 신호. "~하면 안 되나요?"(허락)와 "못 하게"(막기)는 증상이 아니다.
 * service.ts 의 SYMPTOM_REPORT_RE 와 같은 뜻으로 맞춘다(그 정규식은 service.ts 밖으로 내보내지 않는다).
 */
export const INDEX_SYMPTOM_RE =
  /(?<!면\s?)안\s*(?:돼|되|됨|됐|됩|나와|나옴|나오|들려|들리|보여|보이|켜|떠|열려|열리|먹|와|옴)|(?<!면\s?)안돼|(?<!면\s?)안되|안됨|못\s*(?:하겠|해요|해서|들어가|들어와|봐요|보겠|열어|열겠|찾겠|찾아요)|오류|에러|끊겨|끊김|끊어져|튕겨|튕김|튕기|멈춰|멈춤|멈췄|먹통|고장|이상해|이상하|실패|막혔|막혀|비활성|회색|눌러도|눌렀더니|뜹니다|라고\s*(?:떠|뜨|나와|나옵)|지원되지\s*않|했는데도|해\s*봐도|사라졌|없어졌|느려|버벅|깨져|검은\s*화면|0\s*kb/

const ASK_RULES: [AskType, RegExp][] = [
  ["symptom", INDEX_SYMPTOM_RE],
  ["when", /언제|며칠|몇\s*시|얼마나\s*걸|얼마\s*동안|기간|몇\s*(?:일|주|달|개월|년)\s*(?:동안|간|뒤|후|까지|이내)|운영\s*시간|시간대/],
  ["cost", /얼마(?!나)|가격|비용|요금|금액|견적|단가|유료|무료|할인|돈\s*(?:이|을)?\s*(?:들|내|드|받)/],
  ["compare", /차이|비교|\bvs\b|보다\s*(?:나|좋|싸|비싸|낫)|다른\s*점|뭐가\s*(?:달라|다르|나아|낫|좋)|대신|대비/],
  ["quantity", /몇|최대|최소|한도|인원|용량|얼마나\s*(?:많|크|큰|길|오래)/],
  ["who", /누가|누구|어느\s*분|담당자/],
  ["where", /어디|어느\s*(?:메뉴|화면|곳|버튼|탭|페이지)|위치|경로/],
  ["howto", /어떻게|방법|하는\s*법|하려면|순서|절차|설정\s*법/],
  ["definition", /뭐(?:예요|에요|야|임|지|죠|인가요|인데|하는)|무엇|무슨|뭔가요|뭔데|이란|의미|뜻이/],
  ["yesno", /(?:되|돼)(?:나요|요|죠|나|는지|ㅇ)|됩니까|될까요|가능|있(?:나요|어요|나|음|는지|을까요|죠|습니까)|없(?:나요|어요|나|는지)|할\s*수|인가요|맞(?:나요|아요|죠)|지원\s*(?:돼|되|하)/],
]

/** 묻는 꼴(§3.3 ①). 앞 규칙이 먼저다. 못 정하면 null. 원문·정규화한 글 어느 쪽을 줘도 된다. */
export function detectAskType(text: string): AskType | null {
  const normalized = normalizeText(text)
  if (!normalized) return null
  for (const [type, pattern] of ASK_RULES) if (pattern.test(normalized)) return type
  return null
}

// ─── 질문 꼬리 ───────────────────────────────────────────────────────────

/**
 * 질문 꼬리(§3.3 ①). 정규화한 글 끝에서 뗀다. 낱말로 서는 꼬리(가능·궁금·알려…)는 낱말 첫머리여야 하고,
 * 어미 꼬리(되나요·있나요·인가요…)는 앞 낱말에 붙어 있어도 뗀다("녹화돼요" → "녹화").
 */
export const QUESTION_TAILS: readonly string[] = [
  "할 수 있나요",
  "할 수 있어요",
  "수 있나요",
  "수 있어요",
  "가능한가요",
  "가능해요",
  "되나요",
  "돼요",
  "있나요",
  "있어요",
  "뭐예요",
  "인가요",
  "알려주세요",
  "궁금해요",
]

// 낱말로 서는 꼬리: 앞이 공백이거나 글 처음이어야 한다("불가능한가요"의 '가능한가요'는 떼지 않는다).
const STANDALONE_TAIL_RE = new RegExp(
  `(?:^|\\s)(?:${[
    "(?:할\\s*)?수\\s*(?:있|없)(?:나요|어요|을까요|나|음|는지|는지요|죠|습니까|는\\s*지)",
    "가능(?:한가요|할까요|해요|한지|한지요|하나요|합니까|한가|함|할지|하죠|하다)?",
    "불가능(?:한가요|해요|한지|하나요|함)",
    "궁금(?:해요|합니다|한데요|한데|하네요|함|해)",
    "알려\\s*(?:주세요|줘요|줘|주실래요|주시겠어요|주라|주셈|주십시오|주시면\\s*감사하겠습니다)",
    "가르쳐\\s*(?:주세요|줘요|줘)",
    "뭐(?:예요|에요|야|임|지|죠|인가요|인지|일까요)",
    "무엇(?:인가요|이에요|입니까|일까요)",
    "뭔가요|뭔데요|뭔데|뭐죠",
    "싶(?:어요|은데요|은데|습니다|음|어)",
    "주세요|부탁(?:해요|드려요|드립니다|합니다)",
    "어떻게\\s*(?:하나요|해요|하죠|합니까|할까요|되나요|돼요|되죠|하면\\s*(?:돼요|되나요|될까요|되죠))",
    "하는\\s*(?:법|방법)(?:은|이)?",
  ].join("|")})$`
)

// 어미 꼬리: 앞 낱말에 붙어 있어도 뗀다.
const ATTACHED_TAIL_RE = new RegExp(
  `(?:${[
    "(?:되|돼)(?:나요|요|죠|나|는지|는지요|ㅇ)",
    "됩니까|될까요|되요|됨|되는\\s*거죠|되는\\s*건가요",
    "있(?:나요|어요|을까요|나|음|는지|는지요|죠|습니까|던가요)",
    "없(?:나요|어요|을까요|나|음|는지|죠|습니까)",
    "(?:인가요|일까요|인지요|인가|입니까|이죠|이에요|예요|에요)",
    "하나요|해요|하죠|합니까|할까요|하는지|하는지요|하면\\s*(?:돼요|되나요|될까요)",
    "나요|까요|ㄴ가요",
  ].join("|")})$`
)

/** 꼬리를 뗀다(최대 3번). 다 떼서 비면 뗀 적 없는 글을 돌려준다. */
export function stripQuestionTail(normalized: string) {
  let text = normalized.trim()
  for (let round = 0; round < 3; round += 1) {
    const standalone = text.replace(STANDALONE_TAIL_RE, "").trim()
    const next = standalone !== text ? standalone : text.replace(ATTACHED_TAIL_RE, "").trim()
    if (next === text || !next) break
    text = next
  }
  return text || normalized.trim()
}

/** 낱말 하나가 묻는 꼬리뿐인지("되나요", "있어요", "가능해요"). */
export function isTailOnly(word: string) {
  const text = word.trim()
  if (!text) return true
  return !text.replace(STANDALONE_TAIL_RE, "").trim() || !text.replace(ATTACHED_TAIL_RE, "").trim()
}

/** 색인 글(§3.3 ①): normalizeText + 꼬리 떼기. 라우팅 풀이는 하지 않는다(prepareText 가 한다). */
export function normalizeForIndex(text: string) {
  return stripQuestionTail(normalizeText(text))
}

// ─── 낱말 ────────────────────────────────────────────────────────────────

// 가벼운 조사 떼기. 1글자 조사는 3글자 이상 낱말에서만, 2글자 이상 조사는 4글자 이상 낱말에서만 뗀다("회의"의 '의'는 남긴다).
const LONG_PARTICLES = ["에서는", "에서도", "으로는", "이랑은", "한테서", "에게서", "에서", "으로", "한테", "에게", "이랑", "까지", "부터", "처럼", "보다", "께서", "하고", "마다", "라도"]
const SHORT_PARTICLES = ["은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "만", "로", "랑", "께"]

export function stripParticle(word: string) {
  for (const particle of LONG_PARTICLES) {
    if (word.length >= particle.length + 2 && word.endsWith(particle)) return word.slice(0, -particle.length)
  }
  if (word.length >= 3) {
    const last = word[word.length - 1]
    if (SHORT_PARTICLES.includes(last)) return word.slice(0, -1)
  }
  return word
}

/** 정규화한 글의 낱말(조사 뗀 꼴). */
export function wordsOf(normalized: string) {
  return normalized
    .split(" ")
    .filter(Boolean)
    .map(stripParticle)
    .filter(Boolean)
}

// ─── 준비된 글 ───────────────────────────────────────────────────────────

export interface PreparedText {
  /** 받은 글 그대로. */
  raw: string
  /** 브랜드 지우기 + 라우팅 풀이. */
  glossed: string
  /** normalizeText(glossed): 꼬리 붙은 정규화 글(개념 찾기에 쓴다). */
  normalized: string
  /** 꼬리 뗀 색인 글(특징·덮임에 쓴다). */
  stripped: string
  /** stripped 의 공백을 지운 글. */
  compact: string
  askType: AskType | null
}

/** 질문·변형·우주 질문을 색인 글로 준비한다(§3.3 ①: normalizeForIndex(glossForRouting(…))). */
export function prepareText(raw: string): PreparedText {
  const glossed = glossForIndex(stripBrand(raw))
  const normalized = normalizeText(glossed)
  const askType = detectAskType(normalized)
  const stripped = stripQuestionTail(normalized)
  return { raw, glossed, normalized, stripped, compact: compactOf(stripped), askType }
}

// ─── 두 조각 나누기 ─────────────────────────────────────────────────────

export const SEGMENT_MAX_CHARS = 60
const MAX_SEGMENTS = 2
// 비교·관계를 묻는 말이면 '이랑·하고·및·,'가 두 질문을 잇는 말이 아니다("줌이랑 뭐가 달라요").
const RELATION_RE = /비교|차이|다른\s*점|뭐가\s*(?:달라|다르|나아|낫|좋)|같이|함께|동시에|연동|연결|\bvs\b|보다\s*(?:나|좋|싸|비싸|낫)|중에|중\s*(?:어느|뭐)|둘\s*다|사이/
// 잇는 말(왼쪽부터 처음으로 두 조각이 다 내용이 있는 자리에서 나눈다).
const CONNECTOR_RE = /\s*(?:그리고|및|,|，)\s*|(?<=[가-힣a-z0-9])(?:이랑|랑|하고)\s+|(?<=[가-힣])\s*(?:되고|돼고|있고|없고|가능하고)\s+(?=\S+도(?:\s|$))/gi
const TAIL_FOR_SHARE_RE = new RegExp(`(?:\\s|^)(\\S*(?:${QUESTION_TAILS.map((tail) => tail.replace(/\s+/g, "\\s*")).join("|")}|되나요|돼요|있나요|가능해요|인가요|나요|까요)[?？!.~]*)$`)

/** 묻는 꼬리만 있는 조각("싶어요", "되나요")은 내용이 없다. */
function hasContent(text: string) {
  const normalized = normalizeText(text)
  return !isTailOnly(normalized) && compactOf(stripQuestionTail(normalized)).length >= 2
}

/**
 * 짧은 질문(공백 뺀 60자 이하)만 최대 2조각으로 나눈다(§3.3 ②). 신호: 물음표 두 개(앞 물음표 뒤에 글이 더 있음),
 * COMPOUND_QUESTION_RE(quick-answers-basics), '그리고·이랑·하고 …도'. 비교·관계 질문은 나누지 않는다.
 * '이랑·하고·및·,'로 나눌 때 왼쪽 조각에 묻는 꼬리가 없으면 오른쪽 조각의 꼬리를 붙인다("녹화랑 출석 되나요" → "녹화 되나요" / "출석 되나요").
 */
export function segmentQuestion(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed || compactOf(trimmed).length > SEGMENT_MAX_CHARS) return [trimmed]

  const question = trimmed.match(/^(.+?[?？])\s*(\S.*)$/)
  if (question && hasContent(question[1]) && hasContent(question[2])) return [question[1].trim(), question[2].trim()]

  const hasAndDo = /(?:그리고|이랑|랑|하고|되고|있고)\s+\S+도(?:\s|$)/.test(trimmed)
  if (!COMPOUND_QUESTION_RE.test(trimmed) && !hasAndDo) return [trimmed]
  if (RELATION_RE.test(normalizeText(trimmed))) return [trimmed]

  for (const match of trimmed.matchAll(CONNECTOR_RE)) {
    const at = match.index ?? 0
    const left = trimmed.slice(0, at).trim()
    const right = trimmed.slice(at + match[0].length).trim()
    if (!hasContent(left) || !hasContent(right)) continue
    const leftHasTail = stripQuestionTail(normalizeText(left)) !== normalizeText(left) || /[?？]$/.test(left)
    const shared = right.match(TAIL_FOR_SHARE_RE)?.[1]
    const first = !leftHasTail && shared ? `${left} ${shared}` : left
    return [first, right].slice(0, MAX_SEGMENTS)
  }
  return [trimmed]
}
