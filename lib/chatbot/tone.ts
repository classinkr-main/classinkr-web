/**
 * 질문의 감정·형식 신호를 읽어 결정형 답변의 첫마디와 상담 연결을 맞춘다.
 *
 * 페르소나 평가(10명 × 5회)에서 화난 사용자에게 사과 없이 매뉴얼만, 불안한 학부모에게 안심 한마디 없이,
 * 짧게 묻는 학생에게 장황하게, 영어로 묻는 사용자에게 한국어 되묻기만 하던 문제를 고친다.
 * 성별·나이 같은 속성은 추정하지 않는다. 질문 문장에 드러난 신호만 쓴다.
 */

import { isUnverifiedFixedAnswerText } from "@/lib/chatbot/fixed-answers"

/**
 * 앞서 한 말을 가리키는 질문의 종류.
 * same_chat: 이 대화 안의 앞 턴("아까 그거", "또 안 돼요", "아까 챗봇이 알려준").
 * other_window: 다른 창·이전 채팅·지난 대화("다른 창에서 챗봇이 알려준 거").
 * past_inquiry: 지난 문의·통화("지난주에 문의했는데").
 */
export type PriorContextKind = "same_chat" | "other_window" | "past_inquiry"

export interface ConversationTone {
  angry: boolean
  repeated: boolean
  anxious: boolean
  /** 불안 중에서도 "어떡하죠·급해요·큰일"처럼 당황한 상태. 아니면 걱정 정도로 본다. */
  panicked: boolean
  apologetic: boolean
  terse: boolean
  english: boolean
  /** 다른 창·지난 문의를 전제로 묻는다("다른 창에서 챗봇이…", "지난주에 문의했잖아요"). */
  priorContext: "bot" | "inquiry" | null
  /** priorContext 를 세 종류로 나눈 값. priorContext 가 null 이면 null. */
  priorKind: PriorContextKind | null
}

const ANGRY_RE =
  /도대체|말이\s*(?:됩니까|돼요|되나요|됩니다|돼)|짜증|화가\s*(?:나|납)|(?<!대)화나(?:요|네|서|고|는|죠)|화났|어이(?:가)?\s*없|황당|(?:돈|시간|비용|요금|수업료)\S{0,4}\s*아깝|아깝습니다!|최악|엉망|책임\s*(?:지|져)|언제\s*(?:고쳐|해결)|장난\s*(?:해|합)|돈\s*(?:낸|내고|냈)|환불해\s*(?:주|줘)/
// "이게 뭐예요?"는 처음 온 사람이 화면이나 서비스를 가리키며 묻는 말이다. 다른 화남 신호(반복·느낌표 등)와 함께일 때만 화남으로 본다.
const THIS_WHAT_RE = /이게\s*뭐(?:예요|에요|야|냐|입니까)/
const REPEATED_RE =
  /몇\s*번째|(?:두|세|네|다섯)\s*번째\s*(?:문의|연락|전화|말씀|요청|끊|튕|같은|똑같|이에요|예요|입니다)|(?:벌써|이번이|오늘만|이번\s*주만|이번\s*주에만)[^.!?]{0,8}(?:두|세|네|다섯)\s*번째|또\s*(?:문의|연락|물어|말씀)|계속\s*(?:문의|물어|말|연락)|여러\s*번\s*(?:문의|말|연락)|매번\s*(?:문의|물어|말|연락|똑같|같은|재부팅|인터넷)|번번이|몇\s*번을/
// "오늘만 네 번째"처럼 횟수만 세는 말은 같은 일이 반복된다는 뜻이지, 여러 번 문의했다는 뜻이 아니다.
// 문의·연락을 함께 말할 때만 반복 문의로 본다.
const REPEAT_COUNT_RE = /몇\s*번째|(?:두|세|네|다섯)\s*번째/
const INQUIRY_WORD_RE = /문의|연락|전화|말씀|요청|물어|물었|여쭤|상담|접수|얘기|말했|말하/
const ASK_AGAIN_HESITATION_RE = /또\s*물어보기(?:가)?\s*(?:미안|민망|눈치|어렵|힘들|죄송)|또\s*물어보면\s*(?:미안|민망|눈치)/g
// "어떻게 해야 하나요"만으로는 불안으로 보지 않는다(그냥 방법을 묻는 말이 많다).
const ANXIOUS_RE =
  /어떡하|어떻게\s*해야\s*할지\s*(?:모르|막막)|걱정|불안|큰일|급해요|급합니다|급한데|당황|무서|난감|혹시\s*제가|혼났|속상|미치겠|울고/
// "안 맞으면 어떡하죠"처럼 아직 일어나지 않은 일을 걱정하는 말은 당황이 아니라 걱정이다.
const PANICKED_RE = /(?<!면\s{0,2})어떡하|큰일|급해요|급합니다|급한데|당황|미치겠|울고|난감|혼났/
const APOLOGETIC_RE = /^(?:\S+\s+)?죄송|죄송한데|죄송합니다만|실수할까|제가\s*(?:뭔가|뭘|뭐|혹시)?\s*잘못|^sorry\b/i
const SLANG_RE = /ㅋㅋ|ㅠ|ㅜ|어케|어캐|ㄱㄱ|ㅇㅇ|뭐임|머임/
// 들뜬 느낌표("첫 수업이었어요!!")는 화가 난 신호가 아니다.
const POSITIVE_RE = /축하|설레|떨려|떨리|신나|기뻐|기쁘|좋아요|좋았|고마|감사|ㅋㅋ|ㅎㅎ|최고|first\s*class|첫\s*수업|드디어|good\s*job|great|awesome/i
const PRIOR_BOT_RE =
  /\byou\s+(?:told|said|mentioned)\b|\b(?:yesterday|last\s*time|earlier|before),?\s+you\b|(?:다른|이전|지난)\s*(?:창|채팅|대화|세션)|(?:아까|전에|지난번|저번).{0,12}(?:챗봇|봇|답변)|챗봇이\s*(?:알려|말해|답|안내)|(?:지난번|저번|어제|아까|지난주|며칠\s*전)(?:에)?\s*(?:이\s*)?(?:여기서|여기에서|채팅에서|챗봇이|챗봇한테|챗봇에서|봇이)/
