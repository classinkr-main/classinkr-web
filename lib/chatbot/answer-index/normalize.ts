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
/**
 * v2 나누기(findClauseSplit)의 비교·관계 낱말. v1 표(RELATION_RE, 옛 흐름이 읽는다)와 같되 '사이'는 낱말로 설 때만 본다(R3 a2): "카메라 사이즈와 화질,
 * 가격"·"사이트"의 '사이'는 관계 말이 아니다. 낱말 경계는 띄어쓰기·문장부호·조사(에·에서·의·가·는·를)로 본다.
 */
const RELATION_V2_RE = new RegExp(`${RELATION_RE.source.replace(/\|사이$/, "")}|사이(?:에서|에|의|가|는|를)?(?=$|[\\s?？.,，!])`)
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

// ─── 질문 나누기 v2(R2 B2) ──────────────────────────────────────────────
//
// 답 색인(decide.ts)은 이 v2 를 쓴다. 위 segmentQuestion(v1)은 옛 흐름(service.ts appendUnansweredSegmentNotice)이 읽으므로 그대로 둔다.
//
// 순서
//   (a) 번호·점 목록: 줄 첫머리(또는 글 안에서 1. 2. 3. 순서로) 나온 '1.'·'1)'·'①'·'-'·'•' 항목이 둘 이상이면 항목마다.
//   (b) 문장 끊김(?·!·마침표+공백·줄바꿈, '??' 는 하나로): 묻는 꼴 문장이 둘 이상이면 묻는 문장마다. 묻는 꼴이 없는 문장(상황 설명·증상)은
//       다음 묻는 문장의 맥락으로 붙이고, 끝에 남으면 앞 문장에 붙인다.
//   (c) 잇는 말: 그리고·근데·그런데·또(왼쪽이 묻는 꼴일 때)·',' 뒤 그리고, -고/-시고(왼쪽 절에 의문사·요청이 있을 때), 쉼표 목록(명사 항목·
//       '…는지,'), 묻는 어미 뒤 공백(줄임 말투 "되나요 느리진 않나"), 명사를 잇는 '이랑·랑·하고'(v1 과 같고, 묻는 꼬리를 나눠 붙인다).
// 나누지 않음: 비교·관계(RELATION_RE, 명사를 잇는 말일 때), 상황 절 끝(…는데·…면·…고·…서, 의문사 없는 -고), 조건으로 앞 조각을 받는 쉼표
// ("있나요, 있다면 …"), '아님·아니면·혹은'으로 고르는 질문, 내용 글자 2자 미만 조각. 최대 SEGMENT_V2_MAX 조각, 그 뒤 조각은 overflow 로 돌려준다
// (답하지 않고 알림 줄로만). 공백 뺀 SEGMENT_V2_MAX_CHARS 를 넘으면 (b)의 묻는 문장만 조각 후보로 본다.

export const SEGMENT_V2_MAX_CHARS = 200
export const SEGMENT_V2_MAX = 3

export interface QuestionSplit {
  /** 조각(질문 순서, 최대 SEGMENT_V2_MAX). 나누지 않으면 원문 하나. */
  segments: string[]
  /** SEGMENT_V2_MAX 를 넘어 답하지 않는 조각(알림 줄 대상). */
  overflow: string[]
}

/** 의문사(묻는 꼴의 가장 강한 신호). '어떤'은 '어떤 파일'처럼 묻는 말로 쓴다. */
const QUESTION_WORD_RE = /어떻게|어케|어떡|어떠|어디|언제|몇|얼마|뭐(?!든)|무엇|무슨|왜|누가|누구|어느|어떤/
/** 묻는 어미·요청(문장부호를 뗀 끝). '돼요·되요·있어요'는 물음표가 있어야 묻는 꼴이다(서술 '안 돼요.'와 구분). */
const ASK_END_RE =
  /(?:나요|까요|가요|던가요|는지요?|인지요?|은지요?|ㄴ지요?|을지요?|ㄹ지요?|[가-힣]나|[가-힣]까|[가-힣]냐|[가-힣]죠|지요|니까|습니까|있음|없음|됨|되남|할래요|알려\s*주세요|알려\s*줘요?|알려\s*주시겠어요|가르쳐\s*주세요|궁금해요|궁금합니다|궁금함|궁금해|부탁해요|부탁드려요|부탁드립니다|는\s*법|방법|여부|문의(?:드립니다|합니다|드려요|요)?|요청(?:합니다|드립니다|한다)?|묻는다|묻습니다|알고\s*싶(?:음|어요|습니다))$/
/** 상황 절 끝(뒤에 오는 말의 맥락): 이 끝으로 끝나는 조각 뒤에서는 나누지 않는다. */
const SITUATION_END_RE = /(?:는데|은데|인데|ㄴ데|던데|한데|는데요|고|면|면서|서|니까|려고|려는데|으려면|려면|지만|라서|해서|어서|아서|도록|게)$/
/** 앞 조각을 조건으로 받는 머리말(나누면 뜻이 끊긴다). */
const CONDITIONAL_HEAD_RE = /^(?:있다면|없다면|된다면|되면|안\s*되면|그렇다면|그러면|그럼|그렇게\s*하면)(?:\s|$)/
/** 고르는 질문(같은 질문의 두 선택지). */
const ALTERNATIVE_HEAD_RE = /^(?:아님|아니면|혹은|또는)(?:\s|$)/
const CLAUSE_CONNECTOR_RE = /^(?:그리고요?|근데|그런데|그리고\s*또|아울러)(?:\s|$)/

function stripEnd(text: string) {
  return text.replace(/[\s?？!！.。~～,，ㅠㅜㅋㅎ]+$/u, "").trim()
}

/** '…ㄴ지·…ㄹ지'로 끝나는지(가능한지·되는지·할지): 끝 글자 '지' 앞 글자의 받침이 ㄴ·ㄹ. '까지·가지'는 아니다. */
function endsWithEmbeddedQuestion(text: string) {
  const match = text.match(/([가-힣])지요?$/)
  if (!match) return false
  const code = match[1].charCodeAt(0) - 0xac00
  const final = code % 28
  return final === 4 || final === 8
}

/** 조각 하나가 묻는 꼴인지: 물음표·의문사·묻는 어미·요청. */
export function isAskingSegment(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/[?？]/.test(trimmed)) return true
  if (QUESTION_WORD_RE.test(trimmed)) return true
  const bare = stripEnd(trimmed)
  return ASK_END_RE.test(bare) || endsWithEmbeddedQuestion(bare)
}

