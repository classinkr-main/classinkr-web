// 측정 스크립트(scripts/chatbot-live-eval.ts)의 탐침 판정: 복합 질문의 조각 답, 단일 질문 과분할, 낱말 미끼 장치별 걸림.
// 모델·문서·네트워크를 부르지 않는 순수 함수만 둔다. 테스트: tests/chatbot/answer-index/live-eval-probes.test.ts
//
// 입력 칸(EvalCase, scripts/lib/chatbot-live-eval-checks.ts 의 parseEvalCases 가 읽는다)
// - expectFragments: [{ topic, cardPattern, text? }] 복합 질문의 조각별 기대. cardPattern 은 정규식 글(고른 카드의 id + topic 에 맞춘다).
//   text 가 있으면 그 조각만 따로 물었을 때(solo)의 결정도 같이 잰다(거짓 알림·쏠림 방향 판정용).
// - single: true 는 질문 하나(과분할 측정용). 2조각 이상으로 나뉘면 과분할이다.
// - decoy: { device, forbid?, expect?, observable? } 낱말 미끼. forbid·expect 는 outcomeSignature 에 맞추는 정규식 글이다.
//
// 결과 줄에 더하는 칸(기존 칸은 그대로): fragments(조각 기록)·expectFragments·single·decoy·outcome.

/** 복합 질문 한 조각의 기대. */
export interface ExpectFragment {
  topic: string
  /** 고른 카드의 `<id> <topic>` 에 맞추는 정규식 글. */
  cardPattern: string
  /** 그 조각만 따로 쓴 질문 글(있으면 solo 결정을 잰다). */
  text?: string
}

/** 낱말 미끼 한 줄의 기대. */
export interface DecoyExpect {
  /** 걸릴 수 있는 장치 이름(handoff·guard·tried·exam·english·absent·lexicon·vote·policyTopic·angry …). */
  device: string
  /** 이 결정 표시(outcomeSignature)에 맞으면 '걸림'. 정규식 글. */
  forbid?: string[]
  /** 이 결정 표시에 맞으면 기대대로. 정규식 글. */
  expect?: string
  /** false 면 모델 없는 측정으로는 볼 수 없는 장치(표시만 하는 낱말). 집계에서 따로 센다. */
  observable?: boolean
  /** 사람이 이미 '부분 답'으로 본 줄이면 'partial'. */
  known?: "partial"
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** 입력 한 줄의 expectFragments 를 읽는다. 없으면 undefined, 형이 틀리면 오류. */
export function parseExpectFragments(raw: unknown, where: string): ExpectFragment[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) throw new Error(`${where} 의 expectFragments 는 배열이어야 합니다.`)
  return raw.map((item, index) => {
    if (!isRecord(item) || typeof item.topic !== "string" || typeof item.cardPattern !== "string" || !item.cardPattern) {
      throw new Error(`${where} 의 expectFragments[${index}] 에 topic·cardPattern 이 필요합니다.`)
    }
    try {
      new RegExp(item.cardPattern)
    } catch {
      throw new Error(`${where} 의 expectFragments[${index}].cardPattern 이 정규식이 아닙니다.`)
    }
    return {
      topic: item.topic,
      cardPattern: item.cardPattern,
      ...(typeof item.text === "string" && item.text.trim() ? { text: item.text } : {}),
    }
  })
}