const PRIOR_INQUIRY_RE =
  /(?:지난주|지난번|저번|전에|예전에|어제|며칠\s*전|지난달|아까|\d+\s*(?:주|일|달|개월)\s*전)[^.!?]{0,20}(?:문의|물어|물었|여쭤|말씀|연락(?:했|드렸|을\s*드|드린|이\s*왔|받)|접수|얘기|말했|말한|통화|안내받|알려\s*주신|알려준|알려\s*준|전화\s*(?:드렸|했|드린)|상담\s*(?:때|에서|받|했)|받은\s*(?:답변|안내|메일)|메일로\s*받)|(?:지난번|저번|어제|아까)\s*(?:에\s*)?(?:그거|그\s*거)|(?:지난번|저번|어제|아까)(?:이랑|하고|과|처럼)\s*(?:또|(?:똑같은|같은)\s*(?:문제|증상|오류|현상)|same)|(?:문의|접수)\s*했(?:잖아|는데|었는데|었잖아)|happened\s*again|same\s*problem|(?:^|\s)또\s*(?:그래요|그럽니다|그러네|됨|돼요|됐어요|안\s*(?:돼|되)(?!\S*면))|아직도\s*안\s*고쳐/
// 이 대화 안의 앞 턴을 가리키는 말. 지난 문의·통화를 가리키는 말이 함께 있으면 쓰지 않는다.
const SAME_CHAT_RE = /아까|(?:^|\s)또\s*(?:그래|됨|돼|안\s*(?:돼|되))/
const PAST_MARKER_RE =
  /지난주|지난번|저번|어제|며칠\s*전|지난달|\d+\s*(?:주|일|달|개월)\s*전|예전|전에|통화|문의\s*했(?:잖아|는데|었)|접수|메일|아직도\s*안\s*고쳐/
