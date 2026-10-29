import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  docsCategories,
  getDocBySlug,
  getDocPath,
  listDocs,
  type DocArticle,
} from "@/lib/docs"
import { leadMagnets } from "@/lib/lead-magnets"
import { sanitizePublicUrl } from "@/lib/safe-public-url"

// 정적 문서(listDocs) 안의 연결을 검사한다: 관련 문서, 본문·단계의 내부 링크, 첨부 자료 주소, 사진 파일.
// 깨진 연결은 예외 목록으로 숨기지 않는다 — 실패 메시지에 "문서 → 위치 → 대상"을 그대로 남긴다.

const PUBLIC_DIR = path.join(process.cwd(), "public")
const APP_DIR = path.join(process.cwd(), "app")

const docs = listDocs()

function docKey(doc: Pick<DocArticle, "category" | "slug">) {
  return `${doc.category}/${doc.slug}`
}

// lib/docs-content.ts isListedDoc 과 같은 기준 — 목록·사이트맵에 나오는 문서.
function isListed(doc: DocArticle) {
  return (doc.visibility ?? "public") === "public" && !doc.noindex
}

function where(doc: DocArticle) {
  return `${docKey(doc)}${isListed(doc) ? "" : ` (${doc.visibility ?? "public"}${doc.noindex ? ", noindex" : ""})`}`
}

// ---------------------------------------------------------------------------
// app/ 라우트 표 — page 파일이 있는 폴더만 경로가 된다. 라우트 그룹 (x) 는 경로에서 빠지고,
// 비공개 폴더 _x, 병렬 슬롯 @x, 가로채기 (.)x, api 는 문서 링크 대상이 아니므로 건너뛴다.
// ---------------------------------------------------------------------------

interface AppRoute {
  route: string
  segments: string[]
}

function collectAppRoutes(dir: string, segments: string[] = []): AppRoute[] {
  const routes: AppRoute[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      routes.push({ route: `/${segments.join("/")}`, segments })
      continue
    }
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (name.startsWith("_") || name.startsWith("@") || name.startsWith("(.") || name === "api") continue
    const child = path.join(dir, name)
    if (/^\(.+\)$/.test(name)) routes.push(...collectAppRoutes(child, segments))
    else routes.push(...collectAppRoutes(child, [...segments, name]))
  }
  return routes
}

const APP_ROUTES = collectAppRoutes(APP_DIR)

// 같은 깊이에서 정적 > 동적 > catch-all > optional catch-all 순으로 고르는 Next.js 규칙.
function segmentRank(segment: string) {
  if (/^\[\[\.\.\..+\]\]$/.test(segment)) return 3
  if (/^\[\.\.\..+\]$/.test(segment)) return 2
  if (/^\[.+\]$/.test(segment)) return 1
  return 0
}

function matchRoute(pattern: string[], parts: string[]): Record<string, string> | null {
  const params: Record<string, string> = {}
  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index]
    const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/)
    if (optionalCatchAll) {
      params[optionalCatchAll[1]] = parts.slice(index).join("/")
      return params
    }
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/)
    if (catchAll) {
      if (parts.length <= index) return null
      params[catchAll[1]] = parts.slice(index).join("/")
      return params
    }
    if (index >= parts.length) return null
    const dynamic = segment.match(/^\[(.+)\]$/)
    if (dynamic) params[dynamic[1]] = parts[index]
    else if (segment !== parts[index]) return null
  }
  return pattern.length === parts.length ? params : null
}

function findAppRoute(parts: string[]) {
  const candidates = APP_ROUTES.map((route) => ({ route, params: matchRoute(route.segments, parts) }))
    .filter((item): item is { route: AppRoute; params: Record<string, string> } => item.params !== null)
    .sort((a, b) => {
      const length = Math.max(a.route.segments.length, b.route.segments.length)
      for (let index = 0; index < length; index += 1) {
        const diff = segmentRank(a.route.segments[index] ?? "") - segmentRank(b.route.segments[index] ?? "")
        if (diff !== 0) return diff
      }
      return 0
    })
  return candidates[0] ?? null
}

