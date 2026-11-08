/**
 * 질문의 감정·형식 신호를 읽어 결정형 답변의 첫마디와 상담 연결을 맞춘다.
 *
 * 페르소나 평가(10명 × 5회)에서 화난 사용자에게 사과 없이 매뉴얼만, 불안한 학부모에게 안심 한마디 없이,
 * 짧게 묻는 학생에게 장황하게, 영어로 묻는 사용자에게 한국어 되묻기만 하던 문제를 고친다.
 * 성별·나이 같은 속성은 추정하지 않는다. 질문 문장에 드러난 신호만 쓴다.
 */

export interface ConversationTone {
  angry: boolean
  repeated: boolean
  anxious: boolean
  apologetic: boolean
  terse: boolean
  english: boolean
  /** 다른 창·지난 문의를 전제로 묻는다("다른 창에서 챗봇이…", "지난주에 문의했잖아요"). */
  priorContext: "bot" | "inquiry" | null
}

const ANGRY_RE =
  /도대체|말이\s*(?:됩니까|돼요|되나요|됩니다|돼)|짜증|화가\s*(?:나|납)|(?<!대)화나(?:요|네|서|고|는|죠)|화났|어이(?:가)?\s*없|황당|아깝|최악|엉망|책임\s*(?:지|져)|언제\s*(?:고쳐|해결)|장난\s*(?:해|합)|돈\s*(?:낸|내고|냈)|환불해\s*(?:주|줘)|이게\s*뭐(?:예요|에요|야|냐|입니까)/
const REPEATED_RE =
  /몇\s*번째|(?:두|세|네|다섯)\s*번째\s*(?:문의|연락|전화|말씀|요청|끊|튕|같은|똑같|이에요|예요|입니다)|(?:벌써|이번이|오늘만|이번\s*주만|이번\s*주에만)[^.!?]{0,8}(?:두|세|네|다섯)\s*번째|또\s*(?:문의|연락|물어|말씀)|계속\s*(?:문의|물어|말|연락)|여러\s*번\s*(?:문의|말|연락)|매번\s*(?:문의|물어|말|연락|똑같|같은|재부팅|인터넷)|번번이|몇\s*번을/
const ANXIOUS_RE =
  /어떡하|어떻게\s*해야\s*(?:하|할|돼|되)|걱정|불안|큰일|급해요|급합니다|급한데|당황|무서|난감|혹시\s*제가|혼났|속상|미치겠|울고/
const APOLOGETIC_RE = /^(?:\S+\s+)?죄송|죄송한데|죄송합니다만|실수할까|제가\s*(?:뭔가|뭘|뭐|혹시)?\s*잘못|^sorry\b/i
const SLANG_RE = /ㅋㅋ|ㅠ|ㅜ|어케|어캐|ㄱㄱ|ㅇㅇ|뭐임|머임/
// 들뜬 느낌표("첫 수업이었어요!!")는 화가 난 신호가 아니다.
const POSITIVE_RE = /축하|설레|떨려|떨리|신나|기뻐|기쁘|좋아요|좋았|고마|감사|ㅋㅋ|최고|first\s*class|첫\s*수업|드디어/
const PRIOR_BOT_RE =
  /(?:다른|이전|지난)\s*(?:창|채팅|대화|세션)|(?:아까|전에|지난번|저번).{0,12}(?:챗봇|봇|답변)|챗봇이\s*(?:알려|말해|답|안내)/
const PRIOR_INQUIRY_RE =
  /(?:지난주|지난번|저번|전에|예전에|어제|며칠\s*전|지난달|아까|\d+\s*(?:주|일|달|개월)\s*전)[^.!?]{0,20}(?:문의|물어|물었|여쭤|말씀|연락(?:했|드렸|을\s*드|드린|이\s*왔|받)|접수|얘기|말했|말한|통화|안내받|알려\s*주신|알려준|알려\s*준|전화\s*(?:드렸|했|드린)|상담\s*(?:때|에서|받|했)|받은\s*(?:답변|안내|메일)|메일로\s*받)|(?:지난번|저번|어제|아까)\s*(?:에\s*)?(?:그거|그\s*거)|(?:지난번|저번|어제|아까)(?:이랑|하고|과|처럼)\s*(?:또|(?:똑같은|같은)\s*(?:문제|증상|오류|현상)|same)|(?:문의|접수)\s*했(?:잖아|는데|었는데|었잖아)|happened\s*again|same\s*problem|(?:^|\s)또\s*(?:그래요|그럽니다|그러네|됨|돼요|됐어요|안\s*(?:돼|되)(?!\S*면))|아직도\s*안\s*고쳐/
