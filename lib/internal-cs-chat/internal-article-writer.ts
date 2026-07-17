/**
 * 내부 문서(docs_articles visibility='internal' + docs_ai_chunks + 임베딩) 적재 공용 로직.
 *
 * scripts/seed-internal-canon.ts(brand-canon 원문 적재)와 지식 승격 라우트(검토 승인된 CS 답변 →
 * 내부 지식 문서)가 공유한다. SupabaseClient 를 인자로 받아 스크립트(service role)와 서버(admin client)
 * 양쪽에서 동작한다. "server-only" 를 import 하지 않는다 — tsx 스크립트가 직접 실행하기 때문.
 *
 * 공간 정합(중요): docs_ai_chunks 는 공개 문서 청크와 같은 테이블·같은 RPC(match_docs_ai_chunks)로
 * 검색되므로 임베딩은 scripts/embed-docs-chunks.ts 와 "동일 모델·차원"(GEMINI_EMBED_MODEL/GEMINI_EMBED_DIM)
 * 이어야 한다. 현행 컬럼 차원에 맞춰 실행 환경에서 GEMINI_EMBED_DIM 을 설정한다.
 */

import { createHash } from "node:crypto"
import { type SupabaseClient } from "@supabase/supabase-js"

export const INTERNAL_CANON_CATEGORY = "internal-canon"
export const INTERNAL_CANON_UPDATED_BY = "seed-internal-canon"
export const CS_KNOWLEDGE_CATEGORY = "cs-knowledge"
export const CS_KNOWLEDGE_UPDATED_BY = "cs-knowledge-promotion"

const MAX_CHUNK_CHARS = 1400
const THROTTLE_MS = 120

export function getInternalEmbedConfig() {
  return {
    model: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
    dim: Number(process.env.GEMINI_EMBED_DIM ?? "1536"),
  }
}

// ─── 순수 마크다운 유틸 ─────────────────────────────────────