// 동적 라우트는 페이지가 notFound() 를 부르는 조건을 그대로 확인한다(정적 문서 모드 기준).
const DYNAMIC_ROUTE_CHECKS: Record<string, (params: Record<string, string>) => string | null> = {
  "/docs/[category]": ({ category }) =>
    docsCategories.some((item) => item.id === category) ? null : `없는 카테고리: ${category}`,
  "/docs/[category]/[slug]": ({ category, slug }) => {
    const doc = docs.find((item) => item.category === category && item.slug === slug)
    if (doc) return null
    const elsewhere = docs.filter((item) => item.slug === slug).map(docKey)
    return elsewhere.length > 0 ? `카테고리가 다름(실제: ${elsewhere.join(", ")})` : "없는 문서"
  },
  "/resources/[slug]": ({ slug }) =>
    leadMagnets.some((magnet) => magnet.slug === slug && magnet.published) ? null : `없거나 비공개인 자료: ${slug}`,
}

function toPathname(href: string): string | null {
  const pathname = href.split("#")[0].split("?")[0]
  try {
    return decodeURI(pathname)
  } catch {
    return null
  }
}

function publicFileExists(pathname: string) {
  const file = path.join(PUBLIC_DIR, pathname)
  return file.startsWith(PUBLIC_DIR + path.sep) && existsSync(file) && statSync(file).isFile()
}

/** `/` 로 시작하는 사이트 내부 주소가 public 파일이나 실제 페이지로 열리는지. 문제가 없으면 null. */
function checkLocalHref(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return "사이트 내부 경로가 아님"
  const pathname = toPathname(href)
  if (pathname === null) return "주소 인코딩이 깨짐"
  if (publicFileExists(pathname)) return null
  const match = findAppRoute(pathname.split("/").filter(Boolean))
  if (!match) return "public 파일도 페이지도 없음"
  return DYNAMIC_ROUTE_CHECKS[match.route.route]?.(match.params) ?? null
}

/** 내부 링크가 가리키는 문서(있으면). /docs/<카테고리>/<slug> 만 문서로 본다. */
function linkedDoc(href: string) {
  const pathname = toPathname(href)
  const parts = pathname?.split("/").filter(Boolean) ?? []
  if (parts.length !== 3 || parts[0] !== "docs") return undefined
  return docs.find((doc) => doc.category === parts[1] && doc.slug === parts[2])
}

// ---------------------------------------------------------------------------
// 본문·단계에서 링크 뽑기 — lib/blog-markdown.ts 렌더러와 같은 문법만 링크로 본다.
// ---------------------------------------------------------------------------

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const MARKDOWN_LINK_RE = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g
// 본문은 lib/blog-markdown.ts, 단계는 components/docs/DocsArticle.tsx renderInlineMarkdown 이 링크로 그린다.
// 링크 문법 밖에 맨글자로 적힌 /docs/... 경로(렌더러가 링크로 만들지 않지만 독자가 따라 칠 수 있다).
const BARE_DOCS_PATH_RE = /(?<![\w/.(\]-])\/docs(?:\/[\w%.~-]+)+\/?/g

interface TextLink {
  doc: DocArticle
  place: string
  label: string
  href: string
  markdown: boolean
}

function linksInText(doc: DocArticle, place: string, text: string): TextLink[] {
  const links: TextLink[] = []
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    links.push({ doc, place, label: match[1], href: match[2].trim(), markdown: true })
  }
  const withoutMarkdown = text.replace(MARKDOWN_IMAGE_RE, " ").replace(MARKDOWN_LINK_RE, " ")
  for (const match of withoutMarkdown.matchAll(BARE_DOCS_PATH_RE)) {
    links.push({ doc, place, label: match[0], href: match[0], markdown: false })
  }
  return links
}

