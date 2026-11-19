/**
 * 변형 교차 검증(답 색인 사양 §9.1 1, I9): 카드 변형을 5겹으로 나눠, 한 겹을 색인에서 빼고 컴파일한 뒤 뺀 변형으로 판정한다.
 * 결과는 1위 정답률·결정 정답률·못 찾음 비율·엉뚱한 카드 비율과 혼동 표(정답 카드 → 고른 카드)다. 파일은 쓰지 않는다(--out 제외).
 *
 * 실행:
 *   npx tsx scripts/answer-index/cv.ts [--folds 5] [--limit <카드당 변형 수>] [--top 30] [--out <줄별 결과.json>] [--json]
 *   (자료 폴더는 ANSWER_INDEX_DATA_DIR 또는 data/answer-index)
 *
 * - 겹 나누기: sha256(카드 id + 줄바꿈 + 변형 글) 앞 8자리 % 겹 수. 같은 자료면 같은 나눔·같은 결과다.
 * - 판정은 런타임 decide 그대로다(보정 파일·기본 문턱). 옛 정규식 표(vote)와 CHATBOT_COMPILED_* 환경변수는 쓰지 않는다.
 * - 변형만 본다(우주 라벨·보정 묶음은 calibrate.ts). 개발용·확정용 묶음 문장은 읽지 않는다.
 * 네트워크·모델 호출 없음.
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { curatedTextHash } from "@/lib/chatbot/answer-index/curated"
import { loadAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import { argValues, dataDir, hasFlag, repoRoot } from "./lib/common"
import { runVariantCv } from "./lib/cv-core"

function positiveInt(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`${name} 은 1 이상 정수여야 합니다: ${value}`)
    process.exit(2)
  }
  return parsed
}

function main() {
  const argv = process.argv.slice(2)
  const root = repoRoot()
  const dir = dataDir(root)
  const folds = positiveInt(argValues(argv, "--folds")[0], 5, "--folds")
  if (folds < 2) {
    console.error("--folds 는 2 이상이어야 합니다.")
    process.exit(2)
  }
  const limitArg = argValues(argv, "--limit")[0]
  const limit = limitArg ? positiveInt(limitArg, 1, "--limit") : null
  const top = positiveInt(argValues(argv, "--top")[0], 30, "--top")
  const outArg = argValues(argv, "--out")[0]
  const json = hasFlag(argv, "--json")

  const started = performance.now()
  const data = loadAnswerIndexData({ dir, curatedTextHash })
  const { summary, rows } = runVariantCv(data, { folds, limit, top, log: json ? undefined : (line) => console.error(line) })
  const seconds = Math.round((performance.now() - started) / 100) / 10

  if (outArg) writeFileSync(resolve(root, outArg), `${JSON.stringify({ dir, summary, rows }, null, 2)}\n`)
  if (json) {
    console.log(JSON.stringify({ dir, seconds, ...summary }, null, 2))
    return
  }
  console.log(`답 색인 변형 교차 검증(${folds}겹)`)
  if (summary.heldOut === 0) {
    console.log("  변형이 없어 잴 것이 없습니다.")
    return
  }
  console.log(`  뺀 변형 ${summary.heldOut}개 · 카드 ${summary.cards}장 · ${seconds}초`)
  console.log(
    `  1위 정답률 ${summary.top1Accuracy}% · 결정 정답률 ${summary.decidedAccuracy}% · 못 찾음 ${summary.notFoundRate}% · 엉뚱한 카드 ${summary.wrongRate}%`
  )
  console.log("  종류별(결정/1위/못 찾음 %):")
  for (const [kind, group] of Object.entries(summary.byKind)) console.log(`    ${kind}: ${group.decided}/${group.top1}/${group.notFound} (n=${group.n})`)
  console.log("  영역별(결정/1위/못 찾음 %):")
  for (const [area, group] of Object.entries(summary.byArea)) console.log(`    ${area}: ${group.decided}/${group.top1}/${group.notFound} (n=${group.n})`)
  console.log(`  혼동 표(정답 카드 → 고른 카드, 상위 ${top}):`)
  for (const { pair, count } of summary.confusions) console.log(`    ${count}  ${pair}`)
  if (outArg) console.log(`  줄별 결과: ${resolve(root, outArg)}`)
}

main()