export function slugFromRelativePath(rel: string): string {
  return rel
    .replace(/^docs\/active\//, "")
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function titleFromMarkdown(markdown: string, fallback: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#\s+(.+?)\s*$/)
    if (heading) return heading[1].replace(/[#*`>]/g, "").trim().slice(0, 200)
  }
  return fallback
}

export function descriptionFromMarkdown(markdown: string, fallback: string): string {
  const lines = markdown.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) continue
    return trimmed.replace(/[#*`>]/g, "").slice(0, 300)
  }
  return fallback
}

export interface CanonChunk {
  heading: string | null
  content: string
}

// 헤딩(#/##/###...) 경계로 섹션을 나누고, 긴 섹션은 문단(빈 줄) 단위로 소프트 분할한다.
export function chunkMarkdown(markdown: string): CanonChunk[] {
  const lines = markdown.split(/\r?\n/)
  const sections: { heading: string | null; body: string[] }[] = []
  let current: { heading: string | null; body: string[] } = { heading: null, body: [] }

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/)
    if (headingMatch) {
      if (current.heading !== null || current.body.some((l) => l.trim())) sections.push(current)
      current = { heading: headingMatch[1].replace(/[#*`>]/g, "").trim(), body: [] }
    } else {
      current.body.push(line)
    }
  }
  if (current.heading !== null || current.body.some((l) => l.trim())) sections.push(current)

  const chunks: CanonChunk[] = []
  for (const section of sections) {
    const body = section.body.join("\n").trim()
    if (!body && !section.heading) continue
    if (body.length <= MAX_CHUNK_CHARS) {
      chunks.push({ heading: section.heading, content: body || section.heading || "" })
      continue
    }
    // 큰 섹션: 문단 단위로 누적하며 소프트 최대 크기에서 끊는다.
    let buffer: string[] = []
    let size = 0
    for (const paragraph of body.split(/\n{2,}/)) {
      const piece = paragraph.trim()
      if (!piece) continue
      if (size + piece.length > MAX_CHUNK_CHARS && buffer.length > 0) {
        chunks.push({ heading: section.heading, content: buffer.join("\n\n") })
        buffer = []
        size = 0
      }
      buffer.push(piece)
      size += piece.length
    }
    if (buffer.length > 0) chunks.push({ heading: section.heading, content: buffer.join("\n\n") })
  }

  return chunks.filter((chunk) => chunk.content.trim().length > 0)
}

export function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 승격 답변용 제목: 마크다운 헤딩 → 첫 유의미 줄 → 기본값.
export function deriveArticleTitle(markdown: string): string {
  const heading = titleFromMarkdown(markdown, "")
  if (heading) return heading
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.replace(/[#*`>]/g, "").trim()
    if (trimmed) return trimmed.slice(0, 200)
  }
  return "내부 CS 지식"
}

// 슬러그 형식 제약(docs_articles_slug_format): ^[a-z0-9]+(?:-[a-z0-9]+)*$ — 소문자 영숫자 + 단일 하이픈.
export function csKnowledgeSlug(messageId: string): string {
  const normalized = messageId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return `cs-${normalized || "unknown"}`
}

// ─── DB 쓰기 (SupabaseClient 주입) ──────────────────────────

export type InternalDocsSupabase = Pick<SupabaseClient, "from">

export async function embedInternalText(text: string): Promise<number[] | null> {
  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey || !text.trim()) return null
  const { model, dim } = getInternalEmbedConfig()
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: dim,
        }),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { embedding?: { values?: number[] } }
    const values = data.embedding?.values
    return Array.isArray(values) && values.length > 0 ? values : null
  } catch {
    return null
  }
}

export interface EnsureDocsCategoryInput {
  id: string
  title: string
  description: string
  orderIndex: number
  icon: string
  isVisible: boolean
}

export async function ensureDocsCategory(
  supabase: InternalDocsSupabase,
  input: EnsureDocsCategoryInput
): Promise<void> {
  const { error } = await supabase.from("docs_categories").upsert(
    {
      id: input.id,
      title: input.title,
      description: input.description,
      order_index: input.orderIndex,
      icon: input.icon,
      is_visible: input.isVisible,
    },
    { onConflict: "id" }
  )
  if (error) throw new Error(`docs_categories upsert 실패: ${error.message}`)
}

export function ensureInternalCanonCategory(supabase: InternalDocsSupabase) {
  return ensureDocsCategory(supabase, {
    id: INTERNAL_CANON_CATEGORY,
    title: "내부 캐논",
    description: "내부 CS 코파일럿 전용 brand-canon 원문(공개 노출 금지).",
    orderIndex: 900,
    icon: "lock",
    isVisible: false,
  })
}

export function ensureCsKnowledgeCategory(supabase: InternalDocsSupabase) {
  return ensureDocsCategory(supabase, {
    id: CS_KNOWLEDGE_CATEGORY,
    title: "내부 CS 지식",
    description: "검토 승인된 CS 답변에서 승격된 내부 지식(공개 노출 금지).",
    orderIndex: 901,
    icon: "lock",
    isVisible: false,
  })
}

export interface UpsertInternalArticleInput {
  categoryId: string
  slug: string
  title: string
  description: string
  markdown: string
  tags: string[]
  updatedBy: string
  // 제공 시에만 content_json 을 갱신한다(승격 백링크). seed 는 넘기지 않아 기존 content_json 을 건드리지 않는다.
  contentJson?: Record<string, unknown>
}

export async function upsertInternalArticle(
  supabase: InternalDocsSupabase,
  input: UpsertInternalArticleInput
): Promise<string> {
  const payload: Record<string, unknown> = {
    category_id: input.categoryId,
    slug: input.slug,
    title: input.title,
    description: input.description,
    product_area: "general",
    doc_type: "reference",
    difficulty: "advanced",
    status: "published",
    visibility: "internal",
    noindex: true,
    content_markdown: input.markdown,
    tags: input.tags,
    updated_by: input.updatedBy,
  }
  if (input.contentJson !== undefined) payload.content_json = input.contentJson

  const { data, error } = await supabase
    .from("docs_articles")
    .upsert(payload, { onConflict: "category_id,slug" })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(`docs_articles upsert 실패(${input.slug}): ${error?.message ?? "no row"}`)
  }
  return (data as { id: string }).id
}

