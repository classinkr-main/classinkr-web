/**
 * Import selected Channel Talk Documents articles into the local docs center.
 *
 * By default, imports all published articles visible to the configured Documents API key.
 * The numeric IDs in desk.channel.io knowledge URLs are Desk-internal IDs and may not match
 * Documents Open API article IDs; use --ids only with IDs returned by Documents Open API.
 *
 * Usage:
 *   npx tsx scripts/sync-channel-documents.ts --dry-run
 *   npx tsx scripts/sync-channel-documents.ts
 *   npx tsx scripts/sync-channel-documents.ts --ids 44553,701155 --language ko
 *   npx tsx scripts/sync-channel-documents.ts --include-unpublished
 *   npx tsx scripts/sync-channel-documents.ts --strict
 *
 * Required for fetching:
 *   CHANNEL_DOCS_ACCESS / CHANNEL_DOCS_ACCESS_SECRET
 *   or CHANNEL_TALK_ACCESS / CHANNEL_TALK_ACCESS_SECRET
 *
 * Required for writing:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY
 */

import crypto from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { createClient } from "@supabase/supabase-js"

const DOCUMENT_API_BASE = "https://document-api.channel.io/open/v1"
const DEFAULT_LANGUAGE = "ko"
const DEFAULT_STATE = "published"
const CATEGORY_ID = "admin"
const CATEGORY_TITLE = "[관리자] 사용 가이드"
const CATEGORY_DESCRIPTION = "기관(학원) 관리자를 위한 대시보드 전반의 사용 방법을 안내합니다."
const UPDATED_BY = "sync-channel-documents"
const MAX_CHUNK_CHARS = 1800
const FETCH_SPACING_MS = 150
const FETCH_RETRY_DELAYS_MS = [500, 1000, 2000]

type DocsStatus = "draft" | "review" | "published" | "archived"
type DocsVisibility = "public" | "unlisted" | "internal"

interface ChannelArticle {
  id?: string
  slug?: string
  title?: string
  name?: string
  subtitle?: string
  summary?: string
  state?: string
  body?: unknown
  bodyHtml?: string
  updatedAt?: number
  publishedAt?: number
  website?: {
    url?: string
  }
}

interface ChannelArticleView {
  article?: ChannelArticle
}

interface ChannelArticlesListView {
  articles?: ChannelArticle[]
  next?: string
}

interface NormalizedChannelDocument {
  articleId: string
  sourceUrl: string
  title: string
  description: string
  slug: string
  contentMarkdown: string
  contentJson: Record<string, unknown>
  tags: string[]
  keywords: string[]
  updatedAt: string
  publishedAt: string | null
}

interface ArticleIdentity {
  id: string
  slug: string
  category_id: string
}

interface ExistingArticle {
  id: string
  slug: string
  title: string
  description: string
  content_markdown: string | null
}

interface ArticleRow {
  category_id: string
  slug: string
  title: string
  description: string
  audience: string[]
  product_area: string
  doc_type: string
  difficulty: string
  status: DocsStatus
  visibility: DocsVisibility
  noindex: boolean
  featured: boolean
  order_index: number
  tags: string[]
  keywords: string[]
  symptoms: string[]
  chatbot_summary: string
  content_markdown: string
  content_json: Record<string, unknown>
  seo_title: string
  seo_description: string
  canonical_path: string
  published_at: string
  last_reviewed_at: string
  updated_by: string
}

interface ChunkRow {
  article_id: string
  article_version_id: string | null
  chunk_index: number
  heading: string
  content: string
  content_hash: string
  token_count: number | null
  metadata: Record<string, unknown>
  embedding_model: string | null
  embedding: null
  embedding_updated_at: string | null
}

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const skipChunks = args.includes("--skip-chunks")
const strictFetch = args.includes("--strict")