/** 요청으로 끝나는 말("…하고 싶어요", "…바꿔 주세요"): 묻지 않아도 따로 답할 일을 청한다. */
const REQUEST_END_RE = /(?:싶어요|싶습니다|싶음|주세요|주십시오|주시겠어요|바랍니다|원해요|원합니다)$/
/** 묻는 끝(의문사가 든 마지막 절이 이 끝으로 끝나면 묻는 문장이다). 'ㅁ' 받침 명사형("어디서 봄", "어케함")도 묻는 끝이다. */
const INTERROGATIVE_TAIL_RE = /(?:요|죠|나|까|냐|니|지|래|음|함|임|야|가)$/
function endsWithInterrogativeTail(bare: string) {
  if (INTERROGATIVE_TAIL_RE.test(bare)) return true
  const last = bare.charCodeAt(bare.length - 1) - 0xac00
  return last >= 0 && last <= 11171 && last % 28 === 16
}

/**
 * 문장 끝으로 본 묻는 꼴(문장 나누기·잇는 말 조각 검사용, isAskingSegment 보다 좁다): 물음표로 끝남, 묻는 어미·요청·'…는지'로 끝남,
 * 또는 마지막 절(쉼표·'…는데'·'-고' 뒤)에 의문사가 있고 묻는 끝으로 끝남. 상황 절 속 의문사("어떻게 되는지 해 봤는데, …생겼습니다.")와
 * 서술("…안 돼요.")은 묻는 꼴이 아니다.
 */
export function isQuestionSentence(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/[?？][\s"'”’)\]]*$/.test(trimmed)) return true
  const bare = stripEnd(trimmed)
  if (!bare) return false
  if (ASK_END_RE.test(bare) || endsWithEmbeddedQuestion(bare)) return true
  const lastClause = bare.split(/[,，]|(?:는데|은데|인데|던데|지만|니까|해서|어서|아서|면서)\s/).pop() ?? bare
  return QUESTION_WORD_RE.test(lastClause) && endsWithInterrogativeTail(bare)
}

/** 증상·문제 신고로 끝나는 문장(묻지 않아도 도움을 청한다). '안 되면'처럼 조건으로 이어지는 말은 신고가 아니다. */
const PROBLEM_END_RE =
  /(?:안\s*(?:돼요|되요|됩니다|돼|됨|되네요|와요|옴|와|오네요|열려요|열림|열립니다|켜져요|켜짐|보여요|보임|보입니다|들려요|들림|나와요|나옴|떠요|됐어요)|안돼요|안되요|안됨|안옴|안와요|(?:오류|에러)(?:가)?\s*(?:나요|나와요|떠요|납니다|남)|떠요|까먹음|까먹었어요|잊어버렸어요|잊었어요|모르겠어요|못\s*(?:해요|하겠어요|들어가요)|끊겨요|멈춰요|튕겨요)$/
function isProblemReport(text: string) {
  return PROBLEM_END_RE.test(stripEnd(text))
}

/** 요청 문장("…하고 싶어요", "…해 주세요"). 앞 질문을 풀어 말하는 경우가 많아 '그리고·또'로 이어 꺼낼 때만 따로 조각이 된다. */
function isRequestSentence(text: string) {
  return REQUEST_END_RE.test(stripEnd(text))
}

/** 문장 끊김 나누기에서 조각이 될 문장: 묻는 꼴이거나 증상·문제 신고, 또는 '그리고·또'로 꺼낸 요청. */
function isAskingOrReport(text: string) {
  if (isQuestionSentence(text) || isProblemReport(text)) return true
  return /^(?:그리고요?|그리고\s*또|또|아울러)\s/.test(text.trim()) && isRequestSentence(text)
}

/** 새 물음을 꺼내는 문장 머리(규격 4.1 접속어): 그리고·또·추가로·하나 더·아울러. '근데·그런데'는 상황 뒤 진짜 질문을 꺼내는 말이라 넣지 않는다. */
const NEW_QUESTION_HEAD_RE = /^(?:그리고요?|그리고\s*또|또|추가로|하나\s*더|아울러)(?:\s|[,，])/
/** '안·못 + 동사' 로 끝나는 문제 서술("마이크가 잘 안 잡혀요", "소리가 안 나와요"). PROBLEM_END_RE 보다 넓다(다음 문장이 접속어로 새 물음을 꺼낼 때만 쓴다). */
const LOOSE_PROBLEM_END_RE = /(?:^|\s)(?:안|못)\s*[가-힣]{1,4}(?:어요|아요|여요|해요|돼요|되요|져요|와요|나요|네요|요)$/

/**
 * 다음 문장이 접속어로 새 물음을 꺼내면(규격 4.1 "그리고·또·추가로"), 앞 문장의 요청("…쓰고 싶어요")·문제 서술("…잘 안 먹어요")은 맥락이 아니라 따로 답할
 * 물음이다(R3 a2): "숙제를 반별로 나눠 내고 싶어요. 그리고 마감 지난 숙제도 받을 수 있나요?" → 두 조각. 접속어 없이 이어지면
 * 요청 문장은 다음 질문을 풀어 말한 것으로 본다(R2 규칙 그대로, "숙제를 반별로 나눠 내고 싶어요. 어떻게 하나요?").
 */
function asksBeforeConnector(sentence: string, next: string | undefined) {
  if (!next || !NEW_QUESTION_HEAD_RE.test(next.trim())) return false
  const body = next.trim().replace(NEW_QUESTION_HEAD_RE, "").trim()
  if (!isAskingOrReport(next) && !isQuestionSentence(body) && !isRequestSentence(body)) return false
  if (!segmentHasContent(sentence)) return false
  const bare = stripEnd(sentence)
  return isRequestSentence(sentence) || LOOSE_PROBLEM_END_RE.test(bare)
}

/** '…도'가 붙은 명사(더하는 대상: "기록도", "삭제도"). 동사의 '-어도·-해도'(양보)와 '정도·속도' 같은 명사는 뺀다. */
const ALSO_WORD_RE = /(?:^|\s)([가-힣A-Za-z0-9]{1,10})도(?=\s)/g
const CONCESSIVE_STEM_RE = /(?:해|어|아|여|워|와|돼|되|봐|줘|써|러|져|쳐|려|켜|꺼|라|이라|더라)$/

function hasAlsoNoun(text: string) {
  for (const match of text.matchAll(ALSO_WORD_RE)) {
    const word = `${match[1]}도`
    if (PARTICLE_LIKE_NOUNS.has(word) || CONCESSIVE_STEM_RE.test(match[1])) continue
    return true
  }
  return false
}

/**
 * '…도 해 주세요·…도 하고 싶어요'처럼 더하는 대상을 단 요청 문장(R3 a2, 규격 4.1 요청어): 앞 문장이 묻는 문장이거나 요청이면 따로 답할 물음이다.
 * "프로필 사진을 바꾸고 싶어요. 지난 수업 기록도 지워 주세요." → 두 조각(앞 요청도 조각).
 */
function isAlsoRequest(sentence: string, previous: string | undefined) {
  if (!previous || !isRequestSentence(sentence) || !hasAlsoNoun(stripEnd(sentence))) return false
  return segmentHasContent(sentence) && (isAskingOrReport(previous) || isRequestSentence(previous))
}

/** 주어·주제 표지(은·는·이·가·도)가 붙은 낱말이 있는지(-고 절 뒤 조각이 제 주제를 갖는지). 의문사('누가'·'뭐가')는 주제가 아니다. */
const SUBJECT_MARKED_RE = /(?:^|\s)(?!누가|뭐가|무엇이|어디가|어느\s)[가-힣a-z0-9A-Z]+(?:은|는|도|이|가)(?:\s|$)/

/** 내용 낱말이 아닌 말(의문사·일반 동사·요청): 조각의 내용 글자를 셀 때 뺀다("어떻게 해야 하나요?", "언제 해결되나요?"는 내용이 없다). */
const NON_CONTENT_RE =
  /어떻게|어케|어떡|어디서|어디|언제|얼마나|얼마|왜|뭐|무엇|해결|방법|문의|가능|처리|조치|해야|하면|되면|해요|돼요|되요|됩니다|합니다|하나요|되나요|할까요|될까요|좋을까요|좋아요|궁금|알려|주세요|드립니다|싶어요|하죠|되죠|할지|될지|하는지|되는지|요(?=\s|$)/g

/** 인사·사과·질문 예고만 있는 조각("죄송합니다만", "안녕하세요", "두 가지 여쭙겠습니다"): 내용이 없다(다음 조각에 붙인다). */
const GREETING_ONLY_RE =
  /^(?:(?:정말|너무|대단히)\s*)?(?:죄송(?:합니다|해요|한데요?|하지만|합니다만|해요만)|안녕하세요|실례(?:합니다|지만|합니다만)|수고(?:하십니다|하세요|많으십니다)|감사합니다|고맙습니다|(?:두|세|몇)\s*가지\s*(?:여쭙겠습니다|여쭤볼게요|질문(?:이요|입니다|드립니다|드려요|있어요|있습니다)?|문의(?:드립니다|드려요)?|궁금(?:해요|합니다))|질문(?:이\s*있(?:어요|습니다)|드립니다|드려요)|문의(?:드립니다|드려요)|궁금한\s*(?:게|점이?)\s*있(?:어요|습니다|는데요?))$/

/** 앞 조각을 받는 머리말(조건·지시어): "되면 …", "안 오면 …", "그건 …", "거기서 …". */
const REFERRING_HEAD_RE = /^(?:(?:안\s*)?\S*면요?|그건|그거|그게|이건|이거|저건|거기서?|그럼|그러면|그렇다면)(?:\s|$)/

/**
 * 조각이 제 주제 낱말을 갖는지(주제 이어 붙이기 판단, decide.ts): 앞 조각을 받는 머리말로 시작하지 않고, 의문사·일반 동사·요청을
 * 뺀 내용 글자가 2자 이상이다. "되면 어디서 봐요?"·"안 오면 어떻게 해요?"·"그건 얼마예요?"는 주제가 없고, "휴대폰으로도 되나요"는 있다.
 */
export function hasOwnTopicWords(text: string) {
  const normalized = normalizeText(text)
  if (!normalized || REFERRING_HEAD_RE.test(normalized)) return false
  return compactOf(stripQuestionTail(normalized).replace(NON_CONTENT_RE, " ")).length >= 2
}

/** 내용 글자가 2자 이상이고 묻는 꼬리만이 아닌 조각. 인사·사과만 있는 조각은 내용이 없다. */
export function segmentHasContent(text: string) {
  if (GREETING_ONLY_RE.test(stripEnd(text.trim()))) return false
  const normalized = normalizeText(text)
  if (!normalized || isTailOnly(normalized)) return false
  const stripped = stripQuestionTail(normalized)
  if (compactOf(stripped).length < 2) return false
  // 제 조건을 단 되물음("되면 어디서 봐요?", "안 오면 어떻게 해요?")은 앞 조각 주제로 이어 붙여 답할 수 있는 조각이다.
  if (/^(?:안\s*)?\S*(?:면|면요)(?:\s|$)/.test(normalized) && QUESTION_WORD_RE.test(normalized)) return true
  return compactOf(stripped.replace(NON_CONTENT_RE, " ")).length >= 2
}

// ─── (a) 번호·점 목록 ────────────────────────────────────────────────────

const LINE_MARKER_RE = /^(?:\d{1,2}\s*[.)]|[①②③④⑤⑥⑦⑧⑨]|[-•·*])\s*/
const CIRCLED_MARKS = "①②③④⑤⑥⑦⑧⑨"

