// 상담 연결 카드가 쓰는 순수 함수: 문의폼·채널톡에 넘길 상담 요약(draft)과 채널톡 프로필.
//
// 구간(CX-03): 요약과 프로필은 대화 전체가 아니라 '카드를 띄운 답까지'로 만든다. 뒤에 오는 턴은 넣지 않으므로
// 다음 질문이 와도 앞 카드의 요약이 바뀌지 않는다(카드가 생길 때 고정). 예전에는 목록 전체의 마지막 질문을 써서
// '카메라가 안 켜져요 → 해 봤는데 또 안 돼요 → 상담원 연결해 주세요' 뒤 두 카드 모두 '질문: 상담원 연결해 주세요'였다.
//
// 가림(사람 결정 6의 기본안): 고객이 대화에 적은 연락처(전화·이메일·카드·사업자번호)와 이름은 요약과 채널톡 프로필에서
// 가린다. 연락처는 문의폼 칸으로 받는다. 끌 때는 HANDOFF_REDACT_CUSTOMER_PII 하나만 바꾼다.
import type { ChannelTalkProfile } from "@/lib/channel-talk"
import { redactPii } from "@/lib/chatbot/pii"
import { WIDGET_HANDOFF_CHIP } from "@/lib/chatbot/widget-turn"
import type { ChatMessage } from "@/components/ui/chatbot/types"

export const HANDOFF_REDACT_CUSTOMER_PII = true

const HANDOFF_TRANSCRIPT_LIMIT = 6
const HANDOFF_TRANSCRIPT_ITEM_MAX = 300
const HANDOFF_TRANSCRIPT_MAX = 1500
const HANDOFF_PROFILE_VALUE_MAX = 300
const EARLIER_QUESTION_LIMIT = 3
const QUESTION_LINE_MAX = 200
const ANSWER_SUMMARY_MAX = 260

// redactPii 의 자리표시를 요약에서 읽기 쉬운 한국어로 바꾼다. 저장·서버 규칙(redactPii)은 그대로 둔다.
const PLACEHOLDER_LABELS: Record<string, string> = {
    "[email]": "[이메일]",
    "[phone]": "[전화번호]",
    "[payment_number]": "[카드번호]",
    "[business_number]": "[사업자번호]",
}
const NAME_PLACEHOLDER = "[이름]"

/*
 * 이름 가림 — 문장 속 이름을 모두 찾을 수는 없어, 스스로 밝히는 꼴에서만 가린다(오탐을 줄이려고 좁게 잡는다).
 *  - '이름은/성함은 홍길동(입니다)': 이름·성함 뒤
 *  - '저는 김민준입니다': 자기소개 + 서술어
 *  - '학생 김민준 계정': 역할어 + 세 글자 이름 + 계정·아이디·호칭
 *  - '김민준님'·'김민준 씨': 세 글자 이름 + 호칭
 * 이름은 흔한 성으로 시작하는 두세 글자이고, 끝 글자가 조사(이·가·은·는·을·를…)면 이름으로 보지 않는다.
 * lookbehind 는 옛 iOS Safari 에서 정규식 자체가 깨져 쓰지 않는다.
 */
const SURNAMES =
    "김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국"
const NAME_TAIL = "(?:(?![이가은는을를의도만와과로])[가-힣])"
const NAME_2_3 = `[${SURNAMES}][가-힣]${NAME_TAIL}?`
const NAME_3 = `[${SURNAMES}][가-힣]${NAME_TAIL}`
const COPULA = "(?:입니다|이에요|예요|이고요|이고|이며|이요|라고|이라고|님|씨)"
// 이름처럼 보이는 역할·흔한 낱말. 이 낱말이면 가리지 않는다.
const NAME_STOPWORDS = new Set([
    "원장", "강사", "선생", "교사", "학생", "담당", "실장", "대표", "직원", "회원", "정회원", "관리자",
    "고객", "고객님", "상담", "상담원", "부원장", "학부모", "처음", "전부", "정말", "진짜", "지금", "오늘",
    "강의", "강의실", "수업", "문의", "이번", "이거", "정보", "전체", "한번", "한명", "우리",
    "신청자", "보호자", "사용자", "이용자", "작성자", "참가자", "선생님", "원장님",
])

