/**
 * 대화 라벨 스키마와 정규화 — 순수 모듈(단위 테스트 대상).
 * 스키마는 「클라우드 개발 초안」 페이지의 라벨 스키마를 따른다. 화면 요구(학원/학교/강사)에 맞춰
 * segment 는 academy(학원)·school(학교)·tutor(강사)를 중심으로 둔다.
 */
export const LABEL_INTENTS = [
  "comparison",
  "pricing",
  "price_objection",
  "billing_scope",
  "troubleshooting",
  "consultation",
  "demo_request",
  "product_configuration",
  "usage_help",
  "event",
  "other",
] as const
export const LABEL_SEGMENTS = ["academy", "school", "tutor", "enterprise", "parent", "unknown"] as const
export const LABEL_STAGES = ["aware", "consider", "evaluate", "ready", "existing_customer", "unknown"] as const
export const LABEL_TEMPERATURES = ["hot", "warm", "cold"] as const
export const LABEL_HANDOFFS = ["demo", "support", "none"] as const

export type LabelIntent = (typeof LABEL_INTENTS)[number]
export type LabelSegment = (typeof LABEL_SEGMENTS)[number]
export type LabelStage = (typeof LABEL_STAGES)[number]
export type LabelTemperature = (typeof LABEL_TEMPERATURES)[number]
export type LabelHandoff = (typeof LABEL_HANDOFFS)[number]

export interface ChatbotSessionLabel {
  intent: LabelIntent
  segment: LabelSegment
  stage: LabelStage
  temperature: LabelTemperature
  handoff: LabelHandoff
  confidence: number
  rationale: string
}

/** 한국어 표시명 — 어드민·보고용 */
export const SEGMENT_LABEL_KO: Record<LabelSegment, string> = {
  academy: "학원",
  school: "학교",
  tutor: "강사",
  enterprise: "기업",
  parent: "학부모",
  unknown: "미상",
}

const SEGMENT_ALIASES: Record<string, LabelSegment> = {
  학원: "academy",
  학교: "school",
  강사: "tutor",
  개인강사: "tutor",
  과외: "tutor",
  individual_tutor: "tutor",
  teacher: "tutor",
  기업: "enterprise",
  학부모: "parent",
}
const TEMPERATURE_ALIASES: Record<string, LabelTemperature> = { cool: "cold", neutral: "warm", lukewarm: "warm" }
const STAGE_ALIASES: Record<string, LabelStage> = { awareness: "aware", consideration: "consider", evaluation: "evaluate", decision: "ready", customer: "existing_customer" }

function pick<T extends string>(value: unknown, allowed: readonly T[], aliases: Record<string, T>, fallback: T): T {
  if (typeof value !== "string") return fallback
  const v = value.trim().toLowerCase()
  if ((allowed as readonly string[]).includes(v)) return v as T
  return aliases[v] ?? aliases[value.trim()] ?? fallback
}

function confidenceOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(1, Math.max(0, value))
  if (typeof value === "string") {
    const v = value.trim().toLowerCase()
    if (v === "high") return 0.85
    if (v === "medium") return 0.6
    if (v === "low") return 0.35
    const n = Number(v)
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n))
  }
  return 0.5
}

/** 전화번호·이메일 같은 개인정보를 근거 문장에서 지운다(라벨은 내부용이지만 PII 는 남기지 않는다). */
export function scrubRationale(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\b0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, "[연락처]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[이메일]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

/** 모델 출력(JSON 문자열 또는 코드펜스 포함) → 정규화된 라벨. 파싱 실패면 null. */
export function parseChatbotSessionLabel(raw: string): ChatbotSessionLabel | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(match[0]) as Record<string, unknown>
  } catch {
    return null
  }
  return {
    intent: pick(obj.intent, LABEL_INTENTS, {}, "other"),
    segment: pick(obj.segment, LABEL_SEGMENTS, SEGMENT_ALIASES, "unknown"),
    stage: pick(obj.stage ?? obj.purchase_stage, LABEL_STAGES, STAGE_ALIASES, "unknown"),
    temperature: pick(obj.temperature, LABEL_TEMPERATURES, TEMPERATURE_ALIASES, "warm"),
    handoff: pick(obj.handoff, LABEL_HANDOFFS, {}, "none"),
    confidence: confidenceOf(obj.confidence),
    rationale: scrubRationale(obj.rationale),
  }
}

const TEMPERATURE_RANK: Record<LabelTemperature, number> = { cold: 0, warm: 1, hot: 2 }

/** 세션 최고 온도 유지 — 이전 라벨이 hot 이면 이번 턴이 warm 이어도 hot 으로 남긴다. */
export function maxTemperature(a: LabelTemperature | null | undefined, b: LabelTemperature): LabelTemperature {
  if (!a) return b
  return TEMPERATURE_RANK[a] >= TEMPERATURE_RANK[b] ? a : b
}

export const LABELER_SYSTEM_PROMPT = [
  "너는 ClassIn Korea 웹사이트 챗봇 대화를 내부 분석용으로 분류하는 라벨러다. JSON 한 개만 출력한다. 설명, 코드펜스 없이.",
  `필드: intent(${LABEL_INTENTS.join("|")}), segment(${LABEL_SEGMENTS.join("|")}), stage(${LABEL_STAGES.join("|")}), temperature(${LABEL_TEMPERATURES.join("|")}), handoff(${LABEL_HANDOFFS.join("|")}), confidence(0~1 숫자), rationale(한 줄, 개인정보 금지).`,
  "intent: 가장 최근 핵심 질문 하나.",
  "segment: 사용자가 직접 밝힌 기관 유형만. 학원=academy, 학교=school, 1인·개인 강사·과외=tutor. '학원비' 같은 단어만으로 추정하지 않는다. 밝히지 않았으면 unknown.",
  "stage: existing_customer 는 이미 쓰고 있다고 밝혔을 때만. 수업 중 장애 문의만으로 existing_customer 로 보지 않는다. 근거가 없으면 unknown.",
  "temperature: hot=상담·데모를 직접 요청하거나 연락처를 줌, warm=구체적 검토·비교·요금 질문, cold=막연한 질문·가격 거부감·지원 문의.",
  "handoff: 사용자가 상담·데모를 직접 요청했을 때만 demo. 봇이 제안한 것은 demo 가 아니다. 장애·사용 문의는 support. 그 외 none.",
  "confidence: 단서가 명확하면 0.8 이상, 추론이면 0.6 이하.",
].join("\n")
