/**
 * 심사 절차(답 색인 사양 §2.4)의 순수 함수. 파일 입출력은 judge.ts 가 한다. 사용법은 같은 폴더 README.md.
 *
 * 파일 이름 규칙(배치 입력이 X.json 일 때):
 *   X.A.json  심사관 A 결과       X.Bin.json  심사관 B 입력      X.B.json  심사관 B 결과
 *   X.Cin.json 심사관 C 입력      X.C.json    심사관 C 결과      X.final.json 배치 최종
 */

import { createHash } from "node:crypto"

import { isVerdict, type Verdict } from "../score"

export const BATCH_SIZE = 50
/** 심사관 B 가 다시 보는 good 의 몫(§2.4 2단계). */
export const B_GOOD_SHARE = 0.15
/** good 표본을 고르는 해시의 소금. 바꾸면 표본이 바뀌므로 바꾸지 않는다. */
export const B_SAMPLE_SALT = "answer-index-judge-b/v1"
/** nf_ok 의 '찾아본 낱말' 최소 수. */
export const NF_OK_MIN_SEARCHED = 3

export type JudgeId = "A" | "B" | "C"

export interface JudgeSource {
  path: string | null
  heading: string | null
  title: string | null
}

export interface JudgeInputRow {
  id: string
  question: string
  answer: string
  sources: JudgeSource[]
}

/** 심사 입력 파일(X.json·X.Bin.json). C 입력(X.Cin.json)은 줄마다 judgments 가 더 붙는다. */
export interface JudgeBatch<Row extends JudgeInputRow = JudgeInputRow> {
  set: string
  run: string
  batch: number
  stage: JudgeId
  rows: Row[]
}

export interface JudgeEvidence {
  path: string
  quote?: string
}

export interface JudgeResult {
  id: string
  verdict: Verdict
  evidence: JudgeEvidence[]
  searched: string[]
  note: string
  /** 공개 페이지(개인정보처리방침·약관·푸터 등) 사실도 근거로 칠 때 분류가 달라지면 그 분류(§2.1). */
  siteVerdict?: Verdict
}

export interface JudgeFile {
  judge: JudgeId
  results: JudgeResult[]
}

export interface JudgmentForC {
  judge: "A" | "B"
  verdict: Verdict
  evidence: JudgeEvidence[]
  searched: string[]
  note: string
  siteVerdict?: Verdict
}

export interface CInputRow extends JudgeInputRow {
  judgments: JudgmentForC[]
}

export interface FinalRow {
  id: string
  verdict: Verdict
  siteVerdict?: Verdict
  evidence: JudgeEvidence[]
  searched: string[]
  note: string
  /** 최종 분류를 낸 심사관: A(B 가 보지 않음)·AB(A·B 같음)·C(A·B 가 달라 C 가 정함). */
  decidedBy: "A" | "AB" | "C"
  /** A·B 가 달랐는지. */
  disagreement: boolean
  judges: { A: Verdict; B?: Verdict; C?: Verdict }
}

export interface FinalBatch {
  set: string
  run: string
  batch: number
  rows: FinalRow[]
}

export interface JudgedFile {
  set: string
  run: string
  batches: number[]
  n: number
  disagreements: number
  rows: FinalRow[]
}

// ── 경로 ───────────────────────────────────────────────────────────────────────────────────────

export function judgePaths(batchPath: string) {
  if (!batchPath.endsWith(".json")) throw new Error(`배치 입력은 .json 이어야 합니다: ${batchPath}`)
  const stem = batchPath.slice(0, -".json".length)
  if (/\.(?:A|B|C|Bin|Cin|final)$/.test(stem)) {
    throw new Error(`배치 입력(X.json)을 주세요. 심사 단계 파일이 왔습니다: ${batchPath}`)
  }
  return {
    input: batchPath,
    a: `${stem}.A.json`,
    bIn: `${stem}.Bin.json`,
    b: `${stem}.B.json`,
    cIn: `${stem}.Cin.json`,
    c: `${stem}.C.json`,
    final: `${stem}.final.json`,
  }
}

export function judgedFileName(set: string, run: string) {
  return `judged-${set}-${run}.json`
}

// ── split ──────────────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const stringOrNull = (value: unknown) => (typeof value === "string" ? value : null)

