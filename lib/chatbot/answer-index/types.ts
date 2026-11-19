/**
 * 공개 챗봇 '답 색인'(compiled answer index) 자료와 런타임 판정의 형.
 *
 * 자료는 data/answer-index/ 에 JSON 으로 두고, 이 파일이 그 스키마의 정본이다. 추출기·검사기(scripts/answer-index/*),
 * 자료 생성 단위(D1~D13)의 출력, 런타임 모듈(load·normalize·lexicon·score·checks·decide·respond)이 모두 이 형을 계약으로 쓴다.
 * 형을 바꾸면 scripts/answer-index/lib/verify-core.ts 의 스키마 검사(V-12)와 scripts/answer-index/README.md 를 함께 고친다.
 *
 * 문장은 글로 저장하지 않고 (단위 id, 문장 번호, 해시)로만 가리킨다. 해시는 hash.ts 의 sentenceHash 다.
 */

import type { ChatbotIntent, HandoffIntent } from "@/lib/chatbot/classification"

// ─── 영역 ────────────────────────────────────────────────────────────────

/** 카드·단위·정해 둔 답을 나누는 영역 12개. 자료 파일도 이 단위로 나눈다(cards/<area>.json). */
export const ANSWER_INDEX_AREAS = [
  "start",
  "account",
  "classroom",
  "course",
  "recording",
  "homework",
  "admin",
  "board",
  "pricing",
  "company",
  "trust",
  "support",
] as const

export type AnswerIndexArea = (typeof ANSWER_INDEX_AREAS)[number]

export const ANSWER_INDEX_AREA_LABELS: Record<AnswerIndexArea, string> = {
  start: "시작·설치·기기",
  account: "가입·계정·로그인",
  classroom: "교실 운영·도구",
  course: "코스·구성원·수업 만들기",
  recording: "녹화·다시보기·통계",
  homework: "과제·시험·LMS",
  admin: "기관 관리자",
  board: "전자칠판·하드웨어",
  pricing: "요금·계약·결제",
  company: "회사·도입·사례·비교",
  trust: "보안·개인정보·데이터",
  support: "문의·상담·장애 일반",
}

/** 파일럿 영역(§12.2). */
export const ANSWER_INDEX_PILOT_AREAS: readonly AnswerIndexArea[] = ["account", "classroom", "course", "pricing", "company"]

export function isAnswerIndexArea(value: unknown): value is AnswerIndexArea {
  return typeof value === "string" && (ANSWER_INDEX_AREAS as readonly string[]).includes(value)
}

// ─── 공개 문서 단위(units.json) ─────────────────────────────────────────

/** summary: 문서 요약(설명 + 챗봇 요약), section: 문서 절 하나, guide: 공개 화면 가이드(CS_FIGMA_GUIDES) 하나. */
export type UnitKind = "summary" | "section" | "guide"

/**
 * 문장 표시.
 * - caption: 화면 캡션·빨간 박스·"아래 화면처럼" 같은 화면 설명. 답 문장으로 쓰지 않는다.
 * - meta: "이 문서는…", "아래 순서대로 따라 하시면 됩니다" 같은 문서 자체 안내. 답 문장으로 쓰지 않는다.
 * - connective: 접속어·지시어로 시작해 앞 문장이 있어야 뜻이 통한다. 앞 문장과 함께만 쓴다.
 * - nav: 다른 문서를 보라는 안내(문서 링크 포함). 답 문장으로 쓰지 않는다.
 * - table: 표의 한 줄(칸을 " | "로 이음). 한 줄만 떼어 쓰면 머리줄 뜻이 빠질 수 있다.
 */
export type UnitSentenceFlag = "caption" | "meta" | "connective" | "nav" | "table"

export interface UnitSentence {
  /** 단위 안 문장 번호(0부터). */
  i: number
  text: string
  /** sentenceHash(text). */
  hash: string
  flags: UnitSentenceFlag[]
}

