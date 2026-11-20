/**
 * 대화 맥락(직전 한 턴)으로 이번 말을 검색·라우팅용 글로 넓힌다(2026-11-20 조사 G1·G2·G10).
 *
 * 처음 온 고객일수록 짧게 답하거나 이어서 묻는다("휴대폰이요", "그러면 아이패드는요", "아까 그거 다시요").
 * 예전에는 검색·분류·관문·선별·답 색인이 지금 문장만 받아, 봇이 물은 질문("쓰시는 기기가 PC인지…")에 답해도 일반 되묻기가 나갔다.
 * 직전 턴은 DB 이력이 아니라 위젯이 보내는 값(직전 질문 200자 이하·직전 답의 끝 질문 종류·답 모드)만 쓴다.
 * 그래야 측정(scripts/chatbot-live-eval.ts)과 운영이 같은 입력을 본다.
 *
 * 규칙(결정형, 모델·네트워크 호출 없음)
 * - 넓히는 말: 짧은 대답(내용 낱말 2개 이하이고 자기 서술어가 없는 말), 직전 답이 물은 정보의 답 모양(askedSlot),
 *   지시어 후속 질문(그거·이거, 그럼·그러면 …은요, 아까 그거 다시요, 해 봤는데 또 안 돼요).
 * - 그대로 두는 말: 내용 낱말이 있는 긴 질문, 자기 서술어가 있는 새 질문("그럼 녹화는 어디서 봐요?"), 혼자서도 답이 서는 짧은 말
 *   (standsAlone: "요금은요?"처럼 정해 둔 답이 바로 잡히는 말. 판단은 부르는 쪽이 준다).
 * - 직전 턴 없이 지시어만 있는 말("이거 뭐예요")은 target_unknown(대상 불명)이다. 문서 페이지에서는 그 문서를 가리키는 말로 본다(page_context).
 * - 넓힌 글은 "직전 질문 + 지금 말(지시어·잇는 말을 뺀 것)"이다. 직전 질문이 없으면 지금 말 그대로다(한 줄 질문의 답은 바뀌지 않는다).
 */
import type { AskedSlot } from "@/lib/chatbot/follow-up"
import { isTailOnly, stripParticle } from "@/lib/chatbot/answer-index/normalize"

export const ASKED_SLOTS: readonly AskedSlot[] = ["device", "size", "rooms", "mode", "timing", "choice"]
export const PREVIOUS_TURN_QUESTION_MAX = 200

/** 위젯이 보내는 직전 한 턴. question 은 서버가 이번 질문과 같은 정규화·가리기를 한 뒤의 글이다. */
export interface PreviousTurn {
  question: string
  askedSlot?: AskedSlot
  answerMode?: string
}

/** 문서 페이지 경로(/docs/<분류>/<slug>). */
export interface DocPageRef {
  path: string
  category: string
  slug: string
}

export type ConversationTurnReason =
  /** 넓히지 않았다. */
  | "none"
  /** 짧은 대답(내용 낱말 2개 이하, 자기 서술어 없음). */
  | "short_reply"
  /** 직전 답이 물은 정보(기기·규모·교실·수업 방식·시기)의 답 모양. */
  | "slot_answer"
  /** 직전 답이 준 보기 가운데 고르기. */
  | "choice"
  /** 지시어·잇는 말로 앞 턴을 가리키는 후속 질문. */
  | "follow_up"
  /** 문서 페이지에서 그 문서를 가리키는 말("방금 본 내용", 직전 턴 없는 "이거"). */
  | "page_context"
  /** 직전 턴 없이 지시어만 있어 무엇을 묻는지 모른다. */
  | "target_unknown"

export interface ConversationTurn {
  /** 검색·분류·관문·답 색인에 넘길 글. 넓히지 않았으면 지금 말 그대로. */
  routingText: string
  reason: ConversationTurnReason
  /** routingText 를 직전 질문으로 넓혔는지. */
  expanded: boolean
  /** 지금 말이 같은 문제가 다시 생겼다는 신고인지("해 봤는데 또 안 돼요"). 직전 턴이 있을 때만 참이다. */
  retryReport: boolean
  /** page_context 일 때 가리키는 문서. */
  pageDoc?: DocPageRef
}

