/**
 * 공유 카드(lib/og/template.tsx) 글줄 맞춤 — Satori 는 가운데 정렬 줄의 말줄임을 줄 가운데를 맞춘 뒤 덧붙여
 * 축이 오른쪽으로 밀린다. 그래서 줄바꿈·말줄임을 여기서 미리 정하고 각 줄을 따로 가운데 놓는다.
 *
 * 폭은 Pretendard Bold 전진폭(1/1000em) 표로 어림한다. 한글 음절·ASCII 는 실측값, 그 밖의 글자는
 * 넉넉하게(0.7–1em) 잡는다. 어림이 빗나가도 템플릿의 줄 상자가 양옆을 같이 잘라 축과 여백은 지켜진다.
 */

const HANGUL = 864 // 한글 음절은 전부 1770/2048
const SPACE = 230
const ELLIPSIS_WIDTH = 847
export const ELLIPSIS = "…"
// U+0021 ~ U+007E
const ASCII =
  "307,376,624,630,960,648,197,390,390,539,653,287,449,282,371,660,469,610,639,657,627,643,575,644,643,282,282,653,653,653,538,874,718,637,724,701,589,562,732,720,266,547,663,546,883,709,753,623,754,632,630,643,704,718,999,686,695,641,390,371,390,467,456,478,558,611,563,611,574,367,608,600,257,257,558,257,879,598,590,608,608,390,539,370,597,562,819,551,562,549,390,355,390,653"
    .split(",")
    .map(Number)

function advance(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  if (c === 32) return SPACE
  if (c >= 33 && c <= 126) return ASCII[c - 33]
  if (c >= 0xac00 && c <= 0xd7a3) return HANGUL
  if (c === 0x2026) return ELLIPSIS_WIDTH
  if (c >= 0x2e80) return 1000
  return 700
}

/** px 단위 어림 폭 */
export function textWidth(text: string, size: number): number {
  let sum = 0
  for (const ch of text) sum += advance(ch)
  return (sum * size) / 1000
}

type Piece = { text: string; space: boolean }
type Measure = (text: string) => number

function joinPieces(pieces: Piece[]): string {
  return pieces.map((p, i) => (i > 0 && p.space ? " " : "") + p.text).join("")
}

/** 낱말 단위 조각. 한 줄보다 긴 낱말(띄어쓰기 없는 덩어리)은 글자 단위로 쪼갠다 */
function toPieces(text: string, measure: Measure, maxWidth: number): Piece[] {
  const pieces: Piece[] = []
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue
    if (measure(word) <= maxWidth) pieces.push({ text: word, space: true })
    else Array.from(word).forEach((ch, i) => pieces.push({ text: ch, space: i === 0 }))
  }
  return pieces
}

/** 끝 조각을 덜어 내며 '…'까지 maxWidth 안에 맞춘다. 줄 끝 쉼표·가운뎃점·쌍점은 떼고 붙인다 */
function withEllipsis(pieces: Piece[], measure: Measure, maxWidth: number): string {
  const kept = [...pieces]
  while (kept.length > 1 && measure(joinPieces(kept) + ELLIPSIS) > maxWidth) kept.pop()
  return joinPieces(kept).replace(/[,·:]$/, "") + ELLIPSIS
}

/** 한 줄. 넘치면 낱말 경계에서 '…' */
export function fitLine(text: string, size: number, maxWidth: number): string {
  const measure: Measure = (s) => textWidth(s, size)
  const pieces = toPieces(text, measure, maxWidth)
  const whole = joinPieces(pieces)
  return measure(whole) <= maxWidth ? whole : withEllipsis(pieces, measure, maxWidth)
}

/**
 * 제목을 최대 2줄로 나눈다.
 * - 2줄에 다 들어가면 두 줄 폭이 비슷해지는 띄어쓰기에서 나눈다(쉼표 뒤를 조금 더 선호, 글자 단위 쪼갬은 피한다).
 * - 넘치면 둘째 줄을 낱말 경계에서 자르고 '…'를 붙인다.
 * - 띄어쓰기 없는 긴 덩어리는 글자 단위로 나눈다.
 */
export function fitTitle(title: string, size: number, maxWidth: number): string[] {
  const measure: Measure = (s) => textWidth(s, size)
  const pieces = toPieces(title, measure, maxWidth)
  if (pieces.length === 0) return []

  const lines: Piece[][] = [[]]
  for (const piece of pieces) {
    const current = lines[lines.length - 1]
    if (current.length === 0 || measure(joinPieces([...current, piece])) <= maxWidth) current.push(piece)
    else lines.push([piece])
  }
  if (lines.length === 1) return [joinPieces(lines[0])]

  if (lines.length === 2) {
    let best = { k: lines[0].length, score: Infinity }
    for (let k = 1; k < pieces.length; k++) {
      const first = joinPieces(pieces.slice(0, k))
      const second = joinPieces(pieces.slice(k))
      const firstWidth = measure(first)
      const secondWidth = measure(second)
      if (firstWidth > maxWidth || secondWidth > maxWidth) continue
      const charBreak = !pieces[k].space
      const score =
        Math.max(firstWidth, secondWidth) +
        (/[,·:]$/.test(first) ? -0.12 * maxWidth : 0) +
        (charBreak ? 0.5 * maxWidth : 0)
      if (score < best.score) best = { k, score }
    }
    return [joinPieces(pieces.slice(0, best.k)), joinPieces(pieces.slice(best.k))]
  }

  return [joinPieces(lines[0]), withEllipsis(lines[1], measure, maxWidth)]
}
