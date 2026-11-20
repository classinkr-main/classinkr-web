/**
 * generate 모드(CHATBOT_FINAL_ANSWER_LLM=generate)에서 모델이 쓴 답을 내보내기 전에 보는 순수 함수들.
 *
 * - extractContentSuggest: 답 끝의 추천 자료 토큰([CONTENT_SUGGEST:type=…,slug=…,title=…])을 떼고, 허용 목록에 있는 자료만 받는다.
 * - checkGeneratedAnswer: 모델 글을 문장 단위로 안전 초안·근거 문장과 대조한다. 근거 밖 숫자(한글 수 포함)·메뉴(대괄호·따옴표·굵게)·
 *   영문 이름·연락처, 한자 문장, 내부 표현, 연락처를 묻는 문장은 그 문장을 버리고, 초안의 '지원하지 않음·확인 필요·(으)ㄹ 수 없음'을
 *   '가능'으로 뒤집었으면(문장을 버린 뒤에 다시 보고, 버린 문장이 초안의 제약을 담았으면 그것도) 초안으로 돌아간다.
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
      /**
       * empty: 글이 비었다 / constraint_flipped: 초안의 미지원·확인 필요·(으)ㄹ 수 없음을 '가능'으로 뒤집었다(문장을 버린 뒤의 답 포함) /
       * constraint_dropped: 초안에 제약이 있는데 제약을 말한 문장이 근거 대조로 버려졌다 / no_sentences_left: 남은 문장이 없다
       */
      reason: "empty" | "constraint_flipped" | "constraint_dropped" | "no_sentences_left"
      dropped: DroppedGeneratedSentence[]
    }

// 숫자+단위. 긴 단위를 먼저 둔다(만 원 > 만, 개월 > 개, 시간 > 시, 주일 > 주).
const NUMBER_UNIT_RE =
  /(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|천\s*원|억\s*원|만\s*명|개국|개월|시간|주일|퍼센트|페이지|학년|교시|인치|mbps|gb|mb|tb|kb|만|천|억|원|명|인|개|분|초|일|주|달|년|%|배|대|회|번|형|세|살|장|쪽|곳|시)/giu
// 한글 수 + 기간·인원·대수 단위("한 달", "백 명", "두 시간"). 흔한 말("한 번", "한 가지", "두 분")은 보지 않는다. 뒤에는 조사·끝만 온다("한 주제"는 아니다).
const KOREAN_NUMBER_UNIT_RE =
  /(?<![가-힣])(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|서른|백|천|만)\s*(개월|달|주일|주|시간|년|명|대)(?=$|[\s.,!?~)\]]|까지|부터|동안|간|씩|만|정도|이상|이하|이내|안에|째|짜리|당|에|이|의|을|를|은|는|도)/gu
const KOREAN_NUMBERS: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 스무: 20, 서른: 30, 백: 100, 천: 1000, 만: 10000,
}
// 버전 모양(6.0.7, v2.1, "5.2 버전", "버전 5.2")과 단위 없는 세 자리 이상 숫자.
const VERSION_RE = /\bv?\d+\.\d+(?:\.\d+)+\b|\bv\d+(?:\.\d+)?\b|\d+(?:\.\d+)+(?=\s*(?:버전|ver\b))|(?<=(?:버전|ver\.?)\s*)\d+(?:\.\d+)+/gi
const BARE_NUMBER_RE = /(?<![\d.,])\d{3,}(?![\d.,]|\s*(?:만\s*원|천\s*원|억\s*원|만\s*명|개국|개월|시간|주일|퍼센트|페이지|학년|교시|인치|mbps|gb|mb|tb|kb|만|천|억|원|명|인|개|분|초|일|주|달|년|%|배|대|회|번|형|세|살|장|쪽|곳|시))/giu
const MENU_RE = /\[([^\]\n]{1,40})\]/g
// 따옴표·굵게로 쓴 이름 뒤에 메뉴·버튼·탭·설정이 오면 [메뉴]와 같이 본다("‘토론 모드’ 메뉴", "**토론 모드** 버튼").
const QUOTED_MENU_RE =
  /(?:['‘’"“”「『]([^'‘’"“”「」『』\n]{1,40})['‘’"“”」』]|\*\*([^*\n]{1,40})\*\*)\s*(?:메뉴|버튼|탭|설정|항목|모드|기능|화면)/g
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
// 초안의 제약(미지원·확인 필요)과 답의 긍정·완곡 표현. '확인이 필요 없이'는 제약이 아니다(부정의 부정).
const DRAFT_NEGATIVE_RE = /(?:지원|제공)(?:하지|되지)\s*않|확인이\s*필요(?!\s*(?:없|하지\s*않))|(?:쓸|할|사용할)\s*수\s*없|불가/
const ANSWER_POSITIVE_RE =
  /가능(?:합니다|해요|하다|하며|하고|하죠|하니|해서|해|(?=[.!?~\n]|$))|(?:지원|제공)(?:합니다|해요|돼요|됩니다|하고\s*있|되고\s*있)|(?:쓸|할|사용할|이용할)\s*수\s*있(?:어요|습니다|답니다)/
