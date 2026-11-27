/**
 * 채널톡 Documents → 문서센터 동기화의 공개 경계(순수 함수). I/O 없음 — scripts/sync-channel-documents.ts 가 부른다.
 *
 * 경계:
 *  - 공개 챗봇 검색(lib/chatbot/service.ts)은 visibility public·unlisted + noindex=false 를 읽는다. unlisted 도 공개와 같다.
 *  - 채널에서 published 가 아닌 글(초안·비공개)은 visibility internal + noindex true 로만 넣는다(내부 코파일럿만 읽는다).
 *  - 기본 선택은 published 만. 초안까지 넣으려면 --include-drafts 를 명시한다(그때도 internal).
 *  - 본문의 내부 블록("게시 전 확인(내부용)" 같은 머리)은 published 글이라도 빼고 경고한다.
 *    머리가 제목(#)이면 그 절(같거나 높은 단계의 다음 제목 전까지), 인용·콜아웃이면 그 인용 묶음,
 *    그 밖(굵은 머리 줄·목록·문단)이면 범위를 알 수 없어 그 줄부터 본문 끝까지 뺀다(덜 빼서 새는 쪽을 막는다).
 */

export type DocsVisibility = "public" | "unlisted" | "internal"

export const CHANNEL_PUBLISHED_STATE = "published"
export const INCLUDE_DRAFTS_FLAG = "--include-drafts"
export const PUBLISHED_ONLY_FLAG = "--published-only"
export const PUBLIC_FLAG = "--public"

export interface SyncSelectionOptions {
  /** 채널 초안·비공개 글까지 넣는다(internal 로만). 기본 false. */
  includeDrafts: boolean
  /** 채널 published 글을 공개 문서(public)로 올린다. 기본 false(unlisted). */
  publicRequested: boolean
}

/** 명령 인자 → 선택 옵션. --published-only 는 기본값이라 받아만 둔다(--include-drafts 와 같이 쓰면 오류). */
export function parseSyncSelectionArgs(args: readonly string[]): SyncSelectionOptions {
  const includeDrafts = args.includes(INCLUDE_DRAFTS_FLAG)
  if (includeDrafts && args.includes(PUBLISHED_ONLY_FLAG)) {
    throw new Error(`${INCLUDE_DRAFTS_FLAG} 와 ${PUBLISHED_ONLY_FLAG} 는 같이 쓸 수 없습니다.`)
  }
  return { includeDrafts, publicRequested: args.includes(PUBLIC_FLAG) }
}

export function isPublishedState(state: string | null | undefined): boolean {
  return (state ?? "").trim().toLowerCase() === CHANNEL_PUBLISHED_STATE
}

export function channelDocumentSlug(articleId: string): string {
  return `channel-talk-document-${articleId}`
}

/** 목록에서 넣을 글을 고른다. 기본은 published 만 — 나머지는 notSelected 로 돌려준다(기존 행 보호에 쓴다). */
export function selectArticlesForSync<T extends { id?: string; state?: string }>(
  articles: readonly T[],
  options: Pick<SyncSelectionOptions, "includeDrafts">
): { selected: T[]; notSelected: T[] } {
  if (options.includeDrafts) return { selected: [...articles], notSelected: [] }
  const selected: T[] = []
  const notSelected: T[] = []
  for (const article of articles) (isPublishedState(article.state) ? selected : notSelected).push(article)
  return { selected, notSelected }
}

/**
 * 문서 행의 공개 범위. published 가 아니거나 내부 전용 표시(internalOnly)가 있으면 internal + noindex.
 * published 는 --public 일 때만 public, 아니면 unlisted.
 */
export function resolveDocVisibility(input: {
  channelState: string | null | undefined
  publicRequested: boolean
  internalOnly?: boolean
}): { visibility: DocsVisibility; noindex: boolean } {
  if (input.internalOnly || !isPublishedState(input.channelState)) return { visibility: "internal", noindex: true }
  return { visibility: input.publicRequested ? "public" : "unlisted", noindex: false }
}

