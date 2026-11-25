/**
 * 답 꼴 다듬기(R2 B4, 계획 §4): 카드 글을 내보내기 직전에 줄바꿈·목록·표기만 가지런히 한다. 결정적이고 모델·네트워크를 부르지 않는다.
 *
 * 지키는 것
 * - 문장 순서와 글자 내용은 그대로다. 바꾸는 것은 줄바꿈·빈 줄·목록 표시(1. 한 가지)·메뉴 표기([이름], [A] > [B])뿐이다.
 *   글자를 없애는 곳은 둘이다: 뒤에 결론이 있는 빈 리드·예고("이렇게 하면 돼요." "아래 순서대로 따라 하시면 됩니다." "두 가지 답드릴게요.")와
 *   끝에 겹친 끝맺음 줄. 둘 다 결과에 따로 적어 돌려준다(시험이 목록으로 대조한다).
 * - 말투(요체·니다체)는 바꾸지 않는다(결정 3: 사용자 결정 대기).
 * - 위젯이 그리는 규칙에 맞춘다(components/ui/chatbot/MessageList.tsx): 빈 줄로 덩이를 나누고, 덩이의 줄이 전부 "1." 이거나 전부 "-" 일 때만 목록으로 그린다.
 *   리드 줄 바로 아래 번호 목록이 붙으면 목록이 생글자로 나오므로, 문장 줄과 목록 사이에는 늘 빈 줄을 둔다. 번호 목록은 덩이 안에서 끊기지 않게 한 덩이로 모으고
 *   (빈 줄로 갈라진 "1)" "2)" 는 위젯이 각각 "1." 로 그린다) 번호는 1부터 다시 매긴다. 목록 항목 안에서는 줄을 나누지 않는다(이어지는 줄이 있으면 목록이 깨진다).
 *   번호 목록과 점 목록이 한 답에 섞이면 점 목록은 표시를 떼어 한 줄씩 둔다(순서 없는 점검 항목에 번호를 붙이면 "1. 1단계 …"처럼 읽힌다). 점 목록만 있으면 "-" 그대로다.
 * - 줄맞춤 뒤에 안전 규칙(safety-rules.ts)을 다시 검사한다. 원문에 없던 위반이 생기면 다듬지 않은 글을 그대로 낸다.
 * - 스위치 CHATBOT_COMPILED_SHAPE(기본 on, off·0·false 로 끈다). compiled 경로(respond.ts)에서만 돈다.
 */
import { splitIntoSentences } from "@/lib/chatbot/source-grounding"
import { findSafetyViolations } from "./safety-rules"

type Env = Record<string, string | undefined>

/** CHATBOT_COMPILED_SHAPE: on(기본) · off. */
export function compiledShapeEnabled(env: Env = process.env): boolean {
  const value = env.CHATBOT_COMPILED_SHAPE?.trim().toLowerCase()
  return !(value === "off" || value === "0" || value === "false")
}

// ─── 빈 리드·끝맺음 ──────────────────────────────────────────────────────

/** 내용이 없는 리드·예고 문장(뒤에 결론이 있을 때만 뺀다). 문장 하나 전체와 맞아야 한다. */
const EMPTY_LEAD_SENTENCE_RES: readonly RegExp[] = [
  /^이렇게 하면 (?:돼요|됩니다)[.!]?$/,
  /^(?:아래|다음) 순서대로 (?:따라 하시면|따라 하세요|따라 해 주세요|진행하시면|하시면|해 주세요) (?:됩니다|돼요|해요)[.!]?$/,
  /^(?:아래|다음)(?:과 같이|처럼) (?:진행하시면|하시면|해 주시면|따라 하시면) (?:됩니다|돼요)[.!]?$/,
  /^(?:두|세|네) 가지(?: (?:나눠서|나눠|따로|각각|차례로|모두))* 답(?:드릴게요|할게요|드리겠습니다)[.!]?$/,
]

export function isEmptyLeadSentence(sentence: string): boolean {
  const text = sentence.trim()
  return EMPTY_LEAD_SENTENCE_RES.some((pattern) => pattern.test(text))
}

/** 끝맺음(상담·다음 행동 안내) 줄 판별. 길이가 짧은 한두 문장 줄만 끝맺음으로 본다. */
export const CLOSING_LINE_RE =
  /(상담원 연결|상담 연결|상담으로|담당자가 확인|담당자 상담|담당자에게|궁금하시면|궁금한 점|필요하시면|필요하면|언제든|이어 드릴|이어서 도와|실시간 상담)/

const CLOSING_LINE_MAX = 90

