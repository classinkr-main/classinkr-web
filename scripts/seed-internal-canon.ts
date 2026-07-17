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
 *
 * 문서/청크/임베딩 적재 로직은 lib/internal-cs-chat/internal-article-writer.ts 로 공용화되어 지식 승격
 * 라우트와 공유한다. 이 스크립트는 대상 수집·환경 로딩·로그만 소유한다.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

import {
  chunkMarkdown,
  ensureInternalCanonCategory,
  getInternalEmbedConfig,
  slugFromRelativePath,
  writeInternalCanonDoc,
} from "@/lib/internal-cs-chat/internal-article-writer"

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

const dryRun = new Set(process.argv.slice(2)).has("--dry-run")

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

async function main() {
  const { model: embedModel, dim: embedDim } = getInternalEmbedConfig()
  const targets = collectSeedTargets()
  console.log(`[seed-canon] 대상 문서 ${targets.length}개 — 모델 ${embedModel} @ ${embedDim}d`)

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

  await ensureInternalCanonCategory(supabase)

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
    const result = await writeInternalCanonDoc(supabase, { rel, markdown })
    docs += 1
    embedded += result.embedded
    kept += result.kept
    failed += result.failed
    console.log(
      `[seed-canon] ${result.slug} — 청크 ${result.chunkCount}(신규임베딩 ${result.embedded}, 유지 ${result.kept}, 실패 ${result.failed})`
    )
  }

  console.log(
    `[seed-canon] 완료 — 문서 ${docs}, 신규임베딩 ${embedded}, 유지 ${kept}, 실패 ${failed} (model: ${embedModel} @ ${embedDim}d)`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
