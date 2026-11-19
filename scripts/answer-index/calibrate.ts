/**
 * 보정(답 색인 사양 §8.2, I9): 보정 묶음으로 점수 가중치·카드 종류별 확신도 계수·문턱을 맞춰 calibration.json 을 쓴다.
 * 방법은 lib/calibrate-core.ts 머리말. 보정 묶음(eval/calibration-set.json)이 없으면 기본 문턱·기본 계수로 만든다.
 *
 * 실행:
 *   npx tsx scripts/answer-index/calibrate.ts [--set <보정 묶음.json>] [--out <calibration.json>] [--dry-run] [--no-grid]
 *     [--partial doc=0.15,fixed=0.05] [--json]
 *   (자료 폴더는 ANSWER_INDEX_DATA_DIR 또는 data/answer-index)
 *
 * - 기본 출력은 <자료 폴더>/calibration.json 이고, 쓴 뒤 manifest.json 을 다시 쓴다(dataVersion 에 보정이 들어간다).
 *   --out 으로 다른 곳에 쓰면 manifest 는 건드리지 않는다. --dry-run 은 쓰지 않고 결과만 찍는다.
 * - 같은 자료·같은 보정 묶음이면 같은 바이트가 나온다(시각·난수 없음, 부트스트랩은 고정 시드).
 * - 개발용·확정용 묶음은 쓰지 않는다(§8.2 5·6). 확정용 묶음 문장을 이 도구에 넣지 않는다.
 */
import { join, resolve } from "node:path"
import { ANSWER_CARD_KINDS, type AnswerCardKind } from "@/lib/chatbot/answer-index/types"
import { argValues, dataDir, hasFlag, repoRoot, stableJson, writeJsonFile } from "./lib/common"
import { DEFAULT_PARTIAL_RATES, runCalibration } from "./lib/calibrate-core"
import { updateManifest } from "./lib/manifest"

function usage(message: string): never {
  console.error(message)
  console.error(
    "사용법: npx tsx scripts/answer-index/calibrate.ts [--set <보정 묶음.json>] [--out <calibration.json>] [--dry-run] [--no-grid] [--partial doc=0.15,fixed=0.05] [--json]"
  )
  process.exit(2)
}

function parsePartial(values: string[]): Record<AnswerCardKind, number> {
  const rates = { ...DEFAULT_PARTIAL_RATES }
  for (const value of values.flatMap((entry) => entry.split(","))) {
    const [kind, raw] = value.split("=")
    const rate = Number(raw)
    if (!(ANSWER_CARD_KINDS as readonly string[]).includes(kind) || !Number.isFinite(rate) || rate < 0 || rate > 1) usage(`--partial 값이 잘못됐습니다: ${value}`)
    rates[kind as AnswerCardKind] = rate
  }
  return rates
}

function main() {
  const argv = process.argv.slice(2)
  const root = repoRoot()
  const dir = dataDir(root)
  const setArg = argValues(argv, "--set")[0]
  const outArg = argValues(argv, "--out")[0]
  const dryRun = hasFlag(argv, "--dry-run")
  const json = hasFlag(argv, "--json")
  const log = json ? () => {} : (line: string) => console.error(line)

  const { calibration, report } = runCalibration({
    dir,
    setPath: setArg ? resolve(root, setArg) : undefined,
    grid: !hasFlag(argv, "--no-grid"),
    partialRates: parsePartial(argValues(argv, "--partial")),
    log,
  })

  const outPath = outArg ? resolve(root, outArg) : join(dir, "calibration.json")
  if (!dryRun) {
    writeJsonFile(outPath, calibration)
    if (!outArg) updateManifest({}, dir)
  }
  if (json) {
    console.log(JSON.stringify({ out: dryRun ? null : outPath, calibration, report }, null, 2))
    return
  }
  console.log("답 색인 보정")
  console.log(`  보정 묶음: ${report.set} · 문항 ${report.counts.items} → 맞춤 ${report.counts.fit} · 확인 ${report.counts.check} · 뺀 문항 ${JSON.stringify(report.counts.skipped)}`)
  if (report.defaults) {
    console.log("  기본값(보정 묶음 없음 또는 문항·카드 부족): 가중치·계수·문턱 모두 compile.ts DEFAULT_*")
  } else {
    console.log(`  맞춘 종류: ${report.fittedKinds.join(", ") || "(없음 — 모두 기본 계수)"} · 종류별 1위 문항 ${JSON.stringify(report.kindCounts)}`)
    console.log(`  가중치 ${JSON.stringify(calibration.weights)}${report.voteDropped ? " (옛 정규식 vote 는 이득이 0.5점 이하라 0)" : ""}`)
    console.log(`  문턱 ${JSON.stringify(calibration.thresholds)}${report.spreadRuleRelaxed ? " (세 비율 차 1점 이하인 θ 가 없는 종류가 있어 차가 가장 작은 θ 에서 골랐다)" : ""}`)
    console.log(`  확인용 대리 점수 ${report.checkScore} · 부트스트랩 10번째 ${calibration.fit.bootstrapP10} · 세 비율 차 ${report.checkSpread}`)
  }
  console.log(`  판 ${calibration.version} · 자료 ${calibration.dataVersion}`)
  console.log(dryRun ? "  (--dry-run: 쓰지 않음)" : `  썼음: ${outPath}${outArg ? "" : " (manifest.json 갱신)"}`)
  if (dryRun) process.stdout.write(stableJson(calibration))
}

main()