/** 측정 결과 줄(scripts/chatbot-live-eval.ts) → 심사 입력 줄(id·question·answer·sources). 다른 필드는 심사관에게 주지 않는다. */
export function toJudgeRow(raw: unknown): JudgeInputRow {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) throw new Error("측정 결과 줄에 id 가 없습니다.")
  if (typeof raw.question !== "string") throw new Error(`${raw.id}: question 이 없습니다.`)
  const sources = Array.isArray(raw.sources) ? raw.sources.filter(isRecord) : []
  return {
    id: raw.id,
    question: raw.question,
    answer: typeof raw.answer === "string" ? raw.answer : "(답 없음: 측정 오류)",
    sources: sources.map((source) => ({
      path: stringOrNull(source.path ?? source.urlPath),
      heading: stringOrNull(source.heading),
      title: stringOrNull(source.title),
    })),
  }
}

export function splitIntoBatches(
  rows: readonly JudgeInputRow[],
  options: { set: string; run: string; size?: number }
): JudgeBatch[] {
  const size = options.size ?? BATCH_SIZE
  if (!Number.isInteger(size) || size < 1) throw new Error(`배치 크기는 1 이상의 정수여야 합니다: ${size}`)
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`id 가 겹칩니다: ${row.id}`)
    seen.add(row.id)
  }
  const batches: JudgeBatch[] = []
  for (let start = 0; start < rows.length; start += size) {
    batches.push({ set: options.set, run: options.run, batch: batches.length + 1, stage: "A", rows: rows.slice(start, start + size) })
  }
  return batches
}

export function batchFileName(set: string, run: string, batch: number) {
  return `${set}-${run}-b${String(batch).padStart(2, "0")}.json`
}

// ── 결과 파일 확인 ───────────────────────────────────────────────────────────────────────────────

/** 심사관 결과 파일을 읽어 형식을 확인한다. 오류 목록이 비어 있어야 통과. */
export function validateJudgeFile(
  raw: unknown,
  options: { judge: JudgeId; expectedIds: readonly string[] }
): { file: JudgeFile | null; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(raw)) return { file: null, errors: ["JSON 객체가 아닙니다."] }
  if (raw.judge !== options.judge) errors.push(`judge 가 "${options.judge}" 여야 합니다(지금: ${JSON.stringify(raw.judge)}).`)
  if (!Array.isArray(raw.results)) return { file: null, errors: [...errors, "results 배열이 없습니다."] }

  const expected = new Set(options.expectedIds)
  const seen = new Set<string>()
  const results: JudgeResult[] = []
  raw.results.forEach((item, index) => {
    const where = `results[${index}]`
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) {
      errors.push(`${where}: id 가 없습니다.`)
      return
    }
    const id = item.id
    if (seen.has(id)) errors.push(`${id}: 두 번 나옵니다.`)
    seen.add(id)
    if (!expected.has(id)) errors.push(`${id}: 입력에 없는 id 입니다.`)
    if (!isVerdict(item.verdict)) {
      errors.push(`${id}: verdict 가 good·partial·nf_ok·wrong·nf_doc_has·needless_clarify 중 하나가 아닙니다(${JSON.stringify(item.verdict)}).`)
      return
    }
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.filter(isRecord).map((entry) => ({
          path: typeof entry.path === "string" ? entry.path.trim() : "",
          ...(typeof entry.quote === "string" ? { quote: entry.quote.trim() } : {}),
        }))
      : []
    if (item.evidence !== undefined && !Array.isArray(item.evidence)) errors.push(`${id}: evidence 는 배열이어야 합니다.`)
    const searched = Array.isArray(item.searched)
      ? item.searched.filter((word): word is string => typeof word === "string" && word.trim().length > 0)
      : []
    if (item.searched !== undefined && !Array.isArray(item.searched)) errors.push(`${id}: searched 는 배열이어야 합니다.`)
    if (item.verdict === "nf_ok") {
      if (searched.length < NF_OK_MIN_SEARCHED) errors.push(`${id}: nf_ok 는 찾아본 낱말(searched)이 ${NF_OK_MIN_SEARCHED}개 이상이어야 합니다.`)
      if (!evidence.some((entry) => entry.path)) errors.push(`${id}: nf_ok 는 본 문서 경로(evidence[].path)가 하나 이상 있어야 합니다.`)
    }
    if (item.verdict === "nf_doc_has" || item.verdict === "wrong") {
      if (!evidence.some((entry) => entry.path && entry.quote)) {
        errors.push(`${id}: ${item.verdict} 는 근거 문장(evidence[].path + quote)이 하나 이상 있어야 합니다.`)
      }
    }
    if (item.siteVerdict !== undefined && item.siteVerdict !== null && !isVerdict(item.siteVerdict)) {
      errors.push(`${id}: siteVerdict 를 알 수 없습니다(${JSON.stringify(item.siteVerdict)}).`)
    }
    results.push({
      id,
      verdict: item.verdict,
      evidence,
      searched,
      note: typeof item.note === "string" ? item.note : "",
      ...(isVerdict(item.siteVerdict) && item.siteVerdict !== item.verdict ? { siteVerdict: item.siteVerdict } : {}),
    })
  })
  for (const id of options.expectedIds) if (!seen.has(id)) errors.push(`${id}: 결과가 없습니다.`)
  return { file: errors.length === 0 ? { judge: options.judge, results } : null, errors }
}

