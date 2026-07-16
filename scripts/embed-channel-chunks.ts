/**
 * Backfill embeddings for channel_conversation_chunks (내부 CS 코파일럿 상담 근거 검색).
 *
 * Usage:
 *   GEMINI_API_KEY=... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/embed-channel-chunks.ts
 *
 * Flags:
 *   --dry-run     count chunks needing embeddings, do not call Gemini or write
 *   --all         re-embed every chunk (default: only rows where embedding is null)
 *   --limit N     stop after N chunks (useful for a smoke test)
 *
 * Idempotent: default mode only fills missing embeddings, so it is safe to re-run
 * (e.g. after a new sync appended chunks). Pair with migration
 * supabase/migrations/20260716_channel_conversations.sql.
 *
 * 공간 정합(중요): 상담 청크 임베딩은 lib/internal-cs-chat/consultation-search.ts(T2)가 만드는 "쿼리"
 * 임베딩과 반드시 같은 모델·차원이어야 유사도가 의미를 갖는다. 테이블/RPC 가 vector(768) 계약이므로
 * gemini-embedding-001 @ 768d 로 고정한다(CHANNEL_CONVERSATION_EMBED_DIM 로만 override). 이는 docs_ai_chunks
 * 와는 별개 공간이다(그쪽은 GEMINI_EMBED_DIM 을 따른다).
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

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

// 임베딩 호출은 self-contained (lib/chatbot/llm.ts 는 server-only 라 tsx 에서 import 불가).
// 모델은 gemini-embedding-001, 차원은 768 고정(테이블/RPC = vector(768)). CHANNEL_CONVERSATION_EMBED_DIM 로만 override.
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001"
const EMBED_DIM = Number(process.env.CHANNEL_CONVERSATION_EMBED_DIM ?? "768")

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

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const reEmbedAll = args.has("--all")

function parseLimit(): number | null {
  const argv = process.argv.slice(2)
  const idx = argv.indexOf("--limit")
  if (idx === -1) return null
  const value = Number(argv[idx + 1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}
const limit = parseLimit()

const PAGE_SIZE = 200
const THROTTLE_MS = 120

interface ChunkRow {
  id: string
  content: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY."
    )
  }
  if (!dryRun && !process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY (required unless --dry-run).")
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let countQuery = supabase
    .from("channel_conversation_chunks")
    .select("id", { count: "exact", head: true })
  if (!reEmbedAll) countQuery = countQuery.is("embedding", null)
  const { count, error: countError } = await countQuery
  if (countError) throw new Error(`count failed: ${countError.message}`)

  const total = count ?? 0
  console.log(
    `[embed-channel] ${reEmbedAll ? "전체" : "임베딩 없는"} 청크: ${total}개${limit ? ` (limit ${limit})` : ""} — 모델 ${EMBED_MODEL} @ ${EMBED_DIM}d`
  )

  if (dryRun) {
    console.log("[embed-channel] --dry-run: 호출/쓰기 없이 종료합니다.")
    return
  }
  if (total === 0) {
    console.log("[embed-channel] 처리할 청크가 없습니다.")
    return
  }

  let processed = 0
  let embedded = 0
  let skipped = 0

  // 기본 모드는 embedding IS NULL 행이 매 반복마다 줄어드므로 offset 없이 첫 페이지를 반복 조회.
  // --all 모드는 id 커서로 페이지네이션.
  let cursor: string | null = null

  while (true) {
    if (limit && processed >= limit) break

    let pageQuery = supabase
      .from("channel_conversation_chunks")
      .select("id, content")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE)

    if (!reEmbedAll) {
      pageQuery = pageQuery.is("embedding", null)
    } else if (cursor) {
      pageQuery = pageQuery.gt("id", cursor)
    }

    const { data, error } = await pageQuery
    if (error) throw new Error(`fetch failed: ${error.message}`)

    const rows = (data ?? []) as ChunkRow[]
    if (rows.length === 0) break

    let pageEmbedded = 0

    for (const row of rows) {
      if (limit && processed >= limit) break
      processed += 1
      cursor = row.id

      const values = await embedText(row.content.trim())
      await sleep(THROTTLE_MS)

      if (!values) {
        skipped += 1
        console.warn(`[embed-channel] 임베딩 실패(건너뜀): ${row.id}`)
        continue
      }

      const { error: updateError } = await supabase
        .from("channel_conversation_chunks")
        .update({
          // pgvector 컬럼은 "[..]" 문자열로 써야 한다 (배열 직접 전달 시 거부됨).
          embedding: JSON.stringify(values),
        })
        .eq("id", row.id)

      if (updateError) {
        skipped += 1
        console.warn(`[embed-channel] 저장 실패(${row.id}): ${updateError.message}`)
        continue
      }

      embedded += 1
      pageEmbedded += 1
      if (embedded % 25 === 0) {
        console.log(`[embed-channel] 진행: ${embedded}개 임베딩 완료`)
      }
    }

    // 기본 모드(embedding IS NULL)는 실패 행이 다음 페이지에서 다시 잡혀 무한 반복되므로,
    // 이번 페이지에서 한 건도 저장하지 못했으면 중단한다. --all 모드는 id 커서로 전진.
    if (!reEmbedAll && pageEmbedded === 0) {
      console.warn("[embed-channel] 이 페이지에서 저장된 임베딩이 없어 중단합니다.")
      break
    }
  }

  console.log(
    `[embed-channel] 완료 — 처리 ${processed}, 임베딩 ${embedded}, 건너뜀 ${skipped} (model: ${EMBED_MODEL} @ ${EMBED_DIM}d)`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
