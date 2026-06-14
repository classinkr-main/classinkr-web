export interface VectorFallbackArticle {
  id: string
  category_id: string
  slug: string
  title: string
  description: string
  canonical_path: string | null
  noindex: boolean
}

export interface VectorFallbackChunkRow {
  id: string
  article_id: string
  heading: string | null
  content: string
  embedding: string | number[] | null
  docs_articles: VectorFallbackArticle | VectorFallbackArticle[] | null
}

export interface ClientVectorSource {
  articleId?: string
  chunkId?: string
  title: string
  heading?: string
  urlPath: string
  category: string
  excerpt: string
  score: number
}

interface ClientVectorSourceOptions {
  maxSources: number
  similarityFloor: number
}

function compactText(value: string, maxLength = 220) {
  const compacted = value
    .replace(/^#+\s*/gm, "")
    .replace(/[-*]\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (compacted.length <= maxLength) return compacted
  return `${compacted.slice(0, maxLength).trim()}...`
}

function getArticle(row: VectorFallbackChunkRow) {
  return Array.isArray(row.docs_articles)
    ? row.docs_articles[0]
    : row.docs_articles
}

export function parsePgVectorEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const values = value.map(Number)
    return values.every(Number.isFinite) ? values : null
  }

  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null

  const values = trimmed
    .slice(1, -1)
    .split(",")
    .map((part) => Number(part.trim()))

  return values.length > 0 && values.every(Number.isFinite) ? values : null
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return null

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }

  if (leftNorm === 0 || rightNorm === 0) return null
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function dedupeSourcesByPath(sources: ClientVectorSource[]) {
  const seen = new Set<string>()
  const deduped: ClientVectorSource[] = []

  for (const source of sources) {
    if (seen.has(source.urlPath)) continue
    seen.add(source.urlPath)
    deduped.push(source)
  }

  return deduped
}

export function buildClientVectorSources(
  queryEmbedding: number[],
  rows: VectorFallbackChunkRow[],
  options: ClientVectorSourceOptions
): ClientVectorSource[] {
  const ranked = rows
    .map((row): ClientVectorSource | null => {
      const article = getArticle(row)
      if (!article) return null

      const embedding = parsePgVectorEmbedding(row.embedding)
      if (!embedding) return null

      const similarity = cosineSimilarity(queryEmbedding, embedding)
      if (similarity == null || similarity < options.similarityFloor) return null

      return {
        articleId: article.id,
        chunkId: row.id,
        title: article.title,
        heading: row.heading ?? undefined,
        urlPath: article.canonical_path ?? `/docs/${article.category_id}/${article.slug}`,
        category: article.category_id,
        excerpt: compactText(row.content),
        score: Math.max(1, similarity * 10),
      }
    })
    .filter((source): source is ClientVectorSource => source != null)
    .sort((left, right) => right.score - left.score)

  return dedupeSourcesByPath(ranked).slice(0, options.maxSources)
}