function collectTextLinks(): TextLink[] {
  return docs.flatMap((doc) =>
    doc.sections.flatMap((section) => [
      ...linksInText(doc, `${section.heading} › 본문`, section.body ?? ""),
      ...(section.steps ?? []).flatMap((step, index) =>
        linksInText(doc, `${section.heading} › 단계 ${index + 1}`, step)
      ),
    ])
  )
}

const textLinks = collectTextLinks()

describe("docs link integrity — 정적 문서 기준", () => {
  it("relatedSlugs 는 하나의 실제 문서를 가리킨다", () => {
    const slugOwners = new Map<string, string[]>()
    for (const doc of docs) slugOwners.set(doc.slug, [...(slugOwners.get(doc.slug) ?? []), docKey(doc)])

    const problems: string[] = []
    for (const doc of docs) {
      const seen = new Set<string>()
      for (const slug of doc.relatedSlugs ?? []) {
        const owners = slugOwners.get(slug) ?? []
        if (owners.length === 0) problems.push(`없는 문서: ${where(doc)} → ${slug}`)
        // getRelatedDocsFromContent 는 slug 만으로 첫 문서를 고르므로 slug 가 겹치면 엉뚱한 문서로 간다.
        else if (owners.length > 1) problems.push(`slug 중복으로 대상이 모호함: ${where(doc)} → ${slug} (${owners.join(", ")})`)
        if (slug === doc.slug) problems.push(`자기 자신을 가리킴: ${where(doc)}`)
        if (seen.has(slug)) problems.push(`같은 문서를 두 번 가리킴: ${where(doc)} → ${slug}`)
        seen.add(slug)
      }
    }
    expect(problems).toEqual([])
  })

  it("본문·단계의 내부 링크는 실제 문서·카테고리·페이지·파일로 열린다", () => {
    const problems: string[] = []
    for (const link of textLinks) {
      if (!link.href.startsWith("/") || link.href.startsWith("//")) continue
      const problem = checkLocalHref(link.href)
      if (problem) problems.push(`${problem}: ${where(link.doc)} → ${link.place} → ${link.href}`)
    }
    expect(problems).toEqual([])
  })

  it("본문 마크다운 링크 주소는 렌더러가 '#' 으로 바꾸지 않는 형식이다", () => {
    // 렌더러는 /경로·#앵커·http(s) 만 그대로 두고 나머지(상대 경로, 공백, mailto 등)는 href="#" 로 바꾼다.
    const problems = textLinks
      .filter((link) => link.markdown && link.place.endsWith("본문"))
      .filter((link) => !link.href.startsWith("#") && sanitizePublicUrl(link.href, "") === "")
      .map((link) => `${where(link.doc)} → ${link.place} → [${link.label}](${link.href})`)
    expect(problems).toEqual([])
  })

  it("단계(steps)에서 주소처럼 적은 [이름](주소) 는 실제로 링크가 되는 형식이다", () => {
    // components/docs/DocsArticle.tsx renderInlineMarkdown 은 주소가 / # http(s):// mailto: 로 시작할 때만 링크로 그린다.
    // "[단색](색상값과 투명도 입력)" 같은 버튼 이름 + 덧붙임 설명은 글자 그대로 두는 것이 맞으므로,
    // 주소처럼 생겼는데(앞의 / 나 https:// 가 빠진 경로·도메인) 링크가 되지 않는 것만 잡는다.
    const rendersAsLink = /^(?:\/|#|https?:\/\/|mailto:)[^)\s]*$/
    const looksLikeAddress =
      /^(?:www\.\S+|[\w-]+(?:\.[\w-]+)*\.(?:com|kr|net|io|html?)(?:\/\S*)?|[\w-]+(?:\/[\w.%~-]+)+\/?)$/i
    const problems = textLinks
      .filter((link) => link.markdown && !link.place.endsWith("본문"))
      .filter((link) => !rendersAsLink.test(link.href) && looksLikeAddress.test(link.href))
      .map((link) => `${where(link.doc)} → ${link.place} → [${link.label}](${link.href})`)
    expect(problems).toEqual([])
  })

  it("첨부 자료(resources)의 사이트 내부 주소는 public 파일이나 실제 페이지로 열린다", () => {
    const problems: string[] = []
    for (const doc of docs) {
      for (const resource of doc.resources ?? []) {
        const href = resource.href.trim()
        if (!href.startsWith("/")) continue
        const problem = checkLocalHref(href)
        if (problem) problems.push(`${problem}: ${where(doc)} → ${resource.label} → ${href}`)
      }
    }
    expect(problems).toEqual([])
  })

  it("섹션 사진·영상과 본문 이미지의 로컬 파일이 public/ 에 있다", () => {
    const problems: string[] = []
    for (const doc of docs) {
      for (const section of doc.sections) {
        const sources = [
          ...(section.media ?? []).map((media) => ({ src: media.src.trim(), kind: media.type === "video" ? "영상" : "사진" })),
          ...[...(section.body ?? "").matchAll(MARKDOWN_IMAGE_RE)].map((match) => ({ src: match[2].trim(), kind: "본문 이미지" })),
        ]
        for (const { src, kind } of sources) {
          if (/^https?:\/\//.test(src)) continue
          const pathname = src.startsWith("/") && !src.startsWith("//") ? toPathname(src) : null
          if (pathname === null || !publicFileExists(pathname)) {
            problems.push(`${kind} 파일 없음: ${where(doc)} → ${section.heading} → ${src}`)
          }
        }
      }
    }
    expect(problems).toEqual([])
  })

  it("검사가 실제 라우트를 읽고 있다(라우트 표 자체 점검)", () => {
    expect(checkLocalHref("/docs")).toBeNull()
    expect(checkLocalHref("/docs/first-week")).toBeNull()
    expect(checkLocalHref("/docs/search?q=녹화")).toBeNull()
    expect(checkLocalHref(`/docs/${docsCategories[0].id}`)).toBeNull()
    expect(checkLocalHref(`${getDocPath(docs[0])}#section-1`)).toBeNull()
    expect(checkLocalHref("/docs/no-such-category")).not.toBeNull()
    expect(checkLocalHref(`/docs/${docsCategories[0].id}/no-such-doc`)).not.toBeNull()
    expect(checkLocalHref("/no-such-page-for-docs-link-test")).not.toBeNull()
  })
})

describe("docs link integrity — 공개 문서가 목록 밖 문서로 보내는지(경고)", () => {
  // unlisted·noindex 문서도 주소로는 열리지만(404 아님) 목록·검색·사이트맵에 없다.
  // relatedSlugs 쪽은 getRelatedDocsFromContent 가 조용히 빼고 같은 카테고리 문서로 채운다.
  it("공개 문서의 relatedSlugs·본문 링크·자료 링크가 목록 밖 문서를 가리키지 않는다", () => {
    const warnings: string[] = []
    for (const doc of docs.filter(isListed)) {
      for (const slug of doc.relatedSlugs ?? []) {
        const target = getDocBySlug(slug)
        if (target && !isListed(target)) warnings.push(`관련 문서: ${docKey(doc)} → ${where(target)}`)
      }
      for (const resource of doc.resources ?? []) {
        const target = linkedDoc(resource.href.trim())
        if (target && !isListed(target)) warnings.push(`자료 링크: ${docKey(doc)} → ${resource.label} → ${where(target)}`)
      }
    }
    for (const link of textLinks.filter((item) => isListed(item.doc))) {
      const target = linkedDoc(link.href)
      if (target && !isListed(target)) warnings.push(`본문 링크: ${docKey(link.doc)} → ${link.place} → ${where(target)}`)
    }
    expect(warnings).toEqual([])
  })
})