function argValue(name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return

  const envText = readFileSync(envPath, "utf8")
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue

    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

const DOCUMENT_CREDENTIAL_PAIRS = [
  ["CHANNEL_DOCS_ACCESS", "CHANNEL_DOCS_ACCESS_SECRET"],
  ["CHANNEL_DOCUMENTS_ACCESS", "CHANNEL_DOCUMENTS_ACCESS_SECRET"],
  ["CHANNEL_TALK_ACCESS", "CHANNEL_TALK_ACCESS_SECRET"],
  ["CHANNEL_ACCESS_KEY", "CHANNEL_ACCESS_SECRET"],
] as const

function envValue(name: string) {
  return process.env[name]?.trim() || undefined
}

function getDocumentCredentials() {
  const partialPairs: string[] = []

  for (const [accessName, secretName] of DOCUMENT_CREDENTIAL_PAIRS) {
    const access = envValue(accessName)
    const secret = envValue(secretName)

    if (access && secret) return { access, secret, source: `${accessName} / ${secretName}` }
    if (access || secret) partialPairs.push(`${accessName} / ${secretName}`)
  }

  const partialMessage = partialPairs.length
    ? ` Partial pair(s) found: ${partialPairs.join(", ")}.`
    : ""

  throw new Error(
    `Missing Channel Documents API credentials. Set CHANNEL_DOCS_ACCESS / CHANNEL_DOCS_ACCESS_SECRET.${partialMessage}`
  )
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY."
    )
  }

  return { url, serviceRoleKey }
}

function basicAuthHeader(access: string, secret: string) {
  return `Basic ${Buffer.from(`${access}:${secret}`).toString("base64")}`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchChannelArticle(articleId: string, language: string) {
  const credentials = getDocumentCredentials()
  const url = new URL(
    `${DOCUMENT_API_BASE}/spaces/$me/articles/${encodeURIComponent(articleId)}`
  )
  url.searchParams.set("language", language)

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: basicAuthHeader(credentials.access, credentials.secret),
        "Content-Type": "application/json",
      },
    })

    if (response.ok) {
      const data = (await response.json()) as ChannelArticleView
      if (!data.article) throw new Error(`Channel article ${articleId} response has no article.`)
      return data.article
    }

    const body = await response.text().catch(() => "")
    const retryable = response.status === 429 || response.status >= 500
    const retryDelay = FETCH_RETRY_DELAYS_MS[attempt]
    if (retryable && retryDelay) {
      console.warn(
        `[channel-docs] retry ${articleId} after ${response.status} (${retryDelay}ms)`
      )
      await sleep(retryDelay)
      continue
    }

    const credentialHint =
      response.status === 401
        ? " Confirm this is a Channel Documents Open API key pair from Space Settings > Integration > API Authentication Key Management; regular Channel Talk Open API keys can return 401."
        : ""
    throw new Error(
      `Channel Documents API ${response.status} for article ${articleId} using ${credentials.source}.${credentialHint} Response: ${body.slice(0, 240)}`
    )
  }

  throw new Error(`Channel article ${articleId} fetch failed after retries.`)
}

async function listChannelArticles(language: string, state: string | undefined) {
  const credentials = getDocumentCredentials()
  const articles: ChannelArticle[] = []
  let since: string | undefined

  do {
    const url = new URL(`${DOCUMENT_API_BASE}/spaces/$me/articles`)
    url.searchParams.set("language", language)
    url.searchParams.set("limit", "100")
    url.searchParams.set("order", "desc")
    if (state) url.searchParams.set("state", state)
    if (since) url.searchParams.set("since", since)

    const response = await fetch(url, {
      headers: {
        Authorization: basicAuthHeader(credentials.access, credentials.secret),
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(
        `Channel Documents API ${response.status} while listing articles using ${credentials.source}. Response: ${body.slice(0, 240)}`
      )
    }

    const data = (await response.json()) as ChannelArticlesListView
    articles.push(...(data.articles ?? []))
    since = data.next
  } while (since)

  return articles
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function cleanInlineHtml(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
}

function htmlToMarkdown(html: string) {
  return decodeEntities(html)
    .replace(/\r/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, content: string) => {
      return `\n\n${"#".repeat(Number(level))} ${cleanInlineHtml(content)}\n\n`
    })
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
      const label = cleanInlineHtml(text)
      return label ? `[${label}](${href})` : href
    })
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/section>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function inlineToText(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""

  const item = value as Record<string, unknown>
  const attrs = item.attrs && typeof item.attrs === "object" ? item.attrs as Record<string, unknown> : {}
  const text = typeof attrs.text === "string" ? attrs.text : ""

  if (item.type === "emoji" && typeof attrs.name === "string") return attrs.name
  if (text) return text

  if (Array.isArray(item.content)) return item.content.map(inlineToText).join("")
  return ""
}

function blocksToMarkdown(value: unknown, depth = 0): string {
  if (depth > 8 || value == null) return ""
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map((item) => blocksToMarkdown(item, depth + 1)).filter(Boolean).join("\n\n")
  }
  if (typeof value !== "object") return ""

  const block = value as Record<string, unknown>
  const type = typeof block.type === "string" ? block.type : ""
  const attrs = block.attrs && typeof block.attrs === "object" ? block.attrs as Record<string, unknown> : {}
  const content = Array.isArray(block.content) ? block.content : []

  if (type === "heading") {
    const level = typeof attrs.level === "number" ? Math.min(Math.max(attrs.level, 1), 6) : 2
    return `${"#".repeat(level)} ${content.map(inlineToText).join("").trim()}`
  }
  if (type === "text") return content.map(inlineToText).join("").trim()
  if (type === "code") return ["```", content.map(inlineToText).join("\n"), "```"].join("\n")
  if (type === "image" && typeof attrs.src === "string") {
    const alt = typeof attrs.alt === "string" ? attrs.alt : ""
    return `![${alt}](${attrs.src})`
  }
  if (type === "bullets" || type === "orderedList") {
    return content.map((item, index) => {
      const text = blocksToMarkdown(item, depth + 1).replace(/\n/g, "\n  ")
      return type === "orderedList" ? `${index + 1}. ${text}` : `- ${text}`
    }).join("\n")
  }
  if (type === "listItem") return content.map((item) => blocksToMarkdown(item, depth + 1)).join("\n")

  return content.map((item) => blocksToMarkdown(item, depth + 1)).filter(Boolean).join("\n\n")
}