const NAME_PATTERNS: RegExp[] = [
    new RegExp(`((?:이름|성함|본명)\\s*(?:은|는|이|:)\\s*)(${NAME_2_3})(?=\\s*${COPULA}|\\s*[,.!?]|\\s*$)`, "g"),
    new RegExp(`((?:저는|제가|전)\\s*)(${NAME_2_3})(?=\\s*(?:입니다|이에요|예요|이고요|이고|이며|라고|이라고))`, "g"),
    new RegExp(
        `((?:학생|학부모|원장|원장님|선생님|강사|아이|자녀|아들|딸|담당자)\\s+)(${NAME_3})(?=\\s*(?:학생|님|씨|계정|아이디|어머니|아버지|입니다|이에요|예요)|\\s*[,.!?]|\\s*$)`,
        "g",
    ),
    new RegExp(`(^|[\\s(])(${NAME_3})(?=\\s*(?:님|씨))`, "g"),
]

/** 고객이 쓴 글에서 스스로 밝힌 이름을 [이름]으로 가린다. */
export function redactSelfIdentifiedNames(value: string) {
    let next = value
    for (const pattern of NAME_PATTERNS) {
        next = next.replace(pattern, (whole, lead: string, name: string) =>
            NAME_STOPWORDS.has(name) ? whole : `${lead}${NAME_PLACEHOLDER}`
        )
    }
    return next
}

/** redactPii 의 영어 자리표시를 한국어 표기로 바꾼다(복원한 말풍선·요약이 같은 표기를 쓰게). */
export function localizeRedactionPlaceholders(value: string) {
    let next = value
    for (const [token, label] of Object.entries(PLACEHOLDER_LABELS)) next = next.split(token).join(label)
    return next
}

/** 요약·프로필에 싣는 고객 글. 연락처(redactPii)와 스스로 밝힌 이름을 가린다. */
export function redactHandoffText(value: string, redact = HANDOFF_REDACT_CUSTOMER_PII) {
    if (!redact) return value
    return redactSelfIdentifiedNames(localizeRedactionPlaceholders(redactPii(value)))
}

/** 요약에 가린 자리가 있는지 — 카드가 '연락처·이름은 가렸어요'를 보일지 정한다. */
export function hasRedactedPlaceholder(value: string) {
    return [...Object.values(PLACEHOLDER_LABELS), NAME_PLACEHOLDER].some((label) => value.includes(label))
}

/** 카드를 띄운 답(trigger)까지의 대화. trigger 가 목록에 없으면(드묾) 지금 목록 전체. */
export function selectConsultationSegment(messages: readonly ChatMessage[], triggerMessage: ChatMessage): ChatMessage[] {
    const index = messages.findIndex((message) => message.id === triggerMessage.id)
    const segment = index >= 0 ? messages.slice(0, index + 1) : [...messages, triggerMessage]
    // 환영 인사와 위젯이 붙인 오류 말풍선은 상담원에게 넘길 대화가 아니다.
    return segment.filter((message) => message.id !== "welcome" && !message.errorKind && message.content.trim())
}

function oneLine(value: string) {
    return value.replace(/\s+/g, " ").trim()
}

function clipText(value: string, max: number) {
    return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}

// 줄바꿈은 살리고(목록이 한 문단으로 뭉치지 않게) 줄 안의 공백과 빈 줄만 정리한다.
function tidyMultiline(value: string) {
    return value
        .split("\n")
        .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
        .filter(Boolean)
        .join("\n")
}

// 답 글의 마크다운 흔적(이미지·링크 주소·굵게·제목 기호)을 평문으로.
function plainAnswerText(value: string) {
    return value
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^\s*요약:\s*/i, "")
}