const OTHER_WINDOW_RE = /(?:다른|이전|지난)\s*(?:창|채팅|대화|세션)|\byou\s+(?:told|said|mentioned)\b|\b(?:yesterday|last\s*time|earlier|before),?\s+you\b/i
const QUOTED_SPEECH_RE = /['"‘’“”][^'"‘’“”]{1,60}['"‘’“”]/g
const THIRD_PARTY_PRIOR_RE =
  /(?:원장|선생님|강사|실장|엄마|아빠|부모님|친구|담임|팀장)(?:님)?\s*(?:이|가|께서|한테서|이\s*저한테)\s*['"‘“]?\s*(?:저번|지난번|아까|어제|전에)/
const ENGLISH_LEAD_RE = /^(?:hi|hello|hey|can you|could you|how do|how can|how to|my |i |is there|why)/i

// 화남 낱말이 화남이 아닌 자리(R2 B5): 부정("짜증 나는 건 아니고", "언제 해결되는지가 아니라"), 관용구("최악의 경우",
// "수업료 아깝지 않게", "책임 지는 담임 교사", "엉망인 판서를"). 따옴표로 옮긴 남의 말('도대체 왜 안 돼요')도 묻는 사람의 화남이 아니다.
// 화남은 말투(사과 첫마디·상담 연결 앞세우기)와 '이미 해 봤다는 화난 문의'에만 쓴다.
const ANGRY_IDIOM_RE =
  /최악의\s*(?:경우|상황|시나리오)|(?:돈|시간|비용|요금|수업료)\S{0,4}\s*아깝지\s*않|책임\s*(?:지|져)는\s*(?:담임|교사|선생|강사|관리자|역할|담당)|엉망(?:인|이\s*된|진)\s+[가-힣]+(?:을|를)/g
const ANGRY_NEGATED_TAIL_RE = /^[^.?!,\n]{0,14}?(?:건|게|것은|거는|지가|지는|것이)\s*아니(?:고|라|에요|예요|구요|지만)/

function hasAngryWords(text: string) {
  const plain = text.replace(QUOTED_SPEECH_RE, " ").replace(ANGRY_IDIOM_RE, " ")
  const global = new RegExp(ANGRY_RE.source, "g")
  for (const match of plain.matchAll(global)) {
    const after = plain.slice((match.index ?? 0) + match[0].length)
    if (!ANGRY_NEGATED_TAIL_RE.test(after)) return true
  }
  return false
}

export function detectConversationTone(question: string): ConversationTone {
  const text = question.trim()
  // 따옴표로 옮긴 말('Good job!')의 느낌표는 묻는 사람의 감정이 아니다.
  const exclamations = (text.replace(QUOTED_SPEECH_RE, " ").match(/[!！]/g) ?? []).length
  const compact = text.replace(/\s+/g, "")
  const words = text.split(/\s+/).filter(Boolean)
  const latinWords = words.filter((word) => /[a-z]{2,}/i.test(word) && !/[가-힣]/.test(word)).length

  // "바쁘신데 또 물어보기 미안해요"처럼 다른 사람에게 다시 묻기 미안하다는 말은 우리에게 반복 문의한 게 아니다.
  const repeatText = text.replace(ASK_AGAIN_HESITATION_RE, " ")
  const repeated = REPEATED_RE.test(repeatText) && (INQUIRY_WORD_RE.test(repeatText) || !REPEAT_COUNT_RE.test(repeatText))
  const excitedNotAngry = POSITIVE_RE.test(text)
  // "원장님께서 '저번에 말한 그 설정'"처럼 다른 사람과의 지난 대화를 옮긴 말은 우리와의 지난 문의가 아니다.
  // 따옴표로 옮긴 남의 말("선생님, 그거 또 안 돼요")도 빼고 본다.
  const priorContext: ConversationTone["priorContext"] = THIRD_PARTY_PRIOR_RE.test(text)
    ? null
    : PRIOR_BOT_RE.test(text)
      ? "bot"
      : PRIOR_INQUIRY_RE.test(text.replace(QUOTED_SPEECH_RE, " "))
        ? "inquiry"
        : null
  return {
    // 느낌표 두 개 이상, 또는 "~입니까!" 같은 따지는 어미는 화가 난 신호로 본다(들뜬 느낌표는 뺀다).
    angry:
      hasAngryWords(text) ||
      (THIS_WHAT_RE.test(text) && repeated) ||
      (!excitedNotAngry &&
        (exclamations >= 2 || (exclamations >= 1 && /(?:니까|겁니까|입니까|습니까)\s*[!?！]|저만\s*이런/.test(text)))),
    repeated,
    anxious: ANXIOUS_RE.test(text),
    panicked: PANICKED_RE.test(text),
    apologetic: APOLOGETIC_RE.test(text),
    terse: compact.length <= 10 || (SLANG_RE.test(text) && compact.length <= 24),
    english: ENGLISH_LEAD_RE.test(text) || (latinWords >= 3 && latinWords / Math.max(1, words.length) >= 0.34),
    // "원장님께서 '저번에 말한 그 설정'"처럼 다른 사람과의 지난 대화를 옮긴 말은 우리와의 지난 문의가 아니다.
    // 따옴표로 옮긴 남의 말("선생님, 그거 또 안 돼요")도 빼고 본다.
    priorContext,
    priorKind: priorContext ? priorKindOf(text, priorContext) : null,
  }
}

function priorKindOf(text: string, priorContext: "bot" | "inquiry"): PriorContextKind {
  const plain = text.replace(QUOTED_SPEECH_RE, " ")
  if (priorContext === "bot") {
    if (OTHER_WINDOW_RE.test(plain)) return "other_window"
    // "아까 챗봇이 알려준"은 같은 대화, "지난번·저번에 챗봇이"는 이 대화에서 확인할 수 없는 지난 대화다.
    return /아까/.test(plain) && !PAST_MARKER_RE.test(plain) ? "same_chat" : "other_window"
  }
  return SAME_CHAT_RE.test(plain) && !PAST_MARKER_RE.test(plain) ? "same_chat" : "past_inquiry"
}

export const PRIOR_BOT_LINE =
  "다른 창이나 이전 대화에서 드린 답은 제가 볼 수 없어서, 그 내용이 맞는지 여기서 확인해 드릴 수 없어요. 공식 문서와 다르다면 공식 문서와 기술지원 안내를 기준으로 봐 주세요."
export const REFUND_PROMISE_LINE = "환불이나 보상은 제가 채팅에서 약속드릴 수 없어요. 상담원이 이번 상황을 확인해 안내해 드립니다."

export const PRIOR_INQUIRY_LINE =
  "지난 문의나 통화 내용은 이 채팅에서 볼 수 없어요. 그때 내용을 이어서 확인하려면 아래 상담 연결 버튼을 눌러 주세요."

function priorContextLine(tone: ConversationTone) {
  if (tone.priorContext === "bot") return PRIOR_BOT_LINE
  if (tone.priorContext === "inquiry") return PRIOR_INQUIRY_LINE
  return null
}

export function toneOpener(tone: ConversationTone, forHandoff = false, unverifiedFixed = false): string | null {
  if (tone.angry || tone.repeated) {
    return tone.repeated
      ? "같은 문제로 여러 번 문의하시게 해 드려 정말 죄송합니다."
      : "불편을 드려 정말 죄송합니다."
  }
  // 못 찾음·확정 못 함 고정 답 앞에는 "순서대로 알려 드릴게요"·"같이 확인해 볼게요" 같은 안내형 첫마디를 붙이지 않는다.
  if (unverifiedFixed) return null
  // "죄송한데요… 걱정입니다"처럼 미안해하며 걱정하는 말에는 사과를 덜어 주는 첫마디가 더 맞다.
  if (tone.anxious && !(tone.apologetic && !tone.panicked)) {
    return tone.panicked ? "많이 당황하셨죠. 같이 차근차근 확인해 볼게요." : "걱정되셨겠어요. 같이 차근차근 확인해 볼게요."
  }
  if (tone.apologetic) {
    return forHandoff
      ? "죄송해하지 않으셔도 돼요."
      : "죄송해하지 않으셔도 돼요. 처음엔 누구나 헷갈리는 부분이라 순서대로 알려 드릴게요."
  }
  return null
}

export const HANDOFF_NOW_LINE =
  "지금 바로 담당자와 연결해 드릴게요. 아래 [실시간 상담 연결]을 누르시면 상담원이 이 대화를 보고 이어서 도와드립니다."

const EMPATHY_START_RE = /^(?:불편을|같은 문제로|많이 당황|죄송|걱정|괜찮)/
// 답의 첫 문장이 이미 공감·사과로 시작하면 말투 계층이 첫마디를 또 붙이지 않는다.
const EMPATHY_FIRST_SENTENCE_RE = /놀라|놀랐|당황|초조|언짢|불쾌|억울|속상|답답|걱정|신경\s*쓰|불편|죄송|기다리셨|급하시|힘드셨|불안하|민망|곤란하|화나셨|무서운|이해돼/

function startsWithEmpathy(answer: string) {
  if (EMPATHY_START_RE.test(answer)) return true
  const firstSentence = answer.split(/(?<=[.?!])\s/)[0] ?? ""
  return firstSentence.length <= 80 && EMPATHY_FIRST_SENTENCE_RE.test(firstSentence)
}

// 화난·반복 문의에는 공감만으로는 모자라고 불편에 대한 사과가 있어야 한다.
// 첫 두 문장에 그런 사과가 있을 때만 첫마디를 생략한다("약속드릴 수 없어 죄송합니다"는 사과로 치지 않는다).
const APOLOGY_SENTENCE_RE = /^(?:정말\s*)?죄송합니다\.?$|(?:불편|기다리|답답|놀라|속상|번거|당황|하셨다니|하셨다면).{0,40}죄송/

function startsWithApology(answer: string) {
  if (EMPATHY_START_RE.test(answer)) return true
  const sentences = (answer.split(/\n{2,}/)[0] ?? "").split(/(?<=[.?!])\s+/).slice(0, 2)
  return sentences.some((sentence) => APOLOGY_SENTENCE_RE.test(sentence.trim()))
}

export function englishLeadLine(englishSummary?: string, hasSteps = true) {
  return englishSummary
    ? `In short: ${englishSummary} (${hasSteps ? "Detailed steps are below in Korean. " : ""}Type "상담원 연결" anytime to talk to a person.)`
    : `I'll answer in Korean below. If anything is unclear, type "상담원 연결" to talk to a person, or ask again with a short phrase like "login not working".`
}

// 목록·번호 줄로 시작하는 문단(결론 문장이 없다).
const LIST_PARAGRAPH_RE = /^(?:\d+[.)]\s|[-•·*]\s|【)/
// 예고만 하는 첫 문단("세무 담당께 드릴 수 있게 정리할게요.", "아래 순서대로 따라 하시면 됩니다.")은 결론이 아니다.
const PREVIEW_PARAGRAPH_RE = /(?:드릴게요|할게요|볼게요|드리겠습니다|하겠습니다|따라\s*하시면\s*(?:됩니다|돼요)|이렇게\s*하면\s*돼요)[.!:]?$/