/** 표시 사이 글을 항목으로 자른다(첫 표시 앞 글은 첫 항목 앞에 붙인다). */
function itemsBetween(text: string, marks: { at: number; length: number }[]) {
  const items: string[] = []
  for (let at = 0; at < marks.length; at += 1) {
    const start = marks[at].at + marks[at].length
    const end = at + 1 < marks.length ? marks[at + 1].at : text.length
    items.push(text.slice(start, end).trim())
  }
  const head = text.slice(0, marks[0].at).trim()
  if (head && items.length > 0) items[0] = `${head} ${items[0]}`
  const kept = items.filter(Boolean)
  return kept.length >= 2 ? kept : null
}

/**
 * (a) 번호·점 목록 항목. 항목이 둘 미만이면 null. 줄 첫머리 표시 말고도, 서비스가 줄바꿈을 공백으로 접은 글("- 로그인 오류 - 계정 탈퇴",
 * "① 화면 공유 ② 판서 저장", "1) … 2) …")도 같은 목록으로 본다: 원 숫자·숫자는 1부터 차례로, 점 표시('-'·'•')는 글 첫머리가 그 표시일 때만.
 */
function splitNumbered(text: string): string[] | null {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  if (lines.length >= 2 && lines.filter((line) => LINE_MARKER_RE.test(line)).length >= 2) {
    const items: string[] = []
    for (const line of lines) {
      if (LINE_MARKER_RE.test(line) || items.length === 0) items.push(line.replace(LINE_MARKER_RE, "").trim())
      else items[items.length - 1] = `${items[items.length - 1]} ${line}`
    }
    return items.filter(Boolean).length >= 2 ? items.filter(Boolean) : null
  }
  // 글 안의 1. … 2. … (3. …): 번호가 1부터 차례로 나올 때만.
  const inline = Array.from(text.matchAll(/(?:^|\s)(\d)\s*[.)]\s+/g))
  if (inline.length >= 2 && inline.every((match, at) => Number(match[1]) === at + 1)) {
    return itemsBetween(
      text,
      inline.map((match) => ({ at: match.index ?? 0, length: match[0].length }))
    )
  }
  // 글 안의 ① … ② …: 원 숫자가 ①부터 차례로 나올 때만.
  const circled = Array.from(text.matchAll(/[①②③④⑤⑥⑦⑧⑨]\s*/g))
  if (circled.length >= 2 && circled.every((match, at) => CIRCLED_MARKS.indexOf(match[0].trim()) === at)) {
    return itemsBetween(
      text,
      circled.map((match) => ({ at: match.index ?? 0, length: match[0].length }))
    )
  }
  // 글 첫머리가 점 표시('- '·'• '·'· ')이고 같은 표시가 공백 사이에 또 나오면(접힌 점 목록).
  const bullet = /^([-•·*])\s+/.exec(text.trim())
  if (bullet) {
    const body = text.trim()
    const mark = bullet[1].replace(/[-*]/g, "\\$&")
    const marks = [{ at: 0, length: bullet[0].length }, ...Array.from(body.matchAll(new RegExp(`\\s${mark}\\s+`, "g"))).map((match) => ({ at: match.index ?? 0, length: match[0].length }))]
    if (marks.length >= 2) return itemsBetween(body, marks)
  }
  return null
}

