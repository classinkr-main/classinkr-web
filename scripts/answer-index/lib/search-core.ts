/**
 * 에이전트용 전문 검색(units·site-facts·inventory). 띄어쓰기·문장부호·대소문자를 무시하고 낱말이 들어 있는지 본다.
 */
import type {
  AnswerIndexInventoryFile,
  AnswerIndexUnit,
  AnswerIndexUnitsFile,
  SiteFact,
} from "@/lib/chatbot/answer-index/types"

export type SearchSource = "unit" | "site" | "inventory"

export interface SearchHit {
  source: SearchSource
  /** 단위 id · site id · 옛 답 id */
  id: string
  /** 단위 문장 번호(source=unit). */
  i: number | null
  /** 문서 경로 · 저장소 파일 경로:줄 · 답 정의 파일:줄 */
  path: string
  heading: string | null
  area: string | null
  text: string
  hash: string | null
  flags: string[]
  score: number
}

export interface SearchData {
  units: AnswerIndexUnit[]
  siteFacts: SiteFact[]
  inventory: AnswerIndexInventoryFile["entries"]
}

export interface SearchOptions {
  sources?: SearchSource[]
  area?: string | null
  limit?: number
  /** all: 모든 낱말이 있어야 함(기본), any: 하나라도. */
  mode?: "all" | "any"
}

export function normalizeForSearch(text: string) {
  return text.normalize("NFC").toLowerCase().replace(/[\s.,!?·…"'“”‘’()[\]{}<>:;~\-_/|*]+/g, "")
}

/** "따옴표로 묶은 구"는 한 낱말로 본다. */
export function parseQuery(query: string) {
  const terms: string[] = []
  for (const match of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = normalizeForSearch(match[1] ?? match[2] ?? "")
    if (term) terms.push(term)
  }
  return Array.from(new Set(terms))
}

function countOccurrences(haystack: string, needle: string) {
  let count = 0
  for (let index = haystack.indexOf(needle); index >= 0 && count < 3; index = haystack.indexOf(needle, index + needle.length)) count += 1
  return count
}

function scoreText(terms: string[], body: string, context: string, mode: "all" | "any") {
  let score = 0
  let matched = 0
  for (const term of terms) {
    const inBody = countOccurrences(body, term)
    const inContext = context.includes(term)
    if (inBody === 0 && !inContext) continue
    matched += 1
    score += inBody * 2 + (inContext ? 1 : 0)
  }
  if (matched === 0 || (mode === "all" && matched < terms.length)) return 0
  return score + matched * 3
}

function excerpt(text: string, terms: string[], width = 180) {
  if (text.length <= width) return text
  const normalized = text.toLowerCase()
  const first = terms
    .map((term) => normalized.indexOf(term.slice(0, Math.min(term.length, 4))))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  const start = Math.max(0, (first ?? 0) - 40)
  return `${start > 0 ? "…" : ""}${text.slice(start, start + width)}${start + width < text.length ? "…" : ""}`
}

export function searchAnswerIndex(data: SearchData, query: string, options: SearchOptions = {}): SearchHit[] {
  const terms = parseQuery(query)
  if (terms.length === 0) return []
  const sources = new Set(options.sources ?? ["unit", "site"])
  const mode = options.mode ?? "all"
  const area = options.area ?? null
  const hits: (SearchHit & { order: number })[] = []
  let order = 0

  if (sources.has("unit")) {
    for (const unit of data.units) {
      if (area && unit.area !== area) continue
      const context = normalizeForSearch(`${unit.docTitle} ${unit.heading}`)
      for (const sentence of unit.sentences) {
        order += 1
        const score = scoreText(terms, normalizeForSearch(sentence.text), context, mode)
        if (score === 0) continue
        hits.push({
          source: "unit",
          id: unit.unitId,
          i: sentence.i,
          path: unit.path,
          heading: unit.heading,
          area: unit.area,
          text: sentence.text,
          hash: sentence.hash,
          flags: sentence.flags,
          score,
          order,
        })
      }
    }
  }
  if (sources.has("site") && !area) {
    for (const fact of data.siteFacts) {
      order += 1
      const score = scoreText(terms, normalizeForSearch(fact.text), "", mode)
      if (score === 0) continue
      hits.push({ source: "site", id: fact.id, i: null, path: `${fact.path}:${fact.line}`, heading: null, area: null, text: fact.text, hash: fact.hash, flags: [], score, order })
    }
  }
  if (sources.has("inventory")) {
    for (const entry of data.inventory) {
      if (area && entry.area !== area) continue
      order += 1
      const body = [entry.text, ...entry.textAlternatives].join("\n")
      const score = scoreText(terms, normalizeForSearch(body), normalizeForSearch(entry.id), mode)
      if (score === 0) continue
      hits.push({
        source: "inventory",
        id: entry.id,
        i: null,
        path: `${entry.sourceFile}:${entry.sourceLine}`,
        heading: entry.docPath,
        area: entry.area,
        text: excerpt(body.replace(/\s+/g, " "), terms),
        hash: entry.textHash,
        flags: [],
        score,
        order,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.order - b.order)
  return hits.slice(0, options.limit ?? 20).map((hit) => {
    const { order: _order, ...rest } = hit
    void _order
    return rest
  })
}

const SOURCE_LABEL: Record<SearchSource, string> = { unit: "문서", site: "페이지", inventory: "정해 둔 답" }

export function formatSearchHit(hit: SearchHit) {
  const head =
    hit.source === "unit"
      ? `[${SOURCE_LABEL.unit}] ${hit.id} #${hit.i} (${hit.area}) ${hit.heading ?? ""}${hit.flags.length ? ` {${hit.flags.join(",")}}` : ""}`
      : hit.source === "site"
        ? `[${SOURCE_LABEL.site}] ${hit.id}`
        : `[${SOURCE_LABEL.inventory}] ${hit.id} (${hit.area}) ${hit.path}`
  return `${head}\n    ${hit.text}`
}

/** 단위 하나를 번호 붙은 문장으로 보여 준다. */
export function formatUnit(unit: AnswerIndexUnit) {
  const lines = [`${unit.unitId} (${unit.area}) ${unit.docTitle} · ${unit.heading}`]
  for (const sentence of unit.sentences) {
    lines.push(`  ${sentence.i}. ${sentence.text}${sentence.flags.length ? ` {${sentence.flags.join(",")}}` : ""}  [${sentence.hash}]`)
  }
  return lines.join("\n")
}

export function unitsOf(file: AnswerIndexUnitsFile | AnswerIndexUnit[]) {
  return Array.isArray(file) ? file : file.units
}
