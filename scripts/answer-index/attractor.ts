/**
 * 쏠림 카드 지표(R3 e 묶음): 서로 다른 질문에 같은 카드가 자꾸 나가는지 카드별로 센다. 판정 정의는 lib/attractor-core.ts.
 *
 * 실행:
 *   npx tsx scripts/answer-index/attractor.ts --set <이름>=<측정.jsonl>[,<proxy 줄별.json>]... [--keys <이름>=<정답 키.json>]...
 *     [--watch <카드 id 목록 .json | 쉼표 목록>] [--new-batch <묶음 이름>] [--top 20] [--out <결과.json>]
 *     [--cards data/answer-index/cards] [--alias data/answer-index/legacy-alias.json] [--inventory data/answer-index/inventory.json]
 *
 * - --set: 측정 결과(scripts/chatbot-live-eval.ts JSONL)와, 있으면 그 결과의 대리 점수 줄별 판정(proxy-eval.ts --out). 판정이 없는 묶음
 *   (실제 상담 123 등)은 이긴 수·1위 수만 센다.
 * - --keys: (측정 담당만) 그 묶음의 정답 키. 틀린 줄의 '서로 다른 정답 카드 수'를 세는 데만 쓴다. 키 글·정답 카드 id 는 결과에 싣지 않고
 *   화면에도 찍지 않는다. 확정용 묶음(holdout)은 넣지 않는다.
 * - --watch: 지켜볼 카드(지난 조사의 상위 20장 등)의 지표를 따로 묶는다. 앞단은 front:<표시>(예: front:handoff, front:policy)로 쓴다.
 * - --new-batch: provenance.unit 이 이 이름으로 시작하는 카드(예: team1126 축약 카드)를 새 카드로 표시하고 그 가운데 쏠림 후보 수를 센다.
 * - 결과 JSON: summary, top(점수 상위), candidates(쏠림 후보), watch(지켜볼 카드와 합계). 질문 글은 싣지 않는다.
 * 모델·네트워크·데이터베이스를 부르지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { argValues } from "./lib/common"
import {
  buildGoldIndex,
  computeAttractors,
  goldCardsForKey,
  watchedCards,
  watchTotals,
  type AttractorCardStat,
  type AttractorRowInput,
  type AttractorVerdict,
} from "./lib/attractor-core"
import { buildAliasIndex, buildInventoryIndex, readAnswerKeys, readCards, readEvalRows, readInventory } from "./proxy-eval"

function usage(message?: string): never {
  if (message) console.error(message)
  console.error(
    "사용법: npx tsx scripts/answer-index/attractor.ts --set <이름>=<측정.jsonl>[,<proxy 줄별.json>]... [--keys <이름>=<키.json>]... [--watch <목록>] [--new-batch <이름>] [--top 20] [--out <결과.json>]"
  )
  process.exit(2)
}

const VERDICTS: ReadonlySet<string> = new Set(["good", "partial", "wrong", "nf_ok", "nf_doc_has", "needless_clarify"])

function parseNamed(values: string[], flag: string) {
  return values.map((value) => {
    const at = value.indexOf("=")
    if (at <= 0) usage(`${flag} 는 <이름>=<경로> 꼴: ${value}`)
    return { name: value.slice(0, at), path: value.slice(at + 1) }
  })
}

function readWatch(value: string | undefined): string[] {
  if (!value) return []
  if (value.endsWith(".json") && existsSync(resolve(value))) {
    const raw = JSON.parse(readFileSync(resolve(value), "utf8")) as unknown
    const list = Array.isArray(raw) ? raw : (raw as { cards?: unknown } | null)?.cards
    if (!Array.isArray(list)) usage(`--watch 파일은 카드 id 배열 또는 { cards: [...] }: ${value}`)
    return list.map((item) => (typeof item === "string" ? item : String((item as { card?: unknown; id?: unknown }).card ?? (item as { id?: unknown }).id)))
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean)
}

function line(entry: AttractorCardStat) {
  return (
    `${entry.card} [${entry.kind}]${entry.isNew ? " (새)" : ""} 이김 ${entry.wins} · good ${entry.good}/부분 ${entry.partial}/오 ${entry.wrong}/막음 ${entry.nfDocHas}` +
    ` · 1위 ${entry.top1}(막힘 ${entry.top1Blocked}) · 정답 묶음 ${entry.goldGroups}(겹침 합침 ${entry.goldClusters}) · 점수 ${entry.score}${entry.candidate ? " · 쏠림 후보" : ""}`
  )
}

function main() {
  const argv = process.argv.slice(2)
  const sets = parseNamed(argValues(argv, "--set"), "--set")
  if (sets.length === 0) usage("--set 이 없습니다.")
  const keySpecs = parseNamed(argValues(argv, "--keys"), "--keys")
  const top = Number(argValues(argv, "--top")[0] ?? 20)
  if (!Number.isInteger(top) || top < 1) usage("--top 은 1 이상 정수")
  const cardsPath = resolve(argValues(argv, "--cards")[0] ?? "data/answer-index/cards")
  const aliasPath = resolve(argValues(argv, "--alias")[0] ?? "data/answer-index/legacy-alias.json")
  const inventoryPath = resolve(argValues(argv, "--inventory")[0] ?? "data/answer-index/inventory.json")
  const cards = existsSync(cardsPath) ? readCards(cardsPath) : new Map()
  const newBatch = argValues(argv, "--new-batch")[0]
  const kindOf = (card: string) => cards.get(card)?.kind
  const newCard = newBatch
    ? (card: string) => {
        const unit = (cards.get(card) as { provenance?: { unit?: unknown } } | undefined)?.provenance?.unit
        return typeof unit === "string" && unit.startsWith(newBatch)
      }
    : undefined

  // 정답 후보(측정 담당만): 키 → 카드 묶음. 키 글은 여기서만 읽고 밖으로 내지 않는다.
  const goldBySet = new Map<string, Map<string, string[]>>()
  if (keySpecs.length > 0) {
    const alias = existsSync(aliasPath) ? buildAliasIndex(JSON.parse(readFileSync(aliasPath, "utf8"))) : undefined
    const inventory = existsSync(inventoryPath) ? buildInventoryIndex(readInventory(JSON.parse(readFileSync(inventoryPath, "utf8")))) : undefined
    const index = buildGoldIndex(cards, inventory, alias)
    for (const spec of keySpecs) {
      const { keys } = readAnswerKeys(JSON.parse(readFileSync(resolve(spec.path), "utf8")))
      goldBySet.set(spec.name, new Map(keys.map((key) => [key.id, goldCardsForKey(index, key)])))
    }
  }

  const rows: AttractorRowInput[] = []
  for (const spec of sets) {
    const [resultsPath, proxyPath] = spec.path.split(",")
    const evalRows = readEvalRows(readFileSync(resolve(resultsPath), "utf8"))
    const verdicts = new Map<string, AttractorVerdict>()
    if (proxyPath) {
      const raw = JSON.parse(readFileSync(resolve(proxyPath), "utf8")) as { rows?: Array<{ id?: unknown; verdict?: unknown }> }
      for (const item of raw.rows ?? []) if (typeof item.id === "string" && typeof item.verdict === "string" && VERDICTS.has(item.verdict)) verdicts.set(item.id, item.verdict as AttractorVerdict)
    }
    const gold = goldBySet.get(spec.name)
    for (const row of evalRows) {
      if (row.router !== undefined && row.router !== "compiled") continue
      rows.push({ set: spec.name, id: row.id, decidedBy: row.decidedBy ?? "unknown", answerIndex: row.answerIndex, verdict: verdicts.get(row.id) ?? null, gold: gold?.get(row.id) ?? null })
    }
  }

  const { cards: stats, summary } = computeAttractors(rows, { top, kindOf, newCard })
  const watch = readWatch(argValues(argv, "--watch")[0])
  const watched = watch.length > 0 ? watchedCards(stats, watch, kindOf) : []
  const result = {
    summary,
    top: stats.slice(0, top),
    candidates: stats.filter((entry) => entry.candidate).map((entry) => entry.card),
    ...(watch.length > 0 ? { watch: { totals: watchTotals(watched), cards: watched } } : {}),
  }
  const out = argValues(argv, "--out")[0]
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true })
    writeFileSync(resolve(out), `${JSON.stringify(result, null, 2)}\n`)
  }
  console.log(
    `쏠림 지표: 줄 ${summary.rows} · 답한 줄 ${summary.answered}(카드 ${summary.answeringCards}장) · wrong+partial ${summary.wrongPartial} · 상위 ${top}장 wrong+partial ${summary.topWrongPartial}` +
      ` · 이긴 몫 상위 5 ${summary.winShareTop5}%/상위 20 ${summary.winShareTop20}% · 쏠림 후보 ${summary.candidates} · 정답 묶음 3+ ${summary.goldGroups3}` +
      ` · gap 막음 ${summary.gapBlocks} · 앞단 오답 ${summary.frontWrong}${newBatch ? ` · 새 카드 쏠림 후보 ${summary.newCandidates}` : ""}`
  )
  for (const [name, set] of Object.entries(summary.sets)) console.log(`  ${name}: 줄 ${set.rows} · 판정 ${set.verdictRows} · 정답 후보 ${set.goldRows}`)
  for (const entry of stats.slice(0, top)) console.log(`  ${line(entry)}`)
  if (watch.length > 0) {
    const totals = watchTotals(watched)
    console.log(`지켜볼 카드 ${totals.cards}장: 이김 ${totals.wins} · wrong+partial ${totals.wrongPartial} · gap 막음 ${totals.gapBlocks} · 앞단 오답 ${totals.frontWrong} · 쏠림 후보 ${totals.candidates}`)
  }
}

try {
  main()
} catch (error) {
  console.error(`쏠림 지표 실패: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