export interface AnswerIndexUnit {
  /** doc:<문서 경로>#summary · doc:<문서 경로>#<절 번호(0부터)> · guide:<가이드 slug> */
  unitId: string
  kind: UnitKind
  /** 공개 문서 경로(/docs/<category>/<slug>). 가이드는 가이드 문서 경로. */
  path: string
  docTitle: string
  /** 절 제목. 요약은 "요약", 가이드는 "사용 순서 안내". */
  heading: string
  /** doc.sections 의 위치(0부터). 요약·가이드는 null. */
  sectionIndex: number | null
  area: AnswerIndexArea
  docCategory: string
  docSlug: string
  /** 가이드 단위의 CS_FIGMA_GUIDES slug. */
  guideSlug?: string
  sentences: UnitSentence[]
}

export interface AnswerIndexUnitsFile {
  /** 내용 해시로 만든 판 이름(units-<sha12>). 시각을 쓰지 않아 같은 입력이면 같은 값이다. */
  version: string
  counts: {
    units: number
    sentences: number
    byKind: Record<UnitKind, number>
    byArea: Record<AnswerIndexArea, { units: number; sentences: number }>
  }
  units: AnswerIndexUnit[]
}

// ─── 공개 페이지 사실(site-facts.json) ──────────────────────────────────

export interface SiteFact {
  /** site:<저장소 경로>:<줄>. 같은 줄의 둘째 문장부터는 site:<경로>:<줄>#2, #3 … */
  id: string
  path: string
  line: number
  text: string
  hash: string
}

export type SiteFactsFile = SiteFact[]

// ─── 기존 정해 둔 답 목록(inventory.json, 점검 입력·런타임 아님) ──────

export type InventoryModule = "field" | "basics" | "symptom" | "svc" | "template" | "self" | "guide"

/** 평가셋·개발용 질문 중 그 답의 판별식에 걸리는 수. 숫자만 쓰고 질문 글은 쓰지 않는다. */
export interface InventoryHitCounts {
  firstContact: number
  fresh: number
  golden: number
  csSymptom: number
  persona: number
  /** 외부 개발용 묶음(인자로 받은 dev5·holdout1·371 등) 합계. 받지 않았으면 null. */
  dev: number | null
}

export interface InventoryFlags {
  /** 낡을 수 있는 사실: number·version·plan·address·period·price */
  perishable: string[]
  /** '공개 안내에 없다' 류 부재 주장 문장이 있음. */
  absenceClaim: boolean
  /** '약속하지 않는다·단정하지 않는다' 류 정책 문장이 있음. */
  noPromise: boolean
  /** V-3 규칙(식별 정보 요구·금액·할인/환불 약속)에 걸리는 표현. 카드로 옮기면 검사에 걸린다. */
  safety: string[]
}

export interface InventoryEntry {
  /** 옛 답 id. field:<id> · basics:<id> · symptom:<id> · svc:<이름> · template:<절 제목 또는 경로> · self:<key> · guide:<slug> */
  id: string
  module: InventoryModule
  /** 모듈 안 id(접두 없음). */
  sourceId: string
  /** 지금 관문(answer-gate)에 넘기는 출처 이름. 관문 대상이 아니면 null. */
  gateOriginal: string | null
  /** 관문을 거치지 않는 답(거절·잡담 공감 등). */
  gateExempt: boolean
  area: AnswerIndexArea
  /** 기존 분류 값(모듈이 쓰는 문자열 그대로). */
  category: string | null
  handoff: HandoffIntent | null
  docPath: string | null
  docHeading: string | null
  /** 기본 답 글(질문에 따라 바뀌는 부분은 기본 갈래). */
  text: string
  /** textHash(text). legacy 답을 그대로 쓰는 카드(curatedRef)의 textHash 와 대조한다. */
  textHash: string
  /** 질문에 따라 바뀌는 문단·갈래 글(기본 글에 없는 것만). */
  textAlternatives: string[]
  suggestedQuestions: string[]
  englishSummary: string | null
  /** 걸리는 판별식 요약. */
  match: {
    kind: "regex" | "function" | "condition" | "keywords" | "search-heading"
    /** 판별식 원문(공백 접음). */
    source: string | null
    /** 판별식 안의 정규식 원문. */
    regexes: string[]
  }
  /** 판별식에 걸리는 질문 수. 검색 결과에 따라 정해지는 답(template)은 null. */
  hits: InventoryHitCounts | null
  /** 모듈 안 순서대로 골랐을 때 이 답이 뽑히는 질문 수(모듈 첫 번째 맞음 기준). 셀 수 없으면 null. */
  wins: InventoryHitCounts | null
  flags: InventoryFlags
  /** 첫 40자가 같거나 글자 2-gram 자카드 0.8 이상인 다른 답 id. */
  nearDuplicates: string[]
  /** 답 글의 화면 이름([..]). 상담 버튼 이름은 뺀다. */
  screenNames: string[]
  /** 화면 이름 2개 이상을 함께 쓰는 다른 답 id(앞 50개). */
  screenNamePeers: string[]
  screenNamePeerCount: number
  /** 실패 기록(인자로 받은 경로)에서 가로채기 원인으로 이름이 나온 횟수. 받지 않았으면 null. */
  hijackMentions: number | null
  /** 정의가 있는 저장소 파일과 줄. */
  sourceFile: string
  sourceLine: number
  /** 증상 주제 답을 만들 수 없을 때(문서·절이 사라짐) 등 이상 표시. */
  problems: string[]
}