/** (b) 문장 끊김. '??'·'?!' 는 하나로, 마침표는 뒤에 공백이 있을 때만(6.0.7 같은 판 번호 보호). */
function splitSentences(text: string): string[] {
  const out: string[] = []
  let current = ""
  const chars = Array.from(text)
  for (let at = 0; at < chars.length; at += 1) {
    const char = chars[at]
    if (char === "\n") {
      if (current.trim()) out.push(current.trim())
      current = ""
      continue
    }
    current += char
    const next = chars[at + 1]
    if (/[?？!！]/.test(char) && !(next && /[?？!！]/.test(next))) {
      out.push(current.trim())
      current = ""
    } else if (/[.。]/.test(char) && (next === undefined || /\s/.test(next)) && !/\d$/.test(current.slice(0, -1))) {
      out.push(current.trim())
      current = ""
    }
  }
  if (current.trim()) out.push(current.trim())
  return out.filter(Boolean)
}

// ─── (c) 잇는 말 ─────────────────────────────────────────────────────────

/**
 * 비교·관계·묶음 질문(명사를 잇는 '이랑·랑·및'과 쉼표 목록을 나누지 않는다): "소형학원이랑 대형학원 요금 달라요?",
 * "학원관리프로그램이랑 중복 아니에요?", "견적이랑 홈페이지 가격이 다른데 어느 게 맞아요?", "칠판 한 대랑 라이선스 묶으면 얼마예요?".
 */
const COMPARE_RE =
  /달라|다르|다른가|다른지|다른데|차이|중복|겹치|겹쳐|비교|어느\s*(?:게|것|쪽|거|걸)|뭐가\s*(?:나|좋|달|다)|나아요|나은|나을|낫|똑같|같은가|같나요|같아요|같은지|대신|묶|합치|합쳐|섞|맞(?:나요|아요|는지|는\s*거)/

/** '이랑·랑'이 '…와 함께'(대상)인 사람 낱말: "학생이랑 수업", "담당자랑 통화"는 두 질문이 아니다. */
const PARTNER_NOUN_RE = /(?:학생|학생들|원생|선생님|선생|쌤|샘|강사님?|원장님?|실장님?|담당자|담당|학부모|부모님|엄마|아빠|친구|아이|애들|자녀|직원|상담원|매니저|사람|분|동료|팀원|고객)$/

/**
 * 조사처럼 끝나도 명사인 낱말(쉼표·'이랑' 왼쪽의 명사 항목 판단에서 조사로 보지 않는다).
 */
const PARTICLE_LIKE_NOUNS = new Set([
  "아이", "놀이", "길이", "높이", "넓이", "나이", "차이", "사이", "종이",
  "추가", "평가", "단가", "원가", "대가", "휴가", "작가", "전문가", "국가", "증가", "참가", "부가", "정가", "판매가",
  "속도", "해상도", "정도", "제도", "온도", "각도", "빈도", "한도", "강도", "용도", "진도", "시도", "밝기도",
  "회의", "강의", "동의", "문의", "주의", "정의", "모의", "합의", "논의", "질의",
  "결과", "효과", "교과", "학과", "부과", "통과",
  "프로", "매크로", "제로", "인트로", "경로", "진로", "통로",
])
const PARTICLE_END_RE = /(?:을|를|이|가|은|는|에|에서|에게|한테|께|으로|로|까지|부터|와|과|도|만|의|처럼|보다|마다|이나|라도|이며|며)$/

/** 낱말이 조사로 끝나는지(조사를 떼고도 1자 이상 남고, 조사처럼 끝나는 명사가 아닐 때). */
function endsWithParticle(word: string) {
  if (PARTICLE_LIKE_NOUNS.has(word)) return false
  const match = PARTICLE_END_RE.exec(word)
  return Boolean(match) && word.length > match![0].length
}

/** 관형형·동사 끝(명사 항목이 아니다): 하는·있는·만든·받은·쓸… */
const VERBAL_WORD_RE = /(?:하는|되는|있는|없는|하던|되던|만든|받은|보낸|올린|찍힌|쓰는|쓴|같은|다른|새로운|할|될|한데|는데|지만|니다|세요|어요|아요|해요|돼요|했|됐|겠)$|^(?:하|되)(?:고|면|서)$/

/** 묻는 대상이 되는 머리 명사("설치하는 방법", "확인하는 법", "요금제 가격"): 앞에 관형형이 와도 명사 항목이다. */
// 동작 명사(개선·설정·변경·삭제)로 끝나는 항목도 묻는 대상이다("현장 녹화 화질 개선, 녹화 중지 방법, …", R3 반박 검토).
const HEAD_NOUN_RE = /(?:방법|법|기능|여부|기준|가격|요금|비용|위치|순서|절차|용량|결과|기간|시간|개선|설정|변경|삭제)$/

/**
 * 명사 항목(쉼표 목록·'이랑'으로 잇는 왼쪽): 낱말 3개 이하(머리 명사로 끝나면 5개 이하)·공백 뺀 14자(머리 명사면 20자) 이하이고, 낱말이 조사·관형형·
 * 동사 끝으로 끝나지 않는다(머리 명사 앞 관형형은 된다). '판서한 내용을'·'선생님 한 분이'·'같은 시간에'·'외국에 있는 학생'·'죄송합니다만'은 명사 항목이 아니다.
 */
