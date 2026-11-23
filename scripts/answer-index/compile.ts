/**
 * 답 색인 컴파일 점검(사양 §3.10, §9.1 1). 자료를 읽고 색인을 만들어 색인 해시·크기·걸린 시간을 찍는다. 파일은 쓰지 않는다.
 *
 * 실행:
 *   npx tsx scripts/answer-index/compile.ts [--json]
 *   (자료 폴더는 ANSWER_INDEX_DATA_DIR 또는 data/answer-index)
 *
 * - 같은 자료면 같은 색인 해시(answerIndexHash)가 나온다. 판(ANSWER_INDEX_VERSION 꼴) = manifest dataVersion + 계산 규칙 판.
 * - KEEP 카드는 런타임과 같이 지금 옛 답 글 해시로 대조한다(curated.ts). 색인에서 뺀 카드는 이유별로 센다.
 * - 크기: 색인의 타입 배열 바이트 합(대략의 메모리), 프로세스 힙·외부 메모리 증가.
 * 네트워크·모델 호출 없음.
 */
import { ANSWER_INDEX_COMPILER_VERSION, answerIndexHash, compileAnswerIndex, type CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { curatedTextHash } from "@/lib/chatbot/answer-index/curated"
import { loadAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import { dataDir, hasFlag } from "./lib/common"

function typedBytes(value: unknown, seen = new Set<unknown>()): number {
  if (!value || typeof value !== "object" || seen.has(value)) return 0
  seen.add(value)
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (value instanceof Map) {
    let sum = 0
    for (const item of value.values()) sum += typedBytes(item, seen)
    return sum
  }
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + typedBytes(item, seen), 0)
  let sum = 0
  for (const item of Object.values(value as Record<string, unknown>)) sum += typedBytes(item, seen)
  return sum
}

function indexBytes(index: CompiledAnswerIndex) {
  const { currentUnits: _units, cards: _cards, ...rest } = index
  void _units
  void _cards
  return typedBytes(rest)
}

const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10

function main() {
  const argv = process.argv.slice(2)
  const dir = dataDir()
  const memoryBefore = process.memoryUsage()
  const loadStarted = performance.now()
  const data = loadAnswerIndexData({ dir, curatedTextHash })
  const loadMs = performance.now() - loadStarted
  const index = compileAnswerIndex(data)
  const hash = answerIndexHash(index)
  const memoryAfter = process.memoryUsage()

  const excludedByReason: Record<string, number> = {}
  for (const card of data.excluded) {
    const reason = card.reason.split(":")[0]
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1
  }
  const report = {
    dir,
    dataVersion: index.dataVersion,
    version: `${index.dataVersion}+c${ANSWER_INDEX_COMPILER_VERSION}`,
    indexHash: hash,
    calibration: { version: index.calibration.version, fitted: index.calibration.fitted, dataVersion: index.calibration.dataVersion },
    stats: { ...index.stats, phaseMs: Object.fromEntries(Object.entries(index.stats.phaseMs).map(([phase, ms]) => [phase, Math.round(ms)])) },
    loadMs: Math.round(loadMs),
    sizeMb: { typedArrays: mb(indexBytes(index)), heapDelta: mb(memoryAfter.heapUsed - memoryBefore.heapUsed), externalDelta: mb(memoryAfter.external - memoryBefore.external) },
    excluded: { total: data.excluded.length, byReason: excludedByReason },
    skipped: data.skipped,
    problems: data.problems,
    curatedUnchecked: data.report.curatedUnchecked,
  }

  if (hasFlag(argv, "--json")) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  console.log("답 색인 컴파일")
  console.log(`  자료 폴더: ${dir}`)
  console.log(`  판: ${report.version} · 색인 해시 ${hash}`)
  console.log(`  보정: ${report.calibration.version}${report.calibration.fitted ? "" : "(calibration.json 없음 — 기본값)"}`)
  console.log(
    `  카드 ${index.stats.cards} · 변형 ${index.stats.variants} · 우주 ${index.stats.universe} · 반례 ${index.stats.negatives} · 특징 ${index.stats.features} · 단위 ${index.stats.units}`
  )
  console.log(`  읽기 ${report.loadMs}ms · 컴파일 ${Math.round(index.stats.compileMs)}ms ${JSON.stringify(report.stats.phaseMs)}`)
  console.log(`  크기: 타입 배열 ${report.sizeMb.typedArrays}MB · 힙 +${report.sizeMb.heapDelta}MB · 외부 +${report.sizeMb.externalDelta}MB`)
  console.log(`  색인에서 뺀 카드 ${data.excluded.length}개 ${JSON.stringify(excludedByReason)}`)
  if (data.skipped.length > 0) console.log(`  읽지 않은 파일(합치지 않은 조각 등) ${data.skipped.length}개: ${data.skipped.slice(0, 10).join(", ")}`)
  if (data.problems.length > 0) {
    console.log(`  문제 ${data.problems.length}개:`)
    for (const problem of data.problems.slice(0, 20)) console.log(`    - ${problem}`)
  }
}

main()
