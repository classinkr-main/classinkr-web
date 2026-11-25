// 갈매봇 링크 목록 — "링크 찾기" 답과 거절 카드 바로가기가 쓰는 허용 목록(점검 R10·R15).
//
// 고정층만 있다(동적층 — 공개 글·문서·자료 검색 — 은 요청 때 공개 상태를 다시 확인해야 해서 서버가 붙은 뒤).
//  - 어드민 화면(audience "internal"): ADMIN_NAV · CRM 하위 내비 · 팔레트 자식 명령에서 파생한다.
//    손으로 쓴 줄이 없으므로 내비가 바뀌면 이 목록이 따라가고, 존재하지 않는 화면은 시험이 잡는다.
//  - 고객에게 보내도 되는 공개 주소(audience "customer"): lib/public-routes.ts 의 공개 정적 경로 + 제품 소개서.
//    절대 주소는 SITE_URL 하나로만 만든다(결정 9 대기 — 추천안: classin.co.kr 하나로 고정). 소개서(BROCHURE_URL)가
//    유일한 예외이고, 이것도 코드에 박힌 상수 하나다.
//
// 화면은 링크를 문자열이 아니라 id 로만 받는다. 목록에 없는 id 는 그리지 않는다(모델·도구 결과가 주소를 지어내도
// 카드에 닿지 못한다). audience 는 필수라 "어드민 주소가 고객에게 복사되는" 일이 타입에서 막힌다.
import {
  ADMIN_NAV,
  CRM_CHILD_NAV,
  CRM_CUSTOMERS_CHILD_NAV,
  type AdminRole,
} from "@/components/admin/admin-nav"
import { PALETTE_CHILD_COMMANDS } from "@/components/admin/admin-palette-children"
import { BROCHURE_URL } from "@/lib/marketing-links"
import { PUBLIC_STATIC_ROUTES } from "@/lib/public-routes"
import { SITE_URL } from "@/lib/seo"

export type LinkAudience = "internal" | "customer"

interface LinkBase {
  id: string
  label: string
  /** 내부: 어드민 경로(쿼리 포함 가능). 고객용: 공개 경로, 소개서만 절대 주소. */
  href: string
  audience: LinkAudience
  /** 이 화면의 쓰기 동작에 필요한 역할 — 화면을 여는 데는 필요 없고 카드에 알려 주기만 한다. */
  requires?: readonly AdminRole[]
  /** 링크 찾기 검색어(공백 구분, 한·영 병기). */
  keywords: string
}

export interface InternalLink extends LinkBase {
  audience: "internal"
}

export interface CustomerLink extends LinkBase {
  audience: "customer"
  /** 고객에게 그대로 붙여 넣는 절대 주소. */
  url: string
  /** SITE_URL 밖(소개서 노션 페이지)의 주소. 목록에서 하나뿐이다. */
  external?: true
}

export type LinkEntry = InternalLink | CustomerLink

/** 기본 사이트 주소 아래 공개 경로를 절대 주소로 — 고객용 주소를 만드는 유일한 길. */
export function toCustomerUrl(path: string): string {
  return new URL(path, SITE_URL).toString()
}

/** 경로를 id 에 쓰는 낱말로 — 쿼리는 낱말로 풀어 같은 화면의 다른 탭이 다른 id 를 갖게 한다. */
function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/^\/admin\/?/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned || "home"
}

// 필요 역할이 정해진 화면 — 정본은 각 화면의 API 가드이고 여기는 안내용 사본이다.
// 회원 관리: app/api/admin/users PATCH 가 SUPER_ADMIN 만 허용한다.
const REQUIRES_BY_HREF: Readonly<Record<string, readonly AdminRole[]>> = {
  "/admin/settings?tab=members": ["SUPER_ADMIN"],
}

function buildInternalLinks(): InternalLink[] {
  const seen = new Set<string>()
  const out: InternalLink[] = []
  const add = (href: string, label: string, keywords: string | undefined) => {
    if (!href || seen.has(href)) return
    seen.add(href)
    const requires = REQUIRES_BY_HREF[href]
    out.push({
      id: `admin:${slug(href)}`,
      label,
      href,
      audience: "internal",
      ...(requires ? { requires } : {}),
      keywords: `${label} ${keywords ?? ""}`.trim(),
    })
  }

  for (const item of ADMIN_NAV) add(item.href, item.label, item.keywords)
  for (const child of CRM_CHILD_NAV) add(child.href, `CRM ${child.label}`, child.keywords)
  for (const child of CRM_CUSTOMERS_CHILD_NAV) add(child.href, `CRM 고객 · ${child.label}`, child.keywords)
  for (const children of Object.values(PALETTE_CHILD_COMMANDS)) {
    for (const child of children) add(child.href, child.label, child.keywords)
  }
  return out
}