export interface InventoryEvalSetInfo {
  key: keyof Omit<InventoryHitCounts, "dev"> | "dev"
  name: string
  questions: number
  /** 파일 내용 sha256 앞 16자. 저장소 밖 묶음은 파일 이름과 해시만 남긴다. */
  sha: string
}

export interface AnswerIndexInventoryFile {
  version: string
  counts: {
    entries: number
    byModule: Record<InventoryModule, number>
    byArea: Record<AnswerIndexArea, number>
  }
  evalSets: InventoryEvalSetInfo[]
  failureLogs: { name: string; records: number; sha: string }[] | null
  entries: InventoryEntry[]
}

// ─── 답 카드(cards/<area>.json) ──────────────────────────────────────────

export type AnswerCardKind = "doc" | "howto" | "fixed" | "policy" | "gap" | "handoff"
export const ANSWER_CARD_KINDS: readonly AnswerCardKind[] = ["doc", "howto", "fixed", "policy", "gap", "handoff"]

export type AnswerCardTier = "head" | "standard"
export type AnswerCardStatus = "active" | "review" | "disabled"

/** 묻는 꼴. normalize.ts 의 detectAskType 이 같은 값을 쓴다. */
export type AskType =
  | "yesno"
  | "howto"
  | "where"
  | "quantity"
  | "cost"
  | "compare"
  | "definition"
  | "when"
  | "who"
  | "symptom"

export const ASK_TYPES: readonly AskType[] = [
  "yesno",
  "howto",
  "where",
  "quantity",
  "cost",
  "compare",
  "definition",
  "when",
  "who",
  "symptom",
]

/** 허용 목록 리드(§3.6). 문장은 respond.ts 가 정한다. */
export type AnswerLead = "yes_can" | "how_to" | "not_supported" | "none"
export const ANSWER_LEADS: readonly AnswerLead[] = ["yes_can", "how_to", "not_supported", "none"]

/** 단위 문장 가리킴. ids 와 hashes 는 같은 순서·같은 길이다. */
export interface SentenceRef {
  unit: string
  ids: number[]
  hashes: string[]
}

/** 단위 문장 하나 가리킴(리드 근거, 공백 카드 관련 문장). */
export interface SingleSentenceRef {
  unit: string
  i: number
  /** 있으면 V-1 이 대조한다. */
  hash?: string
}

export interface CardNegative {
  /** 이 카드와 낱말이 겹치지만 다른 답이 필요한 질문(자료 에이전트가 쓴 것). */
  q: string
  /** 그 질문이 가야 할 곳: 카드 id · gap:<area>/<slug> · none */
  route: string
}

export interface CardProvenance {
  /** 생성 단위 id(D1-17 등). */
  unit: string
  writer: string
  reviewer?: string
  at: string
  /** 이 카드가 대신하는 옛 답 id(field:…, basics:… 등). */
  legacyIds: string[]
}

