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
 *   지시어 후속 질문(그거·이거, 그럼·그러면 …은요, 아까 그거 다시요, 해 봤는데 또 안 돼요), 같은 대화의 앞 턴을 가리키는 말
 *   ("아까 챗봇이 알려준 대로 했는데 안 돼요": 말투 층의 same_chat, 내용 낱말 수와 상관없이).
 * - 그대로 두는 말: 내용 낱말이 있는 긴 질문, 자기 서술어가 있는 새 질문("그럼 녹화는 어디서 봐요?"), 혼자서도 답이 서는 짧은 말
 *   (standsAlone: "요금은요?"처럼 정해 둔 답이 바로 잡히는 말. 판단은 부르는 쪽이 준다), 슬롯 낱말이 든 완전한 새 질문
 *   ("학생 30명인데 녹화 파일은 어디서 받아요?"), 잇는 말 없이 명사 하나로 화제를 바꾸는 말("출결은요?", 기기 이름과 봇이 되물은 뒤는 뺀다),
 *   넓혀도 앞 턴과 같은 정해 둔 답이 나오고 새 낱말이 답에 없는 말(answersNewWords, 판단은 부르는 쪽이 준다),
 *   다른 창·지난 문의를 가리키는 말.
 * - 직전 턴이 없거나 직전 질문에 내용 낱말이 없는데(인사·"이거 뭐예요") 지시어만 있는 말("이거 뭐예요")은 target_unknown(대상 불명)이다.
 *   문서 페이지에서는 그 문서를 가리키는 말로 본다(page_context).
 * - page_context 는 그 문서를 가리키는 말("이 문서", "방금 본 내용") 밖의 내용 낱말이 적을 때만이다. 조사 '이'("학생이 글씨…"),
 *   '말고·상관없는데'가 붙은 말, 다른 내용 낱말이 많은 말은 경로와 상관없이 지금 흐름이다.
 * - 넓힌 글은 "직전 질문 + 지금 말(지시어·잇는 말을 뺀 것)"이다. 직전 질문이 없으면 지금 말 그대로다(한 줄 질문의 답은 바뀌지 않는다).
 */
import type { AskedSlot } from "@/lib/chatbot/follow-up"
import { isTailOnly, stripParticle } from "@/lib/chatbot/answer-index/normalize"
import { detectConversationTone } from "@/lib/chatbot/tone"

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
  /**
   * 넓힌 글(routingText)이 새 낱말(지금 말의 내용 낱말, 기기 이름 뺌)을 답하는지. 넓혀도 직전 질문 혼자와 같은 정해 둔 답이 나오고
   * 그 답에 새 낱말이 하나도 없으면 false("카메라가 안 켜져요" 뒤 "그러면 출결은요?"). 판단은 부르는 쪽이 결정형으로 한다(모델 호출 없음).
   */
  answersNewWords?: (routingText: string, previousQuestion: string, newWords: string[]) => boolean
  /**
   * R3 a3(답 꼴 규격 4.5): "그리고·또·추가로·그럼"으로 시작하는 말을 새 질문으로 본다(카드를 다시 고른다). 부르는 쪽이 compiled 라우터에서만
   * 켠다(compiledNextTurnMode). 앞 턴의 무엇을 가리키는 말(그거·그걸·거기), 내용 없이 다시 생긴 문제를 알리는 말("또 안 돼요"),
   * 기기 이름 대답("그럼 아이패드는요"), 봇이 물은 정보의 대답은 지금처럼 잇는다. 끄면(기본) 지금 규칙 그대로다.
   */
  leadingConnectiveNewQuestion?: boolean
}

export type CompiledNextTurnMode = "new" | "off"

/** CHATBOT_COMPILED_NEXT_TURN: new(기본, compiled 라우터에서만 4.5 규칙) · off(지금 규칙 그대로). */
export function compiledNextTurnMode(env: Record<string, string | undefined> = process.env): CompiledNextTurnMode {
  return env.CHATBOT_COMPILED_NEXT_TURN?.trim().toLowerCase() === "off" ? "off" : "new"
}

// 새 질문을 여는 첫 낱말(규격 4.5).
const LEADING_NEW_QUESTION_RE = /^(?:아\s*|참\s*|아참\s*)?(?:그리고|그리고요|또|또한|추가로|그럼|그럼요|그러면|그러면요)(?=\s|,|$)/

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