/**
 * 공감 한마디의 자리(R2 B5, 두괄식): 첫 문단이 결론 문장이고 뒤에 문단이 더 있으면 공감은 결론 다음 문단에 둔다
 * ("[결론]\n\n걱정되셨겠어요. 같이 차근차근 확인해 볼게요.\n\n1. …"). 한 문단짜리 답, 목록·예고 문단으로 시작하는 답은 지금처럼 맨 앞이다.
 * 화난·반복 문의의 사과는 맨 앞에 둔다(사과를 먼저 하는 상담 원칙, 상담 연결 줄과 같은 줄).
 */
function withOpener(answer: string, opener: string, tone: ConversationTone) {
  if (tone.angry || tone.repeated) return `${opener}\n\n${answer}`
  const paragraphs = answer.split("\n\n")
  const first = paragraphs[0].trim()
  if (paragraphs.length < 2 || LIST_PARAGRAPH_RE.test(first) || PREVIEW_PARAGRAPH_RE.test(first)) return `${opener}\n\n${answer}`
  return [paragraphs[0], opener, ...paragraphs.slice(1)].join("\n\n")
}

/**
 * 답변 앞에 공감 한마디·영어 요약을 붙이고, 화난/반복 문의면 상담 연결을 켠다. 여러 번 불러도 결과가 같다.
 */
