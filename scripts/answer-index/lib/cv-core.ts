/**
 * 변형 교차 검증 계산(scripts/answer-index/cv.ts). 설명은 cv.ts 머리말.
 */
import { createHash } from "node:crypto"
import { compileAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { decide } from "@/lib/chatbot/answer-index/decide"
import { collectLegacyVotes } from "@/lib/chatbot/answer-index/legacy-votes"
import type { LoadedAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import { prepareText } from "@/lib/chatbot/answer-index/normalize"
import type { AnswerVariant } from "@/lib/chatbot/answer-index/types"

export interface CvRow {
  fold: number
  card: string
  kind: string
  area: string
  q: string
  /** 순위 1위 실제 카드(문턱 무관). */
  top1: string | null
  /** 결정: 카드 id(answer·gap) 또는 (abstain)·(clarify). */
  decided: string
  conf: number
}

/**
 * 겹 열쇠: 질문 쪽 정규화 글(prepareText(q).compact — 브랜드 지우기·라우팅 풀이·정규화·꼬리 떼기·공백 지우기).
 * 정규화가 같은 변형(같은 카드 안이든 다른 카드든)은 같은 겹에 들어가 서로의 정답을 새지 않는다(진단 R19).
 * 정규화 글이 비면 원문을 쓴다.
 */
export function cvFoldKey(q: string) {
  return prepareText(q).compact || q
}

export function cvFoldOf(q: string, folds: number) {
  return parseInt(createHash("sha256").update(cvFoldKey(q), "utf8").digest("hex").slice(0, 8), 16) % folds
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10)

export interface CvOptions {
  folds?: number
  /** 겹마다 카드당 뺄 변형 수 상한. */
  limit?: number | null
  /** 혼동 표 줄 수. */
  top?: number
  /** false 면 옛 정규식 표를 넘기지 않는다(기본: 런타임처럼 collectLegacyVotes(변형, null, legacy-alias)). */
  votes?: boolean
  log?: (line: string) => void
}

export interface CvGroup {
  n: number
  decided: number
  top1: number
  notFound: number
}

export interface CvSummary {
  folds: number
  heldOut: number
  cards: number
  top1Accuracy: number
  decidedAccuracy: number
  notFoundRate: number
  wrongRate: number
  byKind: Record<string, CvGroup>
  byArea: Record<string, CvGroup>
  confusions: { pair: string; count: number }[]
}

export function runVariantCv(data: LoadedAnswerIndexData, options: CvOptions = {}): { summary: CvSummary; rows: CvRow[] } {
  const folds = options.folds ?? 5
  const limit = options.limit ?? null
  const topN = options.top ?? 30
  const useVotes = options.votes !== false
  const cardInfo = new Map(data.cards.map((card) => [card.id, { kind: card.kind, area: card.area }]))
  const rows: CvRow[] = []
  for (let fold = 0; fold < folds; fold += 1) {
    const kept = new Map<string, AnswerVariant[]>()
    const held: { card: string; q: string }[] = []
    for (const cardId of Array.from(data.variants.keys()).sort()) {
      const list = data.variants.get(cardId) ?? []
      const keep: AnswerVariant[] = []
      let taken = 0
      for (const variant of list) {
        if (cvFoldOf(variant.q, folds) === fold && (limit === null || taken < limit)) {
          held.push({ card: cardId, q: variant.q })
          taken += 1
        } else {
          keep.push(variant)
        }
      }
      kept.set(cardId, keep)
    }
    const index = compileAnswerIndex({ ...data, variants: kept })
    for (const item of held) {
      const votes = useVotes ? collectLegacyVotes(item.q, null, index.legacyAlias) : []
      const decision = decide(index, item.q, { env: {}, votes })
      const info = cardInfo.get(item.card)
      rows.push({
        fold,
        card: item.card,
        kind: info?.kind ?? "?",
        area: info?.area ?? "?",
        q: item.q,
        top1: decision.top.find((candidate) => candidate.id !== "none")?.id ?? null,
        decided: decision.kind === "answer" || decision.kind === "gap" ? (decision.card ?? `(${decision.kind})`) : `(${decision.kind})`,
        conf: Math.round(decision.conf * 1000) / 1000,
      })
    }
    options.log?.(`  겹 ${fold + 1}/${folds}: 뺀 변형 ${held.length}개`)
  }

  const n = rows.length
  const rankHit = rows.filter((row) => row.top1 === row.card).length
  const decidedHit = rows.filter((row) => row.decided === row.card).length
  const notFound = rows.filter((row) => row.decided.startsWith("(")).length
  const confusion = new Map<string, number>()
  for (const row of rows) {
    if (row.decided === row.card) continue
    const key = `${row.card} → ${row.decided.startsWith("(") ? `${row.decided} [1위 ${row.top1 ?? "없음"}]` : row.decided}`
    confusion.set(key, (confusion.get(key) ?? 0) + 1)
  }
  const groupBy = (key: (row: CvRow) => string) => {
    const groups = new Map<string, { n: number; hit: number; rank: number; notFound: number }>()
    for (const row of rows) {
      const group = groups.get(key(row)) ?? { n: 0, hit: 0, rank: 0, notFound: 0 }
      group.n += 1
      if (row.decided === row.card) group.hit += 1
      if (row.top1 === row.card) group.rank += 1
      if (row.decided.startsWith("(")) group.notFound += 1
      groups.set(key(row), group)
    }
    return Object.fromEntries(
      Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, group]) => [name, { n: group.n, decided: pct(group.hit, group.n), top1: pct(group.rank, group.n), notFound: pct(group.notFound, group.n) }])
    )
  }
  return {
    rows,
    summary: {
      folds,
      heldOut: n,
      cards: new Set(rows.map((row) => row.card)).size,
      top1Accuracy: pct(rankHit, n),
      decidedAccuracy: pct(decidedHit, n),
      notFoundRate: pct(notFound, n),
      wrongRate: pct(n - decidedHit - notFound, n),
      byKind: groupBy((row) => row.kind),
      byArea: groupBy((row) => row.area),
      confusions: Array.from(confusion.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, topN)
        .map(([pair, count]) => ({ pair, count })),
    },
  }
}