interface ExistingChunk {
  content_hash: string
  hasEmbedding: boolean
}

export interface SyncArticleChunksOptions {
  source: string
  embed?: (text: string) => Promise<number[] | null>
  throttleMs?: number
}

export async function syncArticleChunks(
  supabase: InternalDocsSupabase,
  articleId: string,
  chunks: CanonChunk[],
  options: SyncArticleChunksOptions
): Promise<{ embedded: number; kept: number; failed: number }> {
  const embed = options.embed ?? embedInternalText
  const throttleMs = options.throttleMs ?? THROTTLE_MS
  const { model: embedModel } = getInternalEmbedConfig()

  const { data: existingData, error: existingError } = await supabase
    .from("docs_ai_chunks")
    .select("chunk_index, content_hash, embedding")
    .eq("article_id", articleId)
  if (existingError) throw new Error(`기존 청크 조회 실패: ${existingError.message}`)

  const existing = new Map<number, ExistingChunk>()
  for (const row of (existingData ?? []) as {
    chunk_index: number
    content_hash: string
    embedding: unknown
  }[]) {
    existing.set(row.chunk_index, {
      content_hash: row.content_hash,
      hasEmbedding: row.embedding != null,
    })
  }

  let embedded = 0
  let kept = 0
  let failed = 0

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    const embedInput = `${chunk.heading ? `${chunk.heading}\n` : ""}${chunk.content}`.trim()
    const hash = contentHash(embedInput)
    const prior = existing.get(index)

    if (prior && prior.content_hash === hash && prior.hasEmbedding) {
      kept += 1
      continue
    }

    const values = await embed(embedInput)
    if (throttleMs > 0) await sleep(throttleMs)
    if (!values) {
      failed += 1
      console.warn(`[internal-article] 임베딩 실패(article ${articleId} #${index}) — 청크는 저장하되 embedding=null`)
    }

    const { error: upsertError } = await supabase.from("docs_ai_chunks").upsert(
      {
        article_id: articleId,
        chunk_index: index,
        heading: chunk.heading,
        content: chunk.content,
        content_hash: hash,
        token_count: Math.max(1, Math.ceil(embedInput.length / 4)),
        metadata: { source: options.source, visibility: "internal" },
        embedding_model: values ? embedModel : null,
        embedding: values ? JSON.stringify(values) : null,
        embedding_updated_at: values ? new Date().toISOString() : null,
      },
      { onConflict: "article_id,chunk_index" }
    )
    if (upsertError) throw new Error(`청크 저장 실패(article ${articleId} #${index}): ${upsertError.message}`)
    if (values) embedded += 1
  }

  // 사라진 청크(이전 실행보다 짧아진 경우) 삭제.
  const staleIndexes = [...existing.keys()].filter((idx) => idx >= chunks.length)
  if (staleIndexes.length > 0) {
    const { error: deleteError } = await supabase
      .from("docs_ai_chunks")
      .delete()
      .eq("article_id", articleId)
      .gte("chunk_index", chunks.length)
    if (deleteError) throw new Error(`잉여 청크 삭제 실패(article ${articleId}): ${deleteError.message}`)
  }

  return { embedded, kept, failed }
}

// ─── 고수준: seed(원문 파일 1건) ────────────────────────────

export interface WriteInternalCanonDocResult {
  slug: string
  articleId: string
  chunkCount: number
  embedded: number
  kept: number
  failed: number
}