export function applyToneToAnswer(
  answer: string,
  tone: ConversationTone,
  options: { englishSummary?: string; offerHandoff: boolean; mentionsRefund?: boolean }
) {
  let next = answer
  // 상담 연결 답과 "딱 맞는 안내를 찾지 못했다"는 답에는 "순서대로 알려 드릴게요" 같은 안내형 첫마디가 어울리지 않는다.
  const unverifiedFixed = isUnverifiedFixedAnswerText(answer)
  const opener = toneOpener(
    tone,
    (/\[(?:실시간 상담 연결|도입 상담 남기기)\]/.test(answer) && !/^\d\.\s/m.test(answer)) || unverifiedFixed,
    unverifiedFixed
  )
  const alreadyToned =
    (tone.angry || tone.repeated ? startsWithApology(next) : startsWithEmpathy(next)) ||
    next.startsWith("In short:") ||
    next.startsWith("I'll answer")
  const prior = priorContextLine(tone)
  // 답이 이미 "볼 수 없다"고 밝혔다면 같은 말을 한 번 더 붙이지 않는다.
  if (prior && !next.includes(prior) && !/볼\s*수\s*없|볼\s*수도/.test(next)) {
    // 지난 대화를 아는 척하지 않는다. 볼 수 없다는 사실을 먼저 밝힌다.
    next = alreadyToned && next.includes(HANDOFF_NOW_LINE)
      ? next.replace(HANDOFF_NOW_LINE, `${HANDOFF_NOW_LINE} ${prior}`)
      : `${prior}\n\n${next}`
  }
  if (options.offerHandoff && !next.includes("[실시간 상담 연결]")) {
    // 화난·반복 문의는 사과 바로 다음에 상담 연결을 먼저 내민다(긴 조치 목록 끝에 숨기지 않는다).
    next = next
      .replace(/\n\n(?:그래도 안 되면|따라 하다 막히는 부분이 있으면) 담당자 상담으로 이어 드릴게요\.(?: 상담할 때[^\n]*)?$/, "")
      .replace(/(?:그래도 안 되면|따라 하다 막히는 부분이 있으면) 담당자 상담으로 이어 드릴게요\.\s*/, "")
    const refund = options.mentionsRefund && !next.includes("약속드릴 수 없") ? ` ${REFUND_PROMISE_LINE}` : ""
    const head = `${HANDOFF_NOW_LINE}${prior && next.startsWith(prior) ? ` ${prior}` : ""}${refund}`
    if (prior && next.startsWith(prior)) next = next.slice(prior.length).replace(/^\n\n/, "")
    next = alreadyToned || !opener ? `${head}\n\n${next}` : `${opener} ${head}\n\n먼저 해 보실 수 있는 조치도 함께 남겨 둘게요.\n\n${next}`
  } else if (opener && !alreadyToned && !next.split("\n\n").includes(opener)) {
    next = withOpener(next, opener, tone)
  }
  if (tone.english && !/^(?:In short:|I'll answer|Yes —)/.test(next)) {
    next = `${englishLeadLine(options.englishSummary, /^\d\.\s/m.test(next))}\n\n${next}`
  }
  return next
}

// ── compiled 경로 말투 층(R3 a3, 답 꼴 규격 S7·S13) ──────────────────────────────────────────────────────
// compiled 라우터가 정한 답에만 쓴다(legacy 답은 위 applyToneToAnswer 그대로). 스위치 CHATBOT_COMPILED_EMPATHY=strong(기본)|off.
// off 면 compiled 답도 applyToneToAnswer 를 그대로 거친다(R2 와 같은 글).
// - 공감 한 줄은 강한 표지(화남·같은 문제 반복·수업 직전/수업 중 시간 압박)에만 붙인다. 걱정·불안·'ㅠㅠ'·미안해하는 말에는 붙이지 않는다.
// - 자리는 결론 줄 바로 다음 줄이다(같은 덩이, 빈 줄 없음): "결론 → 공감 한 줄 → 다음 행동". 목록·머리·예고로 시작하는 답만 맨 앞 덩이다.
// - 말투 층과 앞단 고정 문구는 요체로 낸다(니다체를 섞지 않는다).
// - 화남·반복 문의에 상담 연결을 먼저 내미는 동작은 그대로다. 연결 줄이 결론이고 그 다음 줄이 사과다.

export type CompiledEmpathyMode = "strong" | "off"

/** CHATBOT_COMPILED_EMPATHY: strong(기본) · off(R2 말투 층 그대로). */
export function compiledEmpathyMode(env: Record<string, string | undefined> = process.env): CompiledEmpathyMode {
  return env.CHATBOT_COMPILED_EMPATHY?.trim().toLowerCase() === "off" ? "off" : "strong"
}

export interface StrongToneSignals {
  angry: boolean
  /** 같은 문제로 우리에게 다시 문의했다("몇 번째 문의", "또 연락드려요"). 남(학생·학부모)이 여러 번 물었다는 말은 아니다. */
  repeatedInquiry: boolean
  /** 같은 문제가 되풀이되거나 여러 번 해 봐도 안 된다("몇 번을 해도 안 돼요", "다 해 봤는데 그대로예요"). */
  repeatedFailure: boolean
  /** 시간 압박: 수업 중(in_class)·수업 직전(before_class)·급하다는 말(urgent). */
  timePressure: "in_class" | "before_class" | "urgent" | null
}

// 우리에게 다시 묻는 말. 낱말 사이에 다른 말이 끼지 않는다("매번 재부팅해야 …"는 아니다). '전화번호·연락처'는 연락한 말이 아니다.
const REPEAT_INQUIRY_STRICT_RE =
  /(?:몇\s*번째|(?:두|세|네|다섯|여섯|\d+)\s*번째|또|계속|여러\s*번|매번|몇\s*번(?:을|이나|씩)?|번번이|자꾸|벌써)\s*(?:이렇게\s*|같은\s*걸\s*|똑같이\s*)?(?:문의|연락(?!처)|전화(?!\s*번호|기)|말씀|물어|물었|여쭤|상담|접수|요청|말(?:해|했|하|을)|얘기)/
// 그 문장의 주어가 손님 쪽 다른 사람이면(학생들이 계속 물어봐서) 우리에게 다시 문의한 게 아니다.
const THIRD_PARTY_SUBJECT_RE =
  /(?:학생|아이|애|학부모|부모|어머니|아버지|선생|강사|원장|실장|직원|상담사|친구|동료)(?:님)?(?:들)?\s*(?:이|가|께서|도|은|는)(?=\s|[가-힣])/
const REPEATED_ATTEMPT_RE =
  /(?:몇\s*번(?:을|이나)?|여러\s*번|수십\s*번|계속|자꾸|매번|번번이|다시|또)\s*(?:해도|했는데|해\s*봐도|해\s*봤는데|시도해도|시도했는데|깔아도|설치해도|재설치해도|껐다\s*켜도|재부팅해도|들어가도|눌러도|바꿔도|지워도)|(?:다|전부|이것저것|시키는\s*대로|알려\s*준\s*대로|하라는\s*대로|안내대로)\s*해\s*(?:봤|봐도)|(?:두|세|네|다섯|\d+)\s*번째\s*(?:똑같|같은|이러|이래|끊|튕|멈|꺼|안\s*(?:돼|되))|(?:똑같은|같은)\s*(?:문제|증상|오류|현상)(?:가|이)?\s*(?:또|계속|다시|자꾸|반복)/
const STILL_FAILING_RE =
  /안\s*(?:돼|되|됨|됐|나와|나오|들려|보여|켜|열려|열리|떠|고쳐)|안돼|안되|똑같|그대로|여전|소용|해결\s*(?:이\s*)?안|끊|튕|멈|꺼져|오류|에러|먹통|반복/
const CLASS_WORD = String.raw`(?:수업|강의|라이브|화상\s*수업|시험|설명회|발표|개강\s*수업)`
// 수업 중·수업 직전에 문제가 생겼다는 말. "수업 중에 학생 마이크를 끄는 법"·"수업 시작 전에 미리 테스트하는 법"은 기능 질문이라 아니다.
const IN_CLASS_RE = new RegExp(
  String.raw`(?:지금|현재|한창)\s*${CLASS_WORD}\s*(?:하는\s*|진행\s*)?중|${CLASS_WORD}\s*(?:하는\s*|진행\s*)?중(?:인데|이에요|이예요|이라서?|입니다|이거든)`
)
const BEFORE_CLASS_RE = new RegExp(
  String.raw`${CLASS_WORD}\s*(?:직전|바로\s*전|시작\s*직전|들어가기\s*직전)|(?:곧|조금\s*(?:있다가|뒤에?|후에?)|잠시\s*(?:뒤|후)|이따가?|금방)\s*${CLASS_WORD}|\d+\s*분\s*(?:뒤|후|있다가|남았|남은|전)[^.?!\n]{0,10}${CLASS_WORD}|${CLASS_WORD}[^.?!\n]{0,10}\d+\s*분\s*(?:뒤|후|남|전)`
)
const TROUBLE_RE = /안\s*(?:돼|되|나|들|보|켜|열|떠|와)|안돼|안되|못\s*(?:들어|해|하|켜|열|봐|써)|오류|에러|튕|끊|멈|먹통|꺼져|사라졌|없어졌|모르겠|급/
const URGENT_RE = /급해요|급합니다|급한데|급해서|급하니|급한\s*(?:상황|일)|시간이\s*없(?:어|는데|습)/

function sentencesOf(text: string) {
  return text.split(/(?<=[.?!？。…])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean)
}

/** 강한 말투 표지(R3 S13). 따옴표로 옮긴 남의 말은 보지 않는다. tone 을 주면 그 화남 판정을 그대로 쓴다. */
export function detectStrongToneSignals(question: string, tone: ConversationTone = detectConversationTone(question)): StrongToneSignals {
  const plain = question.replace(QUOTED_SPEECH_RE, " ").replace(ASK_AGAIN_HESITATION_RE, " ")
  const sentences = sentencesOf(plain)
  const repeatedInquiry = sentences.some((sentence) => {
    const match = REPEAT_INQUIRY_STRICT_RE.exec(sentence)
    return match !== null && !THIRD_PARTY_SUBJECT_RE.test(sentence.slice(0, match.index))
  })
  const repeatedFailure = sentences.some((sentence) => REPEATED_ATTEMPT_RE.test(sentence)) && STILL_FAILING_RE.test(plain)
  const trouble = TROUBLE_RE.test(plain)
  const timePressure = IN_CLASS_RE.test(plain) && trouble
    ? "in_class"
    : BEFORE_CLASS_RE.test(plain) && trouble
      ? "before_class"
      : URGENT_RE.test(plain)
        ? "urgent"
        : null
  return { angry: tone.angry, repeatedInquiry, repeatedFailure, timePressure }
}

/**
 * compiled 경로의 '반복 문의' 판정: 옛 판정(tone.repeated) 가운데 우리에게 다시 묻거나 같은 문제가 되풀이된다는 말만 남긴다
 * ("매번 재부팅해야 업데이트가 적용되나요?", "번번이 학생들이 물어봐서…"는 빠진다). 상담 연결 앞세우기·끝 질문 생략에 쓴다.
 */
export function compiledRepeated(tone: ConversationTone, signals: StrongToneSignals) {
  return tone.repeated && (signals.repeatedInquiry || signals.repeatedFailure)
}

export const COMPILED_EMPATHY_LINES = {
  repeatedInquiry: "같은 문제로 여러 번 문의하시게 해 드려 정말 죄송해요.",
  angry: "불편을 드려 정말 죄송해요.",
  repeatedFailure: "같은 문제가 되풀이돼서 많이 답답하셨죠.",
  in_class: "수업 중이라 많이 급하시죠.",
  before_class: "수업 직전이라 많이 급하시죠.",
  urgent: "많이 급하시죠.",
} as const

/** 강한 표지에 맞는 공감 한 줄(하나만). 강한 표지가 없으면 null. */
export function compiledToneOpener(signals: StrongToneSignals): string | null {
  if (signals.repeatedInquiry) return COMPILED_EMPATHY_LINES.repeatedInquiry
  if (signals.angry) return COMPILED_EMPATHY_LINES.angry
  if (signals.repeatedFailure) return COMPILED_EMPATHY_LINES.repeatedFailure
  if (signals.timePressure) return COMPILED_EMPATHY_LINES[signals.timePressure]
  return null
}

export const COMPILED_HANDOFF_NOW_LINE =
  "지금 바로 담당자와 연결해 드릴게요. 아래 [실시간 상담 연결]을 누르시면 상담원이 이 대화를 보고 이어서 도와드려요."
export const COMPILED_REFUND_PROMISE_LINE = "환불이나 보상은 제가 채팅에서 약속드릴 수 없어요. 상담원이 이번 상황을 확인해 안내해 드려요."
const COMPILED_STEPS_BRIDGE = "먼저 해 보실 수 있는 조치도 함께 남겨 둘게요."

/**
 * 말투 층·앞단(즉시 상담·이미 해 봄) 고정 문구의 니다체 → 요체. 이 목록에 있는 글 그대로만 바꾼다(카드·문서 문장은 건드리지 않는다).
 * 왼쪽은 tone.ts·service.ts 가 쓰는 고정 문구의 한 부분이다.
 */
export const COMPILED_YO_FIXED_PHRASES: readonly (readonly [string, string])[] = [
  [HANDOFF_NOW_LINE, COMPILED_HANDOFF_NOW_LINE],
  [REFUND_PROMISE_LINE, COMPILED_REFUND_PROMISE_LINE],
  ["불편을 드려 정말 죄송합니다.", COMPILED_EMPATHY_LINES.angry],
  ["같은 문제로 여러 번 문의하시게 해 드려 정말 죄송합니다.", COMPILED_EMPATHY_LINES.repeatedInquiry],
  ["상담원이 지금까지의 대화를 보고 이어서 도와드립니다.", "상담원이 지금까지의 대화를 보고 이어서 도와드려요."],
  ["연락받을 방법을 남기시면 담당자가 연락드립니다.", "연락받을 방법을 남기시면 담당자가 연락드려요."],
  ["담당자가 이번 상황을 확인한 뒤 직접 안내드립니다.", "담당자가 이번 상황을 확인한 뒤 직접 안내해 드려요."],
  ["연결되면 상담원이 바로 안내해 드립니다.", "연결되면 상담원이 바로 안내해 드려요."],
  ["정리해 남겨 주시면 담당자가 확인해 드립니다.", "정리해 남겨 주시면 담당자가 확인해 드려요."],
  ["정리해 두시면 더 빨리 확인합니다.", "정리해 두시면 더 빨리 확인할 수 있어요."],
  ["기술지원이 그 시간대 접속 기록을 보고 확인합니다.", "기술지원이 그 시간대 접속 기록을 보고 확인해요."],
]

export function toCompiledYoFixedPhrases(answer: string) {
  let next = answer
  for (const [from, to] of COMPILED_YO_FIXED_PHRASES) if (next.includes(from)) next = next.split(from).join(to)
  return next
}

// 공감·사과 문장(공감 두 줄 금지: 답의 첫 두 덩이에 이미 있으면 더 붙이지 않는다).
const EMPATHY_ANYWHERE_RE = /죄송|답답하셨|급하시죠|당황하셨|걱정되셨|지치셨|속상하셨|놀라셨|힘드셨|불편하셨/
const STEP_LINE_RE = /(?:^|\n)\s*(?:\d+[.)]|[-•])\s+\S/

