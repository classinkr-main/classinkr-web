import type {
  ChannelConversationMessage,
  ChannelConversationRecord,
} from "@/lib/repositories/channel-conversations"

export type ChannelRootCauseState = "unresolved" | "suspected" | "confirmed"
export type ChannelRootCauseOutcomeStatus =
  | "unknown"
  | "solution_provided"
  | "customer_confirmed_resolved"
  | "still_unresolved"

export interface ChannelRootCauseCandidate {
  candidateKey: string
  ruleId: string
  conversationId: string
  symptom: string
  actualCause: string | null
  causeState: ChannelRootCauseState
  outcomeStatus: ChannelRootCauseOutcomeStatus
  diagnosticQuestions: string[]
  resolution: string | null
  evidenceMessageIds: string[]
  suggestedTags: string[]
  hasVisualEvidenceMention: boolean
  occurredAt: string | null
}

export interface DeriveChannelRootCauseOptions {
  since?: string | Date
  limit?: number
}

interface RootCauseRule {
  id: string
  label: string
  symptomPattern: RegExp
  diagnosticQuestions: string[]
  suggestedTags: string[]
}

interface ConversationIssueSegment {
  rule: RootCauseRule
  messages: ChannelConversationMessage[]
  symptomMessage: ChannelConversationMessage
}

const ROOT_CAUSE_RULES: RootCauseRule[] = [
  {
    id: "late_joiner_replay",
    label: "수업 후 가입 학생의 이전 수업 다시보기",
    symptomPattern: /다시보기|리플레이|녹화본|이전\s*수업|과거\s*수업|지난\s*(?:수업|강의)|1강|첫\s*수업/i,
    diagnosticQuestions: [
      "해당 학생이 문제가 된 수업 종료 후 코스에 가입했나요?",
      "관리자 대시보드의 ‘새로 참여한 학생은 이전 수업 데이터를 볼 수 있습니다’ 설정이 활성화되어 있나요?",
    ],
    suggestedTags: ["classroom", "replay", "late_joiner"],
  },
  {
    id: "recording_interruption",
    label: "수업 녹화 중단",
    symptomPattern: /녹화.{0,18}(?:중간|끝|종료|중단|끊|저장|안\s*돼|안돼)|(?:중간|갑자기).{0,12}녹화/i,
    diagnosticQuestions: [
      "교사 계정이 수업 중 퇴장하거나 다시 입장했나요?",
      "수업 중 접속 기기 또는 교사 계정이 변경됐나요?",
    ],
    suggestedTags: ["classroom", "recording", "troubleshooting"],
  },
  {
    id: "course_visibility",
    label: "코스·수업 노출 또는 초대",
    symptomPattern: /(?:코스|수업|강의).{0,18}(?:안\s*(?:보|떠|나)|못\s*(?:보|찾)|없)|초대.{0,12}(?:안|못)|가입.{0,12}(?:안|못)/i,
    diagnosticQuestions: [
      "학생이 코스 초대를 수락했나요?",
      "학생이 수업 시작 전에 코스에 추가됐나요?",
    ],
    suggestedTags: ["classroom", "enrollment", "visibility"],
  },
  {
    id: "sms_delivery",
    label: "문자 메시지 미수신",
    symptomPattern: /(?:sms|문자|메시지).{0,18}(?:안\s*와|안와|못\s*받|미수신|발송)|(?:안\s*와|안와).{0,12}(?:sms|문자)/i,
    diagnosticQuestions: [
      "동일한 번호로 다른 안내 문자는 정상 수신되나요?",
      "해당 기능이 현재 SMS 발송 전환 또는 점검 대상인지 확인했나요?",
    ],
    suggestedTags: ["notification", "sms", "troubleshooting"],
  },
  {
    id: "completed_course_move",
    label: "완료 수업 이동 제한",
    symptomPattern: /(?:완료|종료).{0,18}(?:수업|강의).{0,24}(?:옮기|이동)|(?:수업|강의).{0,18}(?:다른\s*코스|다른\s*과정).{0,12}(?:옮기|이동)/i,
    diagnosticQuestions: [
      "이미 완료된 수업인가요?",
      "같은 코스 안에서 이동하는지, 다른 코스로 이동하는지 확인했나요?",
    ],
    suggestedTags: ["classroom", "course_move", "limitation"],
  },
  {
    id: "homework_rendering",
    label: "숙제·과제 화면 표시 문제",
    symptomPattern: /(?:숙제|과제).{0,18}(?:깨져|안\s*보|안보|오류|이상)|(?:아이폰|iphone|ios).{0,18}(?:숙제|과제)/i,
    diagnosticQuestions: [
      "사용 기기 모델과 OS 버전은 무엇인가요?",
      "ClassIn 앱을 최신 버전으로 업데이트한 뒤에도 동일한가요?",
    ],
    suggestedTags: ["classroom", "homework", "mobile", "troubleshooting"],
  },
  {
    id: "billing",
    label: "결제·청구 문제",
    symptomPattern: /결제|청구|환불|영수증|세금\s*계산서/i,
    diagnosticQuestions: [
      "결제 상태와 결제 시각을 확인했나요?",
      "오류 문구 또는 결제 수단의 승인·취소 상태를 확인했나요?",
    ],
    suggestedTags: ["billing", "support"],
  },
  {
    id: "login_access",
    label: "로그인·계정 접근 문제",
    symptomPattern: /로그인|비밀번호|인증\s*번호|계정.{0,12}(?:잠김|접근|오류)/i,
    diagnosticQuestions: [
      "같은 계정으로 다른 기기에서는 로그인할 수 있나요?",
      "계정 유형과 로그인 방식이 기존과 동일한가요?",
    ],
    suggestedTags: ["account", "login", "troubleshooting"],
  },
  {
    id: "general_issue",
    label: "기타 기능 문제",
    symptomPattern: /안\s*(?:돼|되|떠|뜬|보|나|와)|못\s*(?:봐|보|해|하|받)|오류|문제|이상|끊|깨져|왜|어떻게/i,
    diagnosticQuestions: [
      "문제가 시작되기 직전에 계정·기기·설정에서 변경한 내용이 있나요?",
      "같은 계정으로 다른 기기에서도 동일하게 재현되나요?",
    ],
    suggestedTags: ["troubleshooting", "needs_triage"],
  },
]