/** 확인을 통과하지 못하면 오류를 던진다. */
export function requireJudgeFile(raw: unknown, options: { judge: JudgeId; expectedIds: readonly string[]; label: string }): JudgeFile {
  const { file, errors } = validateJudgeFile(raw, options)
  if (!file) throw new Error(`${options.label} 형식 오류 ${errors.length}건:\n- ${errors.slice(0, 20).join("\n- ")}`)
  return file
}

// ── select-b ───────────────────────────────────────────────────────────────────────────────────

export function sampleHash(id: string, salt = B_SAMPLE_SALT) {
  return createHash("sha256").update(`${salt}\n${id}`).digest("hex")
}

/**
 * 심사관 B 가 다시 볼 id(§2.4 2단계): A 가 good 이 아니라고 본 줄 전부(nf_ok 포함) + good 가운데 ceil(15%)개.
 * good 표본은 id 해시(sampleHash)가 작은 순서로 고르므로 줄 순서·실행 시각과 상관없이 같다. 돌려주는 순서는 입력 순서.
 */
export function selectForB(rows: readonly JudgeInputRow[], aFile: JudgeFile, options: { share?: number; salt?: string } = {}): string[] {
  const verdictById = new Map(aFile.results.map((result) => [result.id, result.verdict]))
  const good = rows.filter((row) => verdictById.get(row.id) === "good").map((row) => row.id)
  const take = Math.ceil(good.length * (options.share ?? B_GOOD_SHARE))
  const sampled = new Set(
    good
      .map((id) => ({ id, hash: sampleHash(id, options.salt) }))
      .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
      .slice(0, take)
      .map((entry) => entry.id)
  )
  return rows.filter((row) => verdictById.get(row.id) !== "good" || sampled.has(row.id)).map((row) => row.id)
}

// ── disagreements ──────────────────────────────────────────────────────────────────────────────

const toJudgment = (judge: "A" | "B", result: JudgeResult): JudgmentForC => ({
  judge,
  verdict: result.verdict,
  evidence: result.evidence,
  searched: result.searched,
  note: result.note,
  ...(result.siteVerdict ? { siteVerdict: result.siteVerdict } : {}),
})

/** A·B 가 다른 줄 → 심사관 C 입력 줄(두 판정과 근거를 함께 준다). siteVerdict 만 다른 줄도 C 가 본다. */
export function buildDisagreements(rows: readonly JudgeInputRow[], aFile: JudgeFile, bFile: JudgeFile): CInputRow[] {
  const aById = new Map(aFile.results.map((result) => [result.id, result]))
  const bById = new Map(bFile.results.map((result) => [result.id, result]))
  const out: CInputRow[] = []
  for (const row of rows) {
    const a = aById.get(row.id)
    const b = bById.get(row.id)
    if (!a || !b) continue
    if (a.verdict === b.verdict && (a.siteVerdict ?? a.verdict) === (b.siteVerdict ?? b.verdict)) continue
    out.push({ ...row, judgments: [toJudgment("A", a), toJudgment("B", b)] })
  }
  return out
}

