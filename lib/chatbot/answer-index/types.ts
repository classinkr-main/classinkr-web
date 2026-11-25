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
  /**
   * 결론 문장(R2 두괄식, 계획 §4.4 C). sentences 안의 한 문장을 맨 앞으로 옮긴다(문장 집합은 같고 순서만 바뀐다). 아직 렌더하지 않는다(B4).
   * V-13(a): sentences 에 있어야 한다.
   */
  first?: SingleSentenceRef
  /** 새로 쓴 결론 한 줄(≤60자, 근거 문장 토큰 ⊂ 카드 문장 토큰, V-13 c~e). 카드 글을 덮지 않는다. 아직 렌더하지 않는다(B4). */
  headline?: CardHeadline
}

/** 카드 결론 한 줄(R2 headline 파일럿). 근거 문장과 만든 기록을 같이 둔다. */
export interface CardHeadline {
  text: string
  /** 결론이 기대는 카드 문장(하나 이상). */
  basis: SingleSentenceRef[]
  /** 만든 기록(audit/<batch>.jsonl#<id>): 만든 방법·검사 결과. */
  auditRef?: string
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

/**
 * 런타임에서 id 로 옛 답을 부를 수 없는 모듈(curated.ts). svc·template 은 service.ts 안의 조건 갈래라 부를 함수가 없어
 * 그 KEEP(curatedRef) 카드는 load 때 '옛 답 없음'으로 꺼진다. V-2 가 이런 카드를 거부하고, 같은 글은 FIX(text) 카드로 쓴다.
 */
export const CURATED_MODULES_WITHOUT_RUNTIME: readonly CuratedModule[] = ["svc", "template"]

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
  /**
   * 결정을 기다리는 동안 active 카드 답 글에 나오면 안 되는 구절(V-3). 결정(decision)이 비어 있는 항목만 본다.
   * 정규화(NFC·소문자·글자와 숫자만)해 포함 여부로 대조한다. 보는 글은 doc 문장·howto·FIX text·KEEP 옛 답·gap 관련 문장.
   * active policy 카드 전부(사람이 쓴 지금 운영 정책 글 그대로)와 active 가 아닌 카드(review·disabled)는 예외다.
   * 빌드 검사(scripts/answer-index V-3)만 쓰고 런타임은 이 칸을 읽지 않는다.
   */
  blockPhrases?: string[]
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
  /** 카드 종류별 로지스틱 계수. w 는 ANSWER_INDEX_FEATURES 순서(§3.3 ⑥ 13개 + knnCount1). 길이가 다르면 그 종류는 기본 계수. */
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
  /** 답 id 에 이것이 있으면 accept 와 겹쳐도 엉뚱한 답(wrong)으로 센다(심사 범위 밖 사실을 단정하는 옛 답 등). */
  reject?: string[]
  /** 공개 페이지 사실(site-facts)까지 근거로 볼 때만 맞는 답 id(§14 결정 과제 3). 대리 점수 기본 계산에는 쓰지 않는다. */
  siteAccept?: string[]
  nodoc?: boolean
  clarifyOk?: boolean
  /** nodoc 일 때 찾아본 낱말(3개 이상). */
  searched?: string[]
  /** 이 질문의 영역(정답 대상의 영역). proxy-eval --area 가 이 값으로 줄을 거른다. */
  area?: AnswerIndexArea
  /** area 를 정한 근거(키 작성 도구가 적는 값: accept · accept-multi-question · question 등). */
  areaFrom?: string
  /** 정답 근거가 공개 페이지(site-facts)에 기대면 site. */
  evidenceScope?: "docs" | "site"
  note?: string
  /** 같은 정답을 공유하는 키 묶음 이름(묶음 안 키는 함께 고친다). */
  keyGroup?: string
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

/**
 * 확신도 특징(§3.3 ⑥) 순서. calibration.confidence[kind].w 가 이 순서를 따른다(길이가 다르면 그 종류는 기본 계수, compile.ts).
 * knnCount1(진단 R02): 우주 이웃(상위 10, 코사인 0.35 이상) 가운데 그 카드 라벨인 이웃 수를 log1p 로 눌러 0~1 로 맞춘 값
 * (log1p(수) / log1p(10)). 라벨이 둘로 갈린 이웃은 반으로 센다. 이웃 몫(knnShare1)과 달리 이웃이 하나뿐인 소음과 촘촘한 근거를 가른다.
 */
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
  "knnCount1",
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
  /** 조각 글(원문을 자른 것). */
  text: string
  kind: AnswerIndexDecisionKind
  card: string | null
  conf: number
  /**
   * 이 조각을 누가 정했나: index(결정형 — 조각 판정·원문 판정·다른 조각과 같은 카드), assist(모델 고르기, B3), none(못 정함).
   * 없으면 card 가 있을 때 index 로 본다.
   */
  by?: "index" | "assist" | "none"
  /**
   * 결정형 안에서의 출처: segment(조각 판정), whole(원문 판정을 이 조각에 붙임), shared(다른 조각이 답한 카드가 이 조각의 1위),
   * overflow(최대 조각 수를 넘어 답하지 않음).
   */
  source?: "segment" | "whole" | "shared" | "overflow"
  /** 주제를 이어 붙여 점수를 낸 글(주어를 잃은 조각, "요금은요?" → "<앞 조각 주제> 요금은요?"). 답 글에는 쓰지 않는다. */
  scoringText?: string
  /** 이 조각에 걸린 없는 개념(묻는 대상일 때만). */
  absentHit?: string | null
  /** 정해 둔 답 승격으로 정한 조각(조각 글로 센 옛 정규식 표, 또는 원문 승격을 이 조각에 붙임). */
  rescue?: "vote" | null
}