/** D2 검수 기록. */
export interface CardReviewRecord {
  sampled: number
  yes: number
  partial: number
  no: number
  actions: string[]
}

export interface GapSearchLogEntry {
  query: string
  units: number
  site: number
  checked?: string
}

interface AnswerCardBase {
  id: string
  kind: AnswerCardKind
  tier: AnswerCardTier
  area: AnswerIndexArea
  /** 짧은 주제 이름. 공백 카드는 답 틀의 {topic} 에 들어간다(조사 없이). */
  topic: string
  asks?: AskType[]
  /** 사전 개념 id. 새 개념 후보는 NEW:<짧은 영문>. */
  concepts?: string[]
  anchors?: string[]
  covers?: string
  /** 가까운데 이 카드가 답하지 않는 것("… → 행선"). */
  notCovers?: string[]
  negatives?: CardNegative[]
  handoff?: HandoffIntent | null
  category?: string
  intent?: ChatbotIntent
  suggestedQuestions?: string[]
  status: AnswerCardStatus
  provenance?: CardProvenance
  review?: CardReviewRecord
  /** 점검 기록 위치(audit/<batch>.jsonl#<answerId>). */
  auditRef?: string
  /** 공개 페이지 사실(site-facts)에 기대는 카드. 결정 전까지 review(§14 결정 과제 3). */
  evidenceScope?: "docs" | "site"
}

export interface DocCardAnswer {
  lead?: AnswerLead
  leadBasis?: SingleSentenceRef
  sentences: SentenceRef[]
}

export interface DocAnswerCard extends AnswerCardBase {
  kind: "doc"
  answer: DocCardAnswer
  sources?: { path: string; heading: string }[]
}

export interface HowtoCardAnswer {
  /** 증상 주제 id(symptom-triage.ts). */
  symptomTopic?: string
  /** 공개 화면 가이드 slug(CS_FIGMA_GUIDES). */
  guide?: string
}

export interface HowtoAnswerCard extends AnswerCardBase {
  kind: "howto"
  answer: HowtoCardAnswer
}

export type CuratedModule = "field" | "basics" | "svc" | "self" | "template" | "symptom" | "guide"

/** 옛 정해 둔 답을 만드는 함수를 그대로 부르는 카드(KEEP). textHash 가 지금 옛 답 글 해시와 다르면 끈다. */
export interface CuratedRef {
  module: CuratedModule
  id: string
  textHash: string
}

export type FixedCardAnswer = { curatedRef: CuratedRef } | { text: string; textHash: string }

export interface FixedAnswerCard extends AnswerCardBase {
  kind: "fixed"
  answer: FixedCardAnswer
  policyGoverned?: boolean
}

export interface PolicyCardAnswer {
  text: string
  textHash: string
  /** 사람 결정 대기열 id(HQ-xx). */
  policyRef: string
}

export interface PolicyAnswerCard extends AnswerCardBase {
  kind: "policy"
  answer: PolicyCardAnswer
  policyGoverned?: boolean
}

export interface GapCardAnswer {
  template: "gap_default"
  handoff: HandoffIntent | null
  /** 검증된 관련 공개 문장. */
  related: SingleSentenceRef[]
}

export interface GapAnswerCard extends AnswerCardBase {
  kind: "gap"
  answer: GapCardAnswer
  /** 찾아본 기록(주제마다 3개 이상). */
  searchLog?: GapSearchLogEntry[]
}

export interface HandoffAnswerCard extends AnswerCardBase {
  kind: "handoff"
  answer: { handoffKind: HandoffIntent }
}

export type AnswerCard =
  | DocAnswerCard
  | HowtoAnswerCard
  | FixedAnswerCard
  | PolicyAnswerCard
  | GapAnswerCard
  | HandoffAnswerCard

/** 다른 문서 안내뿐이라 카드를 만들지 않은 단위(D1). 카드 파일 안에 카드와 함께 둔다. */
export interface NavMarker {
  unitId: string
  nav: true
  note?: string
}