// 내부 표시 낱말 — "게시 전 확인", "내부용", "내부 전용", "내부 확인용", "사내 전용", "internal only".
// "내부 용량"·"내부 메모 기능"처럼 제품 설명에 나올 수 있는 말은 넣지 않는다(빼는 범위가 본문 끝까지일 수 있어서다).
const INTERNAL_TERM_SOURCE = String.raw`(?:게시\s*전\s*(?:확인|점검|체크)|내부용(?![량도])|내부\s*전용|내부\s*확인용|사내\s*전용|사내용(?![량도])|internal\s*only)`
const INTERNAL_TERM_RE = new RegExp(INTERNAL_TERM_SOURCE, "iu")
const LEADING_INTERNAL_TERM_RE = new RegExp(`^${INTERNAL_TERM_SOURCE}`, "iu")
const BRACKETED_INTERNAL_TERM_RE = new RegExp(String.raw`[\[(【〔]\s*${INTERNAL_TERM_SOURCE}\s*[\])】〕]`, "iu")
const HEADING_RE = /^\s{0,3}(#{1,6})\s+\S/
const QUOTE_RE = /^\s{0,3}>/

/** 줄 앞의 꾸밈(제목 #·인용 >·목록 기호·번호·강조·이모지 이름·기호)을 걷어 낸 글자. */
function labelText(line: string): string {
  return line
    .replace(/^\s*(?:>\s*)*/u, "")
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/u, "")
    .replace(/^(?::[a-z0-9_+-]+:\s*)+/iu, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
}

/** 이 줄이 내부 블록의 머리인가 — 줄 머리가 내부 표시 낱말이거나, 줄 어디든 괄호로 감싼 내부 표시가 있다. */
export function isInternalLabelLine(line: string): boolean {
  if (!line.trim()) return false
  return LEADING_INTERNAL_TERM_RE.test(labelText(line)) || BRACKETED_INTERNAL_TERM_RE.test(line)
}

/** 글 어디든 내부 표시 낱말이 있는가(제목·요약 검사용). */
export function hasInternalTerm(text: string | null | undefined): boolean {
  return Boolean(text && INTERNAL_TERM_RE.test(text))
}

function headingLevel(line: string): number {
  const match = line.match(HEADING_RE)
  return match ? match[1].length : 0
}

export interface InternalBlockScan {
  markdown: string
  /** 뺀 내부 블록 수. */
  removedBlocks: number
  /** 뺀 줄 수. */
  removedLines: number
  /** 머리 꼴이 아니라 빼지 않았지만 내부 표시 낱말이 남은 줄 수(경고만). */
  residualMentions: number
}

/** 마크다운 본문에서 내부 블록을 뺀다. 규칙은 파일 머리 주석. */
export function stripInternalBlocks(markdown: string): InternalBlockScan {
  const lines = markdown.split("\n")
  const out: string[] = []
  let removedBlocks = 0
  let removedLines = 0
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (QUOTE_RE.test(line)) {
      // 인용·콜아웃 묶음 한 덩어리로 본다.
      let end = i
      while (end < lines.length && QUOTE_RE.test(lines[end])) end += 1
      const run = lines.slice(i, end)
      const labelIndex = run.findIndex(isInternalLabelLine)
      if (labelIndex === -1) {
        out.push(...run)
        i = end
        continue
      }
      removedBlocks += 1
      const rest = run.filter((entry, index) => index !== labelIndex && labelText(entry).trim())
      if (rest.length > 0) {
        removedLines += run.length
        i = end
        continue
      }
      // 머리만 든 콜아웃 — 내용이 뒤따르는 꼴이라 범위를 알 수 없다. 본문 끝까지 뺀다.
      removedLines += lines.length - i
      i = lines.length
      continue
    }

    if (!isInternalLabelLine(line)) {
      out.push(line)
      i += 1
      continue
    }

    removedBlocks += 1
    const level = headingLevel(line)
    if (level > 0) {
      let end = i + 1
      while (end < lines.length) {
        const next = headingLevel(lines[end])
        if (next > 0 && next <= level) break
        end += 1
      }
      removedLines += end - i
      i = end
      continue
    }

    removedLines += lines.length - i
    i = lines.length
  }

  const residualMentions = out.filter((entry) => INTERNAL_TERM_RE.test(entry)).length
  return {
    markdown: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    removedBlocks,
    removedLines,
    residualMentions,
  }
}

/**
 * 전수 크롤 정리(reconcile) — 이번 세트에 없는 자동 동기화 행을 archived 로 내린다.
 * 기본(published 만) 실행에서 고르지 않은 초안은 채널에 아직 있으므로 기존 행을 건드리지 않는다(protectedSlugs).
 */
export function planStaleArchive(input: {
  managed: ReadonlyArray<{ id: string; slug: string }>
  currentSlugs: ReadonlySet<string>
  protectedSlugs: ReadonlySet<string>
}): { archiveIds: string[]; keptUnselected: number } {
  const archiveIds: string[] = []
  let keptUnselected = 0
  for (const row of input.managed) {
    if (input.currentSlugs.has(row.slug)) continue
    if (input.protectedSlugs.has(row.slug)) {
      keptUnselected += 1
      continue
    }
    archiveIds.push(row.id)
  }
  return { archiveIds, keptUnselected }
}
