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
}

const ANGRY_RE =
  /도대체|말이\s*(?:됩니까|돼요|되나요|됩니다|돼)|짜증|화가\s*(?:나|납)|(?<!대)화나(?:요|네|서|고|는|죠)|화났|어이(?:가)?\s*없|황당|아깝|최악|엉망|책임\s*(?:지|져)|언제\s*(?:고쳐|해결)|장난\s*(?:해|합)|돈\s*(?:낸|내고|냈)|환불해\s*(?:주|줘)|이게\s*뭐(?:예요|에요|야|냐|입니까)/
const REPEATED_RE =
  /몇\s*번째|(?:두|세|네|다섯)\s*번째|또\s*(?:문의|연락|물어|말씀)|계속\s*(?:문의|물어|말|연락)|여러\s*번\s*(?:문의|말|연락)|매번|번번이|몇\s*번을/
const ANXIOUS_RE =
  /어떡하|어떻게\s*해야\s*(?:하|할|돼|되)|걱정|불안|큰일|급해요|급합니다|급한데|당황|무서|난감|혹시\s*제가/
const APOLOGETIC_RE = /^(?:\S+\s+)?죄송|죄송한데|죄송합니다만|실수할까|제가\s*(?:뭔가|뭘|뭐|혹시)?\s*잘못/
const SLANG_RE = /ㅋㅋ|ㅠ|ㅜ|어케|어캐|ㄱㄱ|ㅇㅇ|뭐임|머임/
const ENGLISH_LEAD_RE = /^(?:hi|hello|hey|can you|could you|how do|how can|how to|my |i |is there|why)/i

export function detectConversationTone(question: string): ConversationTone {
  const text = question.trim()
  const exclamations = (text.match(/[!！]/g) ?? []).length
  const compact = text.replace(/\s+/g, "")
  const words = text.split(/\s+/).filter(Boolean)
  const latinWords = words.filter((word) => /[a-z]{2,}/i.test(word) && !/[가-힣]/.test(word)).length

  const repeated = REPEATED_RE.test(text)
  return {
    // 느낌표 두 개 이상, 또는 "~입니까!" 같은 따지는 어미는 화가 난 신호로 본다.
    angry: ANGRY_RE.test(text) || exclamations >= 2 || (exclamations >= 1 && /(?:니까|겁니까|입니까|습니까)\s*[!?！]|저만\s*이런/.test(text)),
    repeated,
    anxious: ANXIOUS_RE.test(text),
    apologetic: APOLOGETIC_RE.test(text),
    terse: compact.length <= 10 || (SLANG_RE.test(text) && compact.length <= 24),
    english: ENGLISH_LEAD_RE.test(text) || (latinWords >= 3 && latinWords / Math.max(1, words.length) >= 0.34),
  }
}

export function toneOpener(tone: ConversationTone): string | null {
  if (tone.angry || tone.repeated) {
    return tone.repeated
      ? "같은 문제로 여러 번 문의하시게 해 드려 정말 죄송합니다."
      : "불편을 드려 정말 죄송합니다."
  }
  if (tone.anxious) return "많이 당황하셨죠. 같이 차근차근 확인해 볼게요."
  if (tone.apologetic) return "죄송해하지 않으셔도 돼요. 처음엔 누구나 헷갈리는 부분이라 순서대로 알려 드릴게요."
  return null
}

export const HANDOFF_NOW_LINE =
  "지금 바로 담당자와 연결해 드릴게요. 아래 [실시간 상담 연결]을 누르시면 상담원이 이 대화를 보고 이어서 도와드립니다."

const EMPATHY_START_RE = /^(?:불편을|같은 문제로|많이 당황|죄송|걱정|괜찮)/

export function englishLeadLine(englishSummary?: string) {
  return englishSummary
    ? `In short: ${englishSummary} (Detailed steps are below in Korean. Type "상담원 연결" anytime to talk to a person.)`
    : `I'll answer in Korean below. If anything is unclear, type "상담원 연결" to talk to a person, or ask again with a short phrase like "login not working".`
}

/**
 * 답변 앞에 공감 한마디·영어 요약을 붙이고, 화난/반복 문의면 상담 연결을 켠다. 여러 번 불러도 결과가 같다.
 */
export function applyToneToAnswer(
  answer: string,
  tone: ConversationTone,
  options: { englishSummary?: string; offerHandoff: boolean }
) {
  let next = answer
  const opener = toneOpener(tone)
  const alreadyToned = EMPATHY_START_RE.test(next) || next.startsWith("In short:") || next.startsWith("I'll answer")
  if (options.offerHandoff && !next.includes("[실시간 상담 연결]")) {
    // 화난·반복 문의는 사과 바로 다음에 상담 연결을 먼저 내민다(긴 조치 목록 끝에 숨기지 않는다).
    next = next
      .replace(/\n\n그래도 안 되면 담당자 상담으로 이어 드릴게요\.(?: 상담할 때[^\n]*)?$/, "")
      .replace(/그래도 안 되면 담당자 상담으로 이어 드릴게요\.\s*/, "")
    next = alreadyToned || !opener ? `${HANDOFF_NOW_LINE}\n\n${next}` : `${opener} ${HANDOFF_NOW_LINE}\n\n먼저 해 보실 수 있는 조치도 함께 남겨 둘게요.\n\n${next}`
  } else if (opener && !alreadyToned) {
    next = `${opener}\n\n${next}`
  }
  if (tone.english && !/^(?:In short:|I'll answer|Yes —)/.test(next)) {
    next = `${englishLeadLine(options.englishSummary)}\n\n${next}`
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
  [/\bhow\s*(?:do|can|to)\b/i, "어떻게"],
  [/\blink\b/i, "링크"],
]
const SLANG_GLOSSES: [RegExp, string][] = [
  [/어케|어캐|어떠케/g, "어떻게"],
  [/ㅇㄷ(?:서)?/g, "어디서"],
  [/업뎃|업뎃트|업데트/g, "업데이트"],
  [/쌤/g, "선생님"],
  [/안켜짐|안켜져/g, "안 켜져요"],
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