function isNounItem(text: string, allowTopicMark = false) {
  const bare = stripEnd(text).replace(/^(?:클래스인|classin)\s+/i, "")
  if (!bare || /[?？!.,，]/.test(bare)) return false
  const words = bare.split(/\s+/).filter(Boolean)
  const headed = HEAD_NOUN_RE.test(words[words.length - 1] ?? "")
  if (words.length === 0 || words.length > (headed ? 5 : 3) || compactOf(bare).length > (headed ? 20 : 14)) return false
  if (words.some((word, at) => VERBAL_WORD_RE.test(word) && !(headed && at < words.length - 1 && /(?:하는|되는|할|한|된|는)$/.test(word)))) return false
  const last = words[words.length - 1]
  const plain = allowTopicMark ? last.replace(/(?:도|은|는)$/, "") : last
  if (!plain || endsWithParticle(plain)) return false
  return !words.slice(0, -1).some((word) => /(?:을|를|에서|에게|한테|으로|까지|부터)$/.test(word))
}

/** 왼쪽 명사 항목에 나눠 붙여도 뜻이 서는 묻는 꼬리(낱말 하나로 서는 가능·있음·요청·정의·값 꼬리). '줄 수 있나요'처럼 동사가 앞에 와야 하는 꼬리는 아니다. */
const SHAREABLE_TAIL_RE =
  /^(?:되나요|돼요|되요|되나|됨|돼|있나요|있어요|있나|있음|없나요|없어요|가능해요|가능한가요|가능하나요|가능할까요|가능한지|가능|지원(?:돼요|되나요|하나요|되는지)|알려\s*주세요|알려주세요|알려\s*줘요?|궁금해요|궁금합니다|문의(?:드려요|드립니다|합니다|해요|요)?|있는지\s*알려\s*주세요|있는지|되는지|뭔가요|뭐예요|뭐에요|뭐야|얼마(?:예요|에요|야|인가요|죠|일까요)|어떻게\s*(?:해요|하나요|돼요|되나요|봐요))[?？!.~]*$/
// 띄어 쓴 요청('알려 주세요')·반말 요청('알려줘')·'궁금합니다'도 꼬리로 집는다(R3 a2: "녹화 위치, 출석 기록 알려줘"가 나뉘지 않던 것).
// 집은 꼬리는 SHAREABLE_TAIL_RE 를 다시 지나야 나눠 붙인다.
const SHARE_TAIL_PICK_RE = new RegExp(
  `(?:\\s|^)((?:[^\\s]*?)(?:${QUESTION_TAILS.map((tail) => tail.replace(/\s+/g, "\\s*")).join("|")}|알려\\s*(?:주세요|줘요|줘)|궁금합니다|문의(?:드려요|드립니다|합니다|해요|요)?|되나요|돼요|있나요|가능해요|인가요|나요|까요|얼마(?:예요|에요|야|인가요|죠)|뭔가요|뭐예요)[?？!.~]*)$`
)

/** 묻는 꼬리 나눠 붙이기(명사를 잇는 말로 나눌 때): 왼쪽이 명사 항목이고 오른쪽 꼬리가 낱말로 서는 꼬리일 때만. 아니면 null(나누지 않는다). */
function shareTail(left: string, right: string): string | null {
  if (isQuestionSentence(left)) return left
  const shared = right.match(SHARE_TAIL_PICK_RE)?.[1]?.trim()
  if (!shared || !SHAREABLE_TAIL_RE.test(shared)) return null
  return `${stripEnd(left)} ${shared}`
}

/** 'A인가요 B인가요'·'받나요 정액인가요?'처럼 오른쪽이 짧은 이다 꼴 물음이면 같은 질문의 두 선택지다. */
const COPULA_QUESTION_RE = /(?:인가요|인가|이에요|예요|에요|이예요|인지요?|일까요|이나요|이야|야|냐|인데요?|이죠|죠)$/
function isAlternativeTail(right: string) {
  const bare = stripEnd(right)
  const words = bare.split(/\s+/).filter(Boolean)
  return words.length <= 2 && !QUESTION_WORD_RE.test(bare) && COPULA_QUESTION_RE.test(bare)
}

interface SplitPoint {
  at: number
  length: number
  /** 명사를 잇는 말(이랑·랑·및·쉼표 명사 목록): 왼쪽에 오른쪽의 묻는 꼬리를 붙인다. */
  nounJoin: boolean
  /** '…도 되고 …도' 꼴(왼쪽 명사에 '도'가 붙어도 명사 항목으로 본다). */
  doJoin?: boolean
  /** 의문사·요청이 든 -고 절(상황 절 끝 검사를 하지 않는다). */
  askingGo?: boolean
  /** 그리고·근데 같은 잇는 낱말. */
  explicit?: boolean
  /** 묻는 머리 명사(방법·여부…) 뒤 '과·와'(왼쪽 명사 항목은 상황 절 뒤 명사구로 본다). */
  headJoin?: boolean
}

/**
 * 잇는 말로 자른 조각이 혼자 서는지(술어가 있는지): 묻는 꼴·증상 신고·요청, 서술 끝(…요·…다·…죠·…음), 의문사가 든 '-고' 절("설치는 어떻게 하고"),
 * 요청 '-고'("알려주시고"). 술어 없는 명사구("클래스인 소형학원", "학원관리프로그램")는 서지 못한다.
 */
export function segmentStandsAlone(piece: string) {
  if (isAskingOrReport(piece) || isRequestSentence(piece)) return true
  const bare = stripEnd(piece)
  if (/(?:요|다|죠|음|함|됨|임)$/.test(bare) || (endsWithInterrogativeTail(bare) && QUESTION_WORD_RE.test(bare))) return true
  if (/(?:알려\s*주시|궁금하|부탁하)고$/.test(bare)) return true
  return /고$/.test(bare) && QUESTION_WORD_RE.test(bare)
}

