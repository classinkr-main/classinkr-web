/**
 * 어드민 문서 편집기의 마크다운 → content_json 변환 규칙.
 *
 * 공개 문서(app/docs)는 저장된 마크다운을 다시 파싱하지 않고 content_json.sections를 그대로 읽는다
 * (lib/docs-content.ts getSections). 따라서 이 모듈이 공개 화면 구조의 단일 진실 원본이다.
 * React 의존 없는 순수 함수만 둔다 — 편집기는 import만 한다.
 */

export interface StructuredDocMedia {
  type: "image" | "video"
  src: string
  alt: string
  caption?: string
  width?: number
  height?: number
}

export interface StructuredDocSection {
  heading: string
  body: string
  steps?: string[]
  media?: StructuredDocMedia[]
}

/** 불릿(- *)과 번호 목록(1. 1))을 모두 절차 스텝으로 본다 — 툴바 두 버튼이 같은 결과를 내야 한다. */
const STEP_LINE = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/

/**
 * 줄 전체가 이미지 하나인 경우만 section.media로 승격한다(문장 중간 이미지는 본문에 남긴다).
 * alt에는 시드 문서처럼 [로컬 녹화] 같은 대괄호가 들어갈 수 있어 greedy로 받는다.
 */
const STANDALONE_IMAGE_LINE = /^!\[(.*)\]\(\s*([^\s()]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)$/

/**
 * 영상은 마크다운에 이미지 문법이 없어 링크 한 줄로 들어온다(scripts/seed-docs.ts 직렬화 규칙).
 * 확장자가 영상일 때만 승격한다 — 그래야 일반 링크 한 줄이 미디어로 오인되지 않는다.
 */
const STANDALONE_LINK_LINE = /^\[(.*)\]\(\s*([^\s()]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)$/
const VIDEO_SOURCE = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i

/**
 * 마크다운 이미지 title("캡션 | width=640")에서 캡션과 폭을 분리한다.
 * 규칙 출처: lib/blog-markdown.ts 의 parseImageTitle (본문 마크다운 렌더러 정본).
 * 그 함수는 export되지 않아 여기서 동일 규칙을 복제한다 — 규칙이 갈리면 같은 이미지가
 * 본문 렌더러와 구조화 미디어에서 다르게 보인다.
 */
function parseImageTitle(rawTitle: string | undefined) {
  const title = rawTitle ?? ""
  const widthMatch = title.match(/(?:^|\s|\|)width=(\d{2,4})(?:px)?(?:\s|\||$)/i)
  const parsedWidth = widthMatch ? Number.parseInt(widthMatch[1], 10) : null
  const width =
    parsedWidth && Number.isFinite(parsedWidth)
      ? Math.min(1200, Math.max(120, Math.round(parsedWidth)))
      : null
  const caption = title
    .replace(/\s*\|?\s*width=\d{2,4}(?:px)?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  return { caption, width }
}

export function estimateReadMinutes(markdown: string) {
  const compact = markdown.replace(/[#*`>\-[\]().]/g, " ").replace(/\s+/g, " ").trim()
  if (!compact) return 1

  return Math.max(1, Math.ceil(compact.length / 900))
}

export function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * WYSIWYG 에디터(components/admin/RichMarkdownEditor.tsx escapeMarkdown)가 alt/title의
 * \\ " ] 를 이스케이프해 내보낸다. 구조화 미디어는 화면에 그대로 노출되므로 되돌려 저장한다.
 */
function unescapeMarkdownText(value: string) {
  return value.replace(/\\([\\"\]])/g, "$1")
}

function toMedia(
  type: StructuredDocMedia["type"],
  rawAlt: string,
  src: string,
  rawTitle: string | undefined
): StructuredDocMedia {
  const { caption, width } = parseImageTitle(unescapeMarkdownText(rawTitle ?? ""))

  return {
    type,
    src,
    alt: unescapeMarkdownText(rawAlt).trim(),
    ...(caption ? { caption } : {}),
    ...(width ? { width } : {}),
  }
}

export function buildSection(heading: string, lines: string[]): StructuredDocSection | null {
  const bodyLines: string[] = []
  const steps: string[] = []
  const media: StructuredDocMedia[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const stepMatch = trimmed.match(STEP_LINE)

    if (stepMatch?.[1]) {
      steps.push(stepMatch[1].trim())
      continue
    }

    const imageMatch = trimmed.match(STANDALONE_IMAGE_LINE)
    // alt가 greedy라 한 줄에 이미지가 둘이면 첫 이미지를 alt로 삼켜버린다 — 그때는 본문에 남긴다.
    if (imageMatch?.[2] && !imageMatch[1].includes("](")) {
      media.push(toMedia("image", imageMatch[1], imageMatch[2], imageMatch[3]))
      continue
    }

    const linkMatch = trimmed.match(STANDALONE_LINK_LINE)
    if (linkMatch?.[2] && !linkMatch[1].includes("](") && VIDEO_SOURCE.test(linkMatch[2])) {
      media.push(toMedia("video", linkMatch[1], linkMatch[2], linkMatch[3]))
      continue
    }

    if (trimmed.startsWith("# ")) continue
    bodyLines.push(line)
  }

  const body = normalizeMarkdown(bodyLines.join("\n")) || (steps.length ? "아래 항목을 순서대로 확인하세요." : "")
  if (!heading.trim() || (!body && steps.length === 0 && media.length === 0)) return null

  return {
    heading: heading.trim(),
    body,
    ...(steps.length ? { steps } : {}),
    ...(media.length ? { media } : {}),
  }
}

export function markdownToSections(markdown: string): StructuredDocSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const sections: StructuredDocSection[] = []
  const introLines: string[] = []
  let currentHeading = ""
  let currentLines: string[] = []

  const pushCurrent = () => {
    if (!currentHeading) return
    const section = buildSection(currentHeading, currentLines)
    if (section) sections.push(section)
  }

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/)
    if (headingMatch?.[1]) {
      pushCurrent()
      currentHeading = headingMatch[1].trim()
      currentLines = []
      continue
    }

    if (currentHeading) {
      currentLines.push(line)
      continue
    }

    introLines.push(line)
  }

  pushCurrent()

  if (sections.length > 0) return sections

  const intro = buildSection("개요", introLines)
  return intro ? [intro] : []
}

export const DROPPED_INTRO_WARNING =
  "첫 ## 앞의 문단은 공개 화면에 나오지 않습니다. 설명 필드로 옮기거나 ## 섹션 안으로 넣어 주세요."

/**
 * markdownToSections는 ## 섹션이 하나라도 있으면 첫 ## 앞 내용을 버린다.
 * 자동 승격은 기존 문서에 쓰레기 섹션을 만들기 때문에 동작은 그대로 두고, 유실될 산문만 찾아 경고한다.
 * 제목(# )과 대상/업데이트 메타 줄은 편집기 다른 필드에 이미 있으므로 유실로 보지 않는다.
 */
export function findDroppedIntroLines(markdown: string, description?: string): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const introLines: string[] = []
  let hasSectionHeading = false

  for (const line of lines) {
    if (/^##\s+.+$/.test(line)) {
      hasSectionHeading = true
      break
    }
    introLines.push(line)
  }

  if (!hasSectionHeading) return []

  const descriptionLine = description?.trim()

  return introLines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (trimmed.startsWith("# ")) return false
    if (trimmed.startsWith("대상:") || trimmed.startsWith("업데이트:")) return false
    // 설명 필드를 그대로 옮겨 적은 줄은 버려져도 잃는 게 없다. 시드 문서 60편이 전부 이
    // 형태라(설명 → 대상 → 업데이트 순의 머리말) 걸러내지 않으면 경고가 상시 켜져 신호가 죽는다.
    if (descriptionLine && trimmed === descriptionLine) return false
    return true
  })
}

export function hasDroppedIntroContent(markdown: string, description?: string) {
  return findDroppedIntroLines(markdown, description).length > 0
}

/**
 * 마크다운에는 이미지 원본 픽셀 크기를 담을 자리가 없다. height는 표기 규약 자체가 없고,
 * width= 는 lib/blog-markdown.ts 규약상 "표시 최대 폭"이지 원본 크기가 아니다.
 *
 * 그런데 공개 렌더러(app/docs/_utils.tsx DocsSectionMedia)는 width/height 두 값이 다 있을 때만
 * 세로 캡처를 max-h-[640px]로 가둔다. 값이 사라지면 4,700px짜리 스크린샷이 통으로 펼쳐지고
 * next/image 에 넘기는 종횡비도 어긋난다(레이아웃 시프트). 그래서 마크다운을 다시 파싱해
 * sections를 새로 만들 때, 같은 src의 이전 미디어에서 크기를 이어받는다.
 */
function readPreviousMediaSizes(previousContentJson?: Record<string, unknown>) {
  const sizes = new Map<string, { width?: number; height?: number }>()
  const sections = previousContentJson?.sections
  if (!Array.isArray(sections)) return sizes

  for (const section of sections) {
    if (!section || typeof section !== "object") continue
    const media = (section as { media?: unknown }).media
    if (!Array.isArray(media)) continue

    for (const item of media) {
      if (!item || typeof item !== "object") continue
      const { src, width, height } = item as { src?: unknown; width?: unknown; height?: unknown }
      if (typeof src !== "string" || !src || sizes.has(src)) continue

      const size = {
        ...(typeof width === "number" && Number.isFinite(width) && width > 0 ? { width } : {}),
        ...(typeof height === "number" && Number.isFinite(height) && height > 0 ? { height } : {}),
      }
      if (size.width !== undefined || size.height !== undefined) sizes.set(src, size)
    }
  }

  return sizes
}

function mergeMediaSize(
  item: StructuredDocMedia,
  previous: { width?: number; height?: number } | undefined
): StructuredDocMedia {
  if (!previous) return item

  // 편집자가 WYSIWYG에서 이미지를 리사이즈하면 마크다운 title에 width= 가 실려 온다.
  // 그 값이 우선이고, 세로/가로 판정이 어긋나지 않게 height를 같은 비율로 환산한다.
  if (item.width !== undefined) {
    if (previous.width === undefined || previous.height === undefined) return item
    const scaled = Math.round((previous.height / previous.width) * item.width)
    return Number.isFinite(scaled) && scaled > 0 ? { ...item, height: scaled } : item
  }

  return {
    ...item,
    ...(previous.width !== undefined ? { width: previous.width } : {}),
    ...(previous.height !== undefined ? { height: previous.height } : {}),
  }
}

/**
 * scripts/seed-docs.ts 는 doc.resources 를 content_markdown 끝에 "## 첨부 자료" 링크 목록으로도
 * 내보내면서, 같은 내용을 content_json.resources 에도 남긴다. 공개 문서 페이지
 * (app/docs/[category]/[slug]/page.tsx)는 resources 를 전용 블록으로 따로 그리므로,
 * 마크다운에서 파싱한 "첨부 자료" 섹션까지 살려두면 같은 목록이 두 번 나온다.
 * 게다가 steps 는 마크다운 렌더 없이 문자열로 그려져 링크 문법이 그대로 노출된다.
 */
export const RESOURCE_SECTION_HEADING = "첨부 자료"

/**
 * 마크다운에서 새로 만든 sections를 이전 content_json과 맞춰 정리한다.
 * 저장 경로와 편집기 미리보기가 같은 결과를 보도록 두 곳에서 함께 쓴다.
 */
export function reconcileSectionsWithPrevious(
  sections: StructuredDocSection[],
  previousContentJson?: Record<string, unknown>
): StructuredDocSection[] {
  const previousResources = previousContentJson?.resources
  const hasResourceBlock = Array.isArray(previousResources) && previousResources.length > 0
  const kept = hasResourceBlock
    ? sections.filter((section) => section.heading.trim() !== RESOURCE_SECTION_HEADING)
    : sections

  const sizes = readPreviousMediaSizes(previousContentJson)
  if (sizes.size === 0) return kept

  return kept.map((section) =>
    section.media?.length
      ? { ...section, media: section.media.map((item) => mergeMediaSize(item, sizes.get(item.src))) }
      : section
  )
}

export function buildContentJson(
  markdown: string,
  previousContentJson?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(previousContentJson ?? {}),
    source: "admin-editor",
    readMinutes: estimateReadMinutes(markdown),
    updatedAt: new Date().toISOString().slice(0, 10),
    sections: reconcileSectionsWithPrevious(markdownToSections(markdown), previousContentJson),
  }
}
