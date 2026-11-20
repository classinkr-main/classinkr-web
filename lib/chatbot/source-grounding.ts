/**
 * 모델 근거용 본문을 검색 출처에 붙여 나르는 도우미.
 *
 * 출처의 excerpt 는 출처 카드와 결정형 초안에 쓰는 220자 요약이다. 최종 답변 모델에도 이 요약만 넘겼더니
 * (2026-11-13 실측) 모델이 받은 조각 110개 중 83개가 문장 중간에서 끊겨 있었고, 모델이 끊긴 뒷부분과 빠진 단계를
 * 지어냈다. 그래서 문서 본문을 따로 실어 모델에게는 문장이 온전한 근거를 준다.
 *
 * 본문은 심볼 키에 둔다. JSON 직렬화에서 빠지므로 API 응답·스트림 메타·DB 저장에는 실리지 않고,
 * 객체 전개({ ...source })로 복사할 때는 함께 따라간다. 출처를 필드별로 새로 조립하는 코드를 넣으면 본문이
 * 떨어지니, 그때는 attachGroundingText 로 다시 붙인다.
 */
import { flagSentence } from "@/lib/chatbot/answer-index/sentences"

const GROUNDING_TEXT = Symbol("chatbot.source.groundingText")

/** 근거 본문 한 개의 최대 길이. 넘으면 문장 경계에서 자른다. */
export const MAX_GROUNDING_TEXT_LENGTH = 900

type Grounded = { [GROUNDING_TEXT]?: string }