// 같은 문제가 다시 생겼다는 신고("해 봤는데 또 안 돼요", "알려준 대로 했는데 안 돼요", "해봤는데도 똑같아요").
const RETRY_REPORT_RE =
  /해\s*봤|했는데도|했(?:는데|지만|어도)\s*(?:안\s*(?:돼|되|나|켜|떠|들|보|열)|똑같|그대로|여전)|그래도\s*(?:안|똑같)|(?:^|\s)또\s*(?:안\s*(?:돼|되|나|켜|떠|들|보)|그래|그러|똑같|같은)|여전히\s*안|아직도\s*안|똑같(?:아요|이|은\s*(?:문제|증상))/
// 문서 페이지를 가리키는 말. 지시어 '이'는 문장 처음이나 띄어 쓴 뒤에만 본다(조사 '이': "학생이 글씨를…", "선생님이 페이지를…").
// 가리키는 낱말 뒤에는 조사·끝만 온다("이 글씨"는 아니다). 동사 꼴 뒤에도 띄어쓰기·끝만 온다("방금 본사에…"는 아니다).
const PAGE_NOUN_END = String.raw`(?=$|[\s.,?!~]|은|는|이|가|을|를|에|의|도|만|로|으로|과|와|랑|이랑|대로|처럼|요)`
const PAGE_REFERENCE_RE = new RegExp(
  String.raw`방금\s*(?:본|읽은|보던|봤던)(?=\s|$)|(?:^|\s)이\s*(?:문서|페이지|글|안내|내용)${PAGE_NOUN_END}|지금\s*(?:보는|본|읽는)(?=\s|$)|여기\s*(?:나온|있는|적힌|쓰인)(?=\s|$)`
)
// 가리킨 것을 빼고 다른 것을 묻는 말("이 안내 말고 영수증은…", "이 내용이랑 상관없는데…", "아까 그거 말고…").
const EXCLUSION_RE = /말고|상관\s*(?:없|업)|관계\s*없|관련\s*없|별개/
// 문서를 가리키는 말 밖에서 그 문서에 대해 할 일(정리·요약·설명)이나 문서 자체를 말하는 낱말. page_context 의 '다른 내용 낱말'로 세지 않는다.
const PAGE_TALK_RE =
  /^(?:정리|요약|설명|해석|이해|자세|간단)|^(?:쉽게|짧게|맞게|다시|무슨|말|얘기|이야기|뜻|내용|문서|페이지|글|안내|부분|수|줘|해줘|해줄래|줄래)$/
// 문서를 가리키는 말 밖에 이만큼까지의 내용 낱말은 그 문서에 대한 말로 본다("방금 본 내용을 우리 학원 상황에 맞게 정리해 주세요").
const PAGE_OTHER_CONTENT_MAX = 2

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

