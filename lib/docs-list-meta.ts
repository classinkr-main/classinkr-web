import type { DocArticle, DocCategoryId } from "@/lib/docs"

/**
 * 가이드 목록(홈·주제·검색·관련 문서)에 쓰는 문서 유형·미리보기·묶음 계산.
 * 모두 DocArticle 필드에서만 계산한다 — 정적 문서와 운영 DB 문서가 같은 결과를 내야 한다.
 */

/** 목록에서 고를 수 있는 문서 유형. DB doc_type 6종을 사용자가 구분하는 4종으로 접는다. */
export type DocListKind = "howto" | "troubleshooting" | "faq" | "update"

export const DOC_LIST_KIND_LABELS: Record<DocListKind, string> = {
  howto: "사용법",
  troubleshooting: "문제 해결",
  faq: "FAQ",
  update: "업데이트",
}

/** 유형 필터 순서. 사용법이 가장 많고, 증상으로 찾는 문서가 그다음이다. */
export const DOC_LIST_KIND_ORDER: readonly DocListKind[] = ["howto", "troubleshooting", "faq", "update"]

export function isDocListKind(value: string): value is DocListKind {
  return (DOC_LIST_KIND_ORDER as readonly string[]).includes(value)
}

/**
 * 문서 유형을 고른다. docType 이 없으면 DB 시드(scripts/seed-docs.ts inferDocType)와 같은 단서로
 * 추정해, 정적 문서 모드와 운영 DB 모드의 라벨이 어긋나지 않게 한다.
 */
export function getDocListKind(doc: Pick<DocArticle, "docType" | "slug" | "tags" | "title">): DocListKind {
  switch (doc.docType) {
    case "troubleshooting":
      return "troubleshooting"
    case "faq":
      return "faq"
    case "release_note":
      return "update"
    case "guide":
    case "manual":
    case "reference":
      return "howto"
    default:
      break
  }

  if (doc.tags.includes("문제 해결")) return "troubleshooting"
  if (doc.slug.includes("update") || doc.tags.includes("업데이트")) return "update"
  if (/FAQ|자주 묻는 질문/i.test(doc.title)) return "faq"
  return "howto"
}

export interface DocListThumbnail {
  src: string
  width?: number
  height?: number
  /** 개념도(svg)면 true — 사진이 하나도 없을 때만 미리보기로 쓴다. */
  isDiagram: boolean
}