export async function writeInternalCanonDoc(
  supabase: InternalDocsSupabase,
  input: { rel: string; markdown: string }
): Promise<WriteInternalCanonDocResult> {
  const slug = slugFromRelativePath(input.rel)
  const title = titleFromMarkdown(input.markdown, slug)
  const description = descriptionFromMarkdown(input.markdown, title)
  const articleId = await upsertInternalArticle(supabase, {
    categoryId: INTERNAL_CANON_CATEGORY,
    slug,
    title,
    description,
    markdown: input.markdown,
    tags: ["brand-canon", "internal"],
    updatedBy: INTERNAL_CANON_UPDATED_BY,
  })
  const chunks = chunkMarkdown(input.markdown)
  const result = await syncArticleChunks(supabase, articleId, chunks, {
    source: INTERNAL_CANON_UPDATED_BY,
  })
  return { slug, articleId, chunkCount: chunks.length, ...result }
}

// ─── 고수준: 지식 승격(검토 승인 CS 답변 1건) ────────────────

export interface PromoteMessageToInternalArticleInput {
  messageId: string
  conversationId: string
  correctedContent: string
  now?: Date
  embed?: (text: string) => Promise<number[] | null>
  throttleMs?: number
}

export interface PromoteMessageToInternalArticleResult {
  articleId: string
  slug: string
  reused: boolean
  /** 이번 승격에서 임베딩에 실패한 청크 수. 0 이면 모든 청크가 벡터 검색 가능 상태다. */
  embeddingFailures: number
}

/** content_json 백링크(sourceMessageId)로 기존 승격 문서를 찾는다. docs_articles 에 metadata 컬럼이 없어 content_json 을 쓴다. */
export async function findInternalArticleBySourceMessageId(
  supabase: InternalDocsSupabase,
  messageId: string
): Promise<{ id: string; slug: string } | null> {
  const { data, error } = await supabase
    .from("docs_articles")
    .select("id, slug")
    .eq("category_id", CS_KNOWLEDGE_CATEGORY)
    .eq("content_json->>sourceMessageId", messageId)
    .maybeSingle()
  if (error) throw new Error(`docs_articles 백링크 조회 실패: ${error.message}`)
  return (data as { id: string; slug: string } | null) ?? null
}

/**
 * 검토 승인된 CS 답변(corrected_content)을 내부 지식 문서로 승격한다(계약 3).
 * visibility='internal', noindex=true, updated_by='cs-knowledge-promotion', content_json 에
 * { sourceMessageId, sourceConversationId } 백링크. 멱등: 같은 메시지 재승격 시 기존 문서 갱신(reused=true).
 */
export async function promoteMessageToInternalArticle(
  supabase: InternalDocsSupabase,
  input: PromoteMessageToInternalArticleInput
): Promise<PromoteMessageToInternalArticleResult> {
  await ensureCsKnowledgeCategory(supabase)

  const existing = await findInternalArticleBySourceMessageId(supabase, input.messageId)
  const reused = existing !== null
  const slug = existing?.slug ?? csKnowledgeSlug(input.messageId)
  const markdown = input.correctedContent
  const title = deriveArticleTitle(markdown)
  const description = descriptionFromMarkdown(markdown, title)
  const promotedAt = (input.now ?? new Date()).toISOString()

  const articleId = await upsertInternalArticle(supabase, {
    categoryId: CS_KNOWLEDGE_CATEGORY,
    slug,
    title,
    description,
    markdown,
    tags: ["cs-knowledge", "internal"],
    updatedBy: CS_KNOWLEDGE_UPDATED_BY,
    contentJson: {
      source: CS_KNOWLEDGE_UPDATED_BY,
      sourceMessageId: input.messageId,
      sourceConversationId: input.conversationId,
      promotedAt,
    },
  })

  const chunks = chunkMarkdown(markdown)
  const sync = await syncArticleChunks(supabase, articleId, chunks, {
    source: CS_KNOWLEDGE_UPDATED_BY,
    embed: input.embed,
    throttleMs: input.throttleMs,
  })

  // 문서 저장 자체는 임베딩 실패와 무관하게 유지한다(청크는 embedding=null 로 남음).
  // 실패 수는 라우트가 searchable 로 표면화해 담당자가 검색 가능 여부를 알 수 있게 한다.
  return { articleId, slug, reused, embeddingFailures: sync.failed }
}
