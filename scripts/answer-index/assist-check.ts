/**
 * 모델 선택 층 켜기 전 확인(답 색인 사양 §10, I11). 개발용 묶음(두 개)을 compiled 모델 없는 측정 조건(§2.2)에서 모델 선택 층
 * 끔·켬으로 돌려, 답이 바뀐 줄만 심사 입력(judge split 꼴)으로 내보내고 바뀐 줄 수·바뀐 꼴 표를 찍는다. 심사가 끝나면 compare 로
 * 순이득과 켜기 조건(순이득 > 0, 좋음→나쁨 < 나쁨→좋음, 좋음→나쁨 ≤ 전체의 1%)을 본다. 통과할 때만 calibration.json
 * assist.enabled=true 로 둔다(사람이 고친다, 이 도구는 자료를 쓰지 않는다).
 *
 *   npx tsx scripts/answer-index/assist-check.ts run --set dev5=<입력.json> --set holdout1=<입력.json> --out-dir <작업 폴더>
 *       [--assist band|always] [--concurrency 4] [--simulate-gemini 402|hang|429] [--allow-model-errors]
 *   npx tsx scripts/answer-index/assist-check.ts diff --set <이름> --off <끔.jsonl> --on <켬.jsonl> --out-dir <작업 폴더> [--assist band|always]
 *   npx tsx scripts/answer-index/assist-check.ts compare --off <judged-끔.json> --on <judged-켬.json> --total <묶음 전체 줄 수>
 *
 * run: 묶음마다 scripts/chatbot-live-eval.ts 를 두 번 돌린다(--router compiled --mode off --gate off --second-chance off, 그리고
 *   --assist off / --assist <범위>). 결과는 <작업 폴더>/<묶음>-assist-off.jsonl·<묶음>-assist-<범위>.jsonl 이다. 그다음 diff 와 같다.
 *   켬 측정은 모델(Gemini)을 부른다. --simulate-gemini 를 주면 가짜 응답으로 돈다(실제 호출 0, 모델이 실패하므로 바뀐 줄 0).
 * diff: 끔·켬 측정 결과를 id 로 맞대어 바뀐 줄(답 글·상담 버튼·답 모드가 다름)만 골라
 *   <작업 폴더>/judge/<묶음>-assist-off-bNN.json · <묶음>-assist-<범위>-bNN.json(같은 id, 심사관에게는 id·question·answer·sources 만)과
 *   <작업 폴더>/<묶음>-assist-changes.json(바뀐 줄 id·바뀐 꼴·모델 흔적)을 쓴다. 두 판을 따로 judge 절차(A→B→C→merge)로 심사한다.
 * compare: 두 판의 judged-*.json 을 맞댄다. --total 은 바뀌지 않은 줄까지 센 묶음 전체 줄 수(두 묶음이면 합)다.
 *
 * 결과 파일은 저장소에 넣지 않는다(작업 폴더). 종료 코드: 0 정상(compare 는 조건 통과), 1 실패·조건 미달, 2 사용법 오류.
 */

import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { summarizeAssistRows } from "../lib/chatbot-live-eval-checks"
import { batchFileName, splitIntoBatches } from "./judge/lib"
import { changedJudgeRows, compareJudgedAssist, diffAssistRuns, toAssistEvalRow } from "./lib/assist-check-core"

const USAGE = [
  "사용법:",
  "  assist-check.ts run --set <이름>=<입력.json> [--set …] --out-dir <폴더> [--assist band|always] [--concurrency 4] [--simulate-gemini 402|hang|429] [--allow-model-errors]",
  "  assist-check.ts diff --set <이름> --off <끔.jsonl> --on <켬.jsonl> --out-dir <폴더> [--assist band|always]",
  "  assist-check.ts compare --off <judged-끔.json> --on <judged-켬.json> --total <묶음 전체 줄 수>",
].join("\n")

class UsageError extends Error {}

const SAFE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index !== -1 ? argv[index + 1] : undefined
}

