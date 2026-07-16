/**
 * Seed internal brand-canon 원문을 docs_articles(visibility='internal') + docs_ai_chunks 로 적재한다.
 *
 * Usage:
 *   GEMINI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_EMBED_DIM=768 \
 *     npx tsx scripts/seed-internal-canon.ts
 *
 * Flags:
 *   --dry-run   문서/청크 개수만 출력(DB 쓰기·Gemini 호출 없음)
 *
 * 계약 9 (cs-copilot-knowledge-plan-2026-07-16.md): 내부 CS 코파일럿이 brand-canon SSOT 원문을
 * match_docs_ai_chunks(include_internal=true, T1 마이그레이션 20260716_docs_match_internal_param.sql)로
 * 검색할 수 있게 한다. 대상 문서는 visibility='internal', noindex=true 로 공개 경로에서 완전히 가려진다.
 *
 * 멱등: 문서/청크를 (category_id, slug)/(article_id, chunk_index) 로 upsert 하고, 내용 해시가 같고 임베딩이
 * 이미 있는 청크는 재임베딩을 건너뛴다. 사라진 청크는 삭제한다. 재실행 시 변경분만 갱신한다.
 *
 * 공간 정합(중요): docs_ai_chunks 는 공개 문서 청크와 같은 테이블·같은 RPC 로 검색되므로, seed 임베딩은
 * scripts/embed-docs-chunks.ts 와 "동일 모델·차원" 이어야 한다. 그래서 GEMINI_EMBED_MODEL/GEMINI_EMBED_DIM 을
 * 동일하게 읽는다. 현행 컬럼은 vector(768)(20260613_docs_chunk_embedding_768.sql)이므로 GEMINI_EMBED_DIM=768 로 실행한다.
 * (상담 청크 channel_conversation_chunks 는 별개 공간 — scripts/embed-channel-chunks.ts 참고.)
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return

  const envText = readFileSync(envPath, "utf8")
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue

    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

loadEnvLocal()

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001"
const EMBED_DIM = Number(process.env.GEMINI_EMBED_DIM ?? "1536")
const dryRun = new Set(process.argv.slice(2)).has("--dry-run")

const INTERNAL_CANON_CATEGORY = "internal-canon"
const SEED_UPDATED_BY = "seed-internal-canon"
const MAX_CHUNK_CHARS = 1400
const THROTTLE_MS = 120

// 대상 = docs/active/brand-canon/*.md (동적 glob) ∪ knowledge.ts sourceRefs 가 인용하는 docs/active 원문(대조 확정).
// knowledge.ts(T2 계열 소유)는 import 하지 않고, 아래 목록으로 고정한다. sourceRefs 가 바뀌면 이 목록을 함께 갱신할 것.
const KNOWLEDGE_REFERENCED_DOCS = [
  "docs/active/classin-board-s-series-safe-manual-guidelines.md",
  "docs/active/classin-korea-positioning-guidelines.md",
  "docs/active/classin-operating-canon-2026-07-02.md",
  "docs/active/classin-pre-adoption-question-matrix-2026-06-18.md",
  "docs/active/classin-software-feature-inventory.md",
  "docs/active/docs-center-content-guidelines.md",
  "docs/active/internal-cs-ai-bridge.md",
  "docs/active/internal-cs-content-arrangement-2026-07-15.md",
]

function collectSeedTargets(): string[] {
  const brandCanonDir = join(process.cwd(), "docs/active/brand-canon")
  const brandCanon = existsSync(brandCanonDir)
    ? readdirSync(brandCanonDir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => `docs/active/brand-canon/${name}`)
    : []
  return Array.from(new Set([...brandCanon, ...KNOWLEDGE_REFERENCED_DOCS])).sort()
}

function slugFromRelativePath(rel: string): string {
  return rel
    .replace(/^docs\/active\//, "")
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#\s+(.+?)\s*$/)
    if (heading) return heading[1].replace(/[#*`>]/g, "").trim().slice(0, 200)
  }
  return fallback
}

function descriptionFromMarkdown(markdown: string, fallback: string): string {
  const lines = markdown.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) continue
    return trimmed.replace(/[#*`>]/g, "").slice(0, 300)
  }
  return fallback
}

interface CanonChunk {
  heading: string | null
  content: string
}

// 헤딩(#/##/###...) 경계로 섹션을 나누고, 긴 섹션은 문단(빈 줄) 단위로 소프트 분할한다.
function chunkMarkdown(markdown: string): CanonChunk[] {
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

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function embedText(text: string): Promise<number[] | null> {
  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey || !text.trim()) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBED_DIM,
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureCategory(supabase: SupabaseClient) {
  const { error } = await supabase.from("docs_categories").upsert(
    {
      id: INTERNAL_CANON_CATEGORY,
      title: "내부 캐논",
      description: "내부 CS 코파일럿 전용 brand-canon 원문(공개 노출 금지).",
      order_index: 900,
      icon: "lock",
      is_visible: false,
    },
    { onConflict: "id" }
  )
  if (error) throw new Error(`docs_categories upsert 실패: ${error.message}`)
}

async function upsertArticle(
  supabase: SupabaseClient,
  rel: string,
  markdown: string
): Promise<string> {
  const slug = slugFromRelativePath(rel)
  const title = titleFromMarkdown(markdown, slug)
  const description = descriptionFromMarkdown(markdown, title)

  const { data, error } = await supabase
    .from("docs_articles")
    .upsert(
      {
        category_id: INTERNAL_CANON_CATEGORY,
        slug,
        title,
        description,
        product_area: "general",
        doc_type: "reference",
        difficulty: "advanced",
        status: "published",
        visibility: "internal",
        noindex: true,
        content_markdown: markdown,
        tags: ["brand-canon", "internal"],
        updated_by: SEED_UPDATED_BY,
      },
      { onConflict: "category_id,slug" }
    )
    .select("id")
    .single()

  if (error || !data) throw new Error(`docs_articles upsert 실패(${slug}): ${error?.message ?? "no row"}`)
  return (data as { id: string }).id
}

interface ExistingChunk {
  content_hash: string
  hasEmbedding: boolean
}

async function syncArticleChunks(
  supabase: SupabaseClient,
  articleId: string,
  chunks: CanonChunk[]
): Promise<{ embedded: number; kept: number; failed: number }> {
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

    const values = await embedText(embedInput)
    await sleep(THROTTLE_MS)
    if (!values) {
      failed += 1
      console.warn(`[seed-canon] 임베딩 실패(article ${articleId} #${index}) — 청크는 저장하되 embedding=null`)
    }

    const { error: upsertError } = await supabase.from("docs_ai_chunks").upsert(
      {
        article_id: articleId,
        chunk_index: index,
        heading: chunk.heading,
        content: chunk.content,
        content_hash: hash,
        token_count: Math.max(1, Math.ceil(embedInput.length / 4)),
        metadata: { source: SEED_UPDATED_BY, visibility: "internal" },
        embedding_model: values ? EMBED_MODEL : null,
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

async function main() {
  const targets = collectSeedTargets()
  console.log(`[seed-canon] 대상 문서 ${targets.length}개 — 모델 ${EMBED_MODEL} @ ${EMBED_DIM}d`)

  if (dryRun) {
    let totalChunks = 0
    for (const rel of targets) {
      const abs = join(process.cwd(), rel)
      if (!existsSync(abs)) {
        console.warn(`[seed-canon] 파일 없음(건너뜀): ${rel}`)
        continue
      }
      const chunks = chunkMarkdown(readFileSync(abs, "utf8"))
      totalChunks += chunks.length
      console.log(`[seed-canon]   ${slugFromRelativePath(rel)} → 청크 ${chunks.length}개`)
    }
    console.log(`[seed-canon] --dry-run: 총 청크 ${totalChunks}개 (DB 쓰기·Gemini 호출 없음)`)
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY."
    )
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY (required unless --dry-run).")
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await ensureCategory(supabase)

  let docs = 0
  let embedded = 0
  let kept = 0
  let failed = 0

  for (const rel of targets) {
    const abs = join(process.cwd(), rel)
    if (!existsSync(abs)) {
      console.warn(`[seed-canon] 파일 없음(건너뜀): ${rel}`)
      continue
    }
    const markdown = readFileSync(abs, "utf8")
    const articleId = await upsertArticle(supabase, rel, markdown)
    const chunks = chunkMarkdown(markdown)
    const result = await syncArticleChunks(supabase, articleId, chunks)
    docs += 1
    embedded += result.embedded
    kept += result.kept
    failed += result.failed
    console.log(
      `[seed-canon] ${slugFromRelativePath(rel)} — 청크 ${chunks.length}(신규임베딩 ${result.embedded}, 유지 ${result.kept}, 실패 ${result.failed})`
    )
  }

  console.log(
    `[seed-canon] 완료 — 문서 ${docs}, 신규임베딩 ${embedded}, 유지 ${kept}, 실패 ${failed} (model: ${EMBED_MODEL} @ ${EMBED_DIM}d)`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
