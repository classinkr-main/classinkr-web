/**
 * Channel Talk(채널톡) 헬프센터 문서를 로컬 문서센터(docs_articles + docs_ai_chunks)로 동기화한다.
 * 텍스트뿐 아니라 이미지/표/첨부파일/콜아웃을 마크다운으로 보존한다(구조화 body 블록 우선,
 * bodyHtml 이미지 보강). 이렇게 들어온 문서는 챗봇 RAG와 관리자 가이드가 함께 참조한다.
 *
 * 기본 동작(전수 크롤):
 *   - 내용이 있는 모든 문서를 받는다(채널 draft 포함). 빈 "작성중" 스텁과 테스트/샘플 페이지는 제외.
 *   - 채널에서 published 인 글만 visibility 를 --public 으로 공개 승격할 수 있고, draft 는 항상 unlisted.
 *   - 전수 크롤 시, 이번 세트에 없는 과거 자동 동기화 문서는 archived 로 reconcile(수기 편집본 제외).
 *
 * Usage:
 *   npx tsx scripts/sync-channel-documents.ts --dry-run            # 미리보기(쓰기 없음)
 *   npx tsx scripts/sync-channel-documents.ts --dry-run --dump     # 추출 마크다운 전문 출력
 *   npx tsx scripts/sync-channel-documents.ts                      # 전수 크롤 + reconcile
 *   npx tsx scripts/sync-channel-documents.ts --published-only     # 채널 published 상태만
 *   npx tsx scripts/sync-channel-documents.ts --public             # published 글을 공개 문서로
 *   npx tsx scripts/sync-channel-documents.ts --ids 44553,701155   # 특정 문서만(reconcile 안 함)
 *   npx tsx scripts/sync-channel-documents.ts --strict             # fetch 실패 시 중단
 *
 * 채널의 desk.channel.io knowledge URL 숫자 ID 는 Desk 내부 ID 라 Documents Open API ID 와
 * 다를 수 있다. --ids 는 Documents Open API 가 돌려준 ID 로만 사용한다.
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
const CATEGORY_ID = "admin"
const CATEGORY_TITLE = "[관리자] 사용 가이드"
const CATEGORY_DESCRIPTION = "기관(학원) 관리자를 위한 대시보드 전반의 사용 방법을 안내합니다."
const UPDATED_BY = "sync-channel-documents"
const MAX_CHUNK_CHARS = 1800
const FETCH_SPACING_MS = 150
const FETCH_RETRY_DELAYS_MS = [500, 1000, 2000]
// 본문이 이보다 짧으면 "작성중" 빈 스텁으로 보고 동기화에서 제외한다.
const MIN_BODY_CHARS = 24

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
  coverImageUrl?: string
  topicIds?: string[]
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
  channelState: string | null
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
// 기본은 unlisted(챗봇 RAG + 관리자 가이드에서 사용, 공개 색인 제외). --public 으로 공개 문서로 승격.
const DOC_VISIBILITY: DocsVisibility = args.includes("--public") ? "public" : "unlisted"

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
    // 이미지/영상 임베드 보존 — 사용자가 요구한 "텍스트·이미지·영상 전수 크롤링".
    .replace(/<img\b[^>]*?\balt=["']([^"']*)["'][^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi, (_, alt: string, src: string) => `\n\n![${cleanInlineHtml(alt)}](${src})\n\n`)
    .replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi, (_, src: string) => `\n\n![](${src})\n\n`)
    .replace(/<iframe\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>[\s\S]*?<\/iframe>/gi, (_, src: string) => `\n\n[영상/임베드 보기](${src})\n\n`)
    .replace(/<video\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>[\s\S]*?<\/video>/gi, (_, src: string) => `\n\n[영상 보기](${src})\n\n`)
    .replace(/<source\b[^>]*?\bsrc=["']([^"']+)["'][^>]*?>/gi, (_, src: string) => `\n\n[영상 보기](${src})\n\n`)
    .replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi, (_, content: string) => {
      const caption = cleanInlineHtml(content)
      return caption ? `\n\n_${caption}_\n\n` : "\n\n"
    })
    .replace(/<\/figure>/gi, "\n\n")
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

function applyInlineMarks(text: string, marks: unknown): string {
  if (!text || !Array.isArray(marks)) return text
  let out = text
  let href: string | undefined
  let bold = false
  let italic = false
  let code = false
  for (const mark of marks) {
    if (!mark || typeof mark !== "object") continue
    const node = mark as Record<string, unknown>
    const markAttrs = node.attrs && typeof node.attrs === "object" ? (node.attrs as Record<string, unknown>) : {}
    if (node.type === "bold") bold = true
    else if (node.type === "italic") italic = true
    else if (node.type === "inlineCode") code = true
    else if (node.type === "hyperlink") {
      const url =
        typeof markAttrs.href === "string" ? markAttrs.href : typeof markAttrs.url === "string" ? markAttrs.url : undefined
      if (url) href = url
    }
  }
  if (code) out = `\`${out}\``
  if (bold) out = `**${out}**`
  if (italic) out = `_${out}_`
  if (href) out = `[${out}](${href})`
  return out
}

function emojiToText(name: string) {
  return `:${name}:`
}

/** 마크(굵게/링크 등)를 무시한 순수 텍스트 — 설명/제목/이미지 alt 용. */
function inlineToText(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""

  const item = value as Record<string, unknown>
  const attrs = item.attrs && typeof item.attrs === "object" ? item.attrs as Record<string, unknown> : {}
  const text = typeof attrs.text === "string" ? attrs.text : ""

  if (item.type === "emoji" && typeof attrs.name === "string") return emojiToText(attrs.name)
  if (text) return text

  if (Array.isArray(item.content)) return item.content.map(inlineToText).join("")
  return ""
}

