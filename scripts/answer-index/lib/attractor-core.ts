/**
 * 쏠림 카드 지표(R3 e 묶음, scripts/answer-index/attractor.ts 의 본체). 서로 다른 질문에 같은 카드가 자꾸 나가는지 카드별로 센다.
 * 모델·네트워크·데이터베이스를 부르지 않는 순수 함수만 둔다. 시험: tests/chatbot/answer-index/attractor.test.ts
 *
 * 입력(묶음마다)
 * - 측정 결과 줄(scripts/chatbot-live-eval.ts JSONL): decidedBy·answerIndex(결정·top·segments).
 * - 대리 점수 줄별 판정(proxy-eval --out 의 rows[].verdict). 없으면 판정 칸은 비운다(이긴 수·1위 수만 센다).
 * - (측정 담당만) 정답 후보: 줄마다 '이 카드로 답했으면 good' 인 카드 묶음. CLI 가 정답 키로 만들어 넘긴다. 이 모듈은 키 글을 보지 않고
 *   카드 id 묶음만 받는다. 결과에는 카드 id 를 싣지 않고 '서로 다른 정답 카드 묶음 수'만 싣는다.
 *
 * 카드별로 내는 것
 * - wins: 카드가 답한 줄(decidedBy 의 카드. index-partial·index-gap 포함). 앞단(색인 앞 단계)이 정한 줄은 front:<표시>, legacy 가 답한
 *   줄(범위 밖 등)은 legacy:<decidedBy> 가짜 카드로 센다(이긴 몫·답한 카드 수에서는 뺀다).
 * - good·partial·wrong·nfOk·nfDocHas: 이긴 줄의 대리 판정. gap 카드의 nfDocHas 는 'gap 이 문서 답을 막음'이다.
 * - top1: 흔적 1위(answerIndex.top 의 첫 실제 카드)였던 줄. top1Blocked: 1위였는데 못 찾음·되묻기로 끝난 줄, top1BlockedBad: 그중 판정이 나쁜 줄.
 * - frontWrong: 앞단 가짜 카드의 wrong(앞단 가로챔 오답).
 * - goldGroups: 이 카드가 wrong·partial 로 답한 줄들의 서로 다른 정답 후보 묶음 수(서로 다른 정답 카드 수. 빈 묶음은 세지 않는다).
 *   goldClusters: 그 묶음을 카드가 하나라도 겹치면 합친 수(보수적인 값 — 여러 키가 같이 받는 총괄 카드 하나로 묶음이 다 이어질 수 있다).
 * - score = wrong + 0.5·partial + 0.5·top1BlockedBad + 0.5·(gap 카드면 nfDocHas). 쏠림 후보: goldGroups ≥ 3 또는 wrong+partial ≥ 2.
 */

import { cardUnitSentences, idsFromCard, rejectIdsFromCard, withinKeyRange, type AliasIndex, type AnswerKey, type CardRecord, type InventoryIndex } from "../proxy-eval"

export type AttractorVerdict = "good" | "partial" | "wrong" | "nf_ok" | "nf_doc_has" | "needless_clarify"

export interface AttractorRowInput {
  set: string
  id: string
  decidedBy: string
  answerIndex?: unknown
  verdict?: AttractorVerdict | null
  /** 이 줄의 정답 후보 카드(이 카드로 답했으면 good). 모르면 없음. */
  gold?: readonly string[] | null
}

export interface AttractorCardStat {
  card: string
  kind: string
  wins: number
  good: number
  partial: number
  wrong: number
  nfOk: number
  nfDocHas: number
  needlessClarify: number
  top1: number
  top1Blocked: number
  top1BlockedBad: number
  frontWrong: number
  goldGroups: number
  goldClusters: number
  score: number
  candidate: boolean
  bySet: Record<string, number>
  /** 새 묶음 카드(옵션 newCard 가 참). */
  isNew?: boolean
}

