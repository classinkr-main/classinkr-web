/**
 * Seed static docs into Supabase docs center tables.
 *
 * Usage:
 *   npx tsx scripts/seed-docs.ts --dry-run
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-docs.ts
 *
 * This script is intentionally idempotent:
 * - categories and articles are upserted
 * - initial version snapshots are inserted once
 * - AI chunks are derived from lib/docs.ts and replaced for seeded articles
 * - article relations are upserted, not deleted
 */

import crypto from "node:crypto"
import { createClient } from "@supabase/supabase-js"

import {
  docsCategories,
  getDocPath,
  listDocs,
  type DocArticle,
  type DocCategoryId,
  type DocSection,
} from "../lib/docs"

type ProductArea =
  | "general"
  | "software"
  | "hardware"
  | "billing"
  | "onboarding"
  | "classroom"
  | "admin"
  | "partner"

type DocType = "guide" | "manual" | "faq" | "troubleshooting" | "release_note" | "reference"
type ArticleStatus = "draft" | "review" | "published" | "archived"
type ArticleVisibility = "public" | "unlisted" | "internal"

interface ArticleIdentity {
  id: string
  slug: string
  category_id: DocCategoryId
}

interface VersionIdentity {
  id: string
  article_id: string
  version_number: number
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

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const skipChunks = args.has("--skip-chunks")
const skipVersions = args.has("--skip-versions")

const docs = listDocs()

function validateStaticDocs() {
  const slugs = new Set<string>()

  for (const doc of docs) {
    if (slugs.has(doc.slug)) {
      throw new Error(`Duplicate docs slug: ${doc.slug}`)
    }

    slugs.add(doc.slug)
  }

  for (const doc of docs) {
    for (const relatedSlug of doc.relatedSlugs ?? []) {
      if (!slugs.has(relatedSlug)) {
        throw new Error(`Missing related docs slug: ${doc.slug} -> ${relatedSlug}`)
      }
    }
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function toDateTime(date: string) {
  return `${date}T00:00:00+09:00`
}

function hashContent(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function docHaystack(doc: DocArticle) {
  return [...doc.tags, ...doc.keywords, doc.title, doc.description].join(" ").toLowerCase()
}

function inferProductArea(doc: DocArticle): ProductArea {
  const haystack = docHaystack(doc)

  if (doc.slug.includes("update") || doc.tags.includes("업데이트")) return "classroom"
  if (doc.category === "hardware" || doc.category === "board" || haystack.includes("하드웨어") || haystack.includes("전자칠판")) return "hardware"
  if (haystack.includes("결제") || haystack.includes("영수증") || haystack.includes("세금") || haystack.includes("요금")) {
    return "billing"
  }
  if (doc.category === "start" || haystack.includes("온보딩")) return "onboarding"
  if (doc.category === "admin") return "admin"
  if (doc.category === "teacher" || doc.category === "student" || haystack.includes("수업")) return "classroom"

  return "general"
}

function inferDocType(doc: DocArticle): DocType {
  if (doc.slug.includes("update") || doc.tags.includes("업데이트")) return "release_note"
  if (doc.tags.includes("운영 체크리스트") || doc.tags.includes("전자칠판 체크리스트")) return "guide"
  if (doc.category === "hardware" || doc.category === "board") return "reference"
  if (doc.category === "start") return "guide"
  return "manual"
}

function getArticleStatus(doc: DocArticle): ArticleStatus {
  return doc.status ?? "published"
}

function getArticleVisibility(doc: DocArticle, status: ArticleStatus): ArticleVisibility {
  return doc.visibility ?? (status === "published" ? "public" : "unlisted")
}

function getArticleNoindex(doc: DocArticle, status: ArticleStatus) {
  return doc.noindex ?? status !== "published"
}

function inferSymptoms() {
  return []
}

function sectionToMarkdown(section: DocSection) {
  const steps = section.steps?.map((step) => `- ${step}`).join("\n")
  const media = section.media
    ?.map((item) => {
      const asset =
        item.type === "image" ? `![${item.alt}](${item.src})` : `[${item.alt}](${item.src})`
      return [asset, item.caption].filter(Boolean).join("\n")
    })
    .join("\n\n")
  return [`## ${section.heading}`, section.body, steps, media].filter(Boolean).join("\n\n")
}

function docToMarkdown(doc: DocArticle) {
  const resourceLines = doc.resources?.map((resource) =>
    `- [${resource.label}](${resource.href})${resource.description ? ` - ${resource.description}` : ""}`
  )

  return [
    `# ${doc.title}`,
    doc.description,
    `대상: ${doc.audience}`,
    `업데이트: ${doc.updatedAt}`,
    ...doc.sections.map(sectionToMarkdown),
    resourceLines?.length ? ["## 첨부 자료", resourceLines.join("\n")].join("\n\n") : undefined,
  ].join("\n\n")
}

function buildCategoryRows() {
  return docsCategories.map((category) => ({
    id: category.id,
    title: category.title,
    description: category.description,
    order_index: category.order * 10,
    icon: null,
    is_visible: true,
  }))
}

function buildArticleRows() {
  return docs.map((doc, index) => {
    const status = getArticleStatus(doc)
    const visibility = getArticleVisibility(doc, status)
    const noindex = getArticleNoindex(doc, status)
    const reviewedAt = status === "published" ? toDateTime(doc.updatedAt) : null

    return {
      category_id: doc.category,
      slug: doc.slug,
      title: doc.title,
      description: doc.description,
      audience: unique(doc.audience.split(",").map((item) => item.trim())),
      product_area: doc.productArea ?? inferProductArea(doc),
      doc_type: doc.docType ?? inferDocType(doc),
      difficulty: doc.difficulty ?? "beginner",
      status,
      visibility,
      noindex,
      featured: Boolean(doc.featured),
      order_index: (docsCategories.find((category) => category.id === doc.category)?.order ?? 99) * 100 + index,
      tags: doc.tags,
      keywords: doc.keywords,
      symptoms: inferSymptoms(),
      chatbot_summary: doc.chatbotSummary,
      content_markdown: docToMarkdown(doc),
      content_json: {
        source: "lib/docs.ts",
        readMinutes: doc.readMinutes,
        updatedAt: doc.updatedAt,
        sections: doc.sections,
        resources: doc.resources ?? [],
        relatedSlugs: doc.relatedSlugs ?? [],
      },
      seo_title: `${doc.title} | ClassIn 가이드`,
      seo_description: doc.description,
      canonical_path: getDocPath(doc),
      published_at: reviewedAt,
      last_reviewed_at: reviewedAt,
      updated_by: "seed-docs",
    }
  })
}

function buildVersionRows(articleMap: Map<string, ArticleIdentity>) {
  return docs.map((doc) => {
    const article = articleMap.get(doc.slug)
    if (!article) throw new Error(`Missing article id for ${doc.slug}`)

    return {
      article_id: article.id,
      version_number: 1,
      title: doc.title,
      description: doc.description,
      content_markdown: docToMarkdown(doc),
      content_json: {
        source: "lib/docs.ts",
        readMinutes: doc.readMinutes,
        updatedAt: doc.updatedAt,
        sections: doc.sections,
        resources: doc.resources ?? [],
        relatedSlugs: doc.relatedSlugs ?? [],
      },
      change_note: "Initial import from lib/docs.ts",
      created_by: "seed-docs",
    }
  })
}

function buildChunkRows(
  articleMap: Map<string, ArticleIdentity>,
  versionMap: Map<string, VersionIdentity>
) {
  return docs.flatMap((doc) => {
    const article = articleMap.get(doc.slug)
    if (!article) throw new Error(`Missing article id for ${doc.slug}`)

    const version = versionMap.get(article.id)
    const summaryContent = [
      doc.title,
      doc.description,
      doc.chatbotSummary,
      `키워드: ${doc.keywords.join(", ")}`,
      `대상: ${doc.audience}`,
      doc.resources?.length
        ? `첨부 자료: ${doc.resources.map((resource) => `${resource.label} ${resource.href}`).join(", ")}`
        : "",
    ].join("\n\n")

    const chunks: ChunkRow[] = [
      {
        article_id: article.id,
        article_version_id: version?.id ?? null,
        chunk_index: 0,
        heading: "요약",
        content: summaryContent,
        content_hash: hashContent(summaryContent),
        token_count: null,
        metadata: {
          source: "lib/docs.ts",
          path: getDocPath(doc),
          slug: doc.slug,
          category: doc.category,
          tags: doc.tags,
          keywords: doc.keywords,
          audience: doc.audience,
          resources: doc.resources ?? [],
          chunkType: "summary",
        },
        embedding_model: null,
        embedding: null,
        embedding_updated_at: null,
      },
    ]

    doc.sections.forEach((section, index) => {
      const content = sectionToMarkdown(section)

      chunks.push({
        article_id: article.id,
        article_version_id: version?.id ?? null,
        chunk_index: index + 1,
        heading: section.heading,
        content,
        content_hash: hashContent(content),
        token_count: null,
        metadata: {
          source: "lib/docs.ts",
          path: getDocPath(doc),
          slug: doc.slug,
          category: doc.category,
          tags: doc.tags,
          keywords: doc.keywords,
          audience: doc.audience,
          chunkType: "section",
          sectionIndex: index,
        },
        embedding_model: null,
        embedding: null,
        embedding_updated_at: null,
      })
    })

    return chunks
  })
}

function buildRelationRows(articleMap: Map<string, ArticleIdentity>) {
  return docs.flatMap((doc) => {
    const article = articleMap.get(doc.slug)
    if (!article) throw new Error(`Missing article id for ${doc.slug}`)

    return (doc.relatedSlugs ?? []).flatMap((relatedSlug, index) => {
      const related = articleMap.get(relatedSlug)
      if (!related) {
        console.warn(`Skip missing related doc: ${doc.slug} -> ${relatedSlug}`)
        return []
      }

      return {
        article_id: article.id,
        related_article_id: related.id,
        relation_type: index === 0 ? "next_step" : "related",
        order_index: (index + 1) * 10,
        note: "Imported from lib/docs.ts relatedSlugs",
      }
    })
  })
}

function requireSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY."
    )
  }

  return { url, serviceRoleKey }
}

async function main() {
  validateStaticDocs()

  const categoryRows = buildCategoryRows()
  const articleRows = buildArticleRows()
  const expectedChunkCount = docs.reduce((total, doc) => total + 1 + doc.sections.length, 0)
  const expectedRelationCount = docs.reduce((total, doc) => total + (doc.relatedSlugs?.length ?? 0), 0)

  if (dryRun) {
    console.log("Docs seed dry run")
    console.log(`- categories: ${categoryRows.length}`)
    console.log(`- articles: ${articleRows.length}`)
    console.log(`- versions: ${skipVersions ? 0 : articleRows.length}`)
    console.log(`- chunks: ${skipChunks ? 0 : expectedChunkCount}`)
    console.log(`- relations: ${expectedRelationCount}`)
    console.log(`- first article: ${articleRows[0]?.category_id}/${articleRows[0]?.slug}`)
    return
  }

  const { url, serviceRoleKey } = requireSupabaseEnv()
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log("Seeding docs categories...")
  const { error: categoryError } = await supabase
    .from("docs_categories")
    .upsert(categoryRows, { onConflict: "id" })
  if (categoryError) throw categoryError

  console.log("Seeding docs articles...")
  const { data: articles, error: articleError } = await supabase
    .from("docs_articles")
    .upsert(articleRows, { onConflict: "category_id,slug" })
    .select("id, slug, category_id")
  if (articleError) throw articleError
  if (!articles) throw new Error("Supabase returned no article identities.")

  const articleMap = new Map<string, ArticleIdentity>(
    (articles as ArticleIdentity[]).map((article) => [article.slug, article])
  )
  const articleIds = Array.from(articleMap.values()).map((article) => article.id)

  if (!skipVersions) {
    console.log("Seeding initial docs article versions...")
    const versionRows = buildVersionRows(articleMap)
    const { error: versionError } = await supabase
      .from("docs_article_versions")
      .upsert(versionRows, {
        onConflict: "article_id,version_number",
        ignoreDuplicates: true,
      })
    if (versionError) throw versionError
  }

  const { data: versions, error: versionSelectError } = await supabase
    .from("docs_article_versions")
    .select("id, article_id, version_number")
    .in("article_id", articleIds)
    .eq("version_number", 1)
  if (versionSelectError) throw versionSelectError

  const versionMap = new Map<string, VersionIdentity>(
    ((versions ?? []) as VersionIdentity[]).map((version) => [version.article_id, version])
  )

  if (!skipChunks) {
    console.log("Replacing derived docs AI chunks...")
    const { error: chunkDeleteError } = await supabase
      .from("docs_ai_chunks")
      .delete()
      .in("article_id", articleIds)
    if (chunkDeleteError) throw chunkDeleteError

    const chunkRows = buildChunkRows(articleMap, versionMap)
    const { error: chunkInsertError } = await supabase.from("docs_ai_chunks").insert(chunkRows)
    if (chunkInsertError) throw chunkInsertError
  }

  console.log("Seeding docs article relations...")
  const relationRows = buildRelationRows(articleMap)
  if (relationRows.length > 0) {
    const { error: relationError } = await supabase
      .from("docs_article_relations")
      .upsert(relationRows, { onConflict: "article_id,related_article_id" })
    if (relationError) throw relationError
  }

  console.log("Docs seed complete")
  console.log(`- categories: ${categoryRows.length}`)
  console.log(`- articles: ${articleRows.length}`)
  console.log(`- chunks: ${skipChunks ? 0 : expectedChunkCount}`)
  console.log(`- relations: ${relationRows.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
