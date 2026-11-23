/**
 * 심사 절차 도구(답 색인 사양 §2.4). 사용법·파일 형식은 같은 폴더 README.md.
 *
 *   npx tsx scripts/answer-index/judge/judge.ts split --in <측정.jsonl> --set <set> --run <run> --out-dir <폴더> [--size 50]
 *   npx tsx scripts/answer-index/judge/judge.ts check <X.A.json | X.B.json | X.C.json>
 *   npx tsx scripts/answer-index/judge/judge.ts select-b <X.json>
 *   npx tsx scripts/answer-index/judge/judge.ts disagreements <X.json>
 *   npx tsx scripts/answer-index/judge/judge.ts merge [--set <set>] [--run <run>] [--out-dir <폴더>] <X.json> [더 많은 X.json …]
 *
 * 종료 코드: 0 정상, 1 입력·형식 오류(메시지에 줄 id), 2 사용법 오류.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

import { formatSummary, summarizeRows } from "../score"
import {
  batchFileName,
  buildDisagreements,
  combineBatches,
  judgedFileName,
  judgePaths,
  mergeBatch,
  requireJudgeFile,
  selectForB,
  splitIntoBatches,
  toJudgeRow,
  validateJudgeFile,
  type CInputRow,
  type FinalBatch,
  type JudgeBatch,
  type JudgeId,
  type JudgeInputRow,
} from "./lib"

const USAGE = [
  "사용법:",
  "  judge.ts split --in <측정.jsonl> --set <set> --run <run> --out-dir <폴더> [--size 50]",
  "  judge.ts check <X.A.json | X.B.json | X.C.json>",
  "  judge.ts select-b <X.json>",
  "  judge.ts disagreements <X.json>",
  "  judge.ts merge [--set <set>] [--run <run>] [--out-dir <폴더>] <X.json> [더 많은 X.json …]",
].join("\n")

class UsageError extends Error {}

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index !== -1 ? argv[index + 1] : undefined
}

/** 값 플래그와 그 값을 뺀 나머지 인자. */
function positional(argv: string[], valueFlags: string[]) {
  return argv.filter((arg, index) => !arg.startsWith("--") && !valueFlags.includes(argv[index - 1] ?? ""))
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(path), "utf8"))

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(resolve(path)), { recursive: true })
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`)
}

const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

function readBatch<Row extends JudgeInputRow = JudgeInputRow>(path: string, stage?: JudgeId): JudgeBatch<Row> {
  if (!existsSync(resolve(path))) throw new Error(`파일이 없습니다: ${path}`)
  const raw = readJson(path) as Partial<JudgeBatch<Row>> | null
  if (!raw || !Array.isArray(raw.rows) || typeof raw.set !== "string" || typeof raw.run !== "string" || typeof raw.batch !== "number") {
    throw new Error(`심사 입력 형식이 아닙니다(set·run·batch·rows): ${path}`)
  }
  if (stage && raw.stage !== stage) throw new Error(`${path}: stage 가 ${stage} 여야 합니다(지금: ${String(raw.stage)}).`)
  return raw as JudgeBatch<Row>
}

function readJudge(path: string, judge: JudgeId, expectedIds: readonly string[]) {
  if (!existsSync(resolve(path))) throw new Error(`심사관 ${judge} 결과가 없습니다: ${path}`)
  return requireJudgeFile(readJson(path), { judge, expectedIds, label: path })
}

function readEvalLines(path: string): unknown[] {
  const text = readFileSync(resolve(path), "utf8")
  if (text.trimStart().startsWith("[")) return JSON.parse(text) as unknown[]
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown)
}

function commandSplit(argv: string[]) {
  const inPath = argValue(argv, "--in")
  const set = argValue(argv, "--set")
  const run = argValue(argv, "--run")
  const outDir = argValue(argv, "--out-dir")
  if (!inPath || !set || !run || !outDir) throw new UsageError("split 에는 --in·--set·--run·--out-dir 가 필요합니다.")
  if (!SAFE_NAME_RE.test(set) || !SAFE_NAME_RE.test(run)) throw new UsageError("--set·--run 은 영문·숫자·_ . - 만 씁니다.")
  const size = Number(argValue(argv, "--size") ?? 50)
  const batches = splitIntoBatches(readEvalLines(inPath).map(toJudgeRow), { set, run, size })
  for (const batch of batches) writeJson(join(outDir, batchFileName(set, run, batch.batch)), batch)
  console.log(`배치 ${batches.length}개(줄 ${batches.reduce((sum, batch) => sum + batch.rows.length, 0)}개) → ${resolve(outDir)}`)
  for (const batch of batches) console.log(`  ${join(outDir, batchFileName(set, run, batch.batch))} (${batch.rows.length}줄)`)
}

/** X.A.json·X.B.json·X.C.json → 그 결과가 답해야 할 입력 파일과 심사관. */
function stageOf(resultPath: string): { judge: JudgeId; inputPath: string } {
  const match = resultPath.match(/^(.*)\.(A|B|C)\.json$/)
  if (!match) throw new UsageError(`check 에는 X.A.json·X.B.json·X.C.json 을 줍니다: ${resultPath}`)
  const stem = match[1]
  const judge = match[2] as JudgeId
  const inputPath = judge === "A" ? `${stem}.json` : judge === "B" ? `${stem}.Bin.json` : `${stem}.Cin.json`
  return { judge, inputPath }
}

function commandCheck(argv: string[]) {
  const [resultPath] = positional(argv, [])
  if (!resultPath) throw new UsageError("check 에 결과 파일을 주세요.")
  const { judge, inputPath } = stageOf(resultPath)
  const batch = readBatch(inputPath, judge)
  let raw: unknown
  try {
    raw = readJson(resultPath)
  } catch (error) {
    throw new Error(`${resultPath}: JSON 으로 읽지 못했습니다(${error instanceof Error ? error.message : String(error)}).`)
  }
  const { errors } = validateJudgeFile(raw, { judge, expectedIds: batch.rows.map((row) => row.id) })
  if (errors.length > 0) throw new Error(`${resultPath} 형식 오류 ${errors.length}건:\n- ${errors.join("\n- ")}`)
  console.log(`통과: ${resultPath} (심사관 ${judge}, ${batch.rows.length}줄)`)
}

function commandSelectB(argv: string[]) {
  const [batchPath] = positional(argv, [])
  if (!batchPath) throw new UsageError("select-b 에 배치 입력(X.json)을 주세요.")
  const paths = judgePaths(batchPath)
  const batch = readBatch(paths.input, "A")
  const aFile = readJudge(paths.a, "A", batch.rows.map((row) => row.id))
  const ids = new Set(selectForB(batch.rows, aFile))
  const bBatch: JudgeBatch = { ...batch, stage: "B", rows: batch.rows.filter((row) => ids.has(row.id)) }
  writeJson(paths.bIn, bBatch)
  const verdicts = new Map(aFile.results.map((result) => [result.id, result.verdict]))
  const goodSampled = bBatch.rows.filter((row) => verdicts.get(row.id) === "good").length
  console.log(`B 입력 ${bBatch.rows.length}줄(A 가 good 이 아닌 줄 ${bBatch.rows.length - goodSampled}, good 표본 ${goodSampled}) → ${paths.bIn}`)
}

function commandDisagreements(argv: string[]) {
  const [batchPath] = positional(argv, [])
  if (!batchPath) throw new UsageError("disagreements 에 배치 입력(X.json)을 주세요.")
  const paths = judgePaths(batchPath)
  const batch = readBatch(paths.input, "A")
  const aFile = readJudge(paths.a, "A", batch.rows.map((row) => row.id))
  const bBatch = readBatch(paths.bIn, "B")
  const bFile = readJudge(paths.b, "B", bBatch.rows.map((row) => row.id))
  const rows = buildDisagreements(bBatch.rows, aFile, bFile)
  const cBatch: JudgeBatch<CInputRow> = { ...batch, stage: "C", rows }
  writeJson(paths.cIn, cBatch)
  console.log(
    rows.length > 0 ? `A·B 가 다른 줄 ${rows.length}개 → ${paths.cIn}` : `A·B 가 다른 줄 없음(심사관 C 단계 없음) → ${paths.cIn}`
  )
}

function mergeOne(batchPath: string): FinalBatch {
  const paths = judgePaths(batchPath)
  const batch = readBatch(paths.input, "A")
  const aFile = readJudge(paths.a, "A", batch.rows.map((row) => row.id))
  if (!existsSync(resolve(paths.bIn))) throw new Error(`B 입력이 없습니다. select-b 를 먼저 돌리세요: ${paths.bIn}`)
  const bBatch = readBatch(paths.bIn, "B")
  const bIds = bBatch.rows.map((row) => row.id)
  const bFile = bIds.length > 0 ? readJudge(paths.b, "B", bIds) : null
  const cBatch = existsSync(resolve(paths.cIn)) ? readBatch<CInputRow>(paths.cIn, "C") : null
  const cIds = cBatch?.rows.map((row) => row.id) ?? []
  const cFile = cIds.length > 0 ? readJudge(paths.c, "C", cIds) : null
  const final = mergeBatch({ batch, a: aFile, bIds, b: bFile, c: cFile })
  writeJson(paths.final, final)
  return final
}

function commandMerge(argv: string[]) {
  const batchPaths = positional(argv, ["--set", "--run", "--out-dir"])
  if (batchPaths.length === 0) throw new UsageError("merge 에 배치 입력(X.json)을 하나 이상 주세요.")
  const set = argValue(argv, "--set")
  const run = argValue(argv, "--run")
  if ((set && !SAFE_NAME_RE.test(set)) || (run && !SAFE_NAME_RE.test(run))) throw new UsageError("--set·--run 은 영문·숫자·_ . - 만 씁니다.")
  const finals = batchPaths.map(mergeOne)
  const judged = combineBatches(finals, { set, run })
  const outDir = argValue(argv, "--out-dir") ?? dirname(batchPaths[0])
  const outPath = join(outDir, judgedFileName(judged.set, judged.run))
  const summary = summarizeRows(judged.rows)
  writeJson(outPath, { ...judged, sources: batchPaths.map((path) => basename(path)), summary })
  console.log(`배치 ${finals.length}개 합침 → ${outPath}`)
  console.log(`이견(A·B 가 다른 줄) ${judged.disagreements} / ${judged.n}`)
  console.log(formatSummary(summary, "점수"))
  if (summary.withSitePages) {
    console.log(formatSummary(summary.withSitePages, `공개 페이지 포함(바뀐 줄 ${summary.withSitePages.changedRows})`))
  }
}

function main(argv: string[]) {
  const [command, ...rest] = argv
  switch (command) {
    case "split":
      return commandSplit(rest)
    case "check":
      return commandCheck(rest)
    case "select-b":
      return commandSelectB(rest)
    case "disagreements":
      return commandDisagreements(rest)
    case "merge":
      return commandMerge(rest)
    default:
      throw new UsageError(command ? `알 수 없는 명령: ${command}` : "명령을 주세요.")
  }
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, "/").endsWith("scripts/answer-index/judge/judge.ts")) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`오류: ${error.message}\n${USAGE}`)
      process.exit(2)
    }
    console.error(`오류: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