const THIRD_PARTY_PRIOR_RE =
  /(?:원장|선생님|강사|실장|엄마|아빠|부모님|친구|담임|팀장)(?:님)?\s*(?:이|가|께서|한테서|이\s*저한테)\s*['"‘“]?\s*(?:저번|지난번|아까|어제|전에)/
const ENGLISH_LEAD_RE = /^(?:hi|hello|hey|can you|could you|how do|how can|how to|my |i |is there|why)/i

export function detectConversationTone(question: string): ConversationTone {
  const text = question.trim()
  const exclamations = (text.match(/[!！]/g) ?? []).length
  const compact = text.replace(/\s+/g, "")
  const words = text.split(/\s+/).filter(Boolean)
  const latinWords = words.filter((word) => /[a-z]{2,}/i.test(word) && !/[가-힣]/.test(word)).length

  const repeated = REPEATED_RE.test(text)
  const excitedNotAngry = POSITIVE_RE.test(text)
  return {
    // 느낌표 두 개 이상, 또는 "~입니까!" 같은 따지는 어미는 화가 난 신호로 본다(들뜬 느낌표는 뺀다).
    angry:
      ANGRY_RE.test(text) ||
      (!excitedNotAngry &&
        (exclamations >= 2 || (exclamations >= 1 && /(?:니까|겁니까|입니까|습니까)\s*[!?！]|저만\s*이런/.test(text)))),
    repeated,
    anxious: ANXIOUS_RE.test(text),
    apologetic: APOLOGETIC_RE.test(text),
    terse: compact.length <= 10 || (SLANG_RE.test(text) && compact.length <= 24),
    english: ENGLISH_LEAD_RE.test(text) || (latinWords >= 3 && latinWords / Math.max(1, words.length) >= 0.34),
    // "원장님께서 '저번에 말한 그 설정'"처럼 다른 사람과의 지난 대화를 옮긴 말은 우리와의 지난 문의가 아니다.
    priorContext: THIRD_PARTY_PRIOR_RE.test(text)
      ? null
      : PRIOR_BOT_RE.test(text)
        ? "bot"
        : PRIOR_INQUIRY_RE.test(text)
          ? "inquiry"
          : null,
  }
}

export const PRIOR_BOT_LINE =
  "다른 창이나 이전 대화에서 드린 답은 제가 볼 수 없어서, 그 내용이 맞는지 여기서 확인해 드릴 수 없어요. 공식 문서와 다르다면 공식 문서와 기술지원 안내를 기준으로 봐 주세요."
export const REFUND_PROMISE_LINE = "환불이나 보상은 제가 채팅에서 약속드릴 수 없어요. 상담원이 이번 상황을 확인해 안내해 드립니다."

export const PRIOR_INQUIRY_LINE = "지난 문의 내용은 이 채팅에서 볼 수 없어요. 상담원이 이어받아 확인해 드릴게요."

function priorContextLine(tone: ConversationTone) {
  if (tone.priorContext === "bot") return PRIOR_BOT_LINE
  if (tone.priorContext === "inquiry") return PRIOR_INQUIRY_LINE
  return null
}

export function toneOpener(tone: ConversationTone, forHandoff = false): string | null {
  if (tone.angry || tone.repeated) {
    return tone.repeated
      ? "같은 문제로 여러 번 문의하시게 해 드려 정말 죄송합니다."
      : "불편을 드려 정말 죄송합니다."
  }
  if (tone.anxious) return "많이 당황하셨죠. 같이 차근차근 확인해 볼게요."
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

export function englishLeadLine(englishSummary?: string, hasSteps = true) {
  return englishSummary
    ? `In short: ${englishSummary} (${hasSteps ? "Detailed steps are below in Korean. " : ""}Type "상담원 연결" anytime to talk to a person.)`
    : `I'll answer in Korean below. If anything is unclear, type "상담원 연결" to talk to a person, or ask again with a short phrase like "login not working".`
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
  // 상담 연결 답에는 "순서대로 알려 드릴게요" 같은 안내형 첫마디가 어울리지 않는다.
  const opener = toneOpener(tone, /\[(?:실시간 상담 연결|도입 상담 남기기)\]/.test(answer) && !/^\d\.\s/m.test(answer))
  const alreadyToned = EMPATHY_START_RE.test(next) || next.startsWith("In short:") || next.startsWith("I'll answer")
  const prior = priorContextLine(tone)
  if (prior && !next.includes(prior)) {
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
  } else if (opener && !alreadyToned) {
    next = `${opener}\n\n${next}`
  }
  if (tone.english && !/^(?:In short:|I'll answer|Yes —)/.test(next)) {
    next = `${englishLeadLine(options.englishSummary, /^\d\.\s/m.test(next))}\n\n${next}`
  }
  return next
}

// 영어·줄임말 질문도 한국어 규칙으로 고를 수 있게, 라우팅용 한국어 단어를 덧붙인다(원문은 그대로 둔다).
const ROUTING_GLOSSES: [RegExp, string][] = [
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
const SLANG_GLOSSES: [RegExp, string][] = [
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

export function isEnglishSupportRequest(question: string) {
  return /speak\s*english|in\s*english|english\s*(?:please|ok|support)|영어\s*(?:로|가능|돼|되|할\s*줄|지원)|english\s*(?:가능|돼|되)/i.test(question)
}