/**
 * 주의 표시(R2 낱말 장치: 낱말 하나는 결정이 아니라 표시). 결정형이 알아본 신호를 모델 지시문·측정에 넘긴다.
 * absent: 없는 개념 형태가 질문에 있음(target 이면 그 자리가 묻는 대상 — 공백·꼬리 판정에 쓴다, 아니면 수식어·비교·제외 문맥이라 쓰지 않는다).
 * policy_topic·handoff 는 앞단(service.ts, B5)이 채운다.
 */
export interface AnswerIndexCaution {
  kind: "absent" | "policy_topic" | "handoff"
  /** absent 개념 id 등. */
  id: string | null
  /** 맞춘 글(형태). */
  form: string | null
  /** 그 자리가 묻는 대상인지. */
  target: boolean
  /** target 이 아니면 그 까닭(modifier·comparison·exclusion·adjectival). */
  reason?: string | null
}

/** 흔적에 싣는 조각 하나(사양 §3.7 segments[], 계획 §2.6). */
export interface AnswerIndexTraceSegment {
  text: string
  kind: AnswerIndexDecisionKind
  card: string | null
  by: "index" | "assist" | "none"
  source?: AnswerIndexSegmentDecision["source"]
  /** 답 글에서 이 조각 자리를 '못 답함' 알림으로 채우는지(answer·gap 이 아니면 true). */
  notice: boolean
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
  /**
   * 정해 둔 답 승격(진단 R07, decide.ts applyVoteRescue): 옛 정규식 표의 카드가 상위 3 안이고 검사를 통과해 문턱 아래에서도
   * 그 카드로 답했으면 "vote". 흔적에는 decidedBy "index:vote-rescue" 로 남는다.
   */
  rescue?: "vote" | null
  /** 주의 표시(없는 개념 형태 등). 없거나 빈 배열이면 신호 없음. */
  cautions?: AnswerIndexCaution[]
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
  /** 조각 수(나누지 않았으면 1, 색인이 정하지 않았으면 0). 조각별 판정은 parts. */
  segments: number
  /** 질문을 나눠 정했을 때 조각별 판정(질문 순서). 나누지 않았으면 없다. */
  parts?: AnswerIndexTraceSegment[]
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
  /**
   * 색인 앞 단계가 답했을 때 그 단계(compiled 라우터, 사양 §3.2 ①~④와 그 앞): greeting(인사)·policy_guard(거절 답)·
   * exempt(관문 밖 정해 둔 답)·english(영어 안내)·handoff(즉시 상담 연결)·tried(이미 해 봤다는 화난 문의). decision 은 null 이다.
   */
  pre?: "greeting" | "policy_guard" | "exempt" | "english" | "handoff" | "tried" | null
  /** 고른 카드를 답으로 만들 수 없어 못 찾음으로 바꾼 이유(문장 해시 어긋남·옛 답 없음 등). */
  unavailable?: string | null
  /**
   * 결정 경로 표지. 정해 둔 답 승격(AnswerIndexDecision.rescue = vote)으로 답했으면 "index:vote-rescue", 아니면 null.
   * 측정 줄의 decidedBy(index:<card>, 카드 대조용)는 그대로이고 이 칸이 승격 여부를 알려 준다.
   */
  decidedBy?: "index:vote-rescue" | null
  /**
   * 모델 선택 층(사양 §10, assist.ts) 흔적. CHATBOT_ANSWER_ASSIST 가 off(기본)면 없다. 위 decision·card·conf 는 최종 판정이고
   * 결정형 판정은 assist.original 에 남는다(운영 shadow 비교용).
   */
  assist?: AnswerIndexAssistTrace
}

