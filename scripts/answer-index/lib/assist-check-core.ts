/**
 * 모델 선택 층 켜기 전 확인(답 색인 사양 §10, scripts/answer-index/assist-check.ts)의 순수 함수. 파일·프로세스는 assist-check.ts 가 다룬다.
 *
 * - diffAssistRuns: 같은 입력을 모델 선택 층 끔·켬으로 잰 측정 결과(scripts/chatbot-live-eval.ts JSONL)를 id 로 맞춰, 답이 바뀐 줄만
 *   고르고 바뀐 꼴(결정형 → 최종)별로 센다. '바뀜'은 답 글·상담 버튼(needsHandoff)·답 모드가 다른 것이다.
 * - assistTransition: 끔 줄의 decidedBy 와 켬 줄의 decidedBy 로 바뀐 꼴 이름을 만든다(같은 index 끼리 카드가 다르면 "index → index(다른 카드)").
 * - compareJudgedAssist: 바뀐 줄을 끔·켬 두 판으로 심사한 결과(judge merge 의 judged-*.json)를 맞대어 순이득과 켜기 조건(§10)을 본다:
 *   순이득 > 0, 좋음→나쁨 < 나쁨→좋음, 좋음→나쁨 ≤ 전체 줄의 1%.
 * 모델·네트워크를 부르지 않는다.
 */
import { toJudgeRow, type JudgeInputRow } from "../judge/lib"
import { VERDICT_POINTS, isVerdict, type Verdict } from "../score"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 측정 줄에서 쓰는 칸. */
export interface AssistEvalRow {
  id: string
  question: string
  answer: string | null
  answerMode: string | null
  needsHandoff: boolean | null
  decidedBy: string
  answerIndex?: unknown
  raw: Record<string, unknown>
}

export function toAssistEvalRow(raw: unknown): AssistEvalRow {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) throw new Error("측정 결과 줄에 id 가 없습니다.")
  return {
    id: raw.id,
    question: typeof raw.question === "string" ? raw.question : "",
    answer: typeof raw.answer === "string" ? raw.answer : null,
    answerMode: typeof raw.answerMode === "string" ? raw.answerMode : null,
    needsHandoff: typeof raw.needsHandoff === "boolean" ? raw.needsHandoff : null,
    decidedBy: typeof raw.decidedBy === "string" ? raw.decidedBy : "unknown",
    answerIndex: raw.answerIndex,
    raw,
  }
}

/** decidedBy 의 종류(앞머리)와 카드. "index:doc:/x#0/a" → { kind: "index", card: "doc:/x#0/a" }. */
export function decidedByParts(decidedBy: string): { kind: string; card: string | null } {
  const at = decidedBy.indexOf(":")
  if (at < 0) return { kind: decidedBy, card: null }
  return { kind: decidedBy.slice(0, at), card: decidedBy.slice(at + 1) || null }
}

/** 바뀐 꼴 이름. 같은 종류끼리 카드가 다르면 "<종류> → <종류>(다른 카드)". */
export function assistTransition(offDecidedBy: string, onDecidedBy: string) {
  const off = decidedByParts(offDecidedBy)
  const on = decidedByParts(onDecidedBy)
  if (off.kind === on.kind) return off.card === on.card ? `${off.kind} (같음)` : `${off.kind} → ${on.kind}(다른 카드)`
  return `${off.kind} → ${on.kind}`
}

export interface AssistChangedRow {
  id: string
  transition: string
  off: AssistEvalRow
  on: AssistEvalRow
}

export interface AssistDiff {
  /** 두 판 모두에 있는 줄. */
  matched: number
  /** 한쪽에만 있는 id. */
  missing: string[]
  changed: AssistChangedRow[]
  /** 바뀐 꼴별 줄 수(많은 순). */
  transitions: Record<string, number>
}

function rowChanged(off: AssistEvalRow, on: AssistEvalRow) {
  return off.answer !== on.answer || off.needsHandoff !== on.needsHandoff || off.answerMode !== on.answerMode
}