export interface ResolveConversationTurnOptions {
  /** 지금 말만으로 답이 서는지(정해 둔 답·증상 안내·즉시 상담 연결 등). 짧은 대답·잇는 말 후속 질문을 넓히기 전에 묻는다. */
  standsAlone?: (text: string) => boolean
}

// ─── 입력 검사 ────────────────────────────────────────────────────────────

export type PreviousTurnParse = { ok: true; value: PreviousTurn | null } | { ok: false; error: string }

/**
 * 요청의 context.previousTurn 을 검사한다. 없으면 null. 꼴이 틀리면(객체가 아님, 질문이 비었거나 200자를 넘음,
 * 알 수 없는 askedSlot·answerMode) 오류다. 질문 글의 정규화·개인정보 가리기는 부르는 쪽이 한다.
 */
export function parsePreviousTurnInput(raw: unknown, answerModes: readonly string[]): PreviousTurnParse {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "previousTurn 형식이 올바르지 않습니다." }
  const record = raw as Record<string, unknown>
  if (typeof record.question !== "string") return { ok: false, error: "previousTurn.question 이 필요합니다." }
  const question = record.question.replace(/\s+/g, " ").trim()
  if (!question || question.length > PREVIOUS_TURN_QUESTION_MAX) {
    return { ok: false, error: `previousTurn.question 은 1~${PREVIOUS_TURN_QUESTION_MAX}자여야 합니다.` }
  }
  const value: PreviousTurn = { question }
  if (record.askedSlot !== undefined && record.askedSlot !== null) {
    if (typeof record.askedSlot !== "string" || !(ASKED_SLOTS as readonly string[]).includes(record.askedSlot)) {
      return { ok: false, error: "previousTurn.askedSlot 값이 올바르지 않습니다." }
    }
    value.askedSlot = record.askedSlot as AskedSlot
  }
  if (record.answerMode !== undefined && record.answerMode !== null) {
    if (typeof record.answerMode !== "string" || !answerModes.includes(record.answerMode)) {
      return { ok: false, error: "previousTurn.answerMode 값이 올바르지 않습니다." }
    }
    value.answerMode = record.answerMode
  }
  return { ok: true, value }
}

const DOC_PAGE_PATH_RE = /^\/docs\/([a-z0-9][a-z0-9-]{0,80})\/([a-z0-9][a-z0-9-]{0,120})\/?$/

