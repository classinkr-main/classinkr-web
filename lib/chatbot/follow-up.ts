import type { ConversationTone } from "@/lib/chatbot/tone"

/**
 * 질문 주도 — 답 끝에 질문 하나를 자연스럽게 붙여 대화를 이어 간다.
 *
 * 1) 오해 막기: 줄임말·다른 말을 어떻게 이해하고 답했는지 밝히고, 아니면 알려 달라고 한다.
 * 2) 정보가 부족할 때: 주제가 정해 둔 확인 질문, 또는 기기에 따라 순서가 갈리는 답이면 쓰는 기기를 묻는다.
 * 3) 영업 상담을 이어 갈 때: 학원 규모·교실·수업 방식·지금 쓰는 도구·도입 시기 가운데 아직 모르는 것 하나를 묻는다.
 *
 * 지키는 것
 * - 질문은 하나만. 조치·답을 먼저 주고 끝에 붙인다(질문만 던지지 않는다).
 * - 아이디·전화번호·이메일·비밀번호 같은 식별 정보는 묻지 않는다.
 * - 화난·반복 문의, 영어 질문, 되묻기 답, 이미 질문으로 끝나는 답에는 붙이지 않는다.
 */

export interface FollowUpInput {
  question: string
  answer: string
  category: string
  intent: string
  handoffIntent: string
  answerMode: string
  tone: ConversationTone
  /** 증상·사용법 주제가 정해 둔 확인 질문. */
  topicFollowUp?: string
  topicId?: string
  /** false면 영업용 되묻기(규모·교실·도입 시기)를 붙이지 않는다. */
  allowSalesFollowUp?: boolean
}

// 답을 어떻게 이해했는지 밝혀 오해를 막는다. 원 질문에 이 말이 있을 때만.
// asks: 그 문장 자체가 "아니면 알려 주세요"라고 청한다(그러면 다른 질문을 더 붙이지 않는다).
const INTERPRETATIONS: { pattern: RegExp; when?: (input: FollowUpInput) => boolean; line: string; asks?: boolean }[] = [
  {
    pattern: /수업\s*녹음|녹음한\s*(?:걸|것|거)|으로\s*녹음/,
    // 음성 숙제·말하기 제출처럼 정말 소리를 녹음한 이야기에는 붙이지 않는다.
    when: (input) => !/숙제|과제|음성|말하기|제출|스피킹/.test(input.question),
    line: "'녹음'은 수업 녹화로 이해하고 답했어요. 소리만 따로 녹음하는 걸 말씀하신 거라면 알려 주세요.",
    asks: true,
  },
  {
    pattern: /(?:^|\s)다보기/,
    line: "'다보기'는 다시보기로 이해했어요. 다른 뜻이면 알려 주세요.",
    asks: true,
  },
  {
    pattern: /(?:그|그거)\s*서류|서류\s*그거/,
    when: (input) => /verification|institution/.test(input.topicId ?? ""),
    line: "'그 서류'는 기관 인증에 내는 서류(사업자등록증 등)로 이해했어요. 다른 서류라면 알려 주세요.",
    asks: true,
  },
  {
    pattern: /(?:수업|그)\s*프로그램/,
    when: (input) => /칠판|티비|tv|보드/.test(input.question.toLowerCase()),
    line: "'수업 프로그램'은 전자칠판에 깔린 클래스인 X(ClassIn X)로 이해하고 답했어요.",
  },
  {
    pattern: /(?:핸드폰|휴대폰|폰)\s*(?:거|화면)?\s*(?:를|을)?\s*띄우/,
    line: "'핸드폰 띄우기'는 무선 미러링으로 이해하고 답했어요.",
  },
]

const DEVICE_RE =
  /\bpc\b|컴퓨터|노트북|맥북|\b맥\b|윈도우|휴대폰|핸드폰|(?:^|\s)폰|아이폰|갤럭시|안드로이드|태블릿|아이패드|패드|전자\s*칠판|칠판|보드|티비|\btv\b|모바일/i
// 답 안에서 기기별로 순서가 갈린다는 표시.
// 단계나 줄이 기기 이름으로 시작할 때만(괄호 속 "PC는 왼쪽 아래, 휴대폰은 왼쪽 위"처럼 한 줄에 다 담긴 건 제외).
const DEVICE_SPLIT_ANSWER_RE =
  /(?:^|\n)\s*(?:\d+\.\s*|-\s*)?(?:PC는|PC에서는|휴대폰·태블릿은|휴대폰은|모바일은|안드로이드는|아이폰·아이패드는|전자칠판은)/