export function isClosingLine(line: string): boolean {
  const text = line.trim()
  if (!text || text.length > CLOSING_LINE_MAX) return false
  if (/^(?:\d+[.)]|[-•·*])\s/.test(text)) return false
  return CLOSING_LINE_RE.test(text) && splitIntoSentences(text).length <= 2
}

// ─── 덩이·줄 ─────────────────────────────────────────────────────────────

export type LineKind = "ordered" | "bullet" | "plain"

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"
const ORDERED_RE = /^(?:(\d+)[.)]\s+|([①-⑩])\s*)(.+)$/
const BULLET_RE = /^[-•·*–]\s+(.+)$/

export function lineKind(line: string): LineKind {
  if (ORDERED_RE.test(line)) return "ordered"
  if (BULLET_RE.test(line)) return "bullet"
  return "plain"
}

function itemText(line: string): string {
  return (line.match(ORDERED_RE)?.[3] ?? line.match(BULLET_RE)?.[1] ?? line).trim()
}

function itemNumber(line: string): number | null {
  const match = line.match(ORDERED_RE)
  if (!match) return null
  return match[1] !== undefined ? Number(match[1]) : CIRCLED.indexOf(match[2]) + 1
}

/** 글을 덩이(빈 줄로 나뉜 줄 묶음)로 쪼갠다. */
export function toBlocks(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
    .filter((lines) => lines.length > 0)
}

export function fromBlocks(blocks: readonly (readonly string[])[]): string {
  return blocks
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join("\n"))
    .join("\n\n")
}

/** 덩이가 목록이면 그 종류, 아니면 plain(줄이 전부 같은 종류의 목록일 때만 목록). */
export function blockKind(lines: readonly string[]): LineKind {
  if (lines.length === 0) return "plain"
  if (lines.every((line) => lineKind(line) === "ordered")) return "ordered"
  if (lines.every((line) => lineKind(line) === "bullet")) return "bullet"
  return "plain"
}

// ─── 표기 통일 ───────────────────────────────────────────────────────────

const QUOTED_NAME_RE = /(?:'([^'\n]{1,20})'|"([^"\n]{1,20})"|‘([^’\n]{1,20})’|“([^”\n]{1,20})”)(\s?)(메뉴|탭|버튼|항목|아이콘)/g

/** 메뉴·탭·버튼 표기: '이름' 메뉴 → [이름] 메뉴, 「이름」 → [이름], [A] → [B] 사이 화살표 → ">". 일반 인용·그 밖의 화살표는 그대로 둔다. */
export function unifyNotation(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/[「『]([^」』\n]{1,40})[」』]/g, "[$1]")
    .replace(QUOTED_NAME_RE, (_whole, a, b, c, d, space, noun) => `[${a ?? b ?? c ?? d}]${space}${noun}`)
    .replace(/\]\s*(?:→|->|⇒)\s*\[/g, "] > [")
}

const PATH_ROOTS = ["관리자 대시보드", "대시보드"]

/** "경로: A > [B] > [C] 뒤 글" 한 줄을 [경로 줄, 뒤 글]로 나눈다(경로가 줄 끝까지면 뒤 글 없음). 경로 줄이 아니면 null. */
function splitPathLine(line: string): { before: string; path: string; after: string } | null {
  const marker = /경로\s*[:：]\s*/.exec(line)
  if (!marker) return null
  const before = line.slice(0, marker.index).trim()
  const rest = line.slice(marker.index + marker[0].length)
  const arrows = [...rest.matchAll(/\s>\s/g)]
  let end = rest.length
  let cursor = 0
  if (arrows.length > 0) {
    const last = arrows[arrows.length - 1]
    cursor = (last.index ?? 0) + last[0].length
    const tail = rest.slice(cursor)
    const bracket = /^\[[^\]\n]+\]/.exec(tail)
    // 마지막 단계가 [이름] 이면 거기까지가 경로, 아니면 줄 끝까지를 경로로 둔다(뒤 글을 가를 곳을 알 수 없다).
    end = bracket ? cursor + bracket[0].length : rest.length
  } else {
    const bracket = /^\[[^\]\n]+\]/.exec(rest)
    end = bracket ? bracket[0].length : rest.length
  }
  const pathBody = rest.slice(0, end).trim()
  const after = rest.slice(end).trim()
  const root = PATH_ROOTS.find((name) => pathBody.startsWith(`${name} > `))
  const path = `경로: ${root ? `[${root}]${pathBody.slice(root.length)}` : pathBody}`
  return { before, path, after }
}

// ─── 문장 줄 나누기 ──────────────────────────────────────────────────────

/** 문장이 둘 이상이고 이 길이를 넘는 문단은 한 문장 한 줄로 나눈다. */
export const SENTENCE_LINE_MIN_CHARS = 60

