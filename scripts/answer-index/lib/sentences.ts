/**
 * 문서 본문 → 문장 목록과 표시(flags).
 *
 * 문장 나누기는 공개 챗봇 근거 선별과 같은 splitIntoSentences(lib/chatbot/source-grounding.ts)를 쓴다.
 * 그 전에 줄 단위로 먼저 나눈다: 문서 본문은 줄마다 다른 내용("경로: [..] > [..]", 목록 한 줄, 표 한 줄)이라
 * 공백으로 이어 붙이면 마침표 없는 줄이 다음 문장과 붙는다.
 */
import { splitIntoSentences } from "@/lib/chatbot/source-grounding"
import { sentenceHash } from "@/lib/chatbot/answer-index/hash"
import type { UnitSentence, UnitSentenceFlag } from "@/lib/chatbot/answer-index/types"

interface Segment {
  /** 문서 링크 표시([글](/docs/…))는 남겨 둔다. 문장으로 나눈 뒤 문장마다 링크 여부를 보고 지운다. */
  text: string
  table: boolean
}

const TABLE_SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/
const LINK_RE = /\[([^\]]+)]\((?:\/|https?:\/\/|www\.)[^)]*\)/g
const DOC_LINK_RE = /\[[^\]]+]\(\/docs\//

/** 문장의 링크 표시를 글자만 남기고 지운다. */
export function stripLinks(text: string) {
  return text.replace(LINK_RE, "$1")
}

/** 본문 한 덩어리를 줄 단위 조각으로 정리한다(이미지·굵게·목록 표시·인용 표시 제거). */
export function toSegments(raw: string): Segment[] {
  const out: Segment[] = []
  for (const line of raw.split(/\r?\n/)) {
    let text = line.trim()
    if (!text) continue
    if (TABLE_SEPARATOR_RE.test(text)) continue
    text = text.replace(/!\[[^\]]*]\([^)]*\)/g, "")
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1")
    text = text.replace(/^#+\s*/, "").replace(/^>\s?/, "").replace(/^[-*•]\s+/, "")
    let table = false
    if (/^\|.*\|$/.test(text)) {
      table = true
      text = text
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
        .join(" | ")
    }
    text = text.replace(/\s+/g, " ").trim()
    if (!text) continue
    out.push({ text, table })
  }
  return out
}

// 문서 안 다른 자리를 가리키는 말(source-grounding.ts 의 LAYOUT_REFERENCE_RE 와 같은 뜻) + 문서 자체 안내.
const META_RE =
  /(?:아래|위|다음)\s*(?:사례|표|그림|순서|목록|내용|문서|화면\s*예시|예시)|이\s*문서(?:는|에서|의)|앞(?:에서|서)\s*(?:본|말한|설명한)|(?:이|본)\s*(?:가이드|글|페이지)(?:는|에서는|에서|의)\s|(?:안내|설명|정리|소개)하는\s*(?:가이드|문서|글)입니다|순서대로\s*따라\s*하시면\s*됩니다|지도입니다/
const CAPTION_RE =
  /빨간\s*(?:박스|네모|테두리|화살표)|화살표\s*주석|(?:아래|위)\s*(?:화면|그림|사진|캡처|이미지)(?:처럼|과\s*같이|을\s*보면|에서\s*보듯|에\s*표시)|(?:스크린샷|캡처)(?:에\s|의\s|입니다|이다)|누를\s*곳을\s*한\s*장에/
const CONNECTIVE_RE =
  /^(?:그래서|그러면|그럼|그런데|하지만|다만|또한|또|그리고|이때|이\s*때|그다음|그\s*다음|그\s*후|이후|이렇게|그렇게|그래도|따라서|반면|즉|예를\s*들어|이\s*경우(?:에는)?|그럴\s*때|그러나|게다가|아울러|여기서|그때|이어서|그\s*뒤)(?=[\s,]|$)|^(?:위|앞|이)\s*(?:형식|방법|순서|설정|화면|단계|경로|과정|문구)/
const NAV_RE =
  /(?:문서|가이드|안내|도움말|글)(?:를|을|에서|도)?\s*(?:보세요|참고하세요|확인하세요|봐\s*주세요|참고해\s*주세요)|자세한\s*(?:내용|방법|순서|설명)은.{0,40}(?:보세요|참고|확인하세요)|(?:다음|이어서)\s*볼\s*(?:문서|글)/

// 문서 링크가 든 문장 가운데 '그 문서를 보라'는 말로 끝나는 것만 nav 다(링크가 든 사용법 문장은 답으로 쓸 수 있다).
const LINKED_NAV_TAIL_RE = /(?:보세요|봐\s*주세요|참고하세요|참고해\s*주세요|확인하세요|있습니다|나와\s*있습니다|이어집니다)[.!]?$/

export function flagSentence(text: string, context: { docLink: boolean; table: boolean }): UnitSentenceFlag[] {
  const flags: UnitSentenceFlag[] = []
  if (CAPTION_RE.test(text)) flags.push("caption")
  if (META_RE.test(text)) flags.push("meta")
  if (CONNECTIVE_RE.test(text)) flags.push("connective")
  if (NAV_RE.test(text) || (context.docLink && LINKED_NAV_TAIL_RE.test(text))) flags.push("nav")
  if (context.table) flags.push("table")
  return flags
}

/**
 * 본문 덩어리들(설명·본문·단계)을 번호 붙은 문장 목록으로 만든다.
 * 같은 단위 안에서 글자가 같은 문장(공백 무시)은 처음 것만 남긴다.
 */
export function buildUnitSentences(blocks: string[]): UnitSentence[] {
  const sentences: UnitSentence[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    if (!block) continue
    for (const segment of toSegments(block)) {
      const parts = segment.table ? [segment.text] : splitIntoSentences(segment.text)
      for (const part of parts) {
        const docLink = DOC_LINK_RE.test(part)
        const text = stripLinks(part).replace(/\s+/g, " ").trim()
        if (!text) continue
        const key = text.replace(/\s+/g, "")
        if (seen.has(key)) continue
        seen.add(key)
        sentences.push({ i: sentences.length, text, hash: sentenceHash(text), flags: flagSentence(text, { docLink, table: segment.table }) })
      }
    }
  }
  return sentences
}