const SALES_INTENTS = new Set(["sales_consulting", "tutor_pricing_recommend", "emotional_consulting", "onboarding"])
const SALES_CATEGORIES = new Set(["consultation", "billing", "onboarding", "hardware"])
const SUPPORT_SIGNAL_RE =
  /안\s*(?:돼|되|나|켜|열|보|눌)|안돼|안되|오류|에러|고장|끊|튕|멈|꺼져|비활성|회색|눌리지|환불|해지|위약금|결제\s*(?:실패|오류)|중복|두\s*번|청구|계산서|영수증|증빙|부가세|견적서|계약서|a\s*\/?\s*s|수리|접수/

// 영업 상담에서 알아 두면 견적·구성을 좁힐 수 있는 것. 질문에 이미 있으면 묻지 않는다.
const SALES_SLOTS: { id: string; present: RegExp; answerAsks: RegExp; line: string }[] = [
  {
    id: "size",
    present:
      /\d+\s*(?:명|개\s*반|반|교실|대|지점|곳)|(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:명|반|곳|대|지점)|강사\s*\d|학생\s*\d|규모|1인|혼자/,
    answerAsks: /학생\s*수|강사\s*수|몇\s*명|규모/,
    line: "참고로 강사와 학생이 대략 몇 명인지 알려 주시면, 맞는 구성과 요금제를 더 정확히 좁혀 드릴게요.",
  },
  {
    id: "rooms",
    present:
      /교실\s*(?:\d|이|은|수|몇|(?:한|두|세|네|다섯)\s*(?:곳|개|칸))|벽걸이|스탠드|설치\s*(?:장소|형태)|\d+\s*대|(?:한|두|세|네|다섯)\s*대/,
    answerAsks: /교실\s*수|교실이\s*몇|설치\s*형태|벽걸이·스탠드/,
    line: "전자칠판을 놓을 교실이 몇 곳인지, 벽에 걸지 스탠드로 둘지도 생각해 두셨나요? 알려 주시면 그 기준으로 구성을 잡아 드릴게요.",
  },
  {
    id: "mode",
    present: /온라인|오프라인|하이브리드|대면|비대면|현장\s*수업|원격/,
    answerAsks: /대면|온라인|하이브리드/,
    line: "지금은 주로 대면 수업인가요, 온라인·하이브리드 수업도 함께 하시나요? 수업 방식에 따라 필요한 구성이 달라져요.",
  },
  {
    id: "current-tool",
    present: /zoom|줌|구글\s*클래스룸|기존|지금\s*쓰는|다른\s*(?:프로그램|업체|회사|전자칠판)|쓰던/,
    answerAsks: /지금\s*(?:은\s*)?어떤\s*도구|쓰고\s*계신/,
    line: "지금은 어떤 도구(Zoom, 일반 전자칠판 등)로 수업하고 계신가요? 바꿀 때 걱정되는 부분을 같이 짚어 드릴게요.",
  },
  {
    id: "timing",
    present: /언제|시기|다음\s*(?:달|학기)|이번\s*(?:달|학기)|방학|개강|\d+\s*월/,
    answerAsks: /언제쯤|도입\s*시기/,
    line: "도입은 언제쯤 생각하고 계세요? 일정에 맞춰 체험이나 쇼룸 방문 순서를 잡아 드릴 수 있어요.",
  },
]

// 이미 되묻거나 "알려 주시면 좁혀 드릴게요"처럼 정보를 청한 답에는 질문을 더 얹지 않는다.
// 단, 상담원에게 넘길 정보 목록("상담할 때 이 정보를 함께 알려 주시면…")은 되묻기로 치지 않는다.
// 끝의 두 문단에 물음표가 있으면 이미 묻는 답으로 본다(문장 가운데 물음표 포함).
const ALREADY_ASKS_RE =
  /\?|알려\s*주시겠어요|말씀해\s*주시겠어요|알려\s*주실\s*수\s*있을까요|어느\s*쪽인지|알려\s*주시면|알려주시면|말씀해\s*주시면|말씀해주시면/
const DEVICE_LINE = "쓰시는 기기가 PC인지 휴대폰·태블릿인지 알려 주시면, 그 기기에 맞는 순서만 짧게 다시 정리해 드릴게요."