/** 끔·켬 측정 결과를 id 로 맞대어 바뀐 줄을 고른다(켬 판 순서). */
export function diffAssistRuns(offRows: readonly AssistEvalRow[], onRows: readonly AssistEvalRow[]): AssistDiff {
  const offById = new Map<string, AssistEvalRow>()
  for (const row of offRows) {
    if (offById.has(row.id)) throw new Error(`끔 판에 id 가 겹칩니다: ${row.id}`)
    offById.set(row.id, row)
  }
  const seen = new Set<string>()
  const changed: AssistChangedRow[] = []
  const missing: string[] = []
  let matched = 0
  for (const on of onRows) {
    if (seen.has(on.id)) throw new Error(`켬 판에 id 가 겹칩니다: ${on.id}`)
    seen.add(on.id)
    const off = offById.get(on.id)
    if (!off) {
      missing.push(on.id)
      continue
    }
    matched += 1
    if (rowChanged(off, on)) changed.push({ id: on.id, transition: assistTransition(off.decidedBy, on.decidedBy), off, on })
  }
  for (const id of offById.keys()) if (!seen.has(id)) missing.push(id)
  const counts: Record<string, number> = {}
  for (const row of changed) counts[row.transition] = (counts[row.transition] ?? 0) + 1
  const transitions = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
  return { matched, missing, changed, transitions }
}

/** 바뀐 줄 → 심사 입력 줄(끔 판·켬 판). 심사관에게는 id·question·answer·sources 만 준다(judge split 과 같다). */
export function changedJudgeRows(changed: readonly AssistChangedRow[]): { off: JudgeInputRow[]; on: JudgeInputRow[] } {
  return { off: changed.map((row) => toJudgeRow(row.off.raw)), on: changed.map((row) => toJudgeRow(row.on.raw)) }
}

// ─── 심사 결과 맞대기 ────────────────────────────────────────────────────

const GOOD_VERDICTS: ReadonlySet<Verdict> = new Set(["good", "nf_ok"])
const BAD_VERDICTS: ReadonlySet<Verdict> = new Set(["wrong", "nf_doc_has", "needless_clarify"])

export interface AssistJudgedComparison {
  /** 두 판 모두 심사된 줄. */
  n: number
  /** 켬 점수 합 − 끔 점수 합(§2.1 점수: good·nf_ok 1, partial 0.5). */
  netGain: number
  /** 좋음(good·nf_ok) → 나쁨(wrong·nf_doc_has·needless_clarify). */
  goodToBad: number
  /** 나쁨 → 좋음. */
  badToGood: number
  /** 전체 줄 수(묶음 전체, 1% 규칙의 분모). */
  total: number
  /** §10 켜기 조건을 모두 만족하는지. */
  pass: boolean
  reasons: string[]
  rows: { id: string; off: Verdict; on: Verdict }[]
}

function verdictsById(file: unknown, label: string) {
  if (!isRecord(file) || !Array.isArray(file.rows)) throw new Error(`${label}: judged 파일(rows)이 아닙니다.`)
  const map = new Map<string, Verdict>()
  for (const row of file.rows) {
    if (!isRecord(row) || typeof row.id !== "string" || !isVerdict(row.verdict)) throw new Error(`${label}: 줄 형식이 틀렸습니다.`)
    map.set(row.id, row.verdict)
  }
  return map
}

/** 끔·켬 심사 결과 맞대기. total 은 바뀌지 않은 줄까지 센 묶음 전체 줄 수(두 묶음이면 합). */
export function compareJudgedAssist(offJudged: unknown, onJudged: unknown, total: number): AssistJudgedComparison {
  const off = verdictsById(offJudged, "끔")
  const on = verdictsById(onJudged, "켬")
  const rows: AssistJudgedComparison["rows"] = []
  for (const [id, offVerdict] of off) {
    const onVerdict = on.get(id)
    if (onVerdict) rows.push({ id, off: offVerdict, on: onVerdict })
  }
  let netGain = 0
  let goodToBad = 0
  let badToGood = 0
  for (const row of rows) {
    netGain += VERDICT_POINTS[row.on] - VERDICT_POINTS[row.off]
    if (GOOD_VERDICTS.has(row.off) && BAD_VERDICTS.has(row.on)) goodToBad += 1
    if (BAD_VERDICTS.has(row.off) && GOOD_VERDICTS.has(row.on)) badToGood += 1
  }
  const reasons: string[] = []
  if (!(netGain > 0)) reasons.push(`순이득 ${netGain} ≤ 0`)
  if (!(goodToBad < badToGood)) reasons.push(`좋음→나쁨 ${goodToBad} ≥ 나쁨→좋음 ${badToGood}`)
  if (!(total > 0 && goodToBad <= total * 0.01)) reasons.push(`좋음→나쁨 ${goodToBad} > 전체 ${total}의 1%`)
  return { n: rows.length, netGain: Math.round(netGain * 100) / 100, goodToBad, badToGood, total, pass: reasons.length === 0, reasons, rows }
}