const NOISE_PATTERN = /^(?:안녕하세요|안녕|네+|넵+|감사합니다|감사해요|고맙습니다|확인했습니다|확인했어요)[.!?\s]*$/i
const CUSTOMER_POSITIVE_OUTCOME_PATTERN =
  /(?:이제|지금은|현재는)?.{0,10}(?:잘\s*(?:돼|되|보|떠|나|와)|정상(?:적으로)?\s*(?:돼|되|보|작동)|해결(?:됐|되었|되었습니다|됐어요)|확인(?:됐|되었|됩니다)|볼\s*수\s*있(?:어요|습니다))/i
const CUSTOMER_NEGATIVE_OUTCOME_PATTERN =
  /(?:아직|여전히|계속|그대로).{0,16}(?:안\s*(?:돼|되|떠|보|나|와)|못\s*(?:봐|보|해|받)|오류|문제)|(?:안\s*됩니다|안돼요|안\s*돼요|못\s*봐요|못\s*봅니다).{0,10}(?:여전히|계속)?/i
const AGENT_DIAGNOSTIC_PATTERN =
  /\?|인가요|했나요|되나요|맞나요|여부|확인해\s*주|알려\s*주|어떤\s*(?:기기|계정|버전)|언제\s*(?:가입|발생)/i
const AGENT_EXPLICIT_CAUSE_PATTERN =
  /확인\s*결과|원인(?:은|이|으로)|(?:때문|문제였|문제입니다|오류입니다)|비활성화(?:되어|돼)|권한이\s*없|수업\s*후.{0,18}가입|가입.{0,18}수업\s*후/i
const AGENT_SUSPECTED_CAUSE_PATTERN =
  /가능성|추정|보입니다|같습니다|일\s*수\s*있|확인(?:할)?\s*필요|의심/i
const CUSTOMER_CAUSE_HYPOTHESIS_PATTERN =
  /(?:때문|문제(?:였|인)|라서|여서|해서|설정|권한|수업\s*후.{0,18}가입|가입.{0,18}수업\s*후)/i
const AGENT_CONFIRMATION_PATTERN =
  /^(?:네+|넵+|예+)[,.!\s]*(?:맞습니다|맞아요|그렇습니다|그렇습니다만)?[.!\s]*$|^(?:맞습니다|맞아요|그렇습니다)[.!\s]*$/i
const AGENT_RESOLUTION_PATTERN =
  /(?:설정|활성화|비활성화|재입장|다시\s*입장|재가입|탈퇴|삭제|추가|업데이트|재설치|로그아웃|로그인|변경|전환|이동|처리|초대|수락|확인해\s*주|진행해\s*주|시도해\s*주)/i
