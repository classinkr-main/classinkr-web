/**
 * 심사 결과 점수(답 색인 사양 §2.1·§2.4 4단계).
 *
 * 실행:
 *   npx tsx scripts/answer-index/score.ts <judged.json> [더 많은 judged.json …] [--json] [--seed 20261119] [--iterations 10000]
 *
 * - 입력: judge 도구(scripts/answer-index/judge/judge.ts merge)가 만든 judged-<set>-<run>.json({ rows: [{ id, verdict, siteVerdict? }] }),
 *   심사관 결과 파일({ results: [...] }), 또는 같은 꼴의 배열. 여러 파일을 주면 한 묶음으로 센다(id 가 겹치면 오류).
 * - 점수 = (good + nf_ok + 0.5 × partial) ÷ 전체 × 100.
 * - 부트스트랩 90% 구간: 줄을 복원 추출로 n 개 다시 뽑아 점수를 1만 번 계산하고 5번째·95번째 백분위를 쓴다.
 *   난수는 고정 시드(mulberry32)라 같은 입력이면 같은 구간이 나온다.
 * - siteVerdict(공개 페이지 사실까지 근거로 칠 때의 분류, §2.1)가 한 줄이라도 있으면 '공개 페이지 포함' 점수를 함께 낸다.
 * - 이 파일의 함수는 대리 점수(proxy-eval.ts)와 judge 도구도 쓴다.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export const VERDICTS = ["good", "partial", "nf_ok", "wrong", "nf_doc_has", "needless_clarify"] as const
export type Verdict = (typeof VERDICTS)[number]

/** §2.1 분류별 점수. */
export const VERDICT_POINTS: Readonly<Record<Verdict, number>> = {
  good: 1,
  partial: 0.5,
  nf_ok: 1,
  wrong: 0,
  nf_doc_has: 0,
  needless_clarify: 0,
}

export const BOOTSTRAP_SEED = 20261119
export const BOOTSTRAP_ITERATIONS = 10_000
export const BOOTSTRAP_LEVEL = 0.9

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value)
}

export function emptyCounts(): Record<Verdict, number> {
  return Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0])) as Record<Verdict, number>
}

export function countVerdicts(verdicts: readonly Verdict[]): Record<Verdict, number> {
  const counts = emptyCounts()
  for (const verdict of verdicts) counts[verdict] += 1
  return counts
}

/** (good + nf_ok + 0.5 × partial) ÷ 전체 × 100. 줄이 없으면 0. */
export function scoreFromCounts(counts: Readonly<Record<Verdict, number>>): number {
  const total = VERDICTS.reduce((sum, verdict) => sum + counts[verdict], 0)
  if (total === 0) return 0
  const points = VERDICTS.reduce((sum, verdict) => sum + VERDICT_POINTS[verdict] * counts[verdict], 0)
  return (points / total) * 100
}

export function scoreVerdicts(verdicts: readonly Verdict[]): number {
  return scoreFromCounts(countVerdicts(verdicts))
}

/** 고정 시드 난수(mulberry32). [0, 1) 균등. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BootstrapOptions {
  iterations?: number
  seed?: number
  /** 구간 수준(기본 0.9 → 5번째·95번째 백분위). */
  level?: number
}

/**
 * 부트스트랩 백분위 구간. 줄 n 개를 복원 추출로 n 개 뽑아 점수를 iterations 번 계산하고 정렬한 뒤
 * low = 정렬값[floor(B × (1 − level) / 2)], high = 정렬값[ceil(B × (1 + level) / 2) − 1].
 */
export function bootstrapInterval(verdicts: readonly Verdict[], options: BootstrapOptions = {}): { low: number; high: number } {
  const iterations = options.iterations ?? BOOTSTRAP_ITERATIONS
  const level = options.level ?? BOOTSTRAP_LEVEL
  const n = verdicts.length
  if (n === 0) return { low: 0, high: 0 }
  const points = verdicts.map((verdict) => VERDICT_POINTS[verdict])
  const rng = createRng(options.seed ?? BOOTSTRAP_SEED)
  const scores = new Float64Array(iterations)
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let sum = 0
    for (let draw = 0; draw < n; draw += 1) sum += points[Math.floor(rng() * n)]
    scores[iteration] = (sum / n) * 100
  }
  scores.sort()
  const lowIndex = Math.min(iterations - 1, Math.max(0, Math.floor((iterations * (1 - level)) / 2)))
  const highIndex = Math.min(iterations - 1, Math.max(0, Math.ceil((iterations * (1 + level)) / 2) - 1))
  return { low: scores[lowIndex], high: scores[highIndex] }
}

export const round2 = (value: number) => Math.round(value * 100) / 100

export interface ScoreSummary {
  n: number
  counts: Record<Verdict, number>
  score: number
  ci90: { low: number; high: number }
}

export function summarizeVerdicts(verdicts: readonly Verdict[], options: BootstrapOptions = {}): ScoreSummary {
  const interval = bootstrapInterval(verdicts, options)
  return {
    n: verdicts.length,
    counts: countVerdicts(verdicts),
    score: round2(scoreVerdicts(verdicts)),
    ci90: { low: round2(interval.low), high: round2(interval.high) },
  }
}