function compactText(value: string, max = 220) {
  const compacted = value.replace(/\s+/g, " ").trim()
  if (compacted.length <= max) return compacted
  return `${compacted.slice(0, max - 1).trimEnd()}…`
}

function toIso(ms?: number) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return new Date().toISOString()
  return new Date(ms).toISOString()
}

function getArticleBodyMarkdown(article: ChannelArticle) {
  if (typeof article.bodyHtml === "string" && article.bodyHtml.trim()) {
    return htmlToMarkdown(article.bodyHtml)
  }

  const fromBlocks = blocksToMarkdown(article.body)
  if (fromBlocks.trim()) return fromBlocks.trim()

  return [article.summary, article.subtitle].filter(Boolean).join("\n\n").trim()
}

function markdownToSections(markdown: string) {
  const sections: Array<{ heading: string; body: string }> = []
  let currentHeading = "개요"
  let currentLines: string[] = []

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)
    if (heading) {
      const body = currentLines.join("\n").trim()
      if (body) sections.push({ heading: currentHeading, body })
      currentHeading = heading[1].trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  const tail = currentLines.join("\n").trim()
  if (tail) sections.push({ heading: currentHeading, body: tail })
  if (sections.length === 0) sections.push({ heading: "개요", body: markdown })
  return sections.slice(0, 20)
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function normalizeChannelArticle(articleId: string, article: ChannelArticle): NormalizedChannelDocument {
  const title = article.title?.trim() || article.name?.trim() || `Channel Talk 지식 문서 ${articleId}`
  const bodyMarkdown = getArticleBodyMarkdown(article)
  const description = compactText(article.summary || article.subtitle || bodyMarkdown || title)
  const updatedAt = toIso(article.updatedAt)
  const publishedAt = typeof article.publishedAt === "number" ? toIso(article.publishedAt) : null
  const sourceUrl =
    article.website?.url ||
    `https://desk.channel.io/#/channels/103209/alf-customer/knowledge/document/${articleId}`
  const slug = `channel-talk-document-${articleId}`
  const keywords = unique([
    "채널톡",
    "Channel Talk",
    "ALF",
    "지식베이스",
    "도큐먼트",
    "Documents",
    title,
    articleId,
  ])
  const tags = ["채널톡", "ALF", "지식베이스", "상담 자동화"]
  const sections = markdownToSections(bodyMarkdown)
  const contentMarkdown = [
    `# ${title}`,
    description,
    `원문: ${sourceUrl}`,
    bodyMarkdown,
  ].filter(Boolean).join("\n\n")

  return {
    articleId,
    sourceUrl,
    title,
    description,
    slug,
    contentMarkdown,
    contentJson: {
      source: "channel-documents-api",
      channelDocumentId: articleId,
      channelDocumentSlug: article.slug ?? null,
      channelDocumentState: article.state ?? null,
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      updatedAt,
      publishedAt,
      sections,
    },
    tags,
    keywords,
    updatedAt,
    publishedAt,
  }
}

function buildArticleRow(doc: NormalizedChannelDocument, index: number): ArticleRow {
  return {
    category_id: CATEGORY_ID,
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    audience: ["운영팀", "상담 담당자", "관리자", "챗봇 운영자"],
    product_area: "admin",
    doc_type: "reference",
    difficulty: "intermediate",
    status: "published",
    visibility: "unlisted",
    noindex: false,
    featured: false,
    order_index: 3500 + index,
    tags: doc.tags,
    keywords: doc.keywords,
    symptoms: [],
    chatbot_summary: doc.description,
    content_markdown: doc.contentMarkdown,
    content_json: doc.contentJson,
    seo_title: `${doc.title} | ClassIn 운영 지식`,
    seo_description: doc.description,
    canonical_path: `/docs/${CATEGORY_ID}/${doc.slug}`,
    published_at: doc.publishedAt ?? doc.updatedAt,
    last_reviewed_at: doc.updatedAt,
    updated_by: UPDATED_BY,
  }
}

function hashContent(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function splitMarkdownIntoChunks(markdown: string) {
  const chunks: Array<{ heading: string; content: string }> = []
  let currentHeading = "요약"
  let current = ""

  const flush = () => {
    const content = current.trim()
    if (content) chunks.push({ heading: currentHeading, content })
    current = ""
  }

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)
    if (heading && current.trim()) {
      flush()
      currentHeading = heading[1].trim()
    }

    if ((current + "\n" + line).length > MAX_CHUNK_CHARS) {
      flush()
    }
    current = [current, line].filter(Boolean).join("\n")
  }

  flush()
  return chunks
}