export interface AttractorSummary {
  sets: Record<string, { rows: number; verdictRows: number; goldRows: number }>
  rows: number
  /** 카드가 답한 줄(앞단 가짜 카드 포함). */
  answered: number
  /** 답한 카드 수(front:·legacy: 가짜 카드 제외). */
  answeringCards: number
  wrongPartial: number
  /** score 상위 top 장의 wrong+partial 합. */
  topWrongPartial: number
  top: number
  /** 상위 5·20 장이 이긴 줄의 몫(%). */
  winShareTop5: number
  winShareTop20: number
  candidates: number
  /** goldGroups ≥ 3 인 카드 수. */
  goldGroups3: number
  /** gap 카드가 문서 답을 막은 줄(gap 카드 nfDocHas 합). */
  gapBlocks: number
  /** 앞단이 정했는데 wrong 인 줄. */
  frontWrong: number
  /** 새 묶음 카드 가운데 쏠림 후보 수. */
  newCandidates: number
}

export interface AttractorOptions {
  /** 상위 몇 장을 요약에 쓰는지(기본 20). */
  top?: number
  /** 카드 id → 종류(doc·fixed·policy·howto·gap…). 없으면 id 앞 토큰. */
  kindOf?: (card: string) => string | undefined
  /** 새 묶음 카드인지(예: provenance.unit 이 team1126). */
  newCard?: (card: string) => boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** 흔적 1위 실제 카드(none 자리 건너뜀). */
export function traceTop1(answerIndex: unknown): string | null {
  if (!isRecord(answerIndex) || !Array.isArray(answerIndex.top)) return null
  for (const candidate of answerIndex.top) {
    const id = isRecord(candidate) && typeof candidate.id === "string" ? candidate.id : null
    if (id && id !== "none") return id
  }
  return null
}

/**
 * 색인이 정하지 않은 줄의 가짜 카드: 앞단(색인 앞 단계, 흔적의 pre — handoff·policy_guard·tried…)이 정했으면 front:<pre>,
 * 그 밖(범위 밖 등으로 legacy 가 답함)은 legacy:<decidedBy 앞 토큰>.
 */
export function frontLabel(row: Pick<AttractorRowInput, "decidedBy" | "answerIndex">): string {
  const trace = isRecord(row.answerIndex) ? row.answerIndex : null
  const pre = trace && typeof trace.pre === "string" && trace.pre ? trace.pre : null
  return pre ? `front:${pre}` : `legacy:${row.decidedBy.split(":")[0] || "unknown"}`
}

const isPseudo = (card: string) => card.startsWith("front:") || card.startsWith("legacy:")

/**
 * 줄의 답한 카드: index:<카드>·index-partial:<카드>·index-gap:<카드> 면 그 카드, index-abstain·index-clarify 면 null,
 * 색인이 아니면 front:<pre> 또는 legacy:<decidedBy>(frontLabel).
 */
export function answeringCardOf(row: Pick<AttractorRowInput, "decidedBy" | "answerIndex">): string | null {
  const decidedBy = row.decidedBy ?? ""
  const match = decidedBy.match(/^index(?:-partial|-gap)?:(.+)$/)
  if (match) return match[1] === "unknown" ? null : match[1]
  if (decidedBy.startsWith("index")) return null
  return frontLabel(row)
}

/** 서로 다른 정답 후보 묶음 수(같은 카드 집합은 하나). 빈 묶음은 세지 않는다. */
export function countGoldSets(sets: ReadonlyArray<readonly string[]>): number {
  return new Set(sets.filter((set) => set.length > 0).map((set) => [...set].sort().join("\u0000"))).size
}

/** 겹치는(카드를 하나라도 같이 가진) 정답 후보 묶음을 합친 뒤의 묶음 수. 빈 묶음은 세지 않는다. */
export function countGoldGroups(sets: ReadonlyArray<readonly string[]>): number {
  const groups: Set<string>[] = []
  for (const raw of sets) {
    if (raw.length === 0) continue
    const incoming = new Set(raw)
    const overlapping = groups.filter((group) => Array.from(incoming).some((card) => group.has(card)))
    const merged = new Set<string>(incoming)
    for (const group of overlapping) for (const card of group) merged.add(card)
    for (const group of overlapping) groups.splice(groups.indexOf(group), 1)
    groups.push(merged)
  }
  return groups.length
}

const BAD_VERDICTS: ReadonlySet<string> = new Set(["wrong", "partial", "nf_doc_has", "needless_clarify"])

function emptyStat(card: string, kind: string): AttractorCardStat {
  return {
    card,
    kind,
    wins: 0,
    good: 0,
    partial: 0,
    wrong: 0,
    nfOk: 0,
    nfDocHas: 0,
    needlessClarify: 0,
    top1: 0,
    top1Blocked: 0,
    top1BlockedBad: 0,
    frontWrong: 0,
    goldGroups: 0,
    goldClusters: 0,
    score: 0,
    candidate: false,
    bySet: {},
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10

/** 카드별 쏠림 지표와 요약. 카드 표는 score·wrong·wins 내림차순, id 오름차순으로 정렬한다(결정적). */
export function computeAttractors(rows: readonly AttractorRowInput[], options: AttractorOptions = {}): { cards: AttractorCardStat[]; summary: AttractorSummary } {
  const top = options.top ?? 20
  const kindOf = (card: string) => (isPseudo(card) ? card.split(":")[0] : (options.kindOf?.(card) ?? card.split(":")[0]))
  const stats = new Map<string, AttractorCardStat>()
  const stat = (card: string) => {
    let value = stats.get(card)
    if (!value) {
      value = emptyStat(card, kindOf(card))
      if (options.newCard?.(card)) value.isNew = true
      stats.set(card, value)
    }
    return value
  }
  const badGold = new Map<string, string[][]>()
  const sets: AttractorSummary["sets"] = {}
  let answered = 0
  for (const row of rows) {
    const set = (sets[row.set] ??= { rows: 0, verdictRows: 0, goldRows: 0 })
    set.rows += 1
    if (row.verdict) set.verdictRows += 1
    if (row.gold) set.goldRows += 1
    const card = answeringCardOf(row)
    const top1 = traceTop1(row.answerIndex)
    if (top1) {
      const entry = stat(top1)
      entry.top1 += 1
      if (!card || isPseudo(card)) {
        // 색인이 정하지 못한 줄(못 찾음·되묻기)만 '1위인데 막힘'이다. 앞단이 정한 줄은 색인 순위와 무관하게 끝났다.
        if (!card && (row.decidedBy === "index-abstain" || row.decidedBy === "index-clarify")) {
          entry.top1Blocked += 1
          if (row.verdict && BAD_VERDICTS.has(row.verdict)) entry.top1BlockedBad += 1
        }
      }
    }
    if (!card) continue
    answered += 1
    const entry = stat(card)
    entry.wins += 1
    entry.bySet[row.set] = (entry.bySet[row.set] ?? 0) + 1
    switch (row.verdict) {
      case "good":
        entry.good += 1
        break
      case "partial":
        entry.partial += 1
        break
      case "wrong":
        entry.wrong += 1
        if (card.startsWith("front:")) entry.frontWrong += 1
        break
      case "nf_ok":
        entry.nfOk += 1
        break
      case "nf_doc_has":
        entry.nfDocHas += 1
        break
      case "needless_clarify":
        entry.needlessClarify += 1
        break
      default:
        break
    }
    if ((row.verdict === "wrong" || row.verdict === "partial") && row.gold) {
      const list = badGold.get(card) ?? []
      list.push([...row.gold])
      badGold.set(card, list)
    }
  }
  for (const entry of stats.values()) {
    entry.goldGroups = countGoldSets(badGold.get(entry.card) ?? [])
    entry.goldClusters = countGoldGroups(badGold.get(entry.card) ?? [])
    const gapBlocks = entry.kind === "gap" ? entry.nfDocHas : 0
    entry.score = round1(entry.wrong + 0.5 * entry.partial + 0.5 * entry.top1BlockedBad + 0.5 * gapBlocks)
    entry.candidate = entry.goldGroups >= 3 || entry.wrong + entry.partial >= 2
  }
  const cards = Array.from(stats.values())
    .filter((entry) => entry.wins > 0 || entry.top1Blocked > 0)
    .sort((a, b) => b.score - a.score || b.wrong - a.wrong || b.wins - a.wins || a.card.localeCompare(b.card))
  const topCards = cards.slice(0, top)
  const byWins = cards.filter((entry) => !isPseudo(entry.card)).sort((a, b) => b.wins - a.wins || a.card.localeCompare(b.card))
  const winsOf = (list: AttractorCardStat[]) => list.reduce((sum, entry) => sum + entry.wins, 0)
  const realAnswered = winsOf(byWins)
  const share = (n: number) => (realAnswered === 0 ? 0 : round1((winsOf(byWins.slice(0, n)) / realAnswered) * 100))
  const summary: AttractorSummary = {
    sets,
    rows: rows.length,
    answered,
    answeringCards: byWins.filter((entry) => entry.wins > 0).length,
    wrongPartial: cards.reduce((sum, entry) => sum + entry.wrong + entry.partial, 0),
    topWrongPartial: topCards.reduce((sum, entry) => sum + entry.wrong + entry.partial, 0),
    top,
    winShareTop5: share(5),
    winShareTop20: share(20),
    candidates: cards.filter((entry) => entry.candidate).length,
    goldGroups3: cards.filter((entry) => entry.goldGroups >= 3).length,
    gapBlocks: cards.reduce((sum, entry) => sum + (entry.kind === "gap" ? entry.nfDocHas : 0), 0),
    frontWrong: cards.reduce((sum, entry) => sum + entry.frontWrong, 0),
    newCandidates: cards.filter((entry) => entry.isNew && entry.candidate).length,
  }
  return { cards, summary }
}

/** 지켜볼 카드 목록(예: 지난 조사의 상위 20장)의 지표. 이번 측정에 없는 카드는 0 으로 채운다. */
export function watchedCards(cards: readonly AttractorCardStat[], watch: readonly string[], kindOf?: (card: string) => string | undefined): AttractorCardStat[] {
  const byId = new Map(cards.map((entry) => [entry.card, entry]))
  return watch.map((card) => byId.get(card) ?? emptyStat(card, isPseudo(card) ? card.split(":")[0] : (kindOf?.(card) ?? card.split(":")[0])))
}

/** 지켜볼 카드 묶음의 합계(이긴 수·wrong+partial·gap 막음·앞단 오답). */
export function watchTotals(list: readonly AttractorCardStat[]) {
  return {
    cards: list.length,
    wins: list.reduce((sum, entry) => sum + entry.wins, 0),
    wrongPartial: list.reduce((sum, entry) => sum + entry.wrong + entry.partial, 0),
    gapBlocks: list.reduce((sum, entry) => sum + (entry.kind === "gap" ? entry.nfDocHas : 0), 0),
    frontWrong: list.reduce((sum, entry) => sum + entry.frontWrong, 0),
    candidates: list.filter((entry) => entry.candidate).length,
  }
}

// ─── 정답 후보 카드(측정 담당이 정답 키로 만든다) ────────────────────────────

/** 카드마다 대리 점수가 대조하는 id(proxy-eval.ts 와 같은 함수로 만든다). */
export interface GoldIndexEntry {
  id: string
  ids: string[]
  rejectIds: string[]
  used: Map<string, Set<number>>
}

export function buildGoldIndex(cards: ReadonlyMap<string, CardRecord>, inventory?: InventoryIndex, alias?: AliasIndex): GoldIndexEntry[] {
  return Array.from(cards.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((card) => ({ id: card.id, ids: idsFromCard(card, alias), rejectIds: rejectIdsFromCard(card, inventory, alias), used: cardUnitSentences([card]) }))
}

/**
 * 키 하나의 정답 후보 카드: 그 카드 하나로 답했으면 proxy-eval classifyRow 가 good 을 줄 카드(reject 에 걸리지 않고 accept 와 겹침,
 * 문장 범위 규칙 포함). accept 가 없는 키(진짜 NODOC)는 빈 배열이다.
 */
export function goldCardsForKey(index: readonly GoldIndexEntry[], key: AnswerKey): string[] {
  const accept = new Set(key.accept ?? [])
  if (accept.size === 0) return []
  const reject = new Set(key.reject ?? [])
  const out: string[] = []
  for (const entry of index) {
    const inRange = (id: string) => withinKeyRange(id, key, entry.used)
    if (entry.rejectIds.some((id) => reject.has(id) && inRange(id))) continue
    if (entry.ids.some((id) => accept.has(id) && inRange(id))) out.push(entry.id)
  }
  return out
}