export interface ScoredRow {
  id: string
  verdict: Verdict
  /** 공개 페이지(개인정보처리방침·약관·푸터 등) 사실도 근거로 칠 때의 분류. 다를 때만 적는다(§2.1). */
  siteVerdict?: Verdict
}

export interface JudgedSummary extends ScoreSummary {
  /** siteVerdict 가 있는 줄이 하나라도 있으면 그 분류로 바꿔 계산한 점수. */
  withSitePages?: ScoreSummary & { changedRows: number }
}

export function summarizeRows(rows: readonly ScoredRow[], options: BootstrapOptions = {}): JudgedSummary {
  const summary: JudgedSummary = summarizeVerdicts(
    rows.map((row) => row.verdict),
    options
  )
  const changed = rows.filter((row) => row.siteVerdict && row.siteVerdict !== row.verdict).length
  if (rows.some((row) => row.siteVerdict)) {
    summary.withSitePages = {
      ...summarizeVerdicts(
        rows.map((row) => row.siteVerdict ?? row.verdict),
        options
      ),
      changedRows: changed,
    }
  }
  return summary
}

/** judged 파일·심사관 결과 파일·배열에서 { id, verdict, siteVerdict } 줄을 꺼낸다. 알 수 없는 분류는 오류. */
export function readScoredRows(raw: unknown, label = "입력"): ScoredRow[] {
  const container = raw as { rows?: unknown; results?: unknown } | null
  const list = Array.isArray(raw) ? raw : Array.isArray(container?.rows) ? container.rows : container?.results
  if (!Array.isArray(list)) throw new Error(`${label}: rows·results 배열이 없습니다.`)
  return list.map((item, index) => {
    const row = item as { id?: unknown; verdict?: unknown; siteVerdict?: unknown }
    const id = typeof row?.id === "string" && row.id ? row.id : null
    if (!id) throw new Error(`${label}: ${index + 1}번째 줄에 id 가 없습니다.`)
    if (!isVerdict(row.verdict)) throw new Error(`${label}: ${id} 의 verdict 를 알 수 없습니다: ${String(row.verdict)}`)
    if (row.siteVerdict !== undefined && row.siteVerdict !== null && !isVerdict(row.siteVerdict)) {
      throw new Error(`${label}: ${id} 의 siteVerdict 를 알 수 없습니다: ${String(row.siteVerdict)}`)
    }
    return { id, verdict: row.verdict, ...(isVerdict(row.siteVerdict) ? { siteVerdict: row.siteVerdict } : {}) }
  })
}

export function formatSummary(summary: ScoreSummary, title: string): string {
  const lines = [
    `${title}: ${summary.score.toFixed(1)}점 (90% 구간 ${summary.ci90.low.toFixed(1)}~${summary.ci90.high.toFixed(1)}, ${summary.n}줄)`,
    `  ${VERDICTS.map((verdict) => `${verdict} ${summary.counts[verdict]}`).join(" · ")}`,
  ]
  return lines.join("\n")
}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index !== -1 ? argv[index + 1] : undefined
}

function main(argv: string[]) {
  const valueFlags = new Set(["--seed", "--iterations"])
  const files = argv.filter((arg, index) => !arg.startsWith("--") && !valueFlags.has(argv[index - 1] ?? ""))
  if (files.length === 0) {
    console.error("사용법: npx tsx scripts/answer-index/score.ts <judged.json> [더 많은 judged.json …] [--json] [--seed N] [--iterations N]")
    process.exit(2)
  }
  const seed = Number(argValue(argv, "--seed") ?? BOOTSTRAP_SEED)
  const iterations = Number(argValue(argv, "--iterations") ?? BOOTSTRAP_ITERATIONS)
  if (!Number.isInteger(seed) || !Number.isInteger(iterations) || iterations < 1) {
    console.error("--seed 는 정수, --iterations 는 1 이상의 정수여야 합니다.")
    process.exit(2)
  }
  const rows: ScoredRow[] = []
  const seen = new Set<string>()
  for (const file of files) {
    for (const row of readScoredRows(JSON.parse(readFileSync(resolve(file), "utf8")), file)) {
      if (seen.has(row.id)) throw new Error(`id 가 겹칩니다: ${row.id} (${file})`)
      seen.add(row.id)
      rows.push(row)
    }
  }
  const summary = summarizeRows(rows, { seed, iterations })
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ files, seed, iterations, ...summary }, null, 2))
    return
  }
  console.log(formatSummary(summary, "점수"))
  if (summary.withSitePages) {
    console.log(formatSummary(summary.withSitePages, `공개 페이지 포함(바뀐 줄 ${summary.withSitePages.changedRows})`))
  }
}

// 테스트·다른 스크립트가 불러올 때는 돌지 않는다.
if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, "/").endsWith("scripts/answer-index/score.ts")) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`점수 계산 실패: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