/** (c) 한 문장 안의 잇는 말. 처음으로 나눌 수 있는 자리 하나를 찾는다. */
function findClauseSplit(sentence: string): SplitPoint | null {
  const normalized = normalizeText(sentence)
  const relation = RELATION_V2_RE.test(normalized) || COMPARE_RE.test(normalized)
  const candidates: SplitPoint[] = []
  // 그리고·근데·그런데·아울러(앞이 쉼표여도 된다).
  for (const match of sentence.matchAll(/[,，]?\s+(?:그리고요?|근데|그런데|아울러|그리고\s*또)\s+/g)) {
    candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: false, explicit: true })
  }
  // 및: 명사를 잇는 말.
  for (const match of sentence.matchAll(/\s+및\s+/g)) candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: true })
  // 또: 왼쪽이 묻는 꼴일 때만(부사 '또 안 돼요'와 구분).
  for (const match of sentence.matchAll(/[,，]?\s+또\s+/g)) {
    const left = sentence.slice(0, match.index ?? 0)
    if (isQuestionSentence(left)) candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: false, explicit: true })
  }
  // 쉼표.
  for (const match of sentence.matchAll(/\s*[,，]\s*/g)) candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: true })
  // -고/-시고: 왼쪽 절이 요청("알려주시고")이거나, 의문사가 든 절이고 오른쪽 조각이 제 주제(은·는·도·이·가, 의문사 아님)를 가질 때.
  for (const match of sentence.matchAll(/(?<=[가-힣])(?<![라다냐자])고[,，]?\s+/g)) {
    const left = sentence.slice(0, (match.index ?? 0) + 1)
    const clause = left.split(/[,，.!?！？。]/).pop() ?? left
    const request = /(?:알려\s*주시|알려주시|궁금하|부탁하)고$/.test(clause)
    // 의문사 절 뒤 조각(쉼표 앞 첫 절)은 제 주제나 제 조건 + 의문사("비밀번호 잊으면 어떻게 …")가 있어야 다른 질문이다
    // ("어디에 저장되고, 얼마나 보관되나요"·"어떻게 처리되고 누가 볼 수 있나요"는 한 질문).
    const right = sentence.slice((match.index ?? 0) + match[0].length).split(/[,，]/)[0]
    const ownQuestion = SUBJECT_MARKED_RE.test(right) || (/\S면\s/.test(right) && QUESTION_WORD_RE.test(right))
    if (request || (QUESTION_WORD_RE.test(clause) && ownQuestion)) {
      candidates.push({ at: (match.index ?? 0) + 1, length: match[0].length - 1, nounJoin: false, askingGo: true })
    }
  }
  // 명사를 잇는 이랑·랑(띄어쓰기 뒤), '…도 되고·있고 …도'. 동사 '-하고'(신청하고·설치하고)와 명사 '-하고'를 글자로 가를 수 없어 '하고'로는 나누지 않는다.
  for (const match of sentence.matchAll(/(?<=[가-힣a-z0-9A-Z])(?:이랑|랑)\s+/g)) {
    candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: true })
  }
  // 묻는 머리 명사 뒤 '과·와'("비밀번호 변경 방법과 계정 탈퇴 방법 문의", "복제 가능 여부와 연락처로 초대하는 방법"): 두 물음을 잇는 말이다
  // (R3 반박 검토: 이 꼴이 나뉘지 않아 둘째 물음이 알림 없이 빠졌다). 값·때를 묻는 명사(가격·시간…)는 한 물음의 두 속성일 때가 많아 넣지 않는다.
  for (const match of sentence.matchAll(/(?<=(?:방법|법|여부|절차|순서|기준|위치))(?:과|와)\s+/g)) {
    candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: true, headJoin: true })
  }
  // '…하는 법하고 …'처럼 '하다'가 붙지 않는 머리 명사 뒤 '하고'만 명사를 잇는 말로 본다.
  for (const match of sentence.matchAll(/(?<=(?:방법|법|기능|여부|기준|가격|요금|위치|결과))하고\s+/g)) {
    candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: true })
  }
  // 'X하고 Y하는 기능·방법'(과제 제출하고 채점하는 기능): 두 기능을 잇는 동사 '-하고'. 왼쪽은 'X'(명사)로 자른다.
  for (const match of sentence.matchAll(/(?<=[가-힣]{2})하고\s+(?=[^,，]*?(?:하는|되는)\s*(?:기능|방법))/g)) {
    candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: true })
  }
  for (const match of sentence.matchAll(/(?<=[가-힣])\s*(?:되고|돼고|있고|없고|가능하고)\s+(?=\S+도(?:\s|$))/g)) {
    candidates.push({ at: match.index ?? 0, length: match[0].length, nounJoin: true, doJoin: true })
  }
  // 묻는 어미 뒤 공백(문장부호 없는 줄임 말투): '…나요·…까요·…있나·…않나·…있음' 또는 의문사가 든 절의 '…요·…함'.
  for (const match of sentence.matchAll(/[가-힣]+(?=\s+\S)/g)) {
    const end = (match.index ?? 0) + match[0].length
    const word = match[0]
    const left = sentence.slice(0, end)
    const clause = left.split(/[,，.!?！？。]|(?:그리고|근데|그런데)\s/).pop() ?? left
    // '하나'는 수('교실을 하나', '티비 하나 더')와 구별이 안 돼 묻는 어미로 보지 않는다.
    const strong = /(?:나요|까요|가요|있나|되나|없나|않나|있음|없음|됨)$/.test(word)
    const questioned = /(?:요|함|임|음)$/.test(word) && QUESTION_WORD_RE.test(clause)
    if (!strong && !questioned) continue
    candidates.push({ at: end, length: sentence.slice(end).match(/^\s+/)?.[0].length ?? 1, nounJoin: false })
  }
  candidates.sort((a, b) => a.at - b.at || b.length - a.length)

  for (const point of candidates) {
    const left = sentence.slice(0, point.at).trim()
    const right = sentence.slice(point.at + point.length).trim()
    if (!segmentHasContent(left) || !segmentHasContent(right)) continue
    if (ALTERNATIVE_HEAD_RE.test(right) || CONDITIONAL_HEAD_RE.test(right)) continue
    const rightBody = right.replace(CLAUSE_CONNECTOR_RE, "").trim()
    if (!segmentHasContent(rightBody)) continue
    if (point.nounJoin) {
      const isComma = /[,，]/.test(sentence.slice(point.at, point.at + point.length))
      const asking = isQuestionSentence(left)
      // 비교·관계·묶음 질문이면 명사를 잇는 말로 나누지 않는다(쉼표 앞이 이미 묻는 꼴인 물음 목록은 예외 — "되나요, 출석은요?").
      if (relation && !(isComma && asking && !COMPARE_RE.test(normalizeText(right)))) continue
      if (isComma) {
        const bare = stripEnd(left)
        if (SITUATION_END_RE.test(bare)) continue
        const lastItem = bare.split(/[,，]/).pop() ?? bare
        // 쉼표 왼쪽은 묻는 꼴('…는지,'·'되나요,')이거나 명사 항목이어야 한다(부사어·주어·목적어 '판서한 내용을,'·'같은 시간에,'는 아니다).
        if (!asking && !isNounItem(lastItem)) continue
        // 오른쪽(나머지 목록과 꼬리)은 묻는 꼴이어야 한다("있는지, 확장 사용하려는 경우"는 한 질문).
        if (!isQuestionSentence(right)) continue
        if (!asking && shareTail(left, right) === null) continue
      } else {
        // 이랑·랑·및·'도 되고': 왼쪽은 명사 항목(대상 '학생이랑'·'담당자랑'은 아니다), 오른쪽은 묻는 꼴이고 꼬리를 나눠 붙일 수 있어야 한다.
        if (!isQuestionSentence(right)) continue
        const commaItem = (stripEnd(left).split(/[,，]/).pop() ?? left).trim()
        // 머리 명사 '과·와'는 상황 절("…만들 때 ")에 이어진 명사구도 명사 항목으로 본다.
        const leftItem = point.headJoin ? (commaItem.split(/(?:때|는데|은데|인데|려면|으려면)\s+/).pop() ?? commaItem).trim() : commaItem
        if (!isNounItem(leftItem, point.doJoin)) continue
        if (PARTNER_NOUN_RE.test(leftItem.replace(/(?:도|은|는)$/, ""))) continue
        if (shareTail(left, right) === null) continue
      }
    } else {
      // 절을 잇는 말: 왼쪽이 상황 절 끝(…는데·…면)이면 맥락이지 다른 질문이 아니다. 오른쪽은 묻는 꼴이어야 한다.
      if (!point.askingGo && SITUATION_END_RE.test(stripEnd(left)) && !QUESTION_WORD_RE.test(left)) continue
      if (point.askingGo) {
        if (!isAskingOrReport(rightBody)) continue
      } else if (point.explicit) {
        // 그리고·근데: 오른쪽은 묻는 꼴이거나 증상·문제 신고여야 한다. '근데·그런데'는 상황 설명 뒤에 진짜 질문을 꺼내는 말이라
        // 왼쪽도 묻는 꼴·신고일 때만 나눈다("줌 쓰다 왔어요 근데 녹화 되나요"는 한 질문).
        if (!isAskingOrReport(rightBody) && !isRequestSentence(rightBody)) continue
        if (/(?:근데|그런데)/.test(sentence.slice(point.at, point.at + point.length)) && !isAskingOrReport(left)) continue
      } else {
        if (!isQuestionSentence(rightBody) || !isQuestionSentence(left)) continue
        // 'A인가요 B인가요'·'받나요 정액인가요?'는 고르는 질문 하나다. 'X만 있어도 되나요 Y 필요해요?'(충분한지·더 필요한지)도 한 질문이다.
        if (isAlternativeTail(rightBody)) continue
        if (/(?:만|만으로|만으로도)\s[^?？]*(?:되나요|돼요|되요|가능해요|가능한가요)$/.test(stripEnd(left)) && /(?:필요|있어야|사야|꼭)/.test(rightBody)) continue
      }
    }
    return point
  }
  return null
}

