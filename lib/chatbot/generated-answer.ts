/**
 * generate 모드(CHATBOT_FINAL_ANSWER_LLM=generate)에서 모델이 쓴 답을 내보내기 전에 보는 순수 함수들.
 *
 * - extractContentSuggest: 답 끝의 추천 자료 토큰([CONTENT_SUGGEST:type=…,slug=…,title=…])을 떼고, 허용 목록에 있는 자료만 받는다.
 * - checkGeneratedAnswer: 모델 글을 문장 단위로 안전 초안·근거 문장과 대조한다. 근거 밖 숫자·메뉴·영문 이름·연락처, 한자 문장,
 *   내부 표현, 연락처를 묻는 문장은 그 문장을 버리고, 초안의 '지원하지 않음·확인 필요'를 '가능'으로 뒤집었으면 초안으로 돌아간다.
 *
 * 2026-11-20 조사(G13·G14): 사용성 검사(service.ts isUsableGeneratedAnswer)는 길이·끝 글자·막연한 문장만 봐서, 지어낸 모델 글 12종
 * (최대 500명, [AI 자동출결] 메뉴, 한자 문장, 02-1234-5678, '네, 학원비 결제 바로 가능')이 모두 통과했다. 끝 글자 검사에 ']'가 없어
 * 지시문대로 추천 토큰으로 끝난 답은 거꾸로 버려졌다. 여기 함수들은 결정형이고 모델을 부르지 않는다.
 */
import {
  getClassinChatbotReferenceContext,
  getClassinPositioningContext,
} from "@/lib/classin-positioning"
import { leadMagnets } from "@/lib/lead-magnets"
import { splitIntoSentences } from "@/lib/chatbot/source-grounding"

// ── 추천 자료 토큰 ────────────────────────────────────────────────────────────────────────────────

export type ContentSuggestType = "blog" | "resource" | "case"

export interface ContentSuggestAllowItem {
  type: ContentSuggestType
  slug: string
  title: string
}

/** service.ts SuggestedContent 와 같은 모양. */
export interface ContentSuggestItem extends ContentSuggestAllowItem {
  url: string
}

// 시스템 지시(lib/chatbot/llm.ts BASE_SYSTEM_INSTRUCTION)가 추천하라고 적어 둔 자료. 제목은 자료 페이지 제목(data/lead-magnets.json)을 쓴다.
// 모델이 쓴 제목은 버린다(지시문 속 제목과 자료 페이지 제목이 다르고, 모델이 제목을 지어 쓸 수 있다).
const SUGGESTED_RESOURCE_SLUGS = [
  "academy-system-checklist",
  "academy-software-selection-worksheet",
  "academy-resource-reduction-calculator",
  "classin-90-day-adoption-roadmap",
  "academy-data-automation-brief",
  "classin-pre-adoption-questions-checklist",
  "showroom-demo-readiness-kit",
] as const

/** 추천 토큰으로 받을 수 있는 자료. 자료 페이지가 없는 slug 는 빠진다. */
export const CONTENT_SUGGEST_ALLOWLIST: ReadonlyArray<ContentSuggestAllowItem> = SUGGESTED_RESOURCE_SLUGS.flatMap((slug) => {
  const magnet = leadMagnets.find((item) => item.slug === slug)
  return magnet ? [{ type: "resource" as const, slug, title: magnet.title }] : []
})

// 대괄호 안·쌍점·등호·쉼표 앞뒤 공백을 허용한다("[CONTENT_SUGGEST: type=resource, slug=…]").
const CONTENT_SUGGEST_TOKEN_RE = /\[\s*CONTENT_SUGGEST\s*:([^\]\n]*)\]/gi
// 닫는 괄호 없이 끝에서 끊긴 토큰(길이 자르기·끊긴 스트림).
const DANGLING_CONTENT_SUGGEST_RE = /\[\s*CONTENT_SUGGEST\b[^\]\n]*$/i