function argValues(argv: string[], name: string): string[] {
  const values: string[] = []
  argv.forEach((arg, index) => {
    if (arg === name && argv[index + 1] !== undefined) values.push(argv[index + 1])
  })
  return values
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(resolve(path)), { recursive: true })
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`)
}

function readEvalLines(path: string): unknown[] {
  const text = readFileSync(resolve(path), "utf8")
  if (text.trimStart().startsWith("[")) return JSON.parse(text) as unknown[]
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown)
}

function assistModeArg(argv: string[]) {
  const value = (argValue(argv, "--assist") ?? "band").trim().toLowerCase()
  if (value !== "band" && value !== "always") throw new UsageError(`--assist 는 band|always 중 하나여야 합니다: ${value}`)
  return value
}

/** 고정폭 글꼴에서 보이는 너비(한글·전각은 2칸). */
function displayWidth(text: string) {
  return Array.from(text).reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1), 0)
}

function pad(text: string, width: number) {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)))
}

interface DiffReport {
  set: string
  total: number
  changed: number
  transitions: Record<string, number>
}

/** 끔·켬 결과 → 바뀐 줄 심사 입력·바뀐 꼴 기록. 표에 쓸 요약을 돌려준다. */
function diffAndWrite(options: { set: string; offPath: string; onPath: string; outDir: string; assist: string }): DiffReport {
  const offRows = readEvalLines(options.offPath).map(toAssistEvalRow)
  const onRows = readEvalLines(options.onPath).map(toAssistEvalRow)
  const diff = diffAssistRuns(offRows, onRows)
  if (diff.missing.length > 0) {
    console.error(`경고: ${options.set} 에서 한쪽 판에만 있는 줄 ${diff.missing.length}개(앞 5개 ${diff.missing.slice(0, 5).join(", ")})`)
  }
  const judgeDir = join(options.outDir, "judge")
  const { off, on } = changedJudgeRows(diff.changed)
  const runs: [string, typeof off][] = [
    ["assist-off", off],
    [`assist-${options.assist}`, on],
  ]
  for (const [run, rows] of runs) {
    for (const batch of splitIntoBatches(rows, { set: options.set, run })) writeJson(join(judgeDir, batchFileName(options.set, run, batch.batch)), batch)
  }
  writeJson(join(options.outDir, `${options.set}-assist-changes.json`), {
    set: options.set,
    assist: options.assist,
    total: diff.matched,
    changed: diff.changed.length,
    transitions: diff.transitions,
    rows: diff.changed.map((row) => ({
      id: row.id,
      transition: row.transition,
      off: row.off.decidedBy,
      on: row.on.decidedBy,
      assist: (row.on.answerIndex as { assist?: unknown } | undefined)?.assist ?? null,
    })),
  })
  const assistSummary = summarizeAssistRows(onRows.map((row) => row.answerIndex))
  console.log(
    `${options.set}: 줄 ${diff.matched}, 바뀐 줄 ${diff.changed.length}` +
      ` / 모델에 물은 줄 ${assistSummary.used}, 따른 줄 ${assistSummary.accepted}, 이유 ${JSON.stringify(assistSummary.rejectReasons)}`
  )
  if (diff.changed.length > 0) {
    console.log(`  심사 입력: ${resolve(judgeDir)}/${options.set}-assist-off-bNN.json · ${options.set}-assist-${options.assist}-bNN.json`)
  }
  return { set: options.set, total: diff.matched, changed: diff.changed.length, transitions: diff.transitions }
}

function printTable(reports: DiffReport[]) {
  const transitions = Array.from(new Set(reports.flatMap((report) => Object.keys(report.transitions)))).sort()
  const header = ["바뀐 꼴(결정형 → 최종)", ...reports.map((report) => report.set)]
  const width = Math.max(displayWidth(header[0]) + 2, ...transitions.map((name) => displayWidth(name) + 2))
  console.log("\n==== 바뀐 줄 ====")
  console.log(`${pad(header[0], width)}${header.slice(1).map((name) => pad(name, 12)).join("")}`)
  for (const name of transitions) {
    console.log(`${pad(name, width)}${reports.map((report) => pad(String(report.transitions[name] ?? 0), 12)).join("")}`)
  }
  console.log(`${pad("바뀐 줄 합", width)}${reports.map((report) => pad(`${report.changed}/${report.total}`, 12)).join("")}`)
}

function commandRun(argv: string[]) {
  const sets = argValues(argv, "--set").map((value) => {
    const at = value.indexOf("=")
    if (at <= 0) throw new UsageError(`--set 은 <이름>=<입력.json> 꼴입니다: ${value}`)
    const name = value.slice(0, at)
    if (!SAFE_NAME_RE.test(name)) throw new UsageError(`묶음 이름은 영문·숫자·_ . - 만 씁니다: ${name}`)
    return { name, input: value.slice(at + 1) }
  })
  const outDir = argValue(argv, "--out-dir")
  if (sets.length === 0 || !outDir) throw new UsageError("run 에는 --set 하나 이상과 --out-dir 가 필요합니다.")
  if (sets.length !== 2) console.error(`알림: 사양 §10 은 개발용 묶음 두 개로 확인한다(지금 ${sets.length}개).`)
  const assist = assistModeArg(argv)
  const passthrough: string[] = []
  const concurrency = argValue(argv, "--concurrency")
  if (concurrency) passthrough.push("--concurrency", concurrency)
  const simulate = argValue(argv, "--simulate-gemini")
  if (simulate) passthrough.push("--simulate-gemini", simulate)
  if (argv.includes("--allow-model-errors")) passthrough.push("--allow-model-errors")

  const reports: DiffReport[] = []
  for (const set of sets) {
    const paths = { off: join(outDir, `${set.name}-assist-off.jsonl`), on: join(outDir, `${set.name}-assist-${assist}.jsonl`) }
    for (const [label, mode, out] of [
      ["끔", "off", paths.off],
      ["켬", assist, paths.on],
    ] as const) {
      console.error(`\n[${set.name}] 모델 선택 층 ${label}(${mode}) 측정 → ${resolve(out)}`)
      const result = spawnSync(
        "npx",
        [
          "tsx",
          "scripts/chatbot-live-eval.ts",
          "--in",
          set.input,
          "--out",
          out,
          "--router",
          "compiled",
          "--mode",
          "off",
          "--gate",
          "off",
          "--second-chance",
          "off",
          "--assist",
          mode,
          ...passthrough,
        ],
        { stdio: "inherit", env: process.env }
      )
      if (result.status !== 0) throw new Error(`[${set.name}] ${label} 측정이 종료 코드 ${String(result.status)} 로 끝났습니다.`)
    }
    reports.push(diffAndWrite({ set: set.name, offPath: paths.off, onPath: paths.on, outDir, assist }))
  }
  printTable(reports)
}

function commandDiff(argv: string[]) {
  const set = argValue(argv, "--set")
  const offPath = argValue(argv, "--off")
  const onPath = argValue(argv, "--on")
  const outDir = argValue(argv, "--out-dir")
  if (!set || !offPath || !onPath || !outDir) throw new UsageError("diff 에는 --set·--off·--on·--out-dir 가 필요합니다.")
  if (!SAFE_NAME_RE.test(set)) throw new UsageError(`묶음 이름은 영문·숫자·_ . - 만 씁니다: ${set}`)
  printTable([diffAndWrite({ set, offPath, onPath, outDir, assist: assistModeArg(argv) })])
}

function commandCompare(argv: string[]) {
  const offPath = argValue(argv, "--off")
  const onPath = argValue(argv, "--on")
  const total = Number(argValue(argv, "--total"))
  if (!offPath || !onPath || !Number.isInteger(total) || total <= 0) throw new UsageError("compare 에는 --off·--on·--total(양의 정수)이 필요합니다.")
  const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(path), "utf8"))
  const result = compareJudgedAssist(readJson(offPath), readJson(onPath), total)
  console.log(
    `바뀐 줄 ${result.n} / 전체 ${result.total}: 순이득 ${result.netGain}, 좋음→나쁨 ${result.goodToBad}, 나쁨→좋음 ${result.badToGood}`
  )
  console.log(result.pass ? "켜기 조건 통과(§10): calibration.json assist.enabled=true 로 둘 수 있다." : `켜기 조건 미달: ${result.reasons.join("; ")}`)
  if (!result.pass) process.exitCode = 1
}

function main() {
  const [command, ...argv] = process.argv.slice(2)
  try {
    if (command === "run") commandRun(argv)
    else if (command === "diff") commandDiff(argv)
    else if (command === "compare") commandCompare(argv)
    else throw new UsageError(command ? `모르는 명령: ${command}` : "명령이 없습니다.")
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`오류: ${error.message}\n${USAGE}`)
      process.exit(2)
    }
    console.error(`실패: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

main()