export type CardFileEntry = AnswerCard | NavMarker

export function isNavMarker(entry: CardFileEntry): entry is NavMarker {
  return (entry as NavMarker).nav === true && !(entry as AnswerCard).id
}

// ─── 변형(variants/<area>.json) ──────────────────────────────────────────

export interface AnswerVariant {
  q: string
  /** 관점 키. */
  p: string
  /** A: 작성 변형(D1·D4·D5), B: 블라인드 변형(D7). */
  g: "A" | "B"
  /** 생성 모델 등급. */
  m: string
}

/** 카드 id → 변형 목록. */
export type VariantsFile = Record<string, AnswerVariant[]>

// ─── 질문 우주(universe/<shard>.json) ───────────────────────────────────

/** 카드 id · gap:<area>/<slug> · none · clarify · missing:<unitId> */
export type UniverseLabel = string

export interface UniverseItem {
  id: string
  q: string
  /** 관점 카드 id. */
  p: string
  m: string
  label: UniverseLabel | null
  conf: number | null
  labeler: string | null
  label2: UniverseLabel | null
}

export type UniverseFile = UniverseItem[]

// ─── 사전(lexicon.json, generic-words.json) ────────────────────────────

export type ConceptKind = "object" | "action" | "attribute" | "ask" | "modifier"

/**
 * 개념 형태. 공백을 뺀 길이 3글자 이하인 형태는 끝 경계 규칙 대상이라
 * { form, boundary: "both" } 로 적는다(V-6). 그 밖은 문자열로 적는다.
 */
export type LexiconForm = string | { form: string; boundary: "both" | "start" }

export interface LexiconAmbiguityRule {
  form: string
  /** 질문에 이 개념 가운데 하나가 있을 때만 이 형태를 이 개념으로 본다. */
  requiresAny?: string[]
  /** 질문에 이 개념이 있으면 이 형태를 이 개념으로 보지 않는다. */
  notWith?: string[]
}

export interface LexiconConcept {
  id: string
  kind: ConceptKind
  generic: boolean
  parents: string[]
  /** 문서에 나온 그대로의 형태. */
  doc: LexiconForm[]
  /** 방문자가 부르는 형태. */
  visitor: LexiconForm[]
  ambiguous: LexiconAmbiguityRule[]
}

export type LexiconFile = LexiconConcept[]

/** 뜻 없는 낱말(기능어·일반 서술어·수량·지시어). */
export interface GenericWordsFile {
  function: string[]
  predicate: string[]
  quantity: string[]
  demonstrative: string[]
}

// ─── 문서에 없는 개념(absent.json) ──────────────────────────────────────

export interface AbsentConcept {
  id: string
  /** 답 꼬리 문장에 들어갈 검증된 이름. */
  label: string
  forms: string[]
  area: AnswerIndexArea
  gapCard: string
  verified: {
    grep: string[]
    /** verify 가 다시 센다. */
    unitHits: number
    siteHits: number
    checkedAt: string
    checker: string
    /** unitHits·siteHits 가 0이 아닐 때 사람이 적는 '같은 뜻이 아님' 근거. */
    sameMeaningNote?: string
  }
}

export type AbsentFile = AbsentConcept[]

// ─── 옛 id 대응(legacy-alias.json) ──────────────────────────────────────

/** 옛 정해 둔 답 id(inventory 의 id) → 카드 id. DROP·LEGACY_ONLY 는 null. */
export type LegacyAliasFile = Record<string, string | null>

// ─── 답변 사항 점검(audit/<batch>.jsonl, audit/human-queue.json) ───────

export type AuditClaimVerdict =
  | "supported"
  | "contradicted"
  | "outdated"
  | "policy"
  | "unsupported"
  | "absence_claim_wrong"

export type AuditDisposition = "KEEP" | "FIX" | "MERGE" | "CONVERT" | "DROP" | "POLICY" | "LEGACY_ONLY"

export const AUDIT_DISPOSITIONS: readonly AuditDisposition[] = [
  "KEEP",
  "FIX",
  "MERGE",
  "CONVERT",
  "DROP",
  "POLICY",
  "LEGACY_ONLY",
]