// ── 운영 DB 청크 모양 ────────────────────────────────────────────────────────────────────────────────
// 운영(Supabase) 청크 본문은 마크다운 줄 모양이다(lib/admin-docs.ts):
//   절 청크(sectionToChunkContent): "## 절 제목\n\n본문\n\n- 단계\n- 단계"
//   요약 청크(buildDocsSummaryChunkContent): "문서 제목\n\n설명\n\n챗봇 요약\n\n키워드: …\n\n증상: …\n\n대상: …"
// 줄을 공백으로 그냥 이으면 제목이 첫 문장에 붙고("먼저 확인할 것 녹화 문제는…") 마침표 없는 단계가 한 문장으로
// 뭉친다("- 경로: … - 모바일은…"). 근거 선별(select)은 고른 문장을 그대로 내보내므로 이 모양이 그대로 답이 됐다(2026-11-20 조사 G5).
// 정적 문서 출처(service.ts buildDocSectionSource)는 본문과 단계를 공백으로 이어 넘기고 제목 줄이 없어 이 모양이 아니다.
// 정적 쪽 결과는 바꾸지 않는다(측정이 보는 모양).
const HEADING_LINE_RE = /^#{1,6}\s/
const SUMMARY_TAG_LINE_RE = /^(?:키워드|증상|대상)\s*:/
const TABLE_LINE_RE = /^\|.*\|$/
const MEDIA_ONLY_LINE_RE = /^!?\[[^\]]*]\([^)]*\)$/
const LIST_ITEM_RE = /^(?:[-*•]|\d+[.)])\s+/
const LINE_TERMINAL_RE = /[.!?。]["'”’)\]]*$/

/** 운영 DB 청크 모양인지: 첫 줄이 마크다운 제목(절 청크)이거나 출처의 문서 제목(요약 청크)이다. */
function isMarkdownChunkShape(lines: string[], title?: string) {
  if (lines.length < 2) return false
  return HEADING_LINE_RE.test(lines[0]) || Boolean(title && lines[0] === title.trim())
}

/** 줄 안의 표시를 정리한다(이미지·굵게 표시 제거, 공백 하나로). */
function normalizeInline(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    // 굵게 표시는 뗀다. 고른 문장이 그대로 공개 답이 되는데 답에는 굵게 표시를 쓰지 않는다.
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * DB 청크 모양을 줄 단위로 정리한다. 제목 줄·요약 첫 줄(문서 제목)·표 줄·요약 꼬리표 줄·그림만 있는 줄은 뺀다.
 * 목록 줄('- ', '1. ')은 표시를 떼고 문장 경계로 본다(끝에 마침표가 없으면 붙인다). 줄 경계는 줄바꿈으로 남겨
 * buildEvidenceSentences 가 줄마다 문장을 나눈다(마침표 없는 줄이 다음 줄과 붙지 않게).
 */
function normalizeMarkdownChunkLines(lines: string[], title?: string) {
  const out: string[] = []
  lines.forEach((raw, index) => {
    if (HEADING_LINE_RE.test(raw)) return
    if (index === 0 && title && raw === title.trim()) return
    if (TABLE_LINE_RE.test(raw) || SUMMARY_TAG_LINE_RE.test(raw) || MEDIA_ONLY_LINE_RE.test(raw)) return
    // 인용 줄(> …)은 표시만 뗀다. 인용 안의 번호("> 1) 설치: …")는 복사해 보낼 문구의 일부라 목록 표시로 보지 않는다.
    const quoted = /^>/.test(raw)
    let line = quoted ? raw.replace(/^>\s?/, "") : raw
    const listItem = quoted ? null : LIST_ITEM_RE.exec(line)
    if (listItem) line = line.slice(listItem[0].length)
    line = normalizeInline(line)
    if (!line) return
    if (listItem && !LINE_TERMINAL_RE.test(line)) line = `${line}.`
    out.push(line)
  })
  return out.join("\n")
}

function normalizeGroundingText(value: string, title?: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (isMarkdownChunkShape(lines, title)) return normalizeMarkdownChunkLines(lines, title)

  return (
    value
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/^#+\s*/gm, "")
      // 굵게 표시는 뗀다. 고른 문장이 그대로 공개 답이 되는데 답에는 굵게 표시를 쓰지 않는다.
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\s+/g, " ")
      // 인용 표시(>)는 뗀다. 메뉴 경로의 " > "([기관 관리] > [학생])는 문장 첫머리가 아니라서 남는다.
      .replace(/(?:^|(?<=[.!?]["'”’)]?\s))>\s*/g, "")
      .trim()
  )
}

/**
 * 길이를 넘거나 줄임표로 끝나면 마지막 온전한 문장까지만 남긴다.
 * 줄임표는 붙이지 않는다. 끊긴 꼬리가 보이면 모델이 그 뒤를 이어 쓴다.
 */
export function trimToCompleteSentences(value: string, maxLength = MAX_GROUNDING_TEXT_LENGTH) {
  const trimmed = value.trim()
  const hadEllipsis = /(?:\.\.\.|…)$/.test(trimmed)
  const body = hadEllipsis ? trimmed.replace(/\s*(?:\.\.\.|…)$/, "") : trimmed
  if (!hadEllipsis && body.length <= maxLength) return body

  const clipped = body.slice(0, maxLength)
  // 문장 끝: 마침표·물음표·느낌표 뒤가 공백이거나 끝인 자리. "6.0.7", "1. " 같은 숫자 뒤 마침표는 뺀다.
  const sentenceEnd = /(?<!\d)[.!?。](?=\s|$)/g
  let end = -1
  for (let match = sentenceEnd.exec(clipped); match; match = sentenceEnd.exec(clipped)) {
    end = match.index + 1
  }
  return end > 0 ? clipped.slice(0, end).trim() : clipped.trim()
}

/** 출처에 모델 근거용 본문을 붙인다. 본문이 비면 아무것도 하지 않는다. */
export function attachGroundingText<T extends object>(source: T, text: string | null | undefined): T {
  const title = (source as { title?: unknown }).title
  const normalized = text
    ? trimToCompleteSentences(normalizeGroundingText(text, typeof title === "string" ? title : undefined))
    : ""
  if (normalized) (source as T & Grounded)[GROUNDING_TEXT] = normalized
  return source
}

/** 출처에 붙은 근거 본문. 없으면 null. */
export function getGroundingText(source: object): string | null {
  return (source as Grounded)[GROUNDING_TEXT] ?? null
}

/** 근거 선별에 쓰는 문장 하나. 모델은 문장을 새로 쓰지 않고 이 번호만 고른다. */
export interface EvidenceSentence {
  /** 1부터 시작하는 번호. */
  id: number
  /** 몇 번째 출처에서 온 문장인지(0부터). */
  sourceIndex: number
  /** "문서 제목 / 섹션 제목" */
  label: string
  text: string
  /**
   * 앞 문장에 기대는 문장("그래도 안 되면…", "이때…")이면 true. 혼자서는 뜻이 통하지 않아, 같은 출처의 바로 앞 문장이
   * 함께 골렸을 때만 답에 남긴다(keepAnchoredConnectives). 표시는 답 색인 문장 표시(flagSentence)의 connective 를 그대로 쓴다.
   */
  connective?: true
}

const MAX_EVIDENCE_SENTENCES = 48
const MIN_EVIDENCE_SENTENCE_LENGTH = 6
// 이보다 긴 덩어리(표, 끊기지 않은 목록)는 한 문장으로 답에 넣기 어려워 후보에서 뺀다.
const MAX_EVIDENCE_SENTENCE_LENGTH = 360

const QUOTE_SPACE = "\u0001"

/**
 * 마침표·물음표·느낌표(뒤에 닫는 따옴표·괄호가 붙어도 됨) 뒤 공백에서 문장을 나눈다. 숫자 뒤 마침표는 나누지 않는다.
 * 인용문 뒤에 붙는 출처 괄호("…습니다.” (국어 학원 원장))는 인용문과 한 덩어리로 두고, 그다음 인용문 앞에서 나눈다.
 */
export function splitIntoSentences(text: string) {
  // 여러 문장으로 된 인용문(“결제 완료했습니다. 잘 쓰고 있어요.”)이 안에서 쪼개지지 않게, 인용문 속 공백을 잠시 가린다.
  const guarded = text.replace(/“[^”]*”/g, (quote) => quote.replace(/\s+/g, QUOTE_SPACE))
  return guarded
    .split(/(?<=(?<!\d)[.!?]["'”’)]?)\s+(?!\()|(?<=\))\s+(?=["'“‘])/)
    .map((sentence) => sentence.replaceAll(QUOTE_SPACE, " ").trim())
    .filter(Boolean)
}

// 문서 안의 다른 자리를 가리키는 문장("아래 사례 가운데…", "위 표에서…")은 따로 떼면 뜻이 통하지 않아 후보에서 뺀다.
// 답 색인 문장 표시(flagSentence)의 meta 가 이 뜻을 포함하지만, 그쪽 규칙이 바뀌어도 이 거르기는 남도록 따로 둔다.
const LAYOUT_REFERENCE_RE = /(?:아래|위|다음)\s*(?:사례|표|그림|순서|목록|내용|문서|화면\s*예시|예시)|이\s*문서(?:는|에서|의)|앞(?:에서|서)\s*(?:본|말한|설명한)/
// 문서가 뒤에 올 내용을 소개하는 안내 문장("아래를 차례로 봅니다", "다음을 하나씩 확인해 봅니다"). 답으로는 뜻이 없다.
const SECTION_GUIDE_RE = /(?:^|\s)(?:아래|다음)(?:를|을)\s(?:\S+\s){0,4}(?:살펴|확인해\s*)?봅니다[.!]?$/
// 문서 링크 표시가 든 문장(flagSentence 의 docLink 판정과 같은 뜻).
const DOC_LINK_RE = /\[[^\]]+]\(\/docs\//

/** 근거 본문을 문장으로 나눈다. DB 청크 모양은 줄마다 먼저 나눈다(정적 본문은 한 줄이라 그대로다). */
function splitGroundingSentences(body: string) {
  return body.split("\n").flatMap((line) => splitIntoSentences(line))
}

/**
 * 출처들의 근거 본문(없으면 요약)을 번호 붙은 문장 목록으로 만든다. 같은 문장은 한 번만 넣는다.
 * 그림 설명(caption)·문서 자체 안내(meta)·다른 문서로 보내는 말(nav)·뒤 내용 소개("아래를 … 봅니다")는 답이 되지 않아 뺀다.
 * 앞 문장에 기대는 문장(connective)은 후보에 두되 표시해 둔다(2026-11-20 조사 G15).
 */
export function buildEvidenceSentences(
  sources: ReadonlyArray<{ title: string; heading?: string; excerpt: string }>
): EvidenceSentence[] {
  const sentences: EvidenceSentence[] = []
  const seen = new Set<string>()

  sources.forEach((source, sourceIndex) => {
    const body = getGroundingText(source) ?? trimToCompleteSentences(source.excerpt)
    const label = source.heading ? `${source.title} / ${source.heading}` : source.title

    for (const text of splitGroundingSentences(body)) {
      if (sentences.length >= MAX_EVIDENCE_SENTENCES) return
      if (text.length < MIN_EVIDENCE_SENTENCE_LENGTH || text.length > MAX_EVIDENCE_SENTENCE_LENGTH) continue
      if (LAYOUT_REFERENCE_RE.test(text) || SECTION_GUIDE_RE.test(text)) continue
      // table 은 줄 모양을 알 때만 붙는 표시라 여기서는 보지 않는다(표 줄은 normalizeGroundingText 가 이미 뺐다).
      const flags = flagSentence(text, { docLink: DOC_LINK_RE.test(text), table: false })
      if (flags.includes("caption") || flags.includes("meta") || flags.includes("nav")) continue
      const key = text.replace(/\s+/g, "")
      if (seen.has(key)) continue
      seen.add(key)
      sentences.push({
        id: sentences.length + 1,
        sourceIndex,
        label,
        text,
        ...(flags.includes("connective") ? { connective: true as const } : {}),
      })
    }
  })

  return sentences
}

/**
 * 고른 문장에서, 앞 문장에 기대는 문장(connective)을 바로 앞 문장(같은 출처, 번호가 하나 앞)이 함께 골렸을 때만 남긴다.
 * 앞 문장 없이 "그래도 안 되면 앱을 다시 설치합니다."만 나가면 무엇이 안 되는 경우인지 알 수 없다.
 * 남는 문장이 없을 수 있다(호출부는 답 문장을 못 찾은 것으로 다룬다).
 */
export function keepAnchoredConnectives<T extends Pick<EvidenceSentence, "id" | "sourceIndex" | "connective">>(
  picked: ReadonlyArray<T>
): T[] {
  // 번호 순서로 보며, 앞 문장이 남은 경우에만 남긴다(앞 문장도 connective 라서 빠졌으면 이 문장도 뺀다).
  const kept = new Set<string>()
  for (const sentence of [...picked].sort((left, right) => left.id - right.id)) {
    if (sentence.connective && !kept.has(`${sentence.sourceIndex}:${sentence.id - 1}`)) continue
    kept.add(`${sentence.sourceIndex}:${sentence.id}`)
  }
  return picked.filter((sentence) => kept.has(`${sentence.sourceIndex}:${sentence.id}`))
}
