/**
 * 보정(답 색인 사양 §8.2, I9 — 진단 R1 단계 3): 질문 우주(universe/)를 관점 5겹으로 나눈 교차 맞춤으로 점수 가중치·카드 종류별
 * 확신도 계수·문턱을 맞춰 calibration.json 을 쓴다. 보정 묶음(eval/calibration-set.json)은 외부 확인에만 쓴다.
 * 방법은 lib/calibrate-core.ts 머리말, 사양과 다른 점은 README '보정이 사양 §8.2 와 다른 점'. 쓸 우주 문항이 없으면 기본 문턱·기본 계수로 만든다.
 *
 * 실행:
 *   npx tsx scripts/answer-index/calibrate.ts [--set <보정 묶음.json>] [--out <calibration.json>] [--dry-run] [--no-grid]
 *     [--partial doc=0.15,fixed=0.05] [--report <보고.md>] [--cache-dir <폴더>] [--no-cache] [--json]
 *   (자료 폴더는 ANSWER_INDEX_DATA_DIR 또는 data/answer-index)
 *
 * - 기본 출력은 <자료 폴더>/calibration.json 이고, 쓴 뒤 manifest.json 을 다시 쓴다(dataVersion 에 보정이 들어간다).
 *   --out 으로 다른 곳에 쓰면 manifest 는 건드리지 않는다. --dry-run 은 쓰지 않고 결과만 찍는다.
 * - --report: 고른 값·중첩 점수·우주 OOF·외부 확인·점수 대 NODOC 곡선·격자 상위를 마크다운으로 쓴다(질문 글 없음).
 * - 같은 자료·같은 우주면 같은 바이트가 나온다(시각·난수 없음, 부트스트랩은 고정 시드). 격자 108점을 다 훑으면 수십 분 걸린다:
 *   진행은 표준 오류로 찍고, 격자 점 결과는 node_modules/.cache/answer-index-calibrate/(--cache-dir 로 바꿈, --no-cache 로 끔)에
 *   둔다. 캐시 열쇠는 방법 판·자료 판·컴파일 색인 해시·우주 겹·표·표본 분석 해시라, 무엇이 바뀌면 처음부터 다시 잰다.
 *   캐시는 격자 훑기만 줄이고 고른 가중치의 계수·문턱은 언제나 다시 계산한다.
 * - 개발용·확정용 묶음은 쓰지 않는다(§8.2 5·6). 확정용 묶음 문장을 이 도구에 넣지 않는다.
 */
import { writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { ANSWER_CARD_KINDS, type AnswerCardKind } from "@/lib/chatbot/answer-index/types"
import { argValues, dataDir, hasFlag, repoRoot, stableJson, writeJsonFile } from "./lib/common"
import { DEFAULT_PARTIAL_RATES, renderCalibrationReport, runCalibration } from "./lib/calibrate-core"
import { updateManifest } from "./lib/manifest"

function usage(message: string): never {
  console.error(message)
  console.error(
    "사용법: npx tsx scripts/answer-index/calibrate.ts [--set <보정 묶음.json>] [--out <calibration.json>] [--dry-run] [--no-grid] [--partial doc=0.15,fixed=0.05] [--report <보고.md>] [--cache-dir <폴더>] [--no-cache] [--json]"
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
  const reportArg = argValues(argv, "--report")[0]
  const cacheArg = argValues(argv, "--cache-dir")[0]
  const dryRun = hasFlag(argv, "--dry-run")
  const json = hasFlag(argv, "--json")
  const log = json ? () => {} : (line: string) => console.error(line)
  const cacheDir = hasFlag(argv, "--no-cache") ? undefined : resolve(root, cacheArg ?? join("node_modules", ".cache", "answer-index-calibrate"))

  const { calibration, report } = runCalibration({
    dir,
    setPath: setArg ? resolve(root, setArg) : undefined,
    grid: !hasFlag(argv, "--no-grid"),
    partialRates: parsePartial(argValues(argv, "--partial")),
    cacheDir,
    log,
  })

  const outPath = outArg ? resolve(root, outArg) : join(dir, "calibration.json")
  if (!dryRun) {
    writeJsonFile(outPath, calibration)
    if (!outArg) updateManifest({}, dir)
  }
  if (reportArg) writeFileSync(resolve(root, reportArg), renderCalibrationReport(calibration, report))
  if (json) {
    console.log(JSON.stringify({ out: dryRun ? null : outPath, calibration, report }, null, 2))
    return
  }
  const c = report.counts
  console.log("답 색인 보정")
  console.log(`  맞춤 자료: ${report.set} · 우주 ${c.universe} → 쓸 문항 ${c.usable} · 관점 ${c.personas} → ${c.folds}겹 · 뺀 문항 ${JSON.stringify(c.skipped)}`)
  if (report.defaults) {
    console.log("  기본값(쓸 우주 문항·관점 부족 또는 카드 없음): 가중치·계수·문턱 모두 compile.ts DEFAULT_*")
  } else {
    console.log(`  확신도: 제 모델 ${report.fittedKinds.join(", ") || "없음"} · 공용 모델 ${report.pooledKinds.join(", ") || "없음"} · 종류별 맞춤 행 ${JSON.stringify(report.kindCounts)}`)
    console.log(`  가중치 ${JSON.stringify(calibration.weights)}${report.voteDropped ? " (옛 정규식 vote 는 이득이 0.5점 이하라 0)" : ""} · 격자 ${report.grid.length}점(캐시 ${report.gridCached})`)
    console.log(`  문턱 ${JSON.stringify(calibration.thresholds)} · 제약 ${report.selection?.met ? "지킴" : "못 지킴"}(λ ${report.selection?.lambda})`)
    if (report.nested) {
      const n = report.nested
      console.log(`  우주 중첩 교차 검증: 대리 ${n.score}(관점 부트스트랩 10번째 ${n.bootstrap.p10}) · 진짜 NODOC 답함 ${n.trueNodoc}% · NODOC 전체 ${n.nodoc}%`)
    }
    if (report.oof) {
      const o = report.oof
      console.log(
        `  우주 OOF(고른 θ): 대리 ${o.score} · 1위 정답 ${o.top1.pct}% · 결정 정답 ${o.decided.pct}% · 진짜 NODOC 답함 ${o.trueNodocAnswered.pct}%(${o.trueNodocAnswered.hit}/${o.trueNodocAnswered.n})`
      )
    }
    if (report.external) {
      const e = report.external
      console.log(
        `  보정 묶음 외부 확인(${e.n}문항): 대리 ${e.score} · 1위 정답 ${e.top1.pct}% · 결정 정답 ${e.decided.pct}% · 진짜 NODOC 답함 ${e.trueNodocAnswered.hit}/${e.trueNodocAnswered.n} · NODOC 전체 ${e.nodocAnswered.hit}/${e.nodocAnswered.n}`
      )
    }
  }
  console.log(`  판 ${calibration.version} · 자료 ${calibration.dataVersion} · ${report.seconds}초`)
  if (reportArg) console.log(`  보고: ${resolve(root, reportArg)}`)
  console.log(dryRun ? "  (--dry-run: 쓰지 않음)" : `  썼음: ${outPath}${outArg ? "" : " (manifest.json 갱신)"}`)
  if (dryRun) process.stdout.write(stableJson(calibration))
}

main()