/** 한 문장을 잇는 말로 최대 limit 조각까지 나눈다(왼쪽부터). 자른 조각이 혼자 서지 못하면 그 문장은 나누지 않는다. */
function splitClauses(sentence: string, limit: number): string[] {
  const pieces: string[] = []
  const nounJoined: boolean[] = []
  let rest = sentence.trim()
  while (pieces.length + 1 < limit) {
    const point = findClauseSplit(rest)
    if (!point) break
    const left = rest.slice(0, point.at).trim()
    const right = rest.slice(point.at + point.length).trim()
    pieces.push(point.nounJoin ? (shareTail(left, right) ?? left) : left)
    nounJoined.push(point.nounJoin)
    rest = right
  }
  pieces.push(rest)
  // 명사 항목 목록("설치 방법, 요금, 무료 체험 있는지 알려주세요"): 앞 항목들에도 마지막 꼬리를 나눠 준다.
  const shared = pieces.map((piece, at) => (at < pieces.length - 1 && nounJoined[at] && !isQuestionSentence(piece) ? (shareTail(piece, pieces[pieces.length - 1]) ?? piece) : piece))
  // 술어 없는 조각("클래스인 소형학원")·꼬리를 붙여도 뜻이 안 서는 조각이 생기면 나누지 않는다.
  if (shared.length >= 2 && !shared.every((piece) => segmentStandsAlone(piece.replace(CLAUSE_CONNECTOR_RE, "").trim()))) return [sentence.trim()]
  return shared
}

/**
 * 묻는 문장들(문장 끊김으로 나눈 문장 가운데 묻는 꼴·증상 신고인 것). 문장이 하나뿐이거나 묻는 문장이 없거나 모든 문장이 묻는 문장이면
 * null(가릴 상황 문장이 없다). 없는 개념이 상황 설명 속 낱말인지 가릴 때 쓴다(checks.ts absentTargetOf).
 */
export function askingSentencesOf(text: string): string[] | null {
  const sentences = splitSentences(text.trim())
  if (sentences.length < 2) return null
  const asking = sentences.filter(isAskingOrReport)
  return asking.length === 0 || asking.length === sentences.length ? null : asking
}

/**
 * 묻는 문장 수(보수적, legacy 생성 지시문의 복합 질문 한 줄이 쓴다): 번호·점 목록이면 항목 수, 아니면 물음표·묻는 어미·요청으로 끝나는
 * 문장 가운데 내용이 있는 문장 수. 잇는 말(쉼표·'이랑'·'-고')로는 나누지 않는다. 최대 SEGMENT_V2_MAX.
 */
export function explicitQuestionCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const numbered = compactOf(trimmed).length > SEGMENT_V2_MAX_CHARS ? null : splitNumbered(trimmed)
  if (numbered) return Math.min(numbered.filter(segmentHasContent).length, SEGMENT_V2_MAX)
  const asking = splitSentences(trimmed).filter((sentence) => /[?？]\s*$/.test(sentence) || isQuestionSentence(sentence)).filter(segmentHasContent)
  return Math.min(asking.length, SEGMENT_V2_MAX)
}

/** 조각 수 상한으로 받을 수 있는 값(R3 a2 CHATBOT_SEGMENT_MAX=3|4). */
export const SEGMENT_V2_MAX_ALLOWED = 4

export interface SplitQuestionOptions {
  /** 답할 조각 수 상한(2~SEGMENT_V2_MAX_ALLOWED, 기본 SEGMENT_V2_MAX). 넘는 조각은 overflow. */
  max?: number
}

/** 조각 수 상한을 받을 수 있는 범위로 맞춘다(정수 2~SEGMENT_V2_MAX_ALLOWED, 아니면 SEGMENT_V2_MAX). */
export function segmentLimit(max: number | undefined) {
  return max !== undefined && Number.isInteger(max) && max >= 2 && max <= SEGMENT_V2_MAX_ALLOWED ? max : SEGMENT_V2_MAX
}

/**
 * 질문 나누기 v2(R2 B2). 위 규칙으로 나눈 조각(질문 순서)과 넘친 조각. 나누지 않으면 { segments: [원문], overflow: [] }.
 * 조각 글은 원문을 자른 것이다(잇는 말 '그리고·근데'는 떼고, 명사를 잇는 말로 나눈 왼쪽 조각에는 오른쪽의 묻는 꼬리를 붙인다).
 * options.max 로 답할 조각 수 상한을 바꾼다(기본 SEGMENT_V2_MAX = 3, 답 색인 decide.ts 가 CHATBOT_SEGMENT_MAX 로 넘긴다).
 */