export type AuditEvidence =
  | { unit: string; i: number; quote: string }
  | { site: string; quote: string }

export interface AuditClaim {
  n: number
  text: string
  verdict: AuditClaimVerdict
  evidence: AuditEvidence[]
  note?: string
}

export interface AuditIncompleteAspect {
  aspect: string
  evidence: AuditEvidence
  /** site-only: 공개 페이지에만 근거가 있음(§14 결정 과제 3). */
  judgeScope?: "docs" | "site-only"
}

export interface AuditFixChange {
  type: "add" | "remove" | "replace"
  /** 바뀐 주장 번호. 더하기는 null. */
  claim: number | null
  /** 근거 위치(unit id#i 또는 site id). 지우기는 null 일 수 있다. */
  basis: string | null
  added?: string
  removed?: string
}

export interface AuditRecord {
  answerId: string
  module: InventoryModule
  textHash: string
  category: string | null
  handoff: HandoffIntent | null
  hits?: Partial<InventoryHitCounts>
  claims: AuditClaim[]
  incompleteAspects: AuditIncompleteAspect[]
  disposition: AuditDisposition
  fix?: { text: string; textHash?: string; changes: AuditFixChange[] }
  /** MERGE 대상(옛 답 id 또는 카드 id). */
  mergeInto?: string
  policyTopics: string[]
  humanQueue?: string | null
  review?: { agent: string; agree: boolean; note: string }
}

export interface HumanQueueItem {
  id: string
  topic: string
  currentText: string
  conflict: string
  proposal?: string | null
  affectedCards: string[]
  decision: string | null
  decidedBy: string | null
  decidedAt: string | null
}

export interface HumanQueueFile {
  items: HumanQueueItem[]
}

// ─── 보정(calibration.json) ─────────────────────────────────────────────

export type ScoreComponent = "maxcos" | "centroid" | "knnShare" | "vote" | "bm25f" | "linear"

export interface CalibrationFile {
  version: string
  dataVersion: string
  weights: Record<ScoreComponent, number>
  /** 카드 종류별 로지스틱 계수. w 는 §3.3 ⑥ 특징 13개 순서. */
  confidence: Partial<Record<AnswerCardKind, { w: number[]; b: number }>>
  thresholds: Record<AnswerCardKind, number>
  nodocRatesChecked: number[]
  fit: { set: string; n: number; check: number; bootstrapP10: number }
  assist: { enabled: boolean; band: [number, number]; checkedOn: string[] }
}

// ─── 자료 관리(manifest.json) ───────────────────────────────────────────

export interface GenerationRecord {
  /** 조각 이름(D1-07 등). */
  part: string
  files: string[]
  counts: Record<string, number>
  writers: string[]
  reviewers: string[]
  /** 합친 조각 내용 sha256 앞 16자. */
  sha: string
}

export interface AnswerIndexManifest {
  schema: 1
  /** ANSWER_INDEX_VERSION. 자료 파일(eval/·manifest 제외) 내용 해시. */
  dataVersion: string
  /** 추출에 쓴 저장소 원천 파일 → sha256 앞 16자. */
  sources: Record<string, string>
  /** 자료 파일 → 해시와 항목 수. */
  outputs: Record<string, { sha: string; count: number }>
  /** 추출에 쓴 저장소 밖 입력(이름과 해시만). */
  inputs: { devSets: { name: string; sha: string }[]; failureLogs: { name: string; sha: string }[] }
  /** 조각별 생성 기록(merge.ts). */
  generation: Record<string, GenerationRecord>
}

// ─── 평가 자료(eval/, 런타임 아님) ──────────────────────────────────────

export interface AnswerKey {
  id: string
  /** 옛 답 id(basics:·field:·svc:·symptom:·guide:·self:·template:) 또는 unit:<unitId>. */
  accept: string[]
  partialAccept?: string[]
  nodoc?: boolean
  clarifyOk?: boolean
  /** nodoc 일 때 찾아본 낱말(3개 이상). */
  searched?: string[]
}