// 답이 제약을 그대로 두었다고 볼 말(부정·확인 필요·단정 못 함). '상담'·'담당자'를 언급한 것만으로는 제약을 지킨 것이 아니다.
const ANSWER_HEDGE_RE =
  /(?:지원|제공)(?:하지|되지)\s*않|(?:쓸|할|사용할)\s*수\s*없|불가|안\s*(?:돼요|됩니다|되어요)|확인이\s*필요(?!\s*(?:없|하지\s*않))|확인되지\s*않|(?:확정|단정)(?:하기|해\s*드리기|해\s*말씀드리기)?\s*어렵|말씀드리기\s*어렵|공개\s*안내(?:에|에서)\s*(?:없|찾지|확인되지)/
// 넓은 부정·제약 표시(문장 단위 대조용): '(으)ㄹ 수 없', '-지 않/못', '안 됩니다', '없습니다', 불가, 확인 필요.
// 조건("저장되지 않으면", "안 되면")은 제약이 아니다.
const BROAD_NEGATIVE_RE =
  /확인이\s*필요(?!\s*(?:없|하지\s*않))|[가-힣]\s*수\s*(?:가\s*|는\s*)?없(?![가-힣]*면)|불가|[가-힣]지\s*(?:않|못)(?![가-힣]*면)|(?:^|\s)(?:안|못)\s*(?:돼|되|됩|됨|해|합|하|보|들|열|나|켜|떠|와)(?![가-힣]*면)|없습니다|없어요|없고|없으며/
// 부정 문장의 동사: "지울 수 없" → 지울, "복구되지 않" → 복구.
const NEGATED_CAN_RE = /([가-힣]+)\s*수\s*(?:가\s*|는\s*)?없/g
const NEGATED_STEM_RE = /([가-힣]{2,})지\s*(?:않|못)/g
// 동사 줄기 끝의 하·되·돼(지원하 → 지원, 복구되 → 복구). 한 글자만 남으면 그대로 둔다.
const STEM_TAIL_RE = /(?:하|되|돼)$/
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

// 같은 기간을 같은 열쇠로 본다("1달" = "1개월", "2주일" = "2주").
function unitKey(unit: string) {
  const compactUnit = unit.replace(/\s+/g, "").toLowerCase()
  return compactUnit === "달" ? "개월" : compactUnit === "주일" ? "주" : compactUnit
}

function numberUnitKeys(text: string) {
  const keys = new Set<string>()
  for (const match of text.matchAll(NUMBER_UNIT_RE)) {
    keys.add(`${match[1].replace(/,/g, "")}${unitKey(match[2])}`)
  }
  for (const match of text.matchAll(KOREAN_NUMBER_UNIT_RE)) {
    keys.add(`${KOREAN_NUMBERS[match[1]]}${unitKey(match[2])}`)
  }
  return keys
}