/** 마크(굵게/기울임/코드/링크)를 마크다운으로 적용한 인라인 — 본문 단락/표/리스트 용. */
function inlineToMarkdown(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""

  const item = value as Record<string, unknown>
  const attrs = item.attrs && typeof item.attrs === "object" ? item.attrs as Record<string, unknown> : {}
  const text = typeof attrs.text === "string" ? attrs.text : ""

  if (item.type === "emoji" && typeof attrs.name === "string") return emojiToText(attrs.name)
  if (text) return applyInlineMarks(text, item.marks)

  if (Array.isArray(item.content)) return item.content.map(inlineToMarkdown).join("")
  return ""
}

/** 표 셀 1개를 한 줄 텍스트로 — 줄바꿈 제거 + 파이프 이스케이프. */
function renderTableCell(cell: unknown): string {
  const inner = blocksToMarkdown(Array.isArray((cell as Record<string, unknown>)?.content) ? (cell as Record<string, unknown>).content : cell)
  return inner.replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|").trim()
}

function tableToMarkdown(block: Record<string, unknown>): string {
  const rows = Array.isArray(block.content) ? block.content : []
  const matrix: string[][] = []
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const cells = Array.isArray((row as Record<string, unknown>).content)
      ? ((row as Record<string, unknown>).content as unknown[])
      : []
    matrix.push(cells.map(renderTableCell))
  }
  if (matrix.length === 0) return ""
  const cols = Math.max(...matrix.map((r) => r.length))
  const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => r[i] ?? "")
  const header = pad(matrix[0])
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...matrix.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
  ].join("\n")
}

