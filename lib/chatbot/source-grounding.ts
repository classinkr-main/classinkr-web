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
const GROUNDING_TEXT = Symbol("chatbot.source.groundingText")

/** 근거 본문 한 개의 최대 길이. 넘으면 문장 경계에서 자른다. */
export const MAX_GROUNDING_TEXT_LENGTH = 900

type Grounded = { [GROUNDING_TEXT]?: string }

function normalizeGroundingText(value: string) {
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
  const normalized = text ? trimToCompleteSentences(normalizeGroundingText(text)) : ""
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
const LAYOUT_REFERENCE_RE = /(?:아래|위|다음)\s*(?:사례|표|그림|순서|목록|내용|문서|화면\s*예시|예시)|이\s*문서(?:는|에서|의)|앞(?:에서|서)\s*(?:본|말한|설명한)/

/** 출처들의 근거 본문(없으면 요약)을 번호 붙은 문장 목록으로 만든다. 같은 문장은 한 번만 넣는다. */
export function buildEvidenceSentences(
  sources: ReadonlyArray<{ title: string; heading?: string; excerpt: string }>
): EvidenceSentence[] {
  const sentences: EvidenceSentence[] = []
  const seen = new Set<string>()

  sources.forEach((source, sourceIndex) => {
    const body = getGroundingText(source) ?? trimToCompleteSentences(source.excerpt)
    const label = source.heading ? `${source.title} / ${source.heading}` : source.title

    for (const text of splitIntoSentences(body)) {
      if (sentences.length >= MAX_EVIDENCE_SENTENCES) return
      if (text.length < MIN_EVIDENCE_SENTENCE_LENGTH || text.length > MAX_EVIDENCE_SENTENCE_LENGTH) continue
      if (LAYOUT_REFERENCE_RE.test(text)) continue
      const key = text.replace(/\s+/g, "")
      if (seen.has(key)) continue
      seen.add(key)
      sentences.push({ id: sentences.length + 1, sourceIndex, label, text })
    }
  })

  return sentences
}