// 이웃 명사 대조에서 세지 않는 흔한 낱말.
const NEIGHBOR_STOP_WORDS = new Set(["동안", "정도", "이상", "이하", "이내", "까지", "부터", "경우", "때문", "그리고", "하지만", "클래스인", "classin"])
const NEIGHBOR_PARTICLE_RE = /(?:에서는|에서도|으로는|에서|으로|에게|한테|까지|부터|처럼|보다|은|는|이|가|을|를|의|에|와|과|도|만|로|랑)$/

/** 문장의 명사 비슷한 낱말(두 글자 이상 한글, 조사 뗌, 서술어 꼴 뺌). 숫자 이웃 명사 대조와 뒤집기 대조에 쓴다. */
function nounsOf(sentence: string) {
  const nouns = new Set<string>()
  for (const raw of sentence.normalize("NFC").split(/[^가-힣a-zA-Z]+/)) {
    if (!raw) continue
    if (/(?:요|다|니다|죠|고|며|면|서|게|지|까)$/.test(raw) && raw.length >= 3 && /[가-힣]/.test(raw)) continue
    const word = raw.length >= 3 ? raw.replace(NEIGHBOR_PARTICLE_RE, "") : raw
    if (word.length < 2 || NEIGHBOR_STOP_WORDS.has(word.toLowerCase())) continue
    nouns.add(word.toLowerCase())
  }
  return nouns
}

function sharesNoun(left: Set<string>, right: Set<string>) {
  for (const word of left) if (right.has(word)) return true
  return false
}

function numberTokens(text: string) {
  const tokens = new Set<string>()
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)*/g)) tokens.add(match[0].replace(/,/g, ""))
  return tokens
}

/** 글 속 숫자 하나: 숫자+단위 열쇠(unit) 또는 숫자 글(number)과 그 숫자 앞뒤의 이웃 명사. */
interface NumberMention {
  kind: "unit" | "number"
  key: string
  detail: string
  nouns: Set<string>
}

// 이웃 명사를 보는 숫자 앞뒤 글자 수.
const NUMBER_NEIGHBOR_CHARS = 18

/** 숫자 앞뒤 글의 명사(숫자와 단위 자체는 뺀다: "3개월"의 '개월'이 이웃 명사로 맞지 않게). */
function neighborNouns(text: string, index: number, length: number) {
  const before = text.slice(Math.max(0, index - NUMBER_NEIGHBOR_CHARS), index)
  const after = text.slice(index + length, index + length + NUMBER_NEIGHBOR_CHARS)
  return nounsOf(`${before} ${after}`)
}

/** 문장의 숫자들(버전·숫자+단위·단위 없는 세 자리 이상 숫자). 허용 글 쪽은 모든 숫자 글을 number 로 센다(allNumbers). */
function numberMentions(text: string, { allNumbers = false } = {}): NumberMention[] {
  const mentions: NumberMention[] = []
  for (const match of text.matchAll(VERSION_RE)) {
    mentions.push({ kind: "number", key: match[0].replace(/^v/i, ""), detail: match[0], nouns: neighborNouns(text, match.index ?? 0, match[0].length) })
  }
  for (const match of text.matchAll(NUMBER_UNIT_RE)) {
    const key = `${match[1].replace(/,/g, "")}${unitKey(match[2])}`
    mentions.push({ kind: "unit", key, detail: key, nouns: neighborNouns(text, match.index ?? 0, match[0].length) })
  }
  for (const match of text.matchAll(KOREAN_NUMBER_UNIT_RE)) {
    const key = `${KOREAN_NUMBERS[match[1]]}${unitKey(match[2])}`
    mentions.push({ kind: "unit", key, detail: key, nouns: neighborNouns(text, match.index ?? 0, match[0].length) })
  }
  for (const match of text.matchAll(allNumbers ? /\d[\d,]*(?:\.\d+)*/g : BARE_NUMBER_RE)) {
    const key = match[0].replace(/,/g, "")
    mentions.push({ kind: "number", key, detail: match[0], nouns: neighborNouns(text, match.index ?? 0, match[0].length) })
  }
  return mentions
}