/** 글의 내용 낱말(조사·꼬리를 뗀 꼴, 지시어·잇는 말·의문사·내용 없는 서술어 뺌). 서비스가 답이 그 낱말을 말하는지 볼 때 쓴다. */
export function contentWordsOf(text: string): string[] {
  return analyzeMessage(text.replace(/\s+/g, " ").trim()).content
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

function globalOf(pattern: RegExp) {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
}

/**
 * 지금 말이 직전 답이 물은 정보(askedSlot)의 대답인지. 슬롯 낱말이 들어 있어도, 슬롯 낱말을 뺀 나머지가 묻는 말·자기 서술어를 가진
 * 새 질문이면("학생 30명인데 녹화 파일은 어디서 받아요?", "아직 모르겠는데 학생은 수업에 어떻게 들어가요?") 대답이 아니다.
 * 나머지의 내용 낱말이 하나 이하면("아이폰 써요", "아이폰인데 어떻게 해요?") 대답이다.
 */
function matchesSlotAnswer(slot: AskedSlot | undefined, text: string, shape: MessageShape) {
  if (!slot) return false
  if (slot === "choice") {
    if (CHOICE_ANSWER_RE.test(text)) return true
    // 보기 고르기는 명사 꼴이다("전자칠판이요"). 묻는 말("요금은 어떻게 돼요?")은 새 질문이다.
    return !shape.interrogative && shape.content.length >= 1 && shape.content.length <= 2 && !shape.specificPredicate
  }
  const lower = text.toLowerCase()
  const pattern = SLOT_ANSWER_RE[slot]
  if (!pattern.test(lower)) return false
  const rest = analyzeMessage(lower.replace(globalOf(pattern), " "))
  if (!rest.interrogative && !rest.specificPredicate) return true
  return rest.content.length <= 1
}

/** 문서를 가리키는 말이 있고, 그 말 밖의 내용 낱말이 적어 그 문서에 대한 말인지("방금 본 내용 정리해 줘"). */
function refersToPage(text: string) {
  const match = PAGE_REFERENCE_RE.exec(text)
  if (!match) return false
  const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
  const other = analyzeMessage(rest).content.filter((word) => !PAGE_TALK_RE.test(word))
  return other.length <= PAGE_OTHER_CONTENT_MAX
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

  const previous = previousTurn?.question.replace(/\s+/g, " ").trim() ?? ""
  // 직전 질문에도 내용이 없으면(인사·"이거 뭐예요") 붙일 것이 없다. 이때는 직전 턴이 없는 것과 같이 본다.
  const usablePrevious = previous && analyzeMessage(previous).content.length > 0 ? previous : ""
  const deicticOnly = shape.objectDeictic && shape.content.length === 0
  const excluded = EXCLUSION_RE.test(text)

  if (pagePath && !excluded && (refersToPage(text) || (!usablePrevious && deicticOnly))) {
    return { ...none, reason: "page_context", pageDoc: pagePath }
  }

  if (!usablePrevious) {
    if (deicticOnly && compactLength <= SHORT_MESSAGE_MAX) return { ...none, reason: "target_unknown" }
    return none
  }

  const rest = stripReferenceWords(text)
  const routingText = rest ? `${usablePrevious} ${rest}` : usablePrevious
  const expand = (reason: ConversationTurnReason, retryReport = false): ConversationTurn => ({
    routingText,
    reason,
    expanded: true,
    retryReport,
  })
  const standsAlone = (candidate: string) => Boolean(options.standsAlone?.(candidate))
  const short = compactLength <= SHORT_MESSAGE_MAX
  const retry = RETRY_REPORT_RE.test(text)
  const priorKind = detectConversationTone(text).priorKind

  // 다른 창·이전 채팅·지난 문의를 가리키는 말은 이 대화의 앞 턴이 아니다(말투 층이 '볼 수 없어요'로 답한다).
  if (priorKind === "other_window" || priorKind === "past_inquiry") return none
  // 같은 대화의 앞 턴을 가리키는 말("아까 챗봇이 알려준 대로 했는데 안 돼요", "아까 그거 해봤는데도 똑같아요")은
  // 내용 낱말 수와 상관없이 잇는다. '말고'가 붙으면 앞 턴 말고 다른 것을 묻는 말이다.
  if (priorKind === "same_chat" && !excluded) return expand("follow_up", retry)
  // "해 봤는데 또 안 돼요", "그거 해봤는데 안 돼요": 다시 생긴 문제 신고.
  if (short && retry && (shape.objectDeictic || (shape.content.length === 0 && !shape.specificPredicate))) {
    return expand("follow_up", true)
  }
  if (compactLength <= SLOT_MESSAGE_MAX && matchesSlotAnswer(previousTurn?.askedSlot, text, shape)) {
    return expand(previousTurn?.askedSlot === "choice" ? "choice" : "slot_answer")
  }
  // "그리고 출결은요?", "또 숙제 기능도 있어요?": 새 질문을 여는 말은 새로 고른다(compiled 라우터, 규격 4.5).
  if (
    options.leadingConnectiveNewQuestion &&
    LEADING_NEW_QUESTION_RE.test(text) &&
    !shape.objectDeictic &&
    shape.content.length > 0 &&
    !DEVICE_ANSWER_RE.test(text.toLowerCase())
  ) {
    return none
  }
  // "그거 말고 요금은요?": 앞 턴의 것 말고 다른 것을 묻는다.
  if (excluded) return none
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
  if (standsAlone(rest || text)) return none
  // 기기 이름("휴대폰이요", "그러면 아이패드는요")은 앞 턴 문제가 나는 곳이라 그대로 잇는다.
  const device = DEVICE_ANSWER_RE.test(text.toLowerCase())
  // 잇는 말 없는 명사 하나("출결은요?", "숙제는요?")는 화제를 바꾸는 말일 수 있다. 봇이 되물은 뒤(직전 답이 되묻기)가 아니면 넓히지 않는다.
  if (!linked && !device && previousTurn?.answerMode !== "clarifying_question") return none
  // 넓혀도 앞 턴과 같은 정해 둔 답이 나오고 새 낱말이 그 답에 없으면 넓히지 않는다(앞 답을 그대로 다시 내게 된다).
  if (!device && options.answersNewWords && !options.answersNewWords(routingText, usablePrevious, shape.content)) return none
  return expand(linked ? "follow_up" : "short_reply")
}
