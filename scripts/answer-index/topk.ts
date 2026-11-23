/**
 * 라벨용 상위 카드 덤프(D9 우주 라벨·D10 보정 라벨·혼동 정리용). 질문마다 지금 색인의 상위 k 카드와 공백 카드 후보, 지금 결정을
 * JSON Lines 로 쓴다. 색인은 런타임과 같은 경로(load → compile)로 만들고 결정도 decide 와 같은 계산이다(lib/topk-core.ts).
 *
 * 실행:
 *   npx tsx scripts/answer-index/topk.ts --in <질문.json> [--out <결과.jsonl>] [--k 20] [--data-dir <자료 폴더>] [--no-votes]
 *   npm run answer-index:topk -- --in <질문.json> --out <결과.jsonl>
 *
 * - 입력: [{ id, q }] 배열, 우주 샤드 꼴([{ id, q, p, m, label, … }]), 측정 입력([{ id, question }]) 또는 { items | questions | cases }.
 * - 자료 폴더: --data-dir > ANSWER_INDEX_DATA_DIR > data/answer-index(뒤 둘은 런타임 answerIndexDataDir() 그대로: 상대 경로는 작업 폴더 기준).
 *   합치지 않은 조각 파일은 런타임처럼 읽지 않는다(merge 뒤 쓴다).
 * - 한 줄: { id, q, scope, decision: { kind, card, conf, partial, absentHit, absentTail, abstainReason, segments }, votes,
 *   top: [{ rank, id, kind, area, topic, covers, notCovers, answerPreview, s, conf }], absent: [{ id, form, label, gapCard, inIndex, topic, answerPreview }] }
 * - --no-votes: 옛 정규식 표를 넣지 않는다(교차 검증·보정과 같은 조건).
 * - 개발용·확정용 묶음 문장을 이 도구에 넣지 않는다(라벨은 우주·보정 묶음에만 단다). 네트워크·모델 호출 없음.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { argValues, hasFlag } from "./lib/common"
import { buildTopKIndex, readTopKQuestions, topKDataDir, topKForQuestion, TOPK_DEFAULT_K, type TopKRow } from "./lib/topk-core"
import { answerIndexVersionOf } from "@/lib/chatbot/answer-index"

function usage(message?: string): never {
  if (message) console.error(message)
  console.error("사용법: npx tsx scripts/answer-index/topk.ts --in <질문.json> [--out <결과.jsonl>] [--k 20] [--data-dir <자료 폴더>] [--no-votes]")
  process.exit(2)
}

function main() {
  const argv = process.argv.slice(2)
  const inPath = argValues(argv, "--in")[0]
  if (!inPath) usage("--in 이 없습니다.")
  const kArg = argValues(argv, "--k")[0]
  const k = kArg === undefined ? TOPK_DEFAULT_K : Number(kArg)
  if (!Number.isInteger(k) || k < 1) usage(`--k 는 1 이상 정수여야 합니다: ${kArg}`)
  const dir = topKDataDir(argValues(argv, "--data-dir")[0])
  const outArg = argValues(argv, "--out")[0]
  const votes = !hasFlag(argv, "--no-votes")

  const questions = readTopKQuestions(JSON.parse(readFileSync(resolve(process.cwd(), inPath), "utf8")))
  const started = performance.now()
  const { data, index } = buildTopKIndex({ dir })
  console.error(
    `답 색인 상위 ${k} 덤프: 자료 ${dir} · 판 ${answerIndexVersionOf(index)} · 카드 ${index.stats.cards}(뺀 카드 ${data.excluded.length}) · 질문 ${questions.length}` +
      (data.skipped.length > 0 ? ` · 읽지 않은 파일 ${data.skipped.length}(합치지 않은 조각 등)` : "") +
      (votes ? "" : " · 옛 정규식 표 없음")
  )

  const outPath = outArg ? resolve(process.cwd(), outArg) : null
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, "")
  }
  const kinds: Record<string, number> = {}
  let outOfScope = 0
  for (const question of questions) {
    const row: TopKRow = topKForQuestion(index, question, { k, votes })
    kinds[row.decision.kind] = (kinds[row.decision.kind] ?? 0) + 1
    if (row.scope === "out") outOfScope += 1
    const line = `${JSON.stringify(row)}\n`
    if (outPath) appendFileSync(outPath, line)
    else process.stdout.write(line)
  }
  const seconds = Math.round((performance.now() - started) / 100) / 10
  console.error(`결정 ${JSON.stringify(kinds)} · 범위 밖 ${outOfScope} · ${seconds}초${outPath ? ` · ${outPath}` : ""}`)
}

try {
  main()
} catch (error) {
  console.error(`상위 카드 덤프 실패: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