function blocksToMarkdown(value: unknown, depth = 0): string {
  if (depth > 10 || value == null) return ""
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map((item) => blocksToMarkdown(item, depth + 1)).filter(Boolean).join("\n\n")
  }
  if (typeof value !== "object") return ""

  const block = value as Record<string, unknown>
  const type = typeof block.type === "string" ? block.type : ""
  const attrs = block.attrs && typeof block.attrs === "object" ? block.attrs as Record<string, unknown> : {}
  const content = Array.isArray(block.content) ? block.content : []

  switch (type) {
    case "heading": {
      const level = typeof attrs.level === "number" ? Math.min(Math.max(attrs.level, 1), 6) : 2
      return `${"#".repeat(level)} ${content.map(inlineToText).join("").trim()}`
    }
    case "text":
    case "paragraph":
      return content.map(inlineToMarkdown).join("").trim()
    case "code":
      return ["```", content.map(inlineToText).join("\n"), "```"].join("\n")
    case "image": {
      const src = typeof attrs.src === "string" ? attrs.src : ""
      if (!src) return ""
      const alt = typeof attrs.alt === "string" ? attrs.alt.replace(/[[\]]/g, "") : ""
      return `![${alt}](${src})`
    }
    case "file": {
      const src = typeof attrs.src === "string" ? attrs.src : ""
      if (!src) return ""
      // 파일명 안의 대괄호는 마크다운 링크 텍스트를 깨뜨리므로 제거한다.
      const rawName = typeof attrs.name === "string" && attrs.name ? attrs.name : "첨부파일"
      const name = rawName.replace(/[[\]]/g, "").trim() || "첨부파일"
      return `[📎 ${name}](${src})`
    }
    case "webPage": {
      const url =
        typeof attrs.url === "string" ? attrs.url : typeof attrs.src === "string" ? attrs.src : typeof attrs.href === "string" ? attrs.href : ""
      if (!url) return content.map((item) => blocksToMarkdown(item, depth + 1)).filter(Boolean).join("\n")
      const label = typeof attrs.title === "string" && attrs.title ? attrs.title : url
      return `[${label}](${url})`
    }
    case "divider":
      return "---"
    case "callout":
    case "blockquote": {
      const inner = content.map((item) => blocksToMarkdown(item, depth + 1)).filter(Boolean).join("\n")
      return inner
        .split("\n")
        .map((line) => `> ${line}`.trimEnd())
        .join("\n")
    }
    case "table":
      return tableToMarkdown(block)
    case "bullets":
    case "orderedList":
      return content.map((item, index) => {
        const text = blocksToMarkdown(item, depth + 1).replace(/\n/g, "\n  ")
        return type === "orderedList" ? `${index + 1}. ${text}` : `- ${text}`
      }).join("\n")
    case "listItem":
      return content.map((item) => blocksToMarkdown(item, depth + 1)).filter(Boolean).join("\n")
    default:
      return content.map((item) => blocksToMarkdown(item, depth + 1)).filter(Boolean).join("\n\n")
  }
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

/** Channel CDN 미디어의 안정 식별자(usermedia/revisions 해시)로 중복 이미지를 판정한다. */
function mediaKey(src: string): string {
  const match = src.match(/([a-f0-9]{16,})/i)
  return match ? match[1].toLowerCase() : src.trim()
}

