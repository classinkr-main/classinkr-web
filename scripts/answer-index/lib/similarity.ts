/**
 * 글 겹침 검사(V-4 중복 변형, V-7·V-8 평가 질문 겹침, inventory 비슷한 답 쌍).
 *
 * 정규화: NFC, 소문자, 글자·숫자만 남김(공백·문장부호 제거). 질문 묶음 중복 제거(r5/sets/build.js)와 같은 뜻이다.
 * 겹침 기준(§6 V-7):
 * - 정규화 동일
 * - 편집거리 2 이하(둘 다 정규화 길이 EDIT_MIN_LENGTH 이상일 때만. 짧은 글은 거리 2가 뜻이 다른 글도 묶는다)
 * - 글자 2-gram 자카드 0.8 이상
 * - (사전 형태만) 개발 질문과 8자 이상 연속 일치
 */

export const JACCARD_THRESHOLD = 0.8
export const EDIT_DISTANCE_MAX = 2
export const EDIT_MIN_LENGTH = 8
export const SUBSTRING_MIN_LENGTH = 8

export function normalizeForOverlap(text: string) {
  return text.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

export function bigramSet(normalized: string) {
  const out = new Set<string>()
  if (normalized.length === 1) out.add(normalized)
  for (let i = 0; i + 1 < normalized.length; i += 1) out.add(normalized.slice(i, i + 2))
  return out
}

export function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 && b.size === 0) return 1
  let shared = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const gram of small) if (large.has(gram)) shared += 1
  return shared / (a.size + b.size - shared)
}

/** 편집거리(max 를 넘으면 max+1 을 돌려준다). */
export function boundedLevenshtein(a: string, b: string, max = EDIT_DISTANCE_MAX) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      current.push(value)
      if (value < rowMin) rowMin = value
    }
    if (rowMin > max) return max + 1
    previous = current
  }
  return previous[b.length]
}

export type OverlapReason = "same" | "edit" | "jaccard" | "substring"

export interface OverlapMatch {
  /** 참조 묶음 안 위치. */
  index: number
  reason: OverlapReason
}

interface IndexedText {
  normalized: string
  grams: Set<string>
}

/**
 * 참조 글(개발 질문 등)을 색인해 두고 후보 글이 겹치는지 빠르게 찾는다.
 * 2-gram 역색인으로 공유 2-gram 수를 세어 자카드·편집거리 후보만 정확히 계산한다.
 */
export class OverlapIndex {
  private readonly items: IndexedText[]
  private readonly exact = new Map<string, number>()
  private readonly postings = new Map<string, number[]>()
  private readonly substrings = new Map<string, number>()

  constructor(texts: readonly string[], options: { substrings?: boolean } = {}) {
    this.items = texts.map((text) => {
      const normalized = normalizeForOverlap(text)
      return { normalized, grams: bigramSet(normalized) }
    })
    this.items.forEach((item, index) => {
      if (!item.normalized) return
      if (!this.exact.has(item.normalized)) this.exact.set(item.normalized, index)
      for (const gram of item.grams) {
        const list = this.postings.get(gram) ?? []
        list.push(index)
        this.postings.set(gram, list)
      }
      if (options.substrings) {
        for (let i = 0; i + SUBSTRING_MIN_LENGTH <= item.normalized.length; i += 1) {
          const window = item.normalized.slice(i, i + SUBSTRING_MIN_LENGTH)
          if (!this.substrings.has(window)) this.substrings.set(window, index)
        }
      }
    })
  }

  get size() {
    return this.items.length
  }

  /** 겹치는 참조 글 하나(가장 먼저 찾은 것). 없으면 null. */
  find(text: string, options: { substring?: boolean } = {}): OverlapMatch | null {
    const normalized = normalizeForOverlap(text)
    if (!normalized) return null
    const same = this.exact.get(normalized)
    if (same !== undefined) return { index: same, reason: "same" }

    const grams = bigramSet(normalized)
    const shared = new Map<number, number>()
    for (const gram of grams) {
      for (const index of this.postings.get(gram) ?? []) shared.set(index, (shared.get(index) ?? 0) + 1)
    }
    let best: OverlapMatch | null = null
    for (const [index, count] of shared) {
      const item = this.items[index]
      const union = grams.size + item.grams.size - count
      if (union > 0 && count / union >= JACCARD_THRESHOLD) {
        if (!best || index < best.index) best = { index, reason: "jaccard" }
        continue
      }
      if (
        normalized.length >= EDIT_MIN_LENGTH &&
        item.normalized.length >= EDIT_MIN_LENGTH &&
        Math.abs(normalized.length - item.normalized.length) <= EDIT_DISTANCE_MAX &&
        // 편집 한 번은 서로 다른 2-gram 을 최대 2개 없앤다.
        count >= Math.max(grams.size, item.grams.size) - 2 * EDIT_DISTANCE_MAX &&
        boundedLevenshtein(normalized, item.normalized) <= EDIT_DISTANCE_MAX
      ) {
        if (!best || index < best.index) best = { index, reason: "edit" }
      }
    }
    if (best) return best

    if (options.substring && normalized.length >= SUBSTRING_MIN_LENGTH && this.substrings.size > 0) {
      for (let i = 0; i + SUBSTRING_MIN_LENGTH <= normalized.length; i += 1) {
        const hit = this.substrings.get(normalized.slice(i, i + SUBSTRING_MIN_LENGTH))
        if (hit !== undefined) return { index: hit, reason: "substring" }
      }
    }
    return null
  }
}