interface AllowedCorpus {
  compact: string
  compactWithQuestion: string
  digits: string
  /** 숫자+단위·숫자: 초안과 근거 문장(질문에 맞게 고른 것)에서만. */
  numberUnits: Set<string>
  numbers: Set<string>
  /** 허용 글(시스템 지시·요구사항·포지셔닝 정본)의 숫자. 같은 숫자에 이웃 명사가 같을 때만 허용한다. */
  extendedNumbers: NumberMention[]
  lower: string
  lowerWithQuestion: string
}

function buildCorpus(options: GeneratedAnswerCheckOptions): AllowedCorpus {
  const grounded = [options.draft, ...options.groundingSentences].join("\n")
  const extended = [...(options.allowList ?? []), getClassinPositioningContext(), getClassinChatbotReferenceContext()].join("\n")
  const text = `${grounded}\n${extended}`
  const question = options.question ?? ""
  const extendedNumbers = extended.split("\n").flatMap((line) => numberMentions(line, { allNumbers: true }))
  return {
    compact: compact(text),
    compactWithQuestion: compact(`${text}\n${question}`),
    digits: digitsOnly(text),
    numberUnits: numberUnitKeys(grounded),
    numbers: numberTokens(grounded),
    extendedNumbers,
    lower: text.normalize("NFC").toLowerCase(),
    lowerWithQuestion: `${text}\n${question}`.normalize("NFC").toLowerCase(),
  }
}

/**
 * 숫자(숫자+단위 열쇠 또는 숫자 글)가 허용되는지. 초안·근거 문장에 있으면 허용한다. 시스템 지시·포지셔닝에만 있는 숫자는
 * 그 숫자 앞뒤의 이웃 명사가 하나 이상 같을 때만 허용한다("2주"가 체험 문장에만 있으면 "녹화 영상은 2주 보관"은 버린다).
 */
function isNumberAllowed(mention: NumberMention, corpus: AllowedCorpus) {
  if ((mention.kind === "unit" ? corpus.numberUnits : corpus.numbers).has(mention.key)) return true
  return corpus.extendedNumbers.some(
    (item) => item.kind === mention.kind && item.key === mention.key && sharesNoun(mention.nouns, item.nouns)
  )
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
  for (const match of sentence.matchAll(QUOTED_MENU_RE)) {
    const name = match[1] ?? match[2] ?? ""
    if (!corpus.compactWithQuestion.includes(compact(name))) return { issue: "unsupported_menu", detail: match[0] }
  }

  for (const mention of numberMentions(sentence)) {
    if (!isNumberAllowed(mention, corpus)) return { issue: "unsupported_number", detail: mention.detail }
  }

  return null
}

function stemOf(word: string) {
  const stem = word.replace(STEM_TAIL_RE, "")
  return stem.length >= 1 ? stem : word
}