function hasEmpathySentence(answer: string) {
  return answer
    .split("\n\n")
    .slice(0, 2)
    .some((block) => EMPATHY_ANYWHERE_RE.test(block))
}

/** 공감 한 줄 자리: 첫 덩이의 첫 줄이 결론이면 그 바로 다음 줄, 목록·머리·예고·영어 안내로 시작하면 맨 앞 덩이. */
function withCompiledOpener(answer: string, opener: string) {
  const blocks = answer.split("\n\n")
  const lines = blocks[0].split("\n")
  const head = lines[0].trim()
  if (!head || LIST_PARAGRAPH_RE.test(head) || PREVIEW_PARAGRAPH_RE.test(head) || /^(?:In short:|I'll answer|Yes —)/.test(head)) {
    return `${opener}\n\n${answer}`
  }
  return [[lines[0], opener, ...lines.slice(1)].join("\n"), ...blocks.slice(1)].join("\n\n")
}

/**
 * compiled 답의 말투 층(applyToneToAnswer 의 compiled 판). 여러 번 불러도 결과가 같다.
 * - 고정 문구는 요체로 바꾼다(toCompiledYoFixedPhrases).
 * - offerHandoff 면 "연결 줄(+ 지난 대화 줄·환불 줄)" 다음 줄에 사과 한 줄을 두고, 조치 단계가 있을 때만 "먼저 해 보실 수 있는 조치도…"를 잇는다.
 * - 그 밖에는 강한 표지일 때만 공감 한 줄을 결론 다음 줄에 둔다.
 */
export function applyCompiledToneToAnswer(
  answer: string,
  tone: ConversationTone,
  signals: StrongToneSignals,
  options: { englishSummary?: string; offerHandoff: boolean; mentionsRefund?: boolean }
) {
  let next = toCompiledYoFixedPhrases(answer)
  const opener = compiledToneOpener(signals)
  const english = next.startsWith("In short:") || next.startsWith("I'll answer")
  const alreadyToned = english || (opener !== null && next.includes(opener)) || hasEmpathySentence(next)
  const prior = priorContextLine(tone)
  if (prior && !next.includes(prior) && !/볼\s*수\s*없|볼\s*수도/.test(next)) {
    next = next.includes(COMPILED_HANDOFF_NOW_LINE)
      ? next.replace(COMPILED_HANDOFF_NOW_LINE, `${COMPILED_HANDOFF_NOW_LINE} ${prior}`)
      : `${prior}\n\n${next}`
  }
  if (options.offerHandoff && !next.includes("[실시간 상담 연결]")) {
    next = next
      .replace(/\n\n(?:그래도 안 되면|따라 하다 막히는 부분이 있으면) 담당자 상담으로 이어 드릴게요\.(?: 상담할 때[^\n]*)?$/, "")
      .replace(/(?:그래도 안 되면|따라 하다 막히는 부분이 있으면) 담당자 상담으로 이어 드릴게요\.\s*/, "")
    const refund = options.mentionsRefund && !next.includes("약속드릴 수 없") ? ` ${COMPILED_REFUND_PROMISE_LINE}` : ""
    const head = `${COMPILED_HANDOFF_NOW_LINE}${prior && next.startsWith(prior) ? ` ${prior}` : ""}${refund}`
    if (prior && next.startsWith(prior)) next = next.slice(prior.length).replace(/^\n\n/, "")
    const empathy = opener && !alreadyToned ? `\n${opener}` : ""
    const bridge = STEP_LINE_RE.test(next) ? `${COMPILED_STEPS_BRIDGE}\n\n` : ""
    next = `${head}${empathy}\n\n${bridge}${next}`
  } else if (opener && !alreadyToned) {
    // 지난 대화 줄이 맨 앞이면 그 다음 덩이(본 답)의 결론 뒤에 둔다.
    next =
      prior && next.startsWith(`${prior}\n\n`)
        ? `${prior}\n\n${withCompiledOpener(next.slice(prior.length + 2), opener)}`
        : withCompiledOpener(next, opener)
  }
  if (tone.english && !/^(?:In short:|I'll answer|Yes —)/.test(next)) {
    next = `${englishLeadLine(options.englishSummary, /^\d\.\s/m.test(next))}\n\n${next}`
  }
  return next
}

// 영어·줄임말 질문도 한국어 규칙으로 고를 수 있게, 라우팅용 한국어 단어를 덧붙인다(원문은 그대로 둔다).
// 답 색인(lib/chatbot/answer-index/normalize.ts glossForIndex)이 변형 10만 줄에 같은 표를 미리 컴파일해 쓰려고 내보낸다.
export const ROUTING_GLOSSES: [RegExp, string][] = [
  [/\blog\s*-?\s*in\b|\bsign\s*in\b/i, "로그인"],
  [/\bsign\s*-?\s*up\b|\bregister\b/i, "회원가입"],
  [/\bpassword\b/i, "비밀번호"],
  [/\bverification\s*code\b/i, "인증코드"],
  [/\bcode\b/i, "코드"],
  [/\bwrong\b|\bincorrect\b|\binvalid\b/i, "틀려요"],
  [/\bwhere\b/i, "어디"],
  [/\bchange\b|\breset\b/i, "바꾸기"],
  [/\becho(?:es|ing)?\b|\bhowl(?:ing)?\b|\bfeedback\s*noise\b/i, "울림"],
  [/\bppt\b|\bpowerpoint\b|\bslides?\b/i, "PPT"],
  [/\banimation\b/i, "애니메이션"],
  [/\bcamera\b|\bwebcam\b|\bcam\b/i, "카메라"],
  [/\bmic\b|\bmicrophone\b/i, "마이크"],
  [/\bsound\b|\baudio\b|\bvoice\b|\bcan'?t hear\b/i, "소리"],
  [/\brecord(?:ing|ed)?\b/i, "녹화"],
  [/\breplay\b|\bplayback\b/i, "다시보기"],
  [/\bscreen\s*-?\s*shar(?:e|ing)\b|\bshar(?:e|ing)\s*(?:my\s*)?screen\b/i, "화면 공유"],
  [/\binvite\b|\binvitation\b/i, "초대"],
  [/\bstudents?\b/i, "학생"],
  [/\bhomework\b|\bassignment\b/i, "숙제"],
  [/\binstall(?:ation)?\b/i, "설치"],
  [/\bupdate\b|\bupgrade\b/i, "업데이트"],
  [/\bcrash(?:es|ed|ing)?\b/i, "튕겨요"],
  [/\bfr(?:eeze|ozen)\b|\bstuck\b|\bhang(?:s|ing)?\b/i, "멈춰요"],
  [/\bblack\s*screen\b|\bblack\b/i, "검은 화면"],
  [/\bnot\s*working\b|\bdoes\s*n[o']?t\s*work\b|\bisn'?t\s*working\b|\bcan'?t\b|\bcannot\b|\bwon'?t\b/i, "안 돼요"],
  [/\berror\b/i, "오류"],
  [/\bdisconnect(?:s|ed|ing)?\b|\bdrop(?:s|ped)?\b/i, "끊겨요"],
  [/\blag(?:gy|s)?\b|\bslow\b/i, "느려요"],
  [/\bclass(?:room)?\b|\blesson\b/i, "수업"],
  [/\bchat\b/i, "채팅"],
  [/\bmessages?\b/i, "메시지"],
  [/\btest\b/i, "테스트"],
  [/\bhow\s*(?:do|can|to)\b/i, "어떻게"],
  [/\blink\b/i, "링크"],
]
export const SLANG_GLOSSES: [RegExp, string][] = [
  [/어케|어캐|어떠케/g, "어떻게"],
  [/ㅇㄷ(?:서)?/g, "어디서"],
  [/업뎃|업뎃트|업데트/g, "업데이트"],
  [/쌤/g, "선생님"],
  [/안켜짐|안켜져/g, "안 켜져요"],
  [/로긴/g, "로그인"],
  [/안\s*대(?:여|요|염)|안\s*되여|안\s*됨여/g, "안 돼요"],
  [/(^|\s)다보기/g, "$1다시보기"],
  [/잇음/g, "있음"],
  [/잇어요/g, "있어요"],
  [/알려\s*주셈|알려\s*줘셈|알려\s*주삼/g, "알려주세요"],
  [/(?<!안\s?)됨\s*\?/g, "되나요?"],
  [/(^|\s)샘(?=들|\s|이|한테|께|은|도)/g, "$1선생님"],
  [/딴\s*애들/g, "다른 애들"],
  [/수업\s*녹음|녹음한\s*(?:걸|것|거)/g, "녹화한 것"],
]

export function glossForRouting(question: string) {
  let text = question
  for (const [pattern, replacement] of SLANG_GLOSSES) text = text.replace(pattern, replacement)
  for (const [pattern, korean] of ROUTING_GLOSSES) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
    text = text.replace(global, korean)
  }
  return text
}

export const ENGLISH_SUPPORT_ANSWER = [
  "Yes — you can ask me in English. I'll give you the short version in English and the detailed steps in Korean.",
  "Try short phrases like \"login not working\", \"camera black screen\", \"recording not working\", or \"how to invite students\".",
  "If you'd rather talk to a person, type \"상담원 연결\" and I'll connect you to our support team.",
].join("\n\n")

// "영어로만 뜹니다", "오류가 영어로 나와요"처럼 화면 언어를 말하는 문장은 영어 상담 요청이 아니다.
const ENGLISH_SUPPORT_WORD_RE =
  /speak\s*english|in\s*english|english\s*(?:please|ok|support)|영어\s*로\s*(?:답|대답|설명|상담|안내|알려|말해|말씀|대화|얘기|이야기|물어|질문|해\s*(?:줘|주|도))|영어\s*(?:가능|돼요|되나요|되요|할\s*줄|지원)|english\s*(?:가능|돼|되)/i
// 대화 언어를 청하는 말(R2 B5). 이 말이 있으면 아래 '앱·자료 언어' 틀이 함께 있어도 영어 안내로 본다.
const ENGLISH_CONVERSATION_RE =
  /speak\s*english|in\s*english|english\s*please|영어\s*로\s*(?:답|대답|설명|상담|대화|얘기|이야기|말해|말씀)|영어\s*(?:로\s*)?(?:상담|대화)\s*(?:가능|돼|되|할\s*수)/i
// 앱 화면 언어·영어 교재·자막처럼 '영어'가 기능·자료를 꾸미는 말("앱 언어를 영어로 해 주는 설정", "영어 지원 교재를 수업에 올리는 방법").
const ENGLISH_FEATURE_CONTEXT_RE =
  /설정|기능|교재|자막|메뉴|앱\s*언어|언어\s*(?:설정|변경|바꾸|바꿔)|화면\s*언어|표시|키보드|자료|올리|업로드|버전|인터페이스|\bui\b|파일|문서|수업\s*(?:에|을|자료)/i

// 문장마다 본다: 영어를 말한 문장 안에 기능·자료 틀이 있을 때만 영어 안내가 아니다("영어로 해 주세요. 설정은 어디 있어요?"는 영어 안내).
export function isEnglishSupportRequest(question: string) {
  if (!ENGLISH_SUPPORT_WORD_RE.test(question)) return false
  const sentences = question.split(/(?<=[.?!？。…])\s+|\n+/).filter((sentence) => ENGLISH_SUPPORT_WORD_RE.test(sentence))
  return sentences.some((sentence) => ENGLISH_CONVERSATION_RE.test(sentence) || !ENGLISH_FEATURE_CONTEXT_RE.test(sentence))
}