const AGENT_RESOLUTION_DIRECTIVE_PATTERN =
  /(?:해\s*주|해주세요|하세요|하십시오|해\s*보|활성화(?:하|해)|비활성화(?:하|해)|재입장(?:하|해)|다시\s*입장(?:하|해)|재가입(?:하|해)|탈퇴(?:하|해)|삭제(?:하|해)|추가(?:하|해)|업데이트(?:하|해)|재설치(?:하|해)|로그아웃(?:하|해)|로그인(?:하|해)|변경(?:하|해)|전환(?:하|해)|이동(?:하|해)|처리(?:했|됐|해)|적용(?:했|됐|해)|완료(?:했|됐))/i
const VISUAL_EVIDENCE_PATTERN =
  /사진|이미지|스크린\s*샷|스크린샷|캡처|첨부|첫\s*사진|보내드린\s*(?:화면|영상)|화면\s*녹화/i
const EXPLICIT_NEW_ISSUE_PATTERN = /^(?:그리고|추가로|또(?:한)?|별개로|다른\s*문의)/i

export function redactChannelTalkCaseText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{5}\b/g, "[business_number]")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[payment_number]")
    .replace(/\b\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/(비밀번호|패스워드|password)\s*[:：]?\s*\S+/gi, "$1 [redacted]")
    .replace(/\s+/g, " ")
    .trim()
}

function compact(value: string) {
  return redactChannelTalkCaseText(value).slice(0, 500)
}

function safeCandidateKeyPart(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || fallback
}

function findRule(text: string) {
  return ROOT_CAUSE_RULES.find((rule) => rule.symptomPattern.test(text)) ?? null
}

function isPotentialSymptom(message: ChannelConversationMessage) {
  if (message.author !== "customer") return false
  const text = compact(message.text)
  if (!text || NOISE_PATTERN.test(text) || CUSTOMER_POSITIVE_OUTCOME_PATTERN.test(text)) return false
  return findRule(text) !== null
}

function splitIntoIssueSegments(
  transcript: ChannelConversationMessage[]
): ConversationIssueSegment[] {
  const segments: ConversationIssueSegment[] = []
  let current: ConversationIssueSegment | null = null

  for (const message of transcript) {
    if (isPotentialSymptom(message)) {
      const text = compact(message.text)
      const rule = findRule(text)
      if (!rule) continue
      const shouldStartNew =
        !current ||
        (rule.id !== current.rule.id && rule.id !== "general_issue") ||
        (EXPLICIT_NEW_ISSUE_PATTERN.test(text) && current.messages.length > 1)

      if (shouldStartNew) {
        current = { rule, messages: [message], symptomMessage: message }
        segments.push(current)
        continue
      }
    }

    if (current) current.messages.push(message)
  }

  return segments
}

function uniqueStrings(values: string[], limit = Number.POSITIVE_INFINITY) {
  return [...new Set(values.filter(Boolean))].slice(0, limit)
}

function findCause(segment: ConversationIssueSegment): {
  actualCause: string | null
  causeState: ChannelRootCauseState
  evidence: ChannelConversationMessage[]
} {
  for (let index = 0; index < segment.messages.length; index += 1) {
    const message = segment.messages[index]
    const text = compact(message.text)

    if (message.author === "agent" && AGENT_EXPLICIT_CAUSE_PATTERN.test(text)) {
      return { actualCause: text, causeState: "confirmed", evidence: [message] }
    }

    if (message.author === "customer" && CUSTOMER_CAUSE_HYPOTHESIS_PATTERN.test(text)) {
      const confirmation = segment.messages
        .slice(index + 1, index + 3)
        .find(
          (candidate) =>
            candidate.author === "agent" &&
            AGENT_CONFIRMATION_PATTERN.test(compact(candidate.text))
        )
      if (confirmation) {
        return {
          actualCause: text,
          causeState: "confirmed",
          evidence: [message, confirmation],
        }
      }
    }
  }

  const suspected = segment.messages.find(
    (message) =>
      message.author === "agent" && AGENT_SUSPECTED_CAUSE_PATTERN.test(compact(message.text))
  )
  if (suspected) {
    return {
      actualCause: compact(suspected.text),
      causeState: "suspected",
      evidence: [suspected],
    }
  }

  return { actualCause: null, causeState: "unresolved", evidence: [] }
}

function findDiagnosticQuestions(segment: ConversationIssueSegment) {
  const observed = segment.messages
    .filter(
      (message) =>
        message.author === "agent" && AGENT_DIAGNOSTIC_PATTERN.test(compact(message.text))
    )
    .map((message) => compact(message.text))

  return uniqueStrings([...observed, ...segment.rule.diagnosticQuestions], 4)
}