/** 모델 선택 층 켜는 범위(CHATBOT_ANSWER_ASSIST). */
export type AnswerAssistMode = "off" | "band" | "always"

/** 모델 선택 층 흔적(AnswerIndexTrace.assist). */
export interface AnswerIndexAssistTrace {
  mode: Exclude<AnswerAssistMode, "off">
  /** 모델에 물었는지(대상이고 후보가 있어 호출 함수를 불렀는지). 연결이 없거나 차단기에 막혀도 물었으면 true, 실패 이유는 rejectReason. */
  used: boolean
  /** 모델이 고른 번호(후보 번호 1부터 · 0 못 찾음 · -1 되묻기). 묻지 않았거나 호출·파싱이 실패하면 null. */
  pick: number | null
  /** pick 이 가리킨 후보 카드 id(번호가 후보 안일 때만). */
  pickCard: string | null
  /** 물은 모델(basic 1순위 하나, 호출이 실패해도 그 모델). 묻지 않았거나 연결이 없으면 null. */
  model: string | null
  /** 모델 호출에 쓴 시간(ms). 묻지 않았으면 null. */
  ms: number | null
  /** 최종 판정이 모델의 고름을 따랐는지(같은 카드를 골라 결정형 그대로인 경우 포함). */
  accepted: boolean
  /**
   * 따르지 않은 이유. 묻지 않음: calibration_disabled·out_of_band·gap·absent·segments·policy_card·no_candidates.
   * 호출 실패: no_connection·circuit_open·access_denied·auth_error·timeout·http_error·parse_error·error.
   * 받아들이지 않음: out_of_range·negative·absent·policy_card·policy_topic·scope·card_unavailable·nodoc(결정형이 NODOC 신호로 답하지 않은
   * 질문을 카드 답으로 바꾸려 함). 따랐으면 null.
   */
  rejectReason: string | null
  /** 결정형 판정(모델 전). */
  original: { kind: AnswerIndexDecisionKind; card: string | null; conf: number }
  /**
   * 아래 칸은 업체 고르기·대체 층(lib/chatbot/claude/card-pick.ts)을 거친 호출에만 있다. pick·pickCard·model·provider 는 최종 판정에 쓴
   * 고름이다(올림이 성공했으면 올림 모델의 고름, 고르기 단계의 고름은 first).
   */
  provider?: "gemini" | "claude"
  /** 이 질문의 Claude 호출 토큰·추정 비용(고르기·대체·올림 합). Claude 를 부르지 않았으면 없다. */
  usage?: AnswerIndexAssistUsage
  /** 1순위 Gemini 고르기가 402·429·5xx·차단기로 실패해 Claude Haiku 로 다시 골랐는지. */
  crossFallback?: boolean
  /** 하루 상한(CHATBOT_CLAUDE_DAILY_BUDGET_USD) 때문에 Claude 를 건너뛰었는지. */
  budgetBlocked?: boolean
  /** 올림(CHATBOT_ASSIST_ESCALATE)을 실제로 불렀는지. 올림이 꺼져 있으면 없다. */
  escalated?: boolean
  /** 올림 판단·결과. 올림 조건에 걸렸을 때만 있다. */
  escalation?: AnswerIndexAssistEscalation
}

export interface AnswerIndexAssistUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  usd: number
  calls: { stage: "pick" | "cross" | "escalate"; model: string; inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; usd: number }[]
}

export interface AnswerIndexAssistEscalation {
  /** disagree: 고른 답 카드가 결정형 답 카드와 다름 · none_vs_abstain: 고르기 0·결정형 못 찾음·NODOC 신호 없음 · context: 넓힌 질문·두 조각·화남/반복. */
  trigger: "disagree" | "none_vs_abstain" | "context"
  /** 부르지 않은 이유(budget·no_connection·deadline). 불렀으면 null. */
  skipped: string | null
  model: string | null
  /** 올림 모델의 고름. 부르지 않았거나 실패했으면 null. */
  pick: number | null
  ms: number | null
  /** 올림 호출 실패 이유(실패하면 결정형 판정 그대로). */
  failure: string | null
  /** 고르기 단계(②)의 고름. */
  first: { provider: "gemini" | "claude" | null; model: string | null; pick: number; pickCard: string | null }
}