/** 문서 페이지 경로만 받는다(허용 형식 /docs/<분류>/<slug>). 쿼리·조각은 뗀다. 그 밖의 경로는 null(답에 쓰지 않는다). */
export function parseDocPagePath(raw: unknown): DocPageRef | null {
  if (typeof raw !== "string") return null
  const path = raw.trim().split(/[?#]/)[0].toLowerCase()
  const match = DOC_PAGE_PATH_RE.exec(path)
  if (!match) return null
  return { path: `/docs/${match[1]}/${match[2]}`, category: match[1], slug: match[2] }
}

// ─── 말 나누기 ────────────────────────────────────────────────────────────

// 앞 턴(또는 화면)의 무엇을 가리키는 말. 조사를 뗀 꼴로 본다.
const OBJECT_DEICTIC_WORDS = new Set([
  "그거", "그게", "그걸", "그것", "그건", "그거요", "이거", "이게", "이걸", "이것", "이건", "이거요",
  "저거", "저게", "저걸", "저건", "거기", "아까", "아까요", "방금",
])
// 앞 턴에 잇는 말("그러면 아이패드는요").
const CONNECTIVE_WORDS = new Set(["그럼", "그러면", "그럼요", "그러면요", "그러면은", "근데", "그런데", "그리고"])
// 같은 대화의 앞 턴을 다시 가리키는 말("또 안 돼요", "다시 알려주세요").
const BACK_REFERENCE_WORDS = new Set(["또", "다시", "아까", "아까요", "방금"])
// 내용이 아닌 말(감탄·부사·의문사·대명사·인사).
const FILLER_WORDS = new Set([
  "좀", "혹시", "그냥", "한번", "번", "정도", "쪽", "거", "것", "걸", "게", "건", "뭐", "무엇", "뭔가", "뭔지",
  "어떻게", "어떡해", "어떤", "어느", "어디", "어디서", "어디에", "언제", "왜", "얼마", "얼마나", "몇", "네", "넵", "예", "응",
  "아니", "아니요", "아뇨", "저", "제", "저는", "제가", "저희", "우리", "그", "이", "안", "못", "진짜", "정말", "너무", "계속",
  "자꾸", "지금", "이제", "요", "말", "말씀", "해", "하고", "하면", "해서", "해도", "해봐도", "안녕", "안녕하세요", "하이",
  "hi", "hello", "감사합니다", "고마워요", "감사해요", "ㅇㅇ", "ㄴㄴ",
])
// 묻는 말(의문사). 잇는 말 없이 의문사가 있으면 그 자체로 새 질문이다("학생 초대는 어떻게 하나요?").
const INTERROGATIVE_WORDS = new Set([
  "어떻게", "어떡해", "어디", "어디서", "어디에", "언제", "왜", "얼마", "얼마나", "몇", "뭐", "무엇", "무슨", "어떤", "어느", "누가", "누구",
])
// 내용 없는 서술어(묻는 꼬리·해 봤다·된다·안 된다).
const GENERIC_PREDICATE_WORDS = new Set([
  "해요", "해", "했어요", "했는데", "했는데요", "해봤는데", "해봤는데요", "해봤어요", "봤는데", "봤는데요", "봤어요", "돼요", "되요",
  "됐어요", "되나요", "안돼요", "안되요", "되네요", "안되네요", "있어요", "있나요", "없어요", "없나요", "가능해요", "가능한가요",
  "궁금해요", "알려주세요", "알려줘요", "주세요", "해주세요", "부탁해요", "어때요", "그래요", "그러네요", "그래서요", "맞아요",
  "맞나요", "할까요", "하나요", "되죠", "그렇죠", "알려줄래요",
])
// 서술어로 끝난 낱말(해요체·합니다체). 받침 없는 명사 + '요'("카메라요", "PC요")와 '이요·은요'는 서술어가 아니다.
const PREDICATE_WORD_RE =
  /(?:[어아여해돼되와워봐줘져쳐셔세네게래대겨려혀켜꺼떠써내]요|니다|나요|까요|죠|는데요?|던데요?|거든요?|세요|네요|군요|함|됨)$/
// 명사 뒤 꼬리(이요·은요·예요·이에요…)를 뗀다.
const NOUN_TAIL_RE = /(?:이에요|이예요|예요|에요|이요|이고요|이고|인데요|입니다|이죠|은요|는요|도요|이랑요|랑요|으로요|로요|에서요|요)$/

// 같은 문제가 다시 생겼다는 신고.
const RETRY_REPORT_RE =
  /해\s*봤|했는데도|그래도\s*(?:안|똑같)|(?:^|\s)또\s*(?:안\s*(?:돼|되|나|켜|떠|들|보)|그래|그러|똑같|같은)|여전히\s*안|아직도\s*안|똑같(?:아요|이|은\s*(?:문제|증상))/
// 문서 페이지를 가리키는 말.
const PAGE_REFERENCE_RE = /방금\s*(?:본|읽은|보던|봤던)|이\s*(?:문서|페이지|글|안내|내용)|지금\s*(?:보는|본|읽는)|여기\s*(?:나온|있는|적힌|쓰인)/

// 직전 답이 물은 정보의 답 모양(askedSlot 별).
const DEVICE_ANSWER_RE =
  /\bpc\b|컴퓨터|노트북|맥북|\b맥\b|윈도우|휴대폰|핸드폰|(?:^|\s)폰|스마트폰|아이폰|갤럭시|안드로이드|태블릿|아이패드|패드|전자\s*칠판|칠판|보드|티비|\btv\b|모바일|크롬북/i
const SLOT_ANSWER_RE: Record<Exclude<AskedSlot, "choice">, RegExp> = {
  device: DEVICE_ANSWER_RE,
  size: /\d+\s*(?:명|반|개\s*반|교실|지점|곳)|(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:명|반|곳|지점)|혼자|1인|소규모|대형/,
  rooms: /\d+\s*(?:개|곳|대|칸|교실)|(?:한|두|세|네|다섯)\s*(?:개|곳|대|칸)|벽걸이|스탠드|이동형/,
  mode: /온라인|오프라인|하이브리드|대면|비대면|현장|원격|둘\s*다|섞어/,
  timing: /다음\s*(?:달|주|학기)|이번\s*(?:달|주|학기)|방학|개강|\d+\s*(?:월|주|개월)|내년|올해|연내|바로|당장|급해|아직|미정|모르/,
}
const CHOICE_ANSWER_RE = /(?:첫|두|세|네)\s*번째|앞에\s*(?:거|것)|뒤에\s*(?:거|것)|마지막|둘\s*다|전부|다\s*궁금/

interface MessageShape {
  /** 내용 낱말(조사·꼬리 뗀 꼴). */
  content: string[]
  objectDeictic: boolean
  connective: boolean
  backReference: boolean
  /** 내용 있는 서술어(켜져요·봐요·설치해요…)가 있다. */
  specificPredicate: boolean
  /** 의문사(어떻게·어디·언제…)가 있다. */
  interrogative: boolean
}

function wordsOfMessage(text: string) {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function analyzeMessage(text: string): MessageShape {
  const shape: MessageShape = {
    content: [],
    objectDeictic: false,
    connective: false,
    backReference: false,
    specificPredicate: false,
    interrogative: false,
  }
  const words = wordsOfMessage(text)
  // "안 돼요"처럼 띄어 쓴 부정은 한 낱말로 본다.
  const joined: string[] = []
  for (const word of words) {
    const previous = joined[joined.length - 1]
    if ((previous === "안" || previous === "못") && /^(?:돼|되|됨|됐)/.test(word)) joined[joined.length - 1] = `${previous}${word}`
    else joined.push(word)
  }
  for (const word of joined) {
    const bare = stripParticle(word)
    if (OBJECT_DEICTIC_WORDS.has(word) || OBJECT_DEICTIC_WORDS.has(bare)) shape.objectDeictic = true
    if (CONNECTIVE_WORDS.has(word)) shape.connective = true
    if (BACK_REFERENCE_WORDS.has(word) || BACK_REFERENCE_WORDS.has(bare)) shape.backReference = true
    if (INTERROGATIVE_WORDS.has(word) || INTERROGATIVE_WORDS.has(bare)) shape.interrogative = true
    if (
      OBJECT_DEICTIC_WORDS.has(word) ||
      OBJECT_DEICTIC_WORDS.has(bare) ||
      CONNECTIVE_WORDS.has(word) ||
      BACK_REFERENCE_WORDS.has(word) ||
      FILLER_WORDS.has(word) ||
      FILLER_WORDS.has(bare)
    ) {
      continue
    }
    if (GENERIC_PREDICATE_WORDS.has(word) || isTailOnly(word)) continue
    if (PREDICATE_WORD_RE.test(word)) {
      shape.specificPredicate = true
      continue
    }
    const noun = stripParticle(word.replace(NOUN_TAIL_RE, "") || word)
    if (!noun || FILLER_WORDS.has(noun) || OBJECT_DEICTIC_WORDS.has(noun)) continue
    if (!shape.content.includes(noun)) shape.content.push(noun)
  }
  return shape
}

/** 넓힌 글에 붙일 지금 말: 지시어·잇는 말("아까 그거", "그러면")을 뺀다. 남는 것이 없으면 빈 글. */
function stripReferenceWords(text: string) {
  return text
    .split(/\s+/)
    .filter((word) => {
      const lower = word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
      if (!lower) return true
      return !(OBJECT_DEICTIC_WORDS.has(lower) || OBJECT_DEICTIC_WORDS.has(stripParticle(lower)) || CONNECTIVE_WORDS.has(lower))
    })
    .join(" ")
    .trim()
}

function matchesSlotAnswer(slot: AskedSlot | undefined, text: string, shape: MessageShape) {
  if (!slot) return false
  if (slot === "choice") {
    return CHOICE_ANSWER_RE.test(text) || (shape.content.length >= 1 && shape.content.length <= 2 && !shape.specificPredicate)
  }
  return SLOT_ANSWER_RE[slot].test(text.toLowerCase())
}

// 넓힐 만큼 짧은 말(공백 뺀 길이). 슬롯 답은 조금 더 길어도 된다("강사 3명에 학생 40명 정도예요").
const SHORT_MESSAGE_MAX = 30
const SLOT_MESSAGE_MAX = 60

/**
 * 이번 말을 직전 턴·문서 페이지에 비춰 검색·라우팅용 글로 정한다.
 * previousTurn·pagePath 가 없으면 routingText 는 언제나 message 그대로다(대상 불명 표시만 붙을 수 있다).
 */
export function resolveConversationTurn(
  message: string,
  previousTurn: PreviousTurn | null | undefined,
  pagePath: DocPageRef | null | undefined,
  options: ResolveConversationTurnOptions = {}
): ConversationTurn {
  const text = message.replace(/\s+/g, " ").trim()
  const compactLength = text.replace(/\s+/g, "").length
  const shape = analyzeMessage(text)
  const none: ConversationTurn = { routingText: text, reason: "none", expanded: false, retryReport: false }

  if (pagePath && (PAGE_REFERENCE_RE.test(text) || (!previousTurn && shape.objectDeictic && shape.content.length === 0))) {
    return { ...none, reason: "page_context", pageDoc: pagePath }
  }

  const previous = previousTurn?.question.replace(/\s+/g, " ").trim() ?? ""
  // 직전 질문에도 내용이 없으면(인사·"이거 뭐예요") 붙일 것이 없다.
  const usablePrevious = previous && analyzeMessage(previous).content.length > 0 ? previous : ""

  if (!usablePrevious) {
    if (!previousTurn && shape.objectDeictic && shape.content.length === 0 && compactLength <= SHORT_MESSAGE_MAX) {
      return { ...none, reason: "target_unknown" }
    }
    return none
  }

  const expand = (reason: ConversationTurnReason, retryReport = false): ConversationTurn => {
    const rest = stripReferenceWords(text)
    return { routingText: rest ? `${usablePrevious} ${rest}` : usablePrevious, reason, expanded: true, retryReport }
  }
  const standsAlone = (candidate: string) => Boolean(options.standsAlone?.(candidate))
  const short = compactLength <= SHORT_MESSAGE_MAX

  if (short && RETRY_REPORT_RE.test(text) && shape.content.length === 0 && !shape.specificPredicate) {
    return expand("follow_up", true)
  }
  if (compactLength <= SLOT_MESSAGE_MAX && matchesSlotAnswer(previousTurn?.askedSlot, text, shape)) {
    return expand(previousTurn?.askedSlot === "choice" ? "choice" : "slot_answer")
  }
  if (!short || shape.content.length > 2) return none
  // "그거 받았는데 안 열려요", "아까 그거 다시요": 앞 턴의 무엇을 가리킨다.
  if (shape.objectDeictic) return expand("follow_up")
  // "또 안 돼요", "다시 알려주세요": 내용 없이 앞 턴을 다시 가리킨다.
  if (shape.backReference && shape.content.length === 0 && !shape.specificPredicate) return expand("follow_up")
  // 자기 서술어가 있는 말("그럼 녹화는 어디서 봐요?")은 새 질문이다.
  if (shape.specificPredicate || shape.content.length === 0) return none
  const linked = shape.connective || shape.backReference
  // 잇는 말 없이 의문사로 묻는 말("학생 초대는 어떻게 하나요?")도 새 질문이다. "그러면 아이패드는 어떻게 해요?"는 잇는다.
  if (shape.interrogative && !linked) return none
  // "그러면 아이패드는요", "휴대폰이요": 혼자서도 답이 서면("요금은요?") 넓히지 않는다.
  if (standsAlone(stripReferenceWords(text) || text)) return none
  return expand(linked ? "follow_up" : "short_reply")
}