function lastParagraphs(answer: string, count: number) {
  return answer
    .trim()
    .split(/\n{2,}/)
    .slice(-count)
    .map((paragraph) => paragraph.replace(/[^.\n]*상담할 때[^\n]*/g, ""))
    .join("\n")
}

function pickSalesSlot(input: FollowUpInput) {
  const text = input.question.toLowerCase()
  const order =
    input.category === "hardware"
      ? ["rooms", "size", "timing"]
      : /zoom|줌|비교|차이|다른\s*(?:점|회사|업체)|vs/.test(text)
        ? ["current-tool", "size", "timing"]
        : /도입|시작|체험|데모|쇼룸/.test(text)
          ? ["size", "timing", "mode"]
          : ["size", "mode", "timing"]
  for (const id of order) {
    const slot = SALES_SLOTS.find((candidate) => candidate.id === id)
    if (!slot) continue
    if (slot.present.test(text)) continue
    if (slot.answerAsks.test(input.answer)) continue
    return slot.line
  }
  return null
}

// 영업 의도로 분류되지 않은 질문은 구매·도입 신호가 있을 때만 영업 상담으로 본다
// ("칠판 반사 방지 돼요?", "시험 시작 버튼이 비활성화돼요"에 교실 수나 인원을 묻지 않는다).
const PURCHASE_SIGNAL_RE =
  /도입|구매|견적|가격|요금|비용|체험|데모|상담|들이|살까|사려|살\s*거|추천|쇼룸|몇\s*대|여러\s*대|싸게|할인|대수/

function isSalesConversation(input: FollowUpInput) {
  if (input.handoffIntent !== "demo") return false
  const text = input.question.toLowerCase()
  if (SUPPORT_SIGNAL_RE.test(text)) return false
  if (SALES_INTENTS.has(input.intent)) return true
  return SALES_CATEGORIES.has(input.category) && PURCHASE_SIGNAL_RE.test(text)
}

// 이 레이어가 붙이는 문장들. 스트리밍 경로처럼 두 번 거쳐도 질문이 하나만 남게, 이미 붙었으면 더 붙이지 않는다.
const OWN_LINES = [
  ...INTERPRETATIONS.map((interpretation) => interpretation.line),
  ...SALES_SLOTS.map((slot) => slot.line),
  DEVICE_LINE,
]

export function buildFollowUp(input: FollowUpInput): string | null {
  const { tone } = input
  if (tone.angry || tone.repeated || tone.english) return null
  if (input.answerMode === "clarifying_question" || input.answerMode === "fallback") return null
  if (input.intent === "self_knowledge") return null
  if (OWN_LINES.some((line) => input.answer.includes(line))) return null
  if (input.topicFollowUp && input.answer.includes(input.topicFollowUp)) return null
  if (ALREADY_ASKS_RE.test(lastParagraphs(input.answer, 2))) return null

  // 1) 오해 막기: 어떻게 이해했는지 밝힌다. 그 문장이 이미 되묻는 꼴이면 여기서 끝낸다.
  const interpretation = INTERPRETATIONS.find(
    (candidate) => candidate.pattern.test(input.question) && (!candidate.when || candidate.when(input))
  )
  if (interpretation?.asks) return interpretation.line
  const question = pickQuestion(input)
  if (interpretation) return question ? `${interpretation.line} ${question}` : interpretation.line
  return question
}

function pickQuestion(input: FollowUpInput): string | null {
  // 2) 정보가 부족할 때
  if (input.topicFollowUp) return input.topicFollowUp
  const troubleshooting = input.category === "troubleshooting" || input.handoffIntent === "support"
  if (troubleshooting && !DEVICE_RE.test(input.question) && DEVICE_SPLIT_ANSWER_RE.test(input.answer)) {
    return DEVICE_LINE
  }

  // 3) 영업 상담 이어 가기
  if (input.allowSalesFollowUp !== false && isSalesConversation(input)) return pickSalesSlot(input)
  return null
}

/** 답 끝에 확인 질문을 붙인다. 이미 같은 질문이 있으면 그대로 둔다(여러 번 불러도 결과가 같다). */
export function appendFollowUp(answer: string, followUp: string | null) {
  if (!followUp || answer.includes(followUp)) return answer
  return `${answer.trimEnd()}\n\n${followUp}`
}