function buildCustomerLinks(): CustomerLink[] {
  const pages: CustomerLink[] = PUBLIC_STATIC_ROUTES.map((route) => ({
    id: `public:${slug(route.path)}`,
    label: route.label,
    href: route.path,
    audience: "customer",
    url: toCustomerUrl(route.path),
    keywords: `${route.label} ${route.keywords}`,
  }))
  const brochure: CustomerLink = {
    id: "public:brochure",
    label: "제품 소개서",
    href: BROCHURE_URL,
    audience: "customer",
    url: BROCHURE_URL,
    external: true,
    keywords: "제품 소개서 소개서 브로슈어 브로셔 카탈로그 자료 pdf brochure",
  }
  return [...pages, brochure]
}

export const ADMIN_AI_LINKS: readonly LinkEntry[] = [...buildInternalLinks(), ...buildCustomerLinks()]

const BY_ID: ReadonlyMap<string, LinkEntry> = new Map(ADMIN_AI_LINKS.map((entry) => [entry.id, entry]))
const INTERNAL_BY_HREF: ReadonlyMap<string, InternalLink> = new Map(
  ADMIN_AI_LINKS.flatMap((entry) => (entry.audience === "internal" ? [[entry.href, entry] as const] : []))
)

/** 목록에 있는 id 만 돌려준다. 없는 id·문자열이 아닌 값은 undefined — 화면은 그 줄을 그리지 않는다. */
export function getLinkById(id: unknown): LinkEntry | undefined {
  return typeof id === "string" ? BY_ID.get(id) : undefined
}

/** 어드민 주소(쿼리 포함 정확히 일치)가 목록에 있으면 그 줄. 카드가 받은 href 를 그리기 전의 관문이다. */
export function findInternalLinkByHref(href: unknown): InternalLink | undefined {
  return typeof href === "string" ? INTERNAL_BY_HREF.get(href) : undefined
}

export function isRegisteredInternalHref(href: unknown): boolean {
  return findInternalLinkByHref(href) !== undefined
}

/** id 로 어드민 주소를 꺼낸다. 내부용 줄이 아니면 undefined. */
export function internalHrefOf(id: string): string | undefined {
  const entry = BY_ID.get(id)
  return entry?.audience === "internal" ? entry.href : undefined
}

// 링크를 청하는 말 자체는 찾는 대상이 아니다("가격표 링크 알려 줘" 에서 가격표만 남긴다).
const FILLER = /^(링크|주소|url|바로가기|알려|알려줘|알려줄래|줘|주세요|좀|화면|페이지|어디|어디야|어디서|있어|있나|찾아|찾아줘|보내|보내줘)[?？.!]*$/i

export interface FindLinksOptions {
  audience?: LinkAudience
  limit?: number
}

/**
 * 낱말로 링크를 찾는다 — 모델 없이 도는 결정형 검색. 낱말마다 제목에 있으면 3점, 검색어에 있으면 1점이고
 * 모든 낱말이 어딘가에 있어야 결과에 든다. 점수가 같으면 목록 순서(내부 → 고객)를 따른다.
 */
export function findLinks(query: string, options: FindLinksOptions = {}): LinkEntry[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !FILLER.test(token))
  if (tokens.length === 0) return []

  const scored: Array<{ entry: LinkEntry; score: number; order: number }> = []
  ADMIN_AI_LINKS.forEach((entry, order) => {
    if (options.audience && entry.audience !== options.audience) return
    const label = entry.label.toLowerCase()
    const keywords = entry.keywords.toLowerCase()
    let score = 0
    for (const token of tokens) {
      if (label.includes(token)) score += 3
      else if (keywords.includes(token)) score += 1
      else return
    }
    scored.push({ entry, score, order })
  })
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, options.limit ?? 5).map((item) => item.entry)
}