function isDiagramSrc(src: string) {
  return /\.svg(?:[?#].*)?$/i.test(src)
}

/**
 * 본문 첫 화면 사진을 목록 미리보기로 고른다. 실제 화면 사진을 먼저 쓰고, 없으면 개념도를 쓴다.
 * imageCount 는 개념도를 뺀 사진 수다("사진 N장").
 */
export function getDocListPreview(doc: Pick<DocArticle, "sections">): {
  thumbnail?: DocListThumbnail
  imageCount: number
} {
  const images = doc.sections.flatMap((section) => section.media ?? []).filter((media) => media.type === "image")
  const photos = images.filter((media) => !isDiagramSrc(media.src))
  const picked = photos[0] ?? images[0]

  return {
    thumbnail: picked
      ? {
          src: picked.src,
          width: picked.width,
          height: picked.height,
          isDiagram: isDiagramSrc(picked.src),
        }
      : undefined,
    imageCount: photos.length,
  }
}

/** 목록 행이 묶음·정렬에 쓰는 최소 정보. DocsArticleSummary 가 이 모양을 만족한다. */
export interface DocListItemLike {
  title: string
  href: string
  kind?: DocListKind
  updatedAtIso?: string
}

function getSlugFromHref(href: string) {
  return href.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? ""
}

/** 최근에 고친 순서로 고른다. 같은 날짜는 원래 순서를 지킨다. */
export function pickRecentlyUpdated<T extends DocListItemLike>(
  items: readonly T[],
  { limit = 6, excludeHrefs, excludeKinds = [] }: {
    limit?: number
    excludeHrefs?: ReadonlySet<string>
    excludeKinds?: readonly DocListKind[]
  } = {}
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        Boolean(item.updatedAtIso) &&
        !excludeHrefs?.has(item.href) &&
        !(item.kind && excludeKinds.includes(item.kind))
    )
    .sort((a, b) => (b.item.updatedAtIso ?? "").localeCompare(a.item.updatedAtIso ?? "") || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => item)
}

interface DocListGroupRule {
  id: string
  label: string
  /** 이 유형의 문서를 모두 이 묶음에 넣는다(slug·접두어 규칙보다 먼저 본다). */
  kind?: DocListKind
  slugs?: readonly string[]
  /** "코스 - 생성" 처럼 제목 앞에 붙은 접두어. */
  prefixes?: readonly string[]
}

const TROUBLESHOOTING_GROUP: DocListGroupRule = {
  id: "troubleshooting",
  label: "문제가 생겼을 때",
  kind: "troubleshooting",
}

// 문서가 11~16개인 주제만 소제목으로 나눈다. 규칙에 없는 새 문서는 마지막 "그 밖의 가이드"로 간다.
const CATEGORY_GROUP_RULES: Partial<Record<DocCategoryId, readonly DocListGroupRule[]>> = {
  start: [
    {
      id: "install",
      label: "설치와 가입",
      slugs: ["pc-install", "mobile-install", "signup", "password-change-pc", "password-change-mobile"],
    },
    TROUBLESHOOTING_GROUP,
    {
      id: "adoption",
      label: "도입을 검토할 때",
      slugs: [
        "academy-system-os-positioning",
        "why-classin-needs",
        "customer-stories",
        "adoption-journey-90days",
        "pre-adoption-faq-22-questions",
        "company-overview",
      ],
    },
  ],
  admin: [
    {
      id: "institution",
      label: "기관 설정과 계정",
      slugs: ["institution-settings", "account-verification", "billing-upgrade", "admin-operation-standardization"],
    },
    {
      id: "people-course",
      label: "교사·학생과 코스",
      slugs: ["teacher-onboarding", "student-onboarding", "course-creation", "course-management"],
    },
    {
      id: "monitoring",
      label: "수업 확인과 통계",
      slugs: ["web-live-playback", "class-monitoring", "statistics-data"],
    },
    {
      id: "storage",
      label: "자료와 저장 공간",
      slugs: ["storage-management", "shared-drive"],
    },
    TROUBLESHOOTING_GROUP,
  ],
  teacher: [
    { id: "course", label: "코스", prefixes: ["코스"] },
    {
      id: "lesson",
      label: "수업과 교실",
      prefixes: ["수업", "교실"],
      slugs: ["lesson-option-concepts"],
    },
    {
      id: "materials",
      label: "자료와 프로필",
      prefixes: ["드라이브"],
      slugs: ["teacher-profile"],
    },
    TROUBLESHOOTING_GROUP,
    { id: "update", label: "업데이트", kind: "update" },
  ],
  student: [
    { id: "course", label: "코스", prefixes: ["코스"] },
    { id: "lesson", label: "수업", prefixes: ["수업"] },
    {
      id: "tools",
      label: "소통과 도구",
      slugs: ["student-profile", "chat", "todo-calendar", "drive", "ai-features"],
    },
    TROUBLESHOOTING_GROUP,
  ],
  hardware: [
    {
      id: "product",
      label: "제품과 사양",
      slugs: ["board-overview", "board-lineup-specs", "hardware-spec-installation-faq"],
    },
    {
      id: "usage",
      label: "장비 사용법",
      slugs: ["board-basic-operation", "board-writing-touch", "board-ai-camera-mic", "mic-dt2-pro", "cam-t1-s1"],
    },
    {
      id: "install",
      label: "설치와 안전",
      slugs: ["board-install-readiness", "board-s-series-safe-use"],
    },
    TROUBLESHOOTING_GROUP,
  ],
}

function getTitlePrefix(title: string) {
  return title.match(/^(.+?)\s+-\s+/)?.[1]?.trim()
}

export interface DocListGroup<T> {
  id: string
  label: string
  /** 유형으로 모은 묶음이면 그 유형 — 행마다 같은 유형 라벨을 되풀이하지 않게 한다. */
  kind?: DocListKind
  items: T[]
}

/**
 * 주제 페이지 목록을 소제목 묶음으로 나눈다. 규칙이 없는 주제이거나 묶음이 하나뿐이면
 * 묶음 하나(label 빈 문자열)로 돌려줘 화면은 소제목 없이 그린다.
 */
export function groupCategoryItems<T extends DocListItemLike>(
  categoryId: DocCategoryId,
  items: readonly T[]
): DocListGroup<T>[] {
  const rules = CATEGORY_GROUP_RULES[categoryId]
  if (!rules || items.length === 0) return [{ id: "all", label: "", items: [...items] }]

  const buckets = new Map<string, T[]>()
  const rest: T[] = []

  for (const item of items) {
    const slug = getSlugFromHref(item.href)
    const prefix = getTitlePrefix(item.title)
    const kindRule = rules.find((rule) => rule.kind && rule.kind === item.kind)
    const rule =
      kindRule ??
      rules.find((rule) => !rule.kind && rule.slugs?.includes(slug)) ??
      rules.find((rule) => !rule.kind && prefix && rule.prefixes?.includes(prefix))

    if (!rule) {
      rest.push(item)
      continue
    }

    const bucket = buckets.get(rule.id) ?? []
    bucket.push(item)
    buckets.set(rule.id, bucket)
  }

  const groups: DocListGroup<T>[] = rules
    .map((rule) => ({
      id: rule.id,
      label: rule.label,
      kind: rule.kind,
      items: buckets.get(rule.id) ?? [],
    }))
    .filter((group) => group.items.length > 0)

  if (rest.length > 0) groups.push({ id: "rest", label: "그 밖의 가이드", items: rest })

  if (groups.length <= 1) return [{ id: "all", label: "", items: [...items] }]
  return groups
}
