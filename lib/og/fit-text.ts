/**
 * 공유 카드(lib/og/template.tsx) 글줄 맞춤 — Satori 는 가운데 정렬 줄의 말줄임을 줄 가운데를 맞춘 뒤 덧붙여
 * 축이 오른쪽으로 밀린다. 그래서 줄바꿈·말줄임을 여기서 미리 정하고 각 줄을 따로 가운데 놓는다.
 *
 * 폭은 카드가 싣는 글꼴의 실제 전진폭(lib/og/font-metrics.ts, cmap·hmtx)으로 잰다. 글꼴에 없는 글자(이모지·한자 등)와
 * 여러 코드 포인트로 된 이모지 묶음은 1em 로 어림한다. 줄은 grapheme(사람이 보는 한 글자) 단위로만 나눠
 * 국기·가족·피부색 이모지가 중간에서 갈라지지 않는다.
 */

import type { FontMetrics } from "@/lib/og/font-metrics"

export const ELLIPSIS = "…"
/** 글꼴에 없는 글자·이모지 묶음의 어림 폭(1/1000 em) */
const FALLBACK_ADVANCE = 1000
const EMOJI_PART = /\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️/u
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" })

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (part) => part.segment)
}

function graphemeAdvance(grapheme: string, metrics: FontMetrics): number {
  const codePoints = Array.from(grapheme)
  // 여러 코드 포인트로 된 이모지(ZWJ 묶음·국기·피부색·VS16)는 그림 하나로 그려진다
  if (codePoints.length > 1 && EMOJI_PART.test(grapheme)) return FALLBACK_ADVANCE
  let sum = 0
  for (const ch of codePoints) sum += metrics.advance(ch.codePointAt(0) ?? 0) ?? FALLBACK_ADVANCE
  return sum
}

/** px 단위 폭 */
export function textWidth(text: string, size: number, metrics: FontMetrics): number {
  let sum = 0
  for (const grapheme of graphemes(text)) sum += graphemeAdvance(grapheme, metrics)
  return (sum * size) / 1000
}

type Piece = { text: string; space: boolean }
type Measure = (text: string) => number

function joinPieces(pieces: Piece[]): string {
  return pieces.map((p, i) => (i > 0 && p.space ? " " : "") + p.text).join("")
}

/** 낱말 단위 조각. 한 줄보다 긴 낱말(띄어쓰기 없는 덩어리)은 grapheme 단위로 쪼갠다 */
function toPieces(text: string, measure: Measure, maxWidth: number): Piece[] {
  const pieces: Piece[] = []
  for (const word of text.trim().split(/\s+/)) {
    if (!word) continue
    if (measure(word) <= maxWidth) pieces.push({ text: word, space: true })
    else graphemes(word).forEach((grapheme, i) => pieces.push({ text: grapheme, space: i === 0 }))
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
export function fitLine(text: string, size: number, maxWidth: number, metrics: FontMetrics): string {
  const measure: Measure = (s) => textWidth(s, size, metrics)
  const pieces = toPieces(text, measure, maxWidth)
  const whole = joinPieces(pieces)
  return measure(whole) <= maxWidth ? whole : withEllipsis(pieces, measure, maxWidth)
}

/**
 * 제목을 최대 2줄로 나눈다.
 * - 2줄에 다 들어가면 두 줄 폭이 비슷해지는 띄어쓰기에서 나눈다(쉼표 뒤를 조금 더 선호, 글자 단위 쪼갬은 피한다).
 * - 넘치면 둘째 줄을 낱말 경계에서 자르고 '…'를 붙인다.
 * - 띄어쓰기 없는 긴 덩어리는 grapheme 단위로 나눈다.
 */
export function fitTitle(title: string, size: number, maxWidth: number, metrics: FontMetrics): string[] {
  const measure: Measure = (s) => textWidth(s, size, metrics)
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