/** 초안의 부정 문장마다 부정한 동사와 명사. */
function draftNegations(draft: string) {
  return draft
    .split("\n")
    .flatMap((line) => splitIntoSentences(line.replace(LIST_PREFIX_RE, "")))
    .filter((sentence) => BROAD_NEGATIVE_RE.test(sentence))
    .map((sentence) => ({
      canVerbs: Array.from(sentence.matchAll(NEGATED_CAN_RE), (match) => match[1]),
      stems: Array.from(sentence.matchAll(NEGATED_STEM_RE), (match) => stemOf(match[1])).filter((stem) => stem.length >= 2),
      nouns: nounsOf(sentence),
    }))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 답 문장이 초안의 부정 문장을 '가능'으로 뒤집었는지(문장 단위). 부정이 없는 답 문장이 초안이 부정한 동사를 긍정 꼴로 쓰고
 * ("지울 수 없습니다" → "지울 수 있어요", "복구되지 않습니다" → "복구돼요"), 그 부정 문장과 명사를 하나 이상 같이 쓰면 뒤집은 것이다.
 */
function flipsDraftSentence(sentence: string, negations: ReturnType<typeof draftNegations>) {
  if (BROAD_NEGATIVE_RE.test(sentence) || ANSWER_HEDGE_RE.test(sentence)) return false
  const nouns = nounsOf(sentence)
  return negations.some((negation) => {
    if (!sharesNoun(nouns, negation.nouns)) return false
    const can = negation.canVerbs.some((verb) => new RegExp(`${escapeRegExp(verb)}\\s*수\\s*(?:도\\s*)?있`).test(sentence))
    const stem = negation.stems.some((verbStem) =>
      new RegExp(`${escapeRegExp(verbStem)}(?:해요|합니다|해\\s*드려요|돼요|됩니다|되어요|되고|되며|할\\s*수\\s*있|될\\s*수\\s*있|(?:이|가)?\\s*가능)`).test(sentence)
    )
    return can || stem
  })
}

/** 답(문장을 버린 뒤의 답 포함)이 초안의 제약을 뒤집었는지. 굵은 규칙(지원·제공·확인 필요 ↔ 가능)과 문장 단위 대조를 함께 본다. */
function flipsDraftConstraint(text: string, draft: string) {
  if (DRAFT_NEGATIVE_RE.test(draft) && ANSWER_POSITIVE_RE.test(text) && !ANSWER_HEDGE_RE.test(text)) return true
  const negations = draftNegations(draft)
  if (negations.length === 0) return false
  return text
    .split("\n")
    .flatMap((line) => splitIntoSentences(line.replace(LIST_PREFIX_RE, "")))
    .some((sentence) => flipsDraftSentence(sentence, negations))
}

/**
 * 모델이 쓴 답을 문장 단위로 대조한다.
 * - 근거 밖 숫자+단위·버전, [메뉴] 이름, 영문 이름, URL·전화·이메일, 한자·가나, 영문이 30%를 넘는 외국어 문장,
 *   내부 표현('내부 정보 1'·'안전 초안'), 연락처·계정을 채팅으로 달라는 문장은 그 문장을 버린다.
 * - 초안에 '지원하지 않음·제공하지 않음·확인이 필요'가 있는데 답이 그런 말 없이 '가능·지원해요'라고 하면 뒤집은 것으로 보고 ok=false.
 *   문장 단위로도 본다: 초안이 부정한 동사를 같은 명사와 함께 긍정 꼴로 쓰면("지울 수 없습니다" → "지울 수 있어요") 뒤집은 것이다.
 *   '확인이 필요 없이 … 가능해요'는 제약을 지킨 말이 아니다.
 * - 문장을 버린 뒤 다시 지은 답도 같은 뒤집기 검사를 한다. 초안에 제약이 있는데 버린 문장이 제약(부정)을 말한 문장이면
 *   남은 답이 제약을 잃으므로 ok=false(constraint_dropped).
 * - 숫자는 초안·근거 문장과 대조한다(한글 수+단위 포함). 시스템 지시·포지셔닝에만 있는 숫자는 같은 문장의 이웃 명사가 맞을 때만 허용한다.
 * - 남은 문장이 없으면 ok=false. 호출부는 ok=false 면 안전 초안(결정형 답)을 쓴다.
 * 추천 자료 토큰은 extractContentSuggest 로 먼저 뗀다(남아 있으면 지우고 본다).
 * 목록('- ', '1. ')과 문단 모양은 남은 문장으로 그대로 다시 짓는다.
 */
export function checkGeneratedAnswer(answer: string, options: GeneratedAnswerCheckOptions): GeneratedAnswerCheck {
  const text = extractContentSuggest(answer, []).text
  if (!text.trim()) return { ok: false, reason: "empty", dropped: [] }

  if (flipsDraftConstraint(text, options.draft)) {
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
  if (dropped.length > 0) {
    // 버린 문장이 제약(부정)을 말했는데 초안에도 제약이 있으면, 남은 답은 그 제약을 잃는다.
    if (BROAD_NEGATIVE_RE.test(options.draft) && dropped.some((item) => BROAD_NEGATIVE_RE.test(item.sentence))) {
      return { ok: false, reason: "constraint_dropped", dropped }
    }
    if (flipsDraftConstraint(rebuilt, options.draft)) return { ok: false, reason: "constraint_flipped", dropped }
  }
  return { ok: true, answer: rebuilt, dropped }
}