function readTokenField(body: string, key: string) {
  const match = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*([^,\\]]*)`, "i").exec(body)
  return match ? match[1].trim() : ""
}

function contentSuggestUrl(type: ContentSuggestType, slug: string) {
  return type === "blog" ? `/blog/${slug}` : type === "resource" ? `/resources/${slug}` : `/events/${slug}`
}

export interface ExtractedContentSuggest {
  /** 토큰을 모두 뗀 글 */
  text: string
  /** 허용 목록에 있는 자료(같은 slug 는 한 번) */
  items: ContentSuggestItem[]
  /** 허용 목록에 없어 버린 토큰 수 */
  rejected: number
}

/**
 * 답 글에서 추천 자료 토큰을 모두 떼고, 허용 목록에 있는 slug 만 자료로 돌려준다. 제목은 허용 목록의 제목으로 바꾼다.
 * 허용 목록에 없는 slug·형식이 깨진 토큰·끝에서 끊긴 토큰은 글에서만 지운다. 사용성 검사와 근거 대조보다 먼저 부른다.
 */
export function extractContentSuggest(
  raw: string,
  allowList: ReadonlyArray<ContentSuggestAllowItem> = CONTENT_SUGGEST_ALLOWLIST
): ExtractedContentSuggest {
  const items: ContentSuggestItem[] = []
  let rejected = 0
  const text = raw
    .replace(CONTENT_SUGGEST_TOKEN_RE, (_token, body: string) => {
      const slug = readTokenField(body, "slug")
      const allowed = slug ? allowList.find((item) => item.slug === slug) : undefined
      if (!allowed) {
        rejected += 1
      } else if (!items.some((item) => item.slug === allowed.slug)) {
        items.push({ ...allowed, url: contentSuggestUrl(allowed.type, allowed.slug) })
      }
      return ""
    })
    .replace(DANGLING_CONTENT_SUGGEST_RE, () => {
      rejected += 1
      return ""
    })
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { text, items, rejected }
}

// ── 모델 글 대조 ──────────────────────────────────────────────────────────────────────────────────

/** 문장을 버린 까닭. */
export type GeneratedSentenceIssue =
  /** 숫자+단위·버전·세 자리 이상 숫자가 초안·근거·허용 글에 없다 */
  | "unsupported_number"
  /** [대괄호 메뉴] 이름이 초안·근거·허용 글·질문에 없다 */
  | "unsupported_menu"
  /** 영문 이름(제품·회사·기능명)이 초안·근거·허용 글·질문에 없다 */
  | "unsupported_latin"
  /** URL·전화번호·이메일이 초안·근거·허용 글에 없다 */
  | "contact"
  /** 한자·가나가 섞였다 */
  | "foreign_script"
  /** 영문이 30%를 넘는 외국어 문장이다 */
  | "foreign_language"
  /** '내부 정보 1'·'안전 초안' 같은 내부 표현 */
  | "internal_reference"
  /** 연락처·계정 정보를 채팅으로 달라는 문장 */
  | "asks_contact"

export interface DroppedGeneratedSentence {
  sentence: string
  issue: GeneratedSentenceIssue
  /** 걸린 낱말(숫자·메뉴·영문 이름 등) */
  detail?: string
}

export interface GeneratedAnswerCheckOptions {
  /** 안전 초안(결정형 답). '지원하지 않음·확인 필요' 뒤집기를 이 글과 비교한다. */
  draft: string
  /** 모델에게 준 근거 문장(근거 선별이 고른 문장 또는 출처 본문). */
  groundingSentences: ReadonlyArray<string>
  /** 고객 질문. 영문 이름·[메뉴] 이름은 질문에 있으면 허용한다(숫자·연락처는 질문만으로 허용하지 않는다: 질문 속 잘못된 숫자를 맞장구치지 않게). */
  question?: string
  /**
   * 그 밖에 허용할 글(예: llm.ts getFinalAnswerAllowList 가 주는 시스템 지시·요구사항). 포지셔닝 정본(lib/classin-positioning.ts)의
   * 챗봇 맥락은 늘 허용한다.
   */
  allowList?: ReadonlyArray<string>
}

export type GeneratedAnswerCheck =
  | { ok: true; answer: string; dropped: DroppedGeneratedSentence[] }
  | {
      ok: false
      /** empty: 글이 비었다 / constraint_flipped: 초안의 미지원·확인 필요를 '가능'으로 뒤집었다 / no_sentences_left: 남은 문장이 없다 */
      reason: "empty" | "constraint_flipped" | "no_sentences_left"
      dropped: DroppedGeneratedSentence[]
    }

// 숫자+단위. 긴 단위를 먼저 둔다(만 원 > 만, 개월 > 개, 시간 > 시, 주일 > 주).
const NUMBER_UNIT_RE =
  /(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|천\s*원|억\s*원|만\s*명|개국|개월|시간|주일|퍼센트|페이지|학년|교시|인치|mbps|gb|mb|tb|kb|만|천|억|원|명|인|개|분|초|일|주|달|년|%|배|대|회|번|형|세|살|장|쪽|곳|시)/giu
// 버전 모양(6.0.7, v2.1)과 단위 없는 세 자리 이상 숫자.
const VERSION_RE = /\bv?\d+\.\d+(?:\.\d+)+\b|\bv\d+(?:\.\d+)?\b/gi
const BARE_NUMBER_RE = /(?<![\d.,])\d{3,}(?![\d.,]|\s*(?:만\s*원|천\s*원|억\s*원|만\s*명|개국|개월|시간|주일|퍼센트|페이지|학년|교시|인치|mbps|gb|mb|tb|kb|만|천|억|원|명|인|개|분|초|일|주|달|년|%|배|대|회|번|형|세|살|장|쪽|곳|시))/giu
const MENU_RE = /\[([^\]\n]{1,40})\]/g
const LATIN_TOKEN_RE = /[A-Za-z][A-Za-z0-9]*(?:[.+#&'’-][A-Za-z0-9]+)*/g
const URL_RE = /(?:https?:\/\/|www\.)[^\s)\]]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|kr|co\.kr|ai|app)\b(?:\/[^\s)\]]*)?/gi
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const PHONE_RE = /(?:\+?82[-\s.]?)?0\d{1,2}[-\s.)]\s?\d{3,4}[-\s.]\d{4}|\b01[016789]\d{7,8}\b|\b1[5-9]\d{2}[-\s.]\d{4}\b/g
const FOREIGN_SCRIPT_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿]+/g
const HANGUL_RE = /[가-힣]/g
const INTERNAL_REFERENCE_RE =
  /내부\s*검증\s*정보|내부\s*정보\s*\d|\[\s*내부\s*정보|안전\s*초안|시스템\s*지시|(?:제공된|주어진)\s*(?:정보|문서|자료|근거)(?:에|를|로|만|에서)/
// '입력해 주세요'는 앱 화면 안내에 흔해 묻는 말로 보지 않는다.
const ASK_CONTACT_RE =
  /(?:연락처|전화\s*번호|휴대폰\s*번호|핸드폰\s*번호|이메일(?:\s*주소)?|메일\s*주소|아이디|비밀번호|카드\s*번호|계좌(?:\s*번호)?|주민(?:등록)?\s*번호)(?:\S{0,3})\s*(?:\S+\s+){0,2}?(?:알려|남겨|적어|보내|말씀해)\s*(?:주세요|주시면|주실|주시겠|줘)/
// 채팅이 아닌 곳(문의 폼·앱 화면)에 적으라는 안내는 묻는 문장이 아니다.
const CONTACT_ELSEWHERE_RE = /폼|양식|버튼|페이지|화면|앱|로그인|설정|입력란|칸|창/
// 초안의 제약(미지원·확인 필요)과 답의 긍정·완곡 표현.
const DRAFT_NEGATIVE_RE = /(?:지원|제공)(?:하지|되지)\s*않|확인이\s*필요|(?:쓸|할|사용할)\s*수\s*없|불가/
const ANSWER_POSITIVE_RE =
  /가능(?:합니다|해요|하다|하며|하고|하죠|하니|해서|해|(?=[.!?~\n]|$))|(?:지원|제공)(?:합니다|해요|돼요|됩니다|하고\s*있|되고\s*있)|(?:쓸|할|사용할|이용할)\s*수\s*있(?:어요|습니다|답니다)/
// 답이 제약을 그대로 두었다고 볼 말(부정·확인 필요·단정 못 함). '상담'·'담당자'를 언급한 것만으로는 제약을 지킨 것이 아니다.
const ANSWER_HEDGE_RE =
  /(?:지원|제공)(?:하지|되지)\s*않|(?:쓸|할|사용할)\s*수\s*없|불가|안\s*(?:돼요|됩니다|되어요)|확인이\s*필요|확인되지\s*않|(?:확정|단정)(?:하기|해\s*드리기|해\s*말씀드리기)?\s*어렵|말씀드리기\s*어렵|공개\s*안내(?:에|에서)\s*(?:없|찾지|확인되지)/
// 사실 주장이 아닌 흔한 영문 약어·기기 이름. 이 밖의 영문 이름은 초안·근거·허용 글·질문에 있어야 한다.
const GENERIC_LATIN_TOKENS = new Set([
  "pc", "ai", "api", "os", "id", "qr", "pdf", "ppt", "pptx", "app", "faq", "sns", "url", "ok",
  "wifi", "wi-fi", "usb", "hdmi", "tv", "ios", "android", "windows", "mac", "macos", "ipad", "iphone",
])

const LIST_PREFIX_RE = /^\s*(?:[-*•]|\d+[.)])\s+/

function compact(value: string) {
  return value.normalize("NFC").toLowerCase().replace(/\s+/g, "")
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

function numberUnitKeys(text: string) {
  const keys = new Set<string>()
  for (const match of text.matchAll(NUMBER_UNIT_RE)) {
    keys.add(`${match[1].replace(/,/g, "")}${match[2].replace(/\s+/g, "").toLowerCase()}`)
  }
  return keys
}

function numberTokens(text: string) {
  const tokens = new Set<string>()
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)*/g)) tokens.add(match[0].replace(/,/g, ""))
  return tokens
}

interface AllowedCorpus {
  compact: string
  compactWithQuestion: string
  digits: string
  numberUnits: Set<string>
  numbers: Set<string>
  lower: string
  lowerWithQuestion: string
}

function buildCorpus(options: GeneratedAnswerCheckOptions): AllowedCorpus {
  const text = [
    options.draft,
    ...options.groundingSentences,
    ...(options.allowList ?? []),
    getClassinPositioningContext(),
    getClassinChatbotReferenceContext(),
  ].join("\n")
  const question = options.question ?? ""
  return {
    compact: compact(text),
    compactWithQuestion: compact(`${text}\n${question}`),
    digits: digitsOnly(text),
    numberUnits: numberUnitKeys(text),
    numbers: numberTokens(text),
    lower: text.normalize("NFC").toLowerCase(),
    lowerWithQuestion: `${text}\n${question}`.normalize("NFC").toLowerCase(),
  }
}

function isAllowedLatin(token: string, corpus: AllowedCorpus) {
  const lower = token.toLowerCase()
  return GENERIC_LATIN_TOKENS.has(lower) || corpus.lowerWithQuestion.includes(lower)
}

/** 문장 하나를 본다. 버릴 까닭이 있으면 돌려준다. */
function findSentenceIssue(sentence: string, corpus: AllowedCorpus): Omit<DroppedGeneratedSentence, "sentence"> | null {
  if (INTERNAL_REFERENCE_RE.test(sentence)) return { issue: "internal_reference" }

  for (const match of sentence.matchAll(FOREIGN_SCRIPT_RE)) {
    if (!corpus.compact.includes(compact(match[0]))) return { issue: "foreign_script", detail: match[0] }
  }

  // 연락처: 같은 숫자·주소가 허용 글에 있으면 둔다(문서 속 예시 번호 형식 등).
  for (const match of sentence.matchAll(EMAIL_RE)) {
    if (!corpus.lower.includes(match[0].toLowerCase())) return { issue: "contact", detail: match[0] }
  }
  for (const match of sentence.matchAll(PHONE_RE)) {
    if (!corpus.digits.includes(digitsOnly(match[0]))) return { issue: "contact", detail: match[0] }
  }
  for (const match of sentence.matchAll(URL_RE)) {
    if (!corpus.lower.includes(match[0].toLowerCase().replace(/[.,]$/, ""))) return { issue: "contact", detail: match[0] }
  }

  if (ASK_CONTACT_RE.test(sentence) && !CONTACT_ELSEWHERE_RE.test(sentence)) return { issue: "asks_contact" }

  const latinTokens = Array.from(sentence.matchAll(LATIN_TOKEN_RE), (match) => match[0]).filter((token) => token.length >= 2)
  const unknownLatin = latinTokens.filter((token) => !isAllowedLatin(token, corpus))
  if (unknownLatin.length > 0) {
    const latinLetters = latinTokens.join("").replace(/[^A-Za-z]/g, "").length
    const hangulLetters = sentence.match(HANGUL_RE)?.length ?? 0
    // 영문 낱말이 셋 이상이고 글자의 30%를 넘으면 외국어 문장으로 본다(한국어 문장 속 영문 이름 한두 개는 unsupported_latin).
    if (latinTokens.length >= 3 && latinLetters / Math.max(1, latinLetters + hangulLetters) > 0.3) {
      return { issue: "foreign_language", detail: unknownLatin.join(" ") }
    }
    return { issue: "unsupported_latin", detail: unknownLatin.join(" ") }
  }

  for (const match of sentence.matchAll(MENU_RE)) {
    if (!corpus.compactWithQuestion.includes(compact(match[1]))) return { issue: "unsupported_menu", detail: match[0] }
  }

  for (const match of sentence.matchAll(VERSION_RE)) {
    const version = match[0].replace(/^v/i, "")
    if (!corpus.numbers.has(version)) return { issue: "unsupported_number", detail: match[0] }
  }
  for (const key of numberUnitKeys(sentence)) {
    if (!corpus.numberUnits.has(key)) return { issue: "unsupported_number", detail: key }
  }
  for (const match of sentence.matchAll(BARE_NUMBER_RE)) {
    if (!corpus.numbers.has(match[0])) return { issue: "unsupported_number", detail: match[0] }
  }

  return null
}

/**
 * 모델이 쓴 답을 문장 단위로 대조한다.
 * - 근거 밖 숫자+단위·버전, [메뉴] 이름, 영문 이름, URL·전화·이메일, 한자·가나, 영문이 30%를 넘는 외국어 문장,
 *   내부 표현('내부 정보 1'·'안전 초안'), 연락처·계정을 채팅으로 달라는 문장은 그 문장을 버린다.
 * - 초안에 '지원하지 않음·제공하지 않음·확인이 필요'가 있는데 답이 그런 말 없이 '가능·지원해요'라고 하면 뒤집은 것으로 보고 ok=false.
 * - 남은 문장이 없으면 ok=false. 호출부는 ok=false 면 안전 초안(결정형 답)을 쓴다.
 * 추천 자료 토큰은 extractContentSuggest 로 먼저 뗀다(남아 있으면 지우고 본다).
 * 목록('- ', '1. ')과 문단 모양은 남은 문장으로 그대로 다시 짓는다.
 */
export function checkGeneratedAnswer(answer: string, options: GeneratedAnswerCheckOptions): GeneratedAnswerCheck {
  const text = extractContentSuggest(answer, []).text
  if (!text.trim()) return { ok: false, reason: "empty", dropped: [] }

  if (DRAFT_NEGATIVE_RE.test(options.draft) && ANSWER_POSITIVE_RE.test(text) && !ANSWER_HEDGE_RE.test(text)) {
    return { ok: false, reason: "constraint_flipped", dropped: [] }
  }

  const corpus = buildCorpus(options)
  const dropped: DroppedGeneratedSentence[] = []
  let kept = 0
  const lines = text.split("\n").map((line) => {
    if (!line.trim()) return ""
    const prefix = LIST_PREFIX_RE.exec(line)?.[0] ?? ""
    const sentences = splitIntoSentences(line.slice(prefix.length)).filter((sentence) => {
      const issue = findSentenceIssue(sentence, corpus)
      if (issue) dropped.push({ sentence, ...issue })
      return !issue
    })
    kept += sentences.length
    return sentences.length > 0 ? `${prefix.trim() ? `${prefix.trim()} ` : ""}${sentences.join(" ")}` : null
  })

  if (kept === 0) return { ok: false, reason: "no_sentences_left", dropped }

  const rebuilt = lines
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { ok: true, answer: rebuilt, dropped }
}