export interface AnswerKeysFile {
  set: string
  keys: AnswerKey[]
}

export interface CalibrationSetItem {
  id: string
  q: string
  p: string
  m: string
  label: UniverseLabel | null
  label2: UniverseLabel | null
  /** 두 라벨이 엇갈렸을 때 3자 판정. */
  final?: UniverseLabel | null
}

export interface CalibrationSetFile {
  version: string
  items: CalibrationSetItem[]
}

// ─── 런타임 판정(§3.3~§3.7) ─────────────────────────────────────────────

export type AnswerIndexRouter = "legacy" | "shadow" | "compiled"
export type AnswerIndexDecisionKind = "answer" | "gap" | "abstain" | "clarify"

/** 확신도 특징(§3.3 ⑥) 순서. calibration.confidence[kind].w 가 이 순서를 따른다. */
export const ANSWER_INDEX_FEATURES = [
  "s1",
  "s1MinusS2",
  "maxcos1",
  "centroid1",
  "knnShare1",
  "vote1",
  "coverage1",
  "unexplainedCount",
  "unknownHighIdf",
  "negMargin1",
  "absentHit",
  "questionLength",
  "askTypeMatch",
] as const

export type AnswerIndexFeatureName = (typeof ANSWER_INDEX_FEATURES)[number]
export type AnswerIndexFeatures = Record<AnswerIndexFeatureName, number>

export interface AnswerIndexCandidate {
  id: string
  /** 합성 점수. */
  s: number
  conf: number
}

export interface AnswerIndexSegmentDecision {
  text: string
  kind: AnswerIndexDecisionKind
  card: string | null
  conf: number
}

export interface AnswerIndexDecision {
  kind: AnswerIndexDecisionKind
  /** answer·gap 일 때 고른 카드 id. */
  card: string | null
  conf: number
  askType: AskType | null
  top: AnswerIndexCandidate[]
  /** 질문 개념 중 카드가 설명하지 않는 비일반 개념. */
  unexplained: string[]
  /** 걸린 absent 개념 id. */
  absentHit: string | null
  /** 답 끝에 '그 부분은 공개 안내에 없음' 꼬리를 붙일 absent 개념 id. */
  absentTail: string | null
  /** 조각으로 나눠 정했으면 조각별 판정. */
  segments: AnswerIndexSegmentDecision[] | null
  features?: AnswerIndexFeatures
  /**
   * abstain 일 때 낼 못 찾음 글(§3.5): nodoc → NO_SOURCE_FACT_ANSWER, symptom → SYMPTOM_AFTER_GATE_ANSWER(상담 버튼).
   * answer·gap·clarify 면 null.
   */
  abstainReason?: "nodoc" | "symptom" | null
  /** 답에 꼬리(없는 부분 한 줄·못 찾은 조각 한 줄)가 붙는지. 흔적 AnswerIndexTrace.partial 과 같다. */
  partial?: boolean
}

/** ChatbotCore.answerIndex 에 싣는 흔적. 응답에는 싣지 않는다. */
export interface AnswerIndexTrace {
  version: string
  router: AnswerIndexRouter
  scope: "in" | "out"
  decision: AnswerIndexDecisionKind | null
  top: AnswerIndexCandidate[]
  conf: number | null
  unexplained: string[]
  absentHit: string | null
  segments: number
  /**
   * 고른 카드 id(answer 는 답 카드, gap 은 공백 카드 — absentHit 으로 간 gap 이면 absent.gapCard).
   * 측정 스크립트가 decidedBy index:<card>·index-gap:<card> 로 쓴다(scripts/lib/chatbot-live-eval-checks.ts).
   * 없으면 그 스크립트는 top[0].id 로 짐작한다.
   */
  card?: string | null
  /** 답에 꼬리(없는 부분 한 줄·못 찾은 조각 한 줄)를 붙였는지. true 면 decidedBy index-partial:<card>. */
  partial?: boolean
  /** 없는 부분 꼬리를 붙인 absent 개념 id. */
  absentTail?: string | null
}