function sentenceLines(line: string): string[] {
  if (line.length <= SENTENCE_LINE_MIN_CHARS) return [line]
  const sentences = splitIntoSentences(line)
  if (sentences.length < 2) return [line]
  return sentences
}

// ─── 다듬기 ──────────────────────────────────────────────────────────────

/** 공백·줄바꿈·표기 기호·목록 표시를 뺀 글자열(글자 보존 시험이 쓴다). */
export function contentSignature(text: string): string {
  return text
    .replace(/(^|\n)\s*(?:\d+[.)]\s+|[①-⑩]\s*|[-•·*–]\s+)/g, "$1")
    .replace(/[\s\[\]()<>「」『』'"“”‘’→⇒>*-]|->/g, "")
}

export interface ShapeResult {
  text: string
  /** 뺀 빈 리드·예고 문장. */
  removedLeads: string[]
  /** 뺀 겹친 끝맺음 줄. */
  removedClosings: string[]
  /** 안전 규칙 때문에 다듬지 않고 그대로 냈는지. */
  reverted: boolean
}

export interface ShapeOptions {
  /** 끝맺음 겹침을 정리하지 않는다(복합 답은 조각마다 끝맺음을 따로 거둔다). */
  keepClosings?: boolean
}

function mergeOrderedBlocks(blocks: string[][]): string[][] {
  const out: string[][] = []
  for (const lines of blocks) {
    const previous = out.at(-1)
    if (previous && blockKind(previous) === "ordered" && blockKind(lines) === "ordered") {
      const last = itemNumber(previous[previous.length - 1])
      const first = itemNumber(lines[0])
      // 번호가 이어질 때만 한 덩이로 모은다(1) → 2) 처럼 빈 줄로 갈라진 목록). 새로 1부터 시작하면 다른 목록이다.
      if (last !== null && first !== null && first === last + 1) {
        previous.push(...lines)
        continue
      }
    }
    out.push([...lines])
  }
  return out
}

/** 줄 단위 구조 나누기: 덩이를 문장 줄 / 번호 목록 / 점 목록 덩이로 가른다(목록과 문장 줄 사이엔 늘 빈 줄). */
function splitRuns(lines: readonly string[]): string[][] {
  const runs: { kind: LineKind; lines: string[] }[] = []
  for (const line of lines) {
    const kind = lineKind(line)
    const last = runs.at(-1)
    if (last && last.kind === kind) last.lines.push(line)
    else runs.push({ kind, lines: [line] })
  }
  return runs.map((run) => run.lines)
}

function layoutBlocks(input: readonly (readonly string[])[]): string[][] {
  const blocks: string[][] = []
  for (const lines of input) {
    for (const run of splitRuns(lines)) {
      if (blockKind(run) !== "plain") {
        blocks.push(run)
        continue
      }
      const out: string[] = []
      for (const line of run) {
        const path = splitPathLine(line)
        const pieces = path ? [path.before, path.path, path.after].filter(Boolean) : [line]
        for (const piece of pieces) {
          if (/^경로:/.test(piece)) out.push(piece)
          else out.push(...sentenceLines(piece))
        }
      }
      blocks.push(out)
    }
  }
  return mergeOrderedBlocks(blocks)
}

/** 짧은 소제목 줄(목록 앞에 붙는 "함께 확인할 것" 같은 줄)인지. */
function isHeadingLine(line: string): boolean {
  return line.length <= 24 || /[:：]$/.test(line)
}

/**
 * 같은 답 안에 번호 목록과 점 목록이 섞이면 목록 표시를 한 가지(번호)로 맞춘다. 번호는 덩이마다 1부터 다시 매긴다.
 * 점 목록은 순서가 없는 점검 항목이라 번호를 붙이면 "1. 1단계 …"처럼 읽히므로 표시를 떼고 한 줄씩 둔다(앞 소제목 줄과 한 덩이).
 */
function unifyListMarks(blocks: string[][]): string[][] {
  const hasOrdered = blocks.some((lines) => blockKind(lines) === "ordered")
  const out: string[][] = []
  for (const lines of blocks) {
    const kind = blockKind(lines)
    if (kind === "ordered") {
      // 항목이 하나뿐인 번호 목록은 번호를 떼어 문장으로 둔다(위젯이 번호를 다시 1로 그리므로 번호가 틀려 보인다).
      out.push(lines.length === 1 ? [itemText(lines[0])] : lines.map((line, at) => `${at + 1}. ${itemText(line)}`))
    } else if (kind === "bullet" && hasOrdered) {
      const plain = lines.map(itemText)
      const previous = out.at(-1)
      if (previous && blockKind(previous) === "plain" && isHeadingLine(previous[previous.length - 1])) previous.push(...plain)
      else out.push(plain)
    } else if (kind === "bullet") out.push(lines.map((line) => `- ${itemText(line)}`))
    else out.push(lines)
  }
  return out
}

/** 맨 앞 빈 리드·예고 문장을 뺀다(뒤에 다른 내용이 있을 때만). */
function stripEmptyLead(blocks: string[][], removed: string[]): string[][] {
  const first = blocks[0]?.[0]
  if (first === undefined) return blocks
  const sentences = blockKind(blocks[0]) === "plain" ? splitIntoSentences(first) : []
  const head = sentences[0]
  if (head === undefined || !isEmptyLeadSentence(head)) return blocks
  const restOfLine = sentences.slice(1).join(" ")
  const hasMore = restOfLine.length > 0 || blocks[0].length > 1 || blocks.length > 1
  if (!hasMore) return blocks
  removed.push(head)
  const out = blocks.map((lines) => [...lines])
  const remaining = [restOfLine, ...out[0].slice(1)].filter(Boolean)
  if (remaining.length > 0) out[0] = remaining
  else out.shift()
  return out
}

/** 끝 세 줄 안에 끝맺음이 둘 이상이면 마지막 하나만 남긴다(끝맺음만 있는 줄만 지운다). */
function dedupeClosings(blocks: string[][], removed: string[]): string[][] {
  const flat: { block: number; line: number }[] = []
  blocks.forEach((lines, block) => lines.forEach((_line, line) => flat.push({ block, line })))
  const tail = flat.slice(-3)
  const closings = tail.filter((at) => isClosingLine(blocks[at.block][at.line]))
  if (closings.length < 2) return blocks
  const drop = closings.slice(0, -1)
  const out = blocks.map((lines) => [...lines])
  for (const at of drop) {
    removed.push(out[at.block][at.line])
    out[at.block][at.line] = ""
  }
  return out.map((lines) => lines.filter(Boolean)).filter((lines) => lines.length > 0)
}

/** 줄맞춤만(글자·순서 불변): 시험이 contentSignature 로 전후를 대조한다. */
export function shapeLayout(text: string): string {
  return fromBlocks(unifyListMarks(layoutBlocks(toBlocks(unifyNotation(text)))))
}

/**
 * 위젯이 깨뜨려 그리는 덩이(MessageList.tsx 규칙 사본): 번호 줄이 다른 줄과 한 덩이로 섞였거나, 점 목록 뒤에 문장 줄이 오는 덩이.
 * (줄이 전부 번호거나 전부 점이면 목록, 문장 줄 뒤에 점 목록만 오면 리드+목록, 그 밖의 섞임은 글로 그려져 "1." 이 생글자로 보인다.)
 */
export function findWidgetBreaks(text: string): string[] {
  const broken: string[] = []
  for (const lines of toBlocks(text)) {
    const kinds = lines.map(lineKind)
    if (kinds.every((kind) => kind === "ordered") || kinds.every((kind) => kind === "bullet")) continue
    if (kinds.includes("ordered")) {
      broken.push(lines.join("\n"))
      continue
    }
    const firstBullet = kinds.indexOf("bullet")
    if (firstBullet >= 0 && !(firstBullet > 0 && kinds.slice(firstBullet).every((kind) => kind === "bullet"))) broken.push(lines.join("\n"))
  }
  return broken
}

/** 안전 규칙 위반 종류 목록(키). */
function violationKeys(text: string): Set<string> {
  return new Set(findSafetyViolations(text).map((rule) => rule.key))
}

/**
 * 답 글 다듬기. 빈 리드·겹친 끝맺음을 빼고 줄맞춤·표기를 정리한다. 다듬은 글이 원문에 없던 안전 규칙 위반을 만들면 원문을 그대로 낸다.
 */
export function shapeAnswer(text: string, options: ShapeOptions = {}): ShapeResult {
  const removedLeads: string[] = []
  const removedClosings: string[] = []
  const original = text
  // 빈 리드는 줄 나누기 전에 걷는다(길이로 줄을 나누므로 걷은 뒤 글 기준으로 나눠야 한다).
  let blocks = layoutBlocks(stripEmptyLead(toBlocks(unifyNotation(text)), removedLeads))
  if (!options.keepClosings) blocks = dedupeClosings(blocks, removedClosings)
  const shaped = fromBlocks(unifyListMarks(blocks))
  const before = violationKeys(original)
  const introduced = [...violationKeys(shaped)].filter((key) => !before.has(key))
  if (introduced.length > 0) return { text: original, removedLeads: [], removedClosings: [], reverted: true }
  return { text: shaped, removedLeads, removedClosings, reverted: false }
}