function buildChunkRows(
  doc: NormalizedChannelDocument,
  article: ArticleIdentity,
  versionId: string | null
): ChunkRow[] {
  return splitMarkdownIntoChunks(doc.contentMarkdown).map((chunk, index) => ({
    article_id: article.id,
    article_version_id: versionId,
    chunk_index: index,
    heading: chunk.heading,
    content: chunk.content,
    content_hash: hashContent(chunk.content),
    token_count: null,
    metadata: {
      source: "channel-documents-api",
      sourceUrl: doc.sourceUrl,
      channelDocumentId: doc.articleId,
      path: `/docs/${CATEGORY_ID}/${doc.slug}`,
      slug: doc.slug,
      category: CATEGORY_ID,
      tags: doc.tags,
      keywords: doc.keywords,
      chunkType: index === 0 ? "summary" : "section",
    },
    embedding_model: null,
    embedding: null,
    embedding_updated_at: null,
  }))
}

function shouldCreateVersion(existing: ExistingArticle | undefined, next: ArticleRow) {
  if (!existing) return true
  return (
    existing.title !== next.title ||
    existing.description !== next.description ||
    (existing.content_markdown ?? "") !== next.content_markdown
  )
}

async function fetchTargetDocuments(articleIds: string[], language: string) {
  const documents: NormalizedChannelDocument[] = []
  for (const articleId of articleIds) {
    try {
      const article = await fetchChannelArticle(articleId, language)
      documents.push(normalizeChannelArticle(articleId, article))
    } catch (error) {
      if (strictFetch) throw error
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[channel-docs] skipped ${articleId}: ${message}`)
    } finally {
      await sleep(FETCH_SPACING_MS)
    }
  }
  return documents
}

async function syncToSupabase(documents: NormalizedChannelDocument[]) {
  const { url, serviceRoleKey } = getSupabaseEnv()
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date().toISOString()
  await supabase.from("docs_categories").upsert({
    id: CATEGORY_ID,
    title: CATEGORY_TITLE,
    description: CATEGORY_DESCRIPTION,
    order_index: 30,
    icon: null,
    is_visible: true,
  }, { onConflict: "id" }).throwOnError()

  const rows = documents.map(buildArticleRow)
  const slugs = rows.map((row) => row.slug)
  const { data: existingRows, error: existingError } = await supabase
    .from("docs_articles")
    .select("id, slug, title, description, content_markdown")
    .eq("category_id", CATEGORY_ID)
    .in("slug", slugs)
  if (existingError) throw existingError

  const existingBySlug = new Map(
    ((existingRows ?? []) as ExistingArticle[]).map((article) => [article.slug, article])
  )
  const versionNeededBySlug = new Map(
    rows.map((row) => [row.slug, shouldCreateVersion(existingBySlug.get(row.slug), row)])
  )

  const { data: articleRows, error: articleError } = await supabase
    .from("docs_articles")
    .upsert(rows, { onConflict: "category_id,slug" })
    .select("id, slug, category_id")
  if (articleError) throw articleError
  if (!articleRows) throw new Error("Supabase returned no article identities.")

  const identities = (articleRows as ArticleIdentity[])
  const identityBySlug = new Map(identities.map((article) => [article.slug, article]))
  const articleIds = identities.map((article) => article.id)

  const { data: previousVersions, error: previousVersionsError } = await supabase
    .from("docs_article_versions")
    .select("article_id, version_number")
    .in("article_id", articleIds)
    .order("version_number", { ascending: false })
  if (previousVersionsError) throw previousVersionsError

  const latestVersionNumberByArticleId = new Map<string, number>()
  for (const version of (previousVersions ?? []) as Array<{ article_id: string; version_number: number }>) {
    if (!latestVersionNumberByArticleId.has(version.article_id)) {
      latestVersionNumberByArticleId.set(version.article_id, version.version_number)
    }
  }

  const versionRows = rows.flatMap((row) => {
    const article = identityBySlug.get(row.slug)
    if (!article || !versionNeededBySlug.get(row.slug)) return []
    return [{
      article_id: article.id,
      version_number: (latestVersionNumberByArticleId.get(article.id) ?? 0) + 1,
      title: row.title,
      description: row.description,
      content_markdown: row.content_markdown,
      content_json: row.content_json,
      change_note: `Sync Channel Documents article (${now})`,
      created_by: UPDATED_BY,
    }]
  })

  let insertedVersions = 0
  if (versionRows.length > 0) {
    const { error: versionError } = await supabase.from("docs_article_versions").insert(versionRows)
    if (versionError) throw versionError
    insertedVersions = versionRows.length
  }

  let chunkCount = 0
  if (!skipChunks) {
    const { data: latestVersions, error: latestVersionError } = await supabase
      .from("docs_article_versions")
      .select("id, article_id, version_number")
      .in("article_id", articleIds)
      .order("version_number", { ascending: false })
    if (latestVersionError) throw latestVersionError

    const versionByArticleId = new Map<string, { id: string }>()
    for (const version of (latestVersions ?? []) as Array<{ id: string; article_id: string }>) {
      if (!versionByArticleId.has(version.article_id)) versionByArticleId.set(version.article_id, version)
    }

    const { error: deleteChunksError } = await supabase
      .from("docs_ai_chunks")
      .delete()
      .in("article_id", articleIds)
    if (deleteChunksError) throw deleteChunksError

    const docBySlug = new Map(documents.map((doc) => [doc.slug, doc]))
    const chunkRows = identities.flatMap((article) => {
      const doc = docBySlug.get(article.slug)
      if (!doc) return []
      return buildChunkRows(doc, article, versionByArticleId.get(article.id)?.id ?? null)
    })

    if (chunkRows.length > 0) {
      const { error: insertChunksError } = await supabase.from("docs_ai_chunks").insert(chunkRows)
      if (insertChunksError) throw insertChunksError
      chunkCount = chunkRows.length
    }
  }

  return {
    articleCount: identities.length,
    insertedVersions,
    chunkCount,
  }
}

async function main() {
  loadEnvLocal()

  const language = argValue("--language") ?? DEFAULT_LANGUAGE
  const idsArg = argValue("--ids")
  const includeUnpublished = args.includes("--include-unpublished")
  const stateArg = argValue("--state")
  const listState =
    includeUnpublished || stateArg === "all" ? undefined : stateArg ?? DEFAULT_STATE

  let ids = (idsArg ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    const articles = await listChannelArticles(language, listState)
    ids = unique(articles.map((article) => article.id ?? ""))
    console.log(
      `[channel-docs] listed ${ids.length} ${listState ?? "all"} article(s) from Channel Documents`
    )
  }

  if (ids.length === 0) throw new Error("No article IDs provided.")

  const documents = await fetchTargetDocuments(ids, language)
  console.log(`[channel-docs] fetched ${documents.length} document(s)`)
  for (const doc of documents) {
    console.log(`- ${doc.articleId}: ${doc.title} (${doc.contentMarkdown.length} chars)`)
  }

  if (dryRun) {
    console.log("[channel-docs] --dry-run: Supabase write skipped.")
    return
  }

  const result = await syncToSupabase(documents)
  console.log("[channel-docs] sync complete")
  console.log(`- articles: ${result.articleCount}`)
  console.log(`- versions: ${result.insertedVersions}`)
  console.log(`- chunks: ${result.chunkCount}`)
  console.log("[channel-docs] next: run scripts/embed-docs-chunks.ts to backfill embeddings.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