const FILLER_REPLY = /^(?:네|넵|넹|예|응|어|ㅇㅇ|ㅇㅋ|오케이|ok|okay|알겠어요|알겠습니다|알았어요|감사합니다|감사해요|고마워요|고맙습니다|좋아요|그래요|아니요|아뇨|아니에요|맞아요|ㅠ+|ㅜ+|ㅎ+|ㅋ+)$/i
// 상담 연결만 청하는 말(내용 없음)을 가려내려고 지우는 낱말들. 지우고 두 글자 이상 남으면 내용 있는 질문이다.
const HANDOFF_REQUEST_WORDS =
    /상담원|상담사|상담|담당자|사람|직원|매니저|연결|통화|얘기|이야기|대화|바꿔|불러|물어보기|물어볼래요|부탁|드려요|드립니다|합니다|해요|해주세요|해 주세요|주세요|줘요|줘|싶어요|싶습니다|하고|이랑|랑|에게|한테|으로|로|좀|바로|지금|빨리|그냥|님|요/g

/** 앞서 물은 내용에 넣을 만한 질문인지 — 맞장구·상담 연결만 청하는 말은 뺀다. */
export function isContentfulQuestion(value: string) {
    const compact = value.replace(/[\s.,!?~…'"·:;()\-]/g, "")
    if (compact.length < 2) return false
    if (FILLER_REPLY.test(compact)) return false
    if (compact === WIDGET_HANDOFF_CHIP.replace(/\s/g, "")) return false
    return compact.replace(HANDOFF_REQUEST_WORDS, "").length >= 2
}

// 상담원에게 쓸모 있는 답 — 실제로 안내한 답(direct_answer·doc_suggestion). 상담 연결 고정 문구(handoff)·되묻기·못 찾음은 아니다.
const SUBSTANTIVE_ANSWER_MODES = new Set(["direct_answer", "doc_suggestion"])

/**
 * '챗봇 확인 내용'에 실을 답. 카드를 띄운 답이 실제 안내면 그 답을, 상담 연결 고정 문구('네, 담당자 상담으로…
 * 아래 [실시간 상담 연결]을…')면 그 앞에서 챗봇이 실제로 안내한 가장 최근 답을 쓴다 — 상담원은 이미 해 본 것을 알고 시작한다.
 * 그런 답이 없으면 줄을 뺀다. answerMode 가 없는 답(위젯이 붙인 말풍선 등)은 카드를 띄운 답일 때만 쓴다.
 */
function selectAnswerForSummary(segment: readonly ChatMessage[], triggerMessage: ChatMessage) {
    if (!triggerMessage.answerMode || SUBSTANTIVE_ANSWER_MODES.has(triggerMessage.answerMode)) return triggerMessage
    return [...segment]
        .reverse()
        .find((message) => message.role === "assistant" && SUBSTANTIVE_ANSWER_MODES.has(message.answerMode ?? ""))
}

// 답 글이 카드 버튼을 부르는 이름('[실시간 상담 연결]'·'[도입 상담 남기기]')은 요약에서 '[상담 연결]'로 둔다 —
// 운영시간 밖에는 버튼 이름이 다르고, 상담원에게는 버튼 이름이 필요 없다.
function normalizeButtonMentions(value: string) {
    return value.replace(/\[(?:실시간 상담 연결|도입 상담 남기기)\]/g, "[상담 연결]")
}

/** 답 글이 부르는 카드 버튼 이름을 화면의 실제 버튼 이름으로 맞춘다(운영시간 밖에는 버튼 이름이 다르다). */
export function alignHandoffButtonMention(value: string, buttonLabel: string) {
    return value.replace(/\[(?:실시간 상담 연결|도입 상담 남기기)\]/g, `[${buttonLabel}]`)
}

interface ConsultationDraftOptions {
    redact?: boolean
}

export function buildConsultationDraft(
    messages: readonly ChatMessage[],
    triggerMessage: ChatMessage,
    options: ConsultationDraftOptions = {},
) {
    const redact = options.redact ?? HANDOFF_REDACT_CUSTOMER_PII
    const segment = selectConsultationSegment(messages, triggerMessage)
    const questions = segment.filter((message) => message.role === "user").map((message) => message.content)
    const lastQuestion = questions.at(-1)

    // '질문' 줄은 마지막 질문, '앞서 물은 내용'은 그 앞의 내용 있는 질문 최대 3개(오래된 것부터).
    const lastKey = lastQuestion ? oneLine(lastQuestion) : ""
    const seen = new Set<string>([lastKey])
    const earlier: string[] = []
    for (const question of questions.slice(0, -1).reverse()) {
        const key = oneLine(question)
        if (seen.has(key) || !isContentfulQuestion(key)) continue
        seen.add(key)
        earlier.unshift(key)
        if (earlier.length >= EARLIER_QUESTION_LIMIT) break
    }

    const intentLine =
        triggerMessage.handoffIntent === "support"
            ? "계정/결제/장비 상태 확인이 필요한 문의입니다."
            : "도입 방식과 운영 흐름 상담이 필요한 문의입니다."
    const summarySource = selectAnswerForSummary(segment, triggerMessage)
    // 가린 뒤 자른다 — 자르는 경계에 걸친 전화·이메일이 반쯤 남지 않게. 챗봇 답도 고객 글을 되읊을 수 있어 같이 가린다.
    const customer = (text: string) => redactHandoffText(text, redact)
    const answerSummary = summarySource
        ? clipText(customer(tidyMultiline(normalizeButtonMentions(plainAnswerText(summarySource.content)))), ANSWER_SUMMARY_MAX)
        : ""

    return [
        "Classin 상담 요청드립니다.",
        intentLine,
        lastQuestion ? `질문: ${clipText(customer(tidyMultiline(lastQuestion)), QUESTION_LINE_MAX)}` : null,
        earlier.length > 0
            ? ["앞서 물은 내용:", ...earlier.map((question) => `- ${clipText(customer(question), QUESTION_LINE_MAX)}`)].join("\n")
            : null,
        answerSummary ? `챗봇 확인 내용:\n${answerSummary}` : null,
    ].filter(Boolean).join("\n")
}

// 상담원 연결 시 카드를 띄운 답까지의 최근 대화록·인텐트를 채널톡 프로필로 넘긴다 — 상담원이 맥락을 갖고 시작.
export function buildHandoffProfile(
    messages: readonly ChatMessage[],
    triggerMessage: ChatMessage,
    sessionId?: string,
    options: ConsultationDraftOptions = {},
): ChannelTalkProfile {
    const redact = options.redact ?? HANDOFF_REDACT_CUSTOMER_PII
    const segment = selectConsultationSegment(messages, triggerMessage)
    const lastQuestion = [...segment].reverse().find((message) => message.role === "user")?.content
    const transcript = segment
        .slice(-HANDOFF_TRANSCRIPT_LIMIT)
        .map((message) => {
            const text = clipText(redactHandoffText(oneLine(message.content), redact), HANDOFF_TRANSCRIPT_ITEM_MAX)
            return message.role === "user" ? `고객: ${text}` : `챗봇: ${text}`
        })
        .join("\n")

    const profile: ChannelTalkProfile = {
        chatbotHandoff: true,
        chatbotIntent: triggerMessage.handoffIntent ?? "support",
    }
    if (lastQuestion) profile.lastQuestion = clipText(redactHandoffText(oneLine(lastQuestion), redact), HANDOFF_PROFILE_VALUE_MAX)
    if (transcript) profile.chatbotTranscript = transcript.slice(0, HANDOFF_TRANSCRIPT_MAX)
    if (sessionId) profile.chatbotSessionId = sessionId
    return profile
}