/** 입력 한 줄의 decoy 를 읽는다. */
export function parseDecoyExpect(raw: unknown, where: string): DecoyExpect | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isRecord(raw) || typeof raw.device !== "string" || !raw.device) throw new Error(`${where} 의 decoy 에 device 가 필요합니다.`)
  const strings = (value: unknown, name: string) => {
    if (value === undefined) return undefined
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${where} 의 decoy.${name} 는 글 배열이어야 합니다.`)
    for (const item of value as string[]) new RegExp(item)
    return value as string[]
  }
  const forbid = strings(raw.forbid, "forbid")
  if (raw.expect !== undefined && typeof raw.expect !== "string") throw new Error(`${where} 의 decoy.expect 는 글이어야 합니다.`)
  if (typeof raw.expect === "string") new RegExp(raw.expect)
  return {
    device: raw.device,
    ...(forbid ? { forbid } : {}),
    ...(typeof raw.expect === "string" ? { expect: raw.expect } : {}),
    ...(raw.observable === false ? { observable: false } : {}),
    ...(raw.known === "partial" ? { known: "partial" as const } : {}),
  }
}

// ---------------------------------------------------------------------------
// 답 글의 알림 줄(일부 조각을 답하지 못했다는 말)
// ---------------------------------------------------------------------------

/** 일부 조각을 못 답했다고 알리는 줄의 조각. 지금 고정 줄과 앞으로 바뀔 줄을 함께 본다. */
export const UNANSWERED_NOTICE_PATTERNS: readonly RegExp[] = [
  /함께 물어보신 다른 내용은/,
  /이 질문만 따로 보내 주시면/,
  /공개 안내에는 없는 내용이라/,
  /따로 한 번 더 물어봐 주세요/,
]

/** 알림 줄 가운데 '공개 안내에 없다'고 말하는 것(거짓 알림 판정은 이쪽만 본다: '다시 물어봐 달라'는 카드가 있어도 거짓이 아니다). */
export const ABSENCE_NOTICE_PATTERNS: readonly RegExp[] = [/함께 물어보신 다른 내용은/, /공개 안내에는 없는 내용이라/]

export function hasAbsenceNotice(answer: string | null | undefined): boolean {
  if (!answer) return false
  return ABSENCE_NOTICE_PATTERNS.some((pattern) => pattern.test(answer))
}

export function hasUnansweredNotice(answer: string | null | undefined): boolean {
  if (!answer) return false
  return UNANSWERED_NOTICE_PATTERNS.some((pattern) => pattern.test(answer))
}

// ---------------------------------------------------------------------------
// 결정 표시(미끼 장치별 걸림 판정용)
// ---------------------------------------------------------------------------

/**
 * 답 색인 흔적 → 결정 표시 글.
 * 앞 단계가 답했으면 그 이름(handoff·policy_guard·tried·exempt·english·greeting), 범위 밖이면 scope_out, 색인이 정했으면
 * `<결정>[:<카드>][(rescue)][[absent:<개념>]]`. 흔적이 없으면 legacy.
 */
export function outcomeSignature(answerIndex: unknown): string {
  if (!isRecord(answerIndex)) return "legacy"
  if (typeof answerIndex.pre === "string" && answerIndex.pre) return answerIndex.pre
  if (answerIndex.scope === "out") return "scope_out"
  const decision = typeof answerIndex.decision === "string" ? answerIndex.decision : "unknown"
  const card = typeof answerIndex.card === "string" && answerIndex.card ? answerIndex.card : firstTopId(answerIndex)
  const rescue = answerIndex.decidedBy === "index:vote-rescue" ? "(rescue)" : ""
  const absent = typeof answerIndex.absentHit === "string" && answerIndex.absentHit ? `[absent:${answerIndex.absentHit}]` : ""
  if (decision === "answer" || decision === "gap") return `${decision}:${card ?? ""}${rescue}${absent}`
  return decision
}

function firstTopId(trace: Record<string, unknown>): string | null {
  const top = Array.isArray(trace.top) ? trace.top : []
  const first = top[0]
  return isRecord(first) && typeof first.id === "string" && first.id ? first.id : null
}

export type DecoyVerdict = "trapped" | "expected" | "other" | "unobservable"

/** 미끼 한 줄의 판정: 걸림(forbid 에 맞음)·기대대로(expect 에 맞음)·그 밖·관찰 불가. */
export function classifyDecoy(decoy: DecoyExpect, outcome: string): DecoyVerdict {
  if (decoy.observable === false) return "unobservable"
  if ((decoy.forbid ?? []).some((pattern) => new RegExp(pattern).test(outcome))) return "trapped"
  if (decoy.expect && new RegExp(decoy.expect).test(outcome)) return "expected"
  return "other"
}

export interface DecoyRowInput {
  id: string
  decoy?: DecoyExpect | null
  outcome?: string | null
}

export interface DecoyDeviceSummary {
  n: number
  trapped: number
  expected: number
  other: number
  unobservable: number
  trappedIds: string[]
}

/** 미끼 줄들을 장치별로 센다(걸림·기대대로·그 밖·관찰 불가). decoy 가 없는 줄은 센다 하지 않는다. */
export function summarizeDecoys(rows: readonly DecoyRowInput[]): { total: number; devices: Record<string, DecoyDeviceSummary> } {
  const devices: Record<string, DecoyDeviceSummary> = {}
  let total = 0
  for (const row of rows) {
    if (!row.decoy) continue
    total += 1
    const bucket = (devices[row.decoy.device] ??= { n: 0, trapped: 0, expected: 0, other: 0, unobservable: 0, trappedIds: [] })
    const verdict = classifyDecoy(row.decoy, row.outcome ?? "legacy")
    bucket.n += 1
    bucket[verdict] += 1
    if (verdict === "trapped") bucket.trappedIds.push(row.id)
  }
  return { total, devices }
}

// ---------------------------------------------------------------------------
// 조각 기록
// ---------------------------------------------------------------------------

export type SegmentSource = "trace" | "probe" | "count" | "none"

export interface FragmentSegment {
  text: string
  kind: string
  card: string | null
  /** 이 조각을 누가 정했나: index(결정형)·assist(모델 고르기)·none(못 정함). 지금 코드는 결정형만 구분한다. */
  by: "index" | "assist" | "none"
  conf?: number | null
}

export interface FragmentSoloResult {
  topic: string
  /** 이 조각의 기대 카드가 최종 답에 들어갔는지. */
  answered: boolean
  /** 그 조각만 따로 물었을 때 결정형이 기대 카드로 답했는지(text 가 있을 때만). */
  soloAnswered: boolean | null
  soloCard: string | null
  soloKind: string | null
  soloConf: number | null
  /** 그 조각만 물었을 때 상위 카드 안에 기대 카드가 있는지. */
  soloTop: boolean | null
}

export interface FragmentRecord {
  source: SegmentSource
  segmentCount: number
  segments: FragmentSegment[]
  /** 최종 답이 다룬 카드(질문 순서가 아니라 조각 순서). */
  answeredCards: string[]
  /** 답 글에 '일부를 못 답했다'는 알림 줄이 있는지. */
  notice: boolean
  /** 알림 줄 가운데 '공개 안내에 없다'고 말하는 줄이 있는지(거짓 알림 판정용). */
  absenceNotice: boolean
  perFragment: FragmentSoloResult[]
}

export interface SoloProbe {
  kind: string
  card: string | null
  conf: number
  top: Array<{ id: string; topic?: string | null }>
}

export interface ProbeDecision {
  kind: string
  card: string | null
  conf?: number
  segments?: Array<{ text: string; kind: string; card: string | null; conf?: number }> | null
}

export interface FragmentRecordInput {
  question: string
  answer: string | null | undefined
  /** 색인이 답을 정했는지(decidedBy 가 index 로 시작). 앞 단계(즉시 상담·정책 거절)가 답했으면 false. */
  indexDecided: boolean
  /** 답 색인 흔적(ChatbotCore.answerIndex). segments 가 배열이면 그것을, 숫자면 개수만 쓴다. */
  trace: unknown
  /** 흔적에 조각 배열이 없을 때 쓰는 결정형 판정(같은 자료·같은 질문으로 다시 계산한 값). */
  probe?: ProbeDecision | null
  expect?: readonly ExpectFragment[]
  /** expect 와 같은 순서의 solo 결정(없으면 null). */
  solo?: ReadonlyArray<SoloProbe | null>
  /** 카드 id → topic. */
  topicOf: (cardId: string) => string
}

const ANSWERED_KINDS = new Set(["answer", "gap"])

function traceSegments(trace: unknown): FragmentSegment[] | null {
  if (!isRecord(trace) || !Array.isArray(trace.segments)) return null
  const out: FragmentSegment[] = []
  for (const raw of trace.segments) {
    if (!isRecord(raw)) continue
    const kind = typeof raw.kind === "string" ? raw.kind : typeof raw.decision === "string" ? raw.decision : "unknown"
    const card = typeof raw.card === "string" && raw.card ? raw.card : typeof raw.cardId === "string" && raw.cardId ? raw.cardId : null
    const by = raw.by === "assist" || raw.by === "index" || raw.by === "none" ? raw.by : card ? "index" : "none"
    out.push({
      text: typeof raw.text === "string" ? raw.text : "",
      kind,
      card,
      by,
      ...(typeof raw.conf === "number" ? { conf: raw.conf } : {}),
    })
  }
  return out
}

/** 조각 기록을 만든다. 흔적의 조각 배열 > 결정형 판정(probe) > 조각 수만 있는 흔적 순으로 쓴다. */
export function buildFragmentRecord(input: FragmentRecordInput): FragmentRecord {
  const trace = isRecord(input.trace) ? input.trace : null
  const traced = traceSegments(trace)
  let source: SegmentSource = "none"
  let segments: FragmentSegment[] = []
  let primaryCard: string | null = null
  if (traced && traced.length > 0) {
    source = "trace"
    segments = traced
    primaryCard = typeof trace?.card === "string" ? trace.card : null
  } else if (input.probe) {
    source = "probe"
    const decision = input.probe
    primaryCard = decision.card
    const parts = decision.segments && decision.segments.length > 0 ? decision.segments : null
    segments = parts
      ? parts.map((part) => ({ text: part.text, kind: part.kind, card: part.card, by: part.card ? ("index" as const) : ("none" as const), conf: part.conf ?? null }))
      : [{ text: input.question, kind: decision.kind, card: decision.card, by: decision.card ? ("index" as const) : ("none" as const), conf: decision.conf ?? null }]
  } else if (trace) {
    source = "count"
    const count = typeof trace.segments === "number" ? trace.segments : 1
    const kind = typeof trace.decision === "string" ? trace.decision : "unknown"
    const card = typeof trace.card === "string" ? trace.card : null
    primaryCard = card
    segments = Array.from({ length: Math.max(1, count) }, (_, index) => ({
      text: index === 0 ? input.question : "",
      kind: index === 0 ? kind : "unknown",
      card: index === 0 ? card : null,
      by: index === 0 && card ? ("index" as const) : ("none" as const),
    }))
  }

  const answeredCards: string[] = []
  if (input.indexDecided) {
    const push = (card: string | null) => {
      if (card && !answeredCards.includes(card)) answeredCards.push(card)
    }
    push(primaryCard)
    for (const segment of segments) if (ANSWERED_KINDS.has(segment.kind)) push(segment.card)
  }
  const notice = hasUnansweredNotice(input.answer)
  const absenceNotice = hasAbsenceNotice(input.answer)

  const perFragment: FragmentSoloResult[] = (input.expect ?? []).map((fragment, index) => {
    const pattern = new RegExp(fragment.cardPattern)
    const cardText = (id: string) => `${id} ${input.topicOf(id)}`
    const answered = answeredCards.some((card) => pattern.test(cardText(card)))
    const solo = input.solo?.[index] ?? null
    return {
      topic: fragment.topic,
      answered,
      soloAnswered: solo ? solo.kind === "answer" && solo.card !== null && pattern.test(cardText(solo.card)) : null,
      soloCard: solo?.card ?? null,
      soloKind: solo?.kind ?? null,
      soloConf: solo ? solo.conf : null,
      soloTop: solo ? solo.top.some((item) => pattern.test(`${item.id} ${item.topic ?? input.topicOf(item.id)}`)) : null,
    }
  })

  return { source, segmentCount: segments.length || 1, segments, answeredCards, notice, absenceNotice, perFragment }
}

// ---------------------------------------------------------------------------
// 요약
// ---------------------------------------------------------------------------

export interface FragmentRowInput {
  id: string
  group?: string | null
  single?: boolean
  expectFragments?: readonly ExpectFragment[] | null
  fragments?: FragmentRecord | null
}

const pct = (numerator: number, denominator: number) => (denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10)

export interface FragmentSummary {
  /** 복합 질문(조각 기대가 2개 이상인 줄). */
  multi: {
    rows: number
    fragments: number
    answeredFragments: number
    /** 조각 답 비율(%). */
    answeredRatio: number
    allAnswered: number
    allAnsweredRatio: number
    /** 한 조각도 못 답한 줄(못 찾음). */
    noneAnswered: number
    noneAnsweredRatio: number
    /** 일부 조각만 답한 줄. */
    partialRows: number
    /** 쏠림 방향: 일부만 답한 줄 가운데 첫 조각만·뒤 조각만·답한 쪽이 혼자 물었을 때 확신도가 더 높은 쪽인 줄. */
    lean: { firstOnly: number; laterOnly: number; strongerSolo: number; soloKnown: number }
    /** 일부만 답했는데 알림 줄이 없는 줄(소리 없는 누락). 분모는 partialRows. */
    silentMissing: number
    /** 알림 줄이 있는 줄. */
    noticeRows: number
    /** 알림 줄이 있는데 못 답한 조각의 기대 카드가 그 조각만 물었을 때 상위 10 안에 있는 줄(거짓 알림: 카드가 있는데 '없다'고 함). 분모는 noticeRows. */
    falseNotice: number
    /** 거짓 알림 중 그 조각만 물으면 결정형이 기대 카드로 답까지 하는 줄(엄격한 기준). */
    falseNoticeStrict: number
    /** 답 카드가 하나도 없는 줄(못 찾음 고정 답). noneAnswered 는 엉뚱한 카드로 답한 줄을 더 센다. */
    noCard: number
    /** 질문 조각 수(trace/probe 가 센 값)가 기대 조각 수보다 적은 줄(나누지 못함). */
    underSplit: number
    byGroup: Record<string, { rows: number; answeredFragments: number; fragments: number; allAnswered: number }>
  }
  /** 단일 질문(single: true). 2조각 이상으로 나뉜 줄이 과분할이다. */
  single: { rows: number; overSplit: number; overSplitRatio: number; overSplitIds: string[] }
}

/** 조각 기록이 있는 줄들의 요약 지표. */
export function summarizeFragments(rows: readonly FragmentRowInput[]): FragmentSummary {
  const multiRows = rows.filter((row) => (row.expectFragments?.length ?? 0) >= 2 && row.fragments)
  let fragments = 0
  let answeredFragments = 0
  let allAnswered = 0
  let noneAnswered = 0
  let partialRows = 0
  let firstOnly = 0
  let laterOnly = 0
  let strongerSolo = 0
  let soloKnown = 0
  let silentMissing = 0
  let noticeRows = 0
  let falseNotice = 0
  let falseNoticeStrict = 0
  let noCard = 0
  let underSplit = 0
  const byGroup: FragmentSummary["multi"]["byGroup"] = {}
  for (const row of multiRows) {
    const record = row.fragments as FragmentRecord
    const per = record.perFragment
    const answered = per.filter((item) => item.answered)
    fragments += per.length
    answeredFragments += answered.length
    const bucket = (byGroup[row.group ?? "-"] ??= { rows: 0, answeredFragments: 0, fragments: 0, allAnswered: 0 })
    bucket.rows += 1
    bucket.fragments += per.length
    bucket.answeredFragments += answered.length
    if (answered.length === per.length) {
      allAnswered += 1
      bucket.allAnswered += 1
    }
    if (answered.length === 0) noneAnswered += 1
    if (record.answeredCards.length === 0) noCard += 1
    if (record.segmentCount < per.length) underSplit += 1
    const partial = answered.length > 0 && answered.length < per.length
    if (partial) {
      partialRows += 1
      if (per[0].answered) firstOnly += 1
      else laterOnly += 1
      const answeredConf = Math.max(...answered.map((item) => item.soloConf ?? -1))
      const missing = per.filter((item) => !item.answered)
      const missingConf = Math.max(...missing.map((item) => item.soloConf ?? -1))
      if (answeredConf >= 0 && missingConf >= 0) {
        soloKnown += 1
        if (answeredConf > missingConf) strongerSolo += 1
      }
      if (!record.notice) silentMissing += 1
    }
    if (record.notice) {
      noticeRows += 1
      if (record.absenceNotice && per.some((item) => !item.answered && item.soloTop === true)) falseNotice += 1
      if (record.absenceNotice && per.some((item) => !item.answered && item.soloAnswered === true)) falseNoticeStrict += 1
    }
  }
  const singleRows = rows.filter((row) => row.single && row.fragments)
  const overSplitIds = singleRows.filter((row) => (row.fragments?.segmentCount ?? 1) >= 2).map((row) => row.id)
  return {
    multi: {
      rows: multiRows.length,
      fragments,
      answeredFragments,
      answeredRatio: pct(answeredFragments, fragments),
      allAnswered,
      allAnsweredRatio: pct(allAnswered, multiRows.length),
      noneAnswered,
      noneAnsweredRatio: pct(noneAnswered, multiRows.length),
      partialRows,
      lean: { firstOnly, laterOnly, strongerSolo, soloKnown },
      silentMissing,
      noticeRows,
      falseNotice,
      falseNoticeStrict,
      noCard,
      underSplit,
      byGroup,
    },
    single: {
      rows: singleRows.length,
      overSplit: overSplitIds.length,
      overSplitRatio: pct(overSplitIds.length, singleRows.length),
      overSplitIds,
    },
  }
}