function findResolution(segment: ConversationIssueSegment) {
  const messages = segment.messages.filter(
    (message) => {
      if (message.author !== "agent") return false
      const text = compact(message.text)
      return (
        AGENT_RESOLUTION_PATTERN.test(text) &&
        AGENT_RESOLUTION_DIRECTIVE_PATTERN.test(text) &&
        !AGENT_SUSPECTED_CAUSE_PATTERN.test(text) &&
        !AGENT_DIAGNOSTIC_PATTERN.test(text)
      )
    }
  )
  const text = uniqueStrings(messages.map((message) => compact(message.text)), 3).join(" ")
  return { resolution: text || null, evidence: messages.slice(0, 3) }
}

function findOutcome(
  segment: ConversationIssueSegment,
  resolutionEvidence: ChannelConversationMessage[]
): { status: ChannelRootCauseOutcomeStatus; evidence: ChannelConversationMessage[] } {
  const resolutionAt = resolutionEvidence.at(-1)?.at
  const customerMessages = segment.messages.filter((message) => message.author === "customer")
  const afterResolution = resolutionAt
    ? customerMessages.filter((message) => !message.at || message.at >= resolutionAt)
    : customerMessages

  const resolved = afterResolution.find((message) =>
    CUSTOMER_POSITIVE_OUTCOME_PATTERN.test(compact(message.text))
  )
  if (resolved) return { status: "customer_confirmed_resolved", evidence: [resolved] }

  const unresolved = afterResolution.find((message) =>
    CUSTOMER_NEGATIVE_OUTCOME_PATTERN.test(compact(message.text))
  )
  if (unresolved) return { status: "still_unresolved", evidence: [unresolved] }

  if (resolutionEvidence.length > 0) {
    return { status: "solution_provided", evidence: [] }
  }
  return { status: "unknown", evidence: [] }
}

export function deriveChannelRootCauseCandidatesForConversation(
  record: ChannelConversationRecord
): ChannelRootCauseCandidate[] {
  return splitIntoIssueSegments(record.transcript ?? []).map((segment) => {
    const cause = findCause(segment)
    const resolution = findResolution(segment)
    const outcome = findOutcome(segment, resolution.evidence)
    const evidenceMessageIds = uniqueStrings([
      segment.symptomMessage.id,
      ...cause.evidence.map((message) => message.id),
      ...resolution.evidence.map((message) => message.id),
      ...outcome.evidence.map((message) => message.id),
    ])
    const visualMention = segment.messages.some((message) =>
      VISUAL_EVIDENCE_PATTERN.test(compact(message.text))
    )

    return {
      // conversationId 는 별도 저장 키다. candidateKey 는 repo 계약에 맞춰 소문자
      // [a-z0-9:_-]와 120자 이내로 제한한다.
      candidateKey: `${segment.rule.id}:${safeCandidateKeyPart(
        segment.symptomMessage.id,
        "message"
      )}`.slice(0, 120),
      ruleId: segment.rule.id,
      conversationId: record.id,
      symptom: compact(segment.symptomMessage.text),
      actualCause: cause.actualCause,
      causeState: cause.causeState,
      outcomeStatus: outcome.status,
      diagnosticQuestions: findDiagnosticQuestions(segment),
      resolution: resolution.resolution,
      evidenceMessageIds,
      suggestedTags: uniqueStrings([
        "channel_talk_root_cause",
        ...segment.rule.suggestedTags,
        cause.causeState,
      ]),
      hasVisualEvidenceMention: visualMention,
      occurredAt: segment.symptomMessage.at || record.firstAskedAt || record.lastMessageAt || null,
    }
  })
}

export function deriveChannelRootCauseCandidates(
  records: ChannelConversationRecord[],
  options: DeriveChannelRootCauseOptions = {}
): ChannelRootCauseCandidate[] {
  const sinceMs = options.since ? new Date(options.since).getTime() : null
  const limit = Number.isFinite(options.limit)
    ? Math.max(0, Math.trunc(options.limit ?? 0))
    : Number.POSITIVE_INFINITY

  return records
    .flatMap(deriveChannelRootCauseCandidatesForConversation)
    .filter((candidate) => {
      if (sinceMs === null || !Number.isFinite(sinceMs)) return true
      const occurredMs = candidate.occurredAt ? new Date(candidate.occurredAt).getTime() : Number.NaN
      return Number.isFinite(occurredMs) && occurredMs >= sinceMs
    })
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))
    .slice(0, limit)
}