export function splitQuestion(text: string, options: SplitQuestionOptions = {}): QuestionSplit {
  const max = segmentLimit(options.max)
  const trimmed = text.trim()
  const single = { segments: [trimmed], overflow: [] }
  if (!trimmed) return single
  const long = compactOf(trimmed).length > SEGMENT_V2_MAX_CHARS

  let pieces: string[] = []
  const numbered = long ? null : splitNumbered(trimmed)
  if (numbered) {
    pieces = numbered
  } else {
    const sentences = splitSentences(trimmed)
    // 묻는 문장: 묻는 꼴·증상 신고·'그리고·또'로 꺼낸 요청, 다음 문장이 접속어로 새 물음을 꺼내는 앞 요청·문제 서술, '…도' 요청과 그 앞 요청(R3 a2).
    const alsoAt = sentences.map((sentence, at) => isAlsoRequest(sentence, sentences[at - 1]))
    const askingAt = sentences.map(
      (sentence, at) =>
        isAskingOrReport(sentence) || asksBeforeConnector(sentence, sentences[at + 1]) || alsoAt[at] || (Boolean(alsoAt[at + 1]) && isRequestSentence(sentence) && segmentHasContent(sentence))
    )
    const asking = sentences.filter((_sentence, at) => askingAt[at])
    // 묻는 문장이 둘 이상(신고만 있으면 문장이 모두 신고일 때만 — "카메라가 안 켜져요. 소리도 안 들려요.").
    const allReports = asking.length === sentences.length && sentences.every(isProblemReport)
    if (asking.length >= 2 && (asking.some((sentence) => isQuestionSentence(sentence) || isRequestSentence(sentence)) || allReports)) {
      // 묻는 문장마다. 묻는 꼴이 없는 문장은 다음 묻는 문장의 맥락으로, 끝에 남으면 앞 문장에 붙인다.
      let context: string[] = []
      for (const [at, sentence] of sentences.entries()) {
        if (askingAt[at]) {
          const clauses = long ? [sentence] : splitClauses(sentence, max + 1)
          if (context.length > 0) clauses[0] = `${context.join(" ")} ${clauses[0]}`
          pieces.push(...clauses)
          context = []
        } else if (!long) {
          context.push(sentence)
        }
      }
      if (context.length > 0 && pieces.length > 0) pieces[pieces.length - 1] = `${pieces[pieces.length - 1]} ${context.join(" ")}`
    } else if (!long && asking.length === 1) {
      // 묻는 문장이 하나면 그 문장 안에서만 잇는 말로 나눈다. 다른 문장(상황 설명)은 앞이면 첫 조각, 뒤면 끝 조각에 붙인다.
      const at = sentences.indexOf(asking[0])
      const clauses = splitClauses(asking[0], max + 1)
      if (clauses.length >= 2) {
        const before = sentences.slice(0, at).join(" ")
        const after = sentences.slice(at + 1).join(" ")
        if (before) clauses[0] = `${before} ${clauses[0]}`
        if (after) clauses[clauses.length - 1] = `${clauses[clauses.length - 1]} ${after}`
      }
      pieces = clauses
    } else {
      pieces = [trimmed]
    }
  }

  // 잇는 말 머리 떼기, 내용 없는 조각(인사·사과·꼬리뿐)은 앞(없으면 뒤) 조각에 붙인다.
  const cleaned: string[] = []
  for (const raw of pieces) {
    const piece = raw.replace(CLAUSE_CONNECTOR_RE, "").trim()
    if (!piece) continue
    if (!segmentHasContent(piece) && cleaned.length > 0) cleaned[cleaned.length - 1] = `${cleaned[cleaned.length - 1]} ${piece}`
    else cleaned.push(piece)
  }
  if (cleaned.length >= 2 && !segmentHasContent(cleaned[0])) cleaned.splice(0, 2, `${cleaned[0]} ${cleaned[1]}`)
  if (cleaned.length < 2) return single
  return { segments: cleaned.slice(0, max), overflow: cleaned.slice(max) }
}

// ─── 이미 해 본 동작(R3 a2, 규격 S14) ───────────────────────────────────

/**
 * 동작 이름(답에서 뺄 단계의 이름)과 그 동작을 가리키는 말. 이름은 렌더(respond.ts, CHATBOT_COMPILED_SKIP_TRIED)가 "이미 해 보신 {이름}은 빼고"에 쓴다.
 * 순서가 곧 내놓는 순서다.
 */
const TRIED_ACTIONS: readonly { name: string; re: RegExp }[] = [
  { name: "재설치", re: /재설치|다시\s*(?:설치|깔)|(?:지웠다|지우고|삭제하고|삭제했다가|삭제\s*후)\s*(?:다시\s*)?(?:설치|깔)/ },
  { name: "업데이트", re: /업데이트|업뎃|최신\s*(?:버전|판)으로/ },
  { name: "다시 로그인", re: /재\s*로그인|로그아웃\s*(?:하고|후|했다가|했다)?\s*(?:다시\s*)?로그인|다시\s*로그인/ },
  { name: "껐다 켜기", re: /껐다\s*(?:가\s*)?(?:다시\s*)?켜|껐다\s*켰|끄고\s*(?:다시\s*)?켜|껐다가/ },
  { name: "재시작", re: /재시작|재부팅|다시\s*(?:시작|부팅)|리부팅|재실행/ },
]
/** 이미 했다는 표지(규격 S14: 이미·벌써·몇 번·했는데·했지만·다시 깔았 …). 동작 말만 있고 이 표지가 없으면("재설치하면 되나요?") 해 본 것이 아니다. */
const TRIED_MARK_RE =
  /이미|벌써|몇\s*(?:번|차례)|여러\s*(?:번|차례)|수차례|(?:했|봤|깔았|켰|껐|지웠|돌렸)(?:는데|지만|고|어요|습니다|더니|다가|어도|음|다|으나)|해\s*(?:봤|보았|봐도)|해도|깔아도|켜도|(?:후|뒤|다음)에도/

/**
 * 질문에서 '이미 해 본 동작'을 뽑는다(규격 S14). 표지(TRIED_MARK_RE)와 동작 말이 함께 있을 때만 그 동작 이름을 돌려준다(없으면 빈 배열).
 * 뽑기만 하고 판정은 바꾸지 않는다. 답에서 단계를 빼는 일은 렌더(respond.ts)가 스위치(CHATBOT_COMPILED_SKIP_TRIED)로 한다.
 */
export function extractTriedActions(text: string): string[] {
  const normalized = text.normalize("NFC")
  if (!TRIED_MARK_RE.test(normalized)) return []
  return TRIED_ACTIONS.filter((action) => action.re.test(normalized)).map((action) => action.name)
}
