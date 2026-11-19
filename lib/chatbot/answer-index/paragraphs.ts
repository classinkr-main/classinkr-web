/**
 * 문서 문장을 답 문단으로 묶는 규칙. 근거 선별 답(service.ts formatSelectedEvidenceAnswer)과 답 색인 doc 카드 답(respond.ts)이
 * 같은 규칙을 쓴다: 고른 순서대로 잇되, 같은 출처에서 바로 이어지는 문장(번호가 1 큰 문장)은 한 문단으로 묶고
 * 출처가 바뀌거나 번호가 건너뛰면 새 문단을 연다.
 */

export interface ParagraphSentence {
  /** 출처 묶음(같은 값이면 같은 출처). */
  group: string | number
  /** 출처 안 문장 번호. */
  id: number
  text: string
}

export function groupSentenceParagraphs(sentences: readonly ParagraphSentence[]): string[] {
  const paragraphs: string[] = []
  let current: ParagraphSentence[] = []
  for (const sentence of sentences) {
    const previous = current.at(-1)
    if (previous && (previous.group !== sentence.group || sentence.id !== previous.id + 1)) {
      paragraphs.push(current.map((item) => item.text).join(" "))
      current = []
    }
    current.push(sentence)
  }
  if (current.length > 0) paragraphs.push(current.map((item) => item.text).join(" "))
  return paragraphs
}