function getArticleBodyMarkdown(article: ChannelArticle) {
  // 구조화된 body 블록을 우선 사용한다(이미지 alt·표·파일·콜아웃을 정확히 보존).
  let body = blocksToMarkdown(article.body).trim()

  if (!body && typeof article.bodyHtml === "string" && article.bodyHtml.trim()) {
    body = htmlToMarkdown(article.bodyHtml)
  }

  // 블록에서 누락된 bodyHtml '콘텐츠' 이미지를 보강 — 이모지/아이콘 자산은 제외(노이즈).
  if (typeof article.bodyHtml === "string" && article.bodyHtml.includes("<img")) {
    const present = new Set([...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => mediaKey(m[1])))
    const missing: string[] = []
    for (const match of article.bodyHtml.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) {
      const src = match[1]
      if (/\/(asset|emoji|icons?)\//i.test(src)) continue
      const key = mediaKey(src)
      if (present.has(key)) continue
      present.add(key)
      missing.push(src)
    }
    if (missing.length) {
      body = `${body}\n\n${missing.map((src) => `![](${src})`).join("\n\n")}`.trim()
    }
  }

  // 인접한 굵게 런이 만든 빈 강조(****)를 정리한다.
  body = body.replace(/\*\*\*\*/g, "").trim()

  if (body) return body
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

/**
 * 채널 자동생성/날짜코드 제목을 사람이 읽을 수 있는 제목으로 보정한다.
 *  - "260407_코스 탈퇴 규정" → "코스 탈퇴 규정" (날짜코드 접두어 제거)
 *  - "한국어20260323_1109" → 본문 첫 제목/굵게/번호항목에서 추출 (실패 시 원제목 유지)
 */
function deriveTitle(rawTitle: string, bodyMarkdown: string): string {
  const title = rawTitle.trim()

  const prefixStripped = title.replace(/^\d{6,}_+\s*/, "").trim()
  if (prefixStripped && prefixStripped !== title && prefixStripped.length >= 2) {
    return prefixStripped
  }

  if (/^(한국어|영어|english|korean)?\s*\d{6,}/i.test(title)) {
    const candidate =
      bodyMarkdown.match(/^#{1,3}\s+(.+)$/m)?.[1] ??
      bodyMarkdown.match(/\*\*\s*(?:\d+\.\s*)?([^*]{2,})\*\*/)?.[1] ??
      bodyMarkdown.match(/^\s*\d+\.\s+(.+)$/m)?.[1]
    const clean = candidate
      ?.replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ\dIVX]+[.．]\s*/, "")
      .replace(/[*`#]/g, "")
      .trim()
    if (clean && clean.length >= 2 && !/^\d+$/.test(clean)) return clean.slice(0, 80)
  }

  return title
}

function normalizeChannelArticle(articleId: string, article: ChannelArticle): NormalizedChannelDocument {
  const bodyMarkdown = getArticleBodyMarkdown(article)
  const rawTitle = article.title?.trim() || article.name?.trim() || `Channel Talk 지식 문서 ${articleId}`
  const title = deriveTitle(rawTitle, bodyMarkdown)
  const description = compactText(article.summary || article.subtitle || bodyMarkdown || title)
  const updatedAt = toIso(article.updatedAt)
  const publishedAt = typeof article.publishedAt === "number" ? toIso(article.publishedAt) : null
  const sourceUrl =
    article.website?.url ||
    `https://desk.channel.io/#/channels/103209/alf-customer/knowledge/document/${articleId}`
  const slug = `channel-talk-document-${articleId}`
  // 제목 토큰을 키워드로 풀어 키워드 폴백 검색이 제품 용어(수업/코스/성적 등)에 걸리게 한다.
  const titleTokens = title
    .split(/[\s&·,/()[\]]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
  const keywords = unique([
    ...titleTokens,
    title,
    "ClassIn",
    "클래스인",
    "사용 가이드",
    "사용법",
    "헬프센터",
  ])
  const tags = ["ClassIn 가이드", "사용법", "헬프센터"]
  const coverImage =
    typeof article.coverImageUrl === "string" && article.coverImageUrl.trim()
      ? article.coverImageUrl.trim()
      : null
  const imageCount = (bodyMarkdown.match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length + (coverImage ? 1 : 0)
  const fileCount = (bodyMarkdown.match(/\[📎[^\]]*\]\([^)]+\)/g) ?? []).length
  const sections = markdownToSections(bodyMarkdown)
  const contentMarkdown = [
    `# ${title}`,
    coverImage ? `![${title}](${coverImage})` : "",
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
      coverImage,
      imageCount,
      fileCount,
      topicIds: Array.isArray(article.topicIds) ? article.topicIds : [],
      fetchedAt: new Date().toISOString(),
      updatedAt,
      publishedAt,
      sections,
    },
    tags,
    keywords,
    channelState: article.state ?? null,
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
    audience: ["관리자", "교사", "운영팀"],
    product_area: "admin",
    doc_type: "reference",
    difficulty: "intermediate",
    status: "published",
    // 채널에서 published 인 글만 --public 으로 공개 승격 가능. draft/unpublished 는 항상 unlisted.
    visibility: doc.channelState === "published" ? DOC_VISIBILITY : "unlisted",
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
      const title = article.title?.trim() || article.name?.trim() || articleId
      const bodyMarkdown = getArticleBodyMarkdown(article).trim()
      if (bodyMarkdown.length < MIN_BODY_CHARS) {
        console.warn(`[channel-docs] skipped ${articleId} (작성중/빈 본문: "${title}")`)
        continue
      }
      // 명시적 테스트/샘플 페이지는 챗봇 답변 품질을 위해 제외(정확히 일치할 때만 — 보수적).
      if (/^(테스트|test|샘플|sample)$/.test(title.toLowerCase().replace(/\s+/g, ""))) {
        console.warn(`[channel-docs] skipped ${articleId} (테스트/샘플 페이지: "${title}")`)
        continue
      }
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

async function syncToSupabase(documents: NormalizedChannelDocument[], reconcile: boolean) {
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

  // 정합성 reconcile — 전수 크롤 시, 이번 세트에 없는 과거 자동 동기화 문서(삭제·비공개·빈 스텁 등)를
  // archived 로 내려 챗봇 RAG/문서센터에서 제외하고 그 청크를 정리한다. 관리자 수기 편집본은 건드리지 않는다.
  let archivedStale = 0
  if (reconcile) {
    const currentSlugs = new Set(rows.map((row) => row.slug))
    const { data: managedRows, error: managedError } = await supabase
      .from("docs_articles")
      .select("id, slug")
      .eq("category_id", CATEGORY_ID)
      .like("slug", "channel-talk-document-%")
      .eq("updated_by", UPDATED_BY)
      .neq("status", "archived")
    if (managedError) throw managedError

    const staleIds = ((managedRows ?? []) as Array<{ id: string; slug: string }>)
      .filter((row) => !currentSlugs.has(row.slug))
      .map((row) => row.id)

    if (staleIds.length > 0) {
      const { error: deleteStaleChunksError } = await supabase
        .from("docs_ai_chunks")
        .delete()
        .in("article_id", staleIds)
      if (deleteStaleChunksError) throw deleteStaleChunksError

      const { error: archiveError } = await supabase
        .from("docs_articles")
        .update({
          status: "archived",
          visibility: "internal",
          noindex: true,
          last_reviewed_at: now,
          updated_by: UPDATED_BY,
        })
        .in("id", staleIds)
      if (archiveError) throw archiveError
      archivedStale = staleIds.length
    }
  }

  return {
    articleCount: identities.length,
    insertedVersions,
    chunkCount,
    archivedStale,
  }
}

async function main() {
  loadEnvLocal()

  const language = argValue("--language") ?? DEFAULT_LANGUAGE
  const idsArg = argValue("--ids")
  // 기본은 내용이 있는 모든 문서(초안 포함)를 크롤 — 빈 스텁/테스트는 fetch 단계에서 제외.
  // --published-only 로 채널에서 published 상태인 글만 좁힐 수 있다.
  const publishedOnly = args.includes("--published-only")

  let ids = (idsArg ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  // 특정 id 지정이 없을 때만 전수 크롤 + 정합성 reconcile 을 수행한다.
  const fullCrawl = ids.length === 0

  if (fullCrawl) {
    // Documents Open API의 state 쿼리 파라미터는 신뢰할 수 없어(draft까지 반환) 전체를 받아 클라이언트에서 거른다.
    const articles = await listChannelArticles(language, undefined)
    const selected = publishedOnly
      ? articles.filter((article) => (article.state ?? "") === "published")
      : articles
    ids = unique(selected.map((article) => article.id ?? ""))
    console.log(
      `[channel-docs] listed ${articles.length} article(s); selected ${ids.length} (${publishedOnly ? "published only" : "all states, content-bearing"})`
    )
  }

  if (ids.length === 0) throw new Error("No article IDs provided.")

  const documents = await fetchTargetDocuments(ids, language)
  console.log(`[channel-docs] fetched ${documents.length} document(s)`)
  for (const doc of documents) {
    console.log(`- ${doc.articleId}: ${doc.title} (${doc.contentMarkdown.length} chars)`)
  }

  if (dryRun) {
    if (args.includes("--dump")) {
      for (const doc of documents) {
        const meta = doc.contentJson as { imageCount?: number; fileCount?: number }
        console.log(`\n===== ${doc.slug} (images:${meta.imageCount ?? 0} files:${meta.fileCount ?? 0}) =====`)
        console.log(doc.contentMarkdown)
      }
    }
    console.log("[channel-docs] --dry-run: Supabase write skipped.")
    return
  }

  const result = await syncToSupabase(documents, fullCrawl)
  console.log("[channel-docs] sync complete")
  console.log(`- articles: ${result.articleCount}`)
  console.log(`- versions: ${result.insertedVersions}`)
  console.log(`- chunks: ${result.chunkCount}`)
  console.log(`- archived stale: ${result.archivedStale}`)
  console.log("[channel-docs] next: run scripts/embed-docs-chunks.ts to backfill embeddings.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