// ── merge ──────────────────────────────────────────────────────────────────────────────────────

const finalFrom = (
  result: JudgeResult,
  decidedBy: FinalRow["decidedBy"],
  judges: FinalRow["judges"],
  disagreement: boolean
): FinalRow => ({
  id: result.id,
  verdict: result.verdict,
  ...(result.siteVerdict ? { siteVerdict: result.siteVerdict } : {}),
  evidence: result.evidence,
  searched: result.searched,
  note: result.note,
  decidedBy,
  disagreement,
  judges,
})

/**
 * 배치 하나의 최종 분류. B 가 보지 않은 줄은 A, A·B 가 같으면 그 판정(근거는 A), 다르면 C.
 * B 입력에 든 줄은 B 결과가, A·B 가 다른 줄은 C 결과가 있어야 한다(없으면 오류).
 */
export function mergeBatch(options: {
  batch: JudgeBatch
  a: JudgeFile
  bIds: readonly string[]
  b: JudgeFile | null
  c: JudgeFile | null
}): FinalBatch {
  const { batch, a, b, c } = options
  const aById = new Map(a.results.map((result) => [result.id, result]))
  const bById = new Map((b?.results ?? []).map((result) => [result.id, result]))
  const cById = new Map((c?.results ?? []).map((result) => [result.id, result]))
  const bSet = new Set(options.bIds)
  const missing: string[] = []
  const rows: FinalRow[] = []
  for (const row of batch.rows) {
    const aResult = aById.get(row.id)
    if (!aResult) {
      missing.push(`${row.id}: A 결과 없음`)
      continue
    }
    if (!bSet.has(row.id)) {
      rows.push(finalFrom(aResult, "A", { A: aResult.verdict }, false))
      continue
    }
    const bResult = bById.get(row.id)
    if (!bResult) {
      missing.push(`${row.id}: B 결과 없음`)
      continue
    }
    const sameSite = (aResult.siteVerdict ?? aResult.verdict) === (bResult.siteVerdict ?? bResult.verdict)
    if (aResult.verdict === bResult.verdict && sameSite) {
      rows.push(finalFrom(aResult, "AB", { A: aResult.verdict, B: bResult.verdict }, false))
      continue
    }
    const cResult = cById.get(row.id)
    if (!cResult) {
      missing.push(`${row.id}: A·B 가 달라(${aResult.verdict}/${bResult.verdict}) C 결과가 필요합니다`)
      continue
    }
    rows.push(finalFrom(cResult, "C", { A: aResult.verdict, B: bResult.verdict, C: cResult.verdict }, aResult.verdict !== bResult.verdict))
  }
  if (missing.length > 0) throw new Error(`배치 ${batch.batch} 를 합칠 수 없습니다:\n- ${missing.join("\n- ")}`)
  return { set: batch.set, run: batch.run, batch: batch.batch, rows }
}

/** 여러 배치 최종 → judged-<set>-<run>.json. set·run 이 섞이면 오류(합칠 때 따로 정해 준 값이 있으면 그 값). */
export function combineBatches(finals: readonly FinalBatch[], override: { set?: string; run?: string } = {}): JudgedFile {
  if (finals.length === 0) throw new Error("합칠 배치가 없습니다.")
  const set = override.set ?? finals[0].set
  const run = override.run ?? finals[0].run
  if (!override.set && finals.some((batch) => batch.set !== set)) throw new Error("배치마다 set 이 다릅니다. --set 으로 정해 주세요.")
  if (!override.run && finals.some((batch) => batch.run !== run)) throw new Error("배치마다 run 이 다릅니다. --run 으로 정해 주세요.")
  const seen = new Set<string>()
  const rows: FinalRow[] = []
  for (const batch of [...finals].sort((x, y) => x.batch - y.batch)) {
    for (const row of batch.rows) {
      if (seen.has(row.id)) throw new Error(`id 가 여러 배치에 있습니다: ${row.id}`)
      seen.add(row.id)
      rows.push(row)
    }
  }
  return {
    set,
    run,
    batches: finals.map((batch) => batch.batch).sort((x, y) => x - y),
    n: rows.length,
    disagreements: rows.filter((row) => row.disagreement).length,
    rows,
  }
}
