/**
 * 답 꼴 다듬기(R2 B4, 계획 §4): 카드 글을 내보내기 직전에 줄바꿈·목록·표기만 가지런히 한다. 결정적이고 모델·네트워크를 부르지 않는다.
 *
 * 지키는 것
 * - 문장 순서와 글자 내용은 그대로다. 바꾸는 것은 줄바꿈·빈 줄·목록 표시(1. 한 가지)·메뉴 표기([이름], [A] > [B])뿐이다.
 *   글자를 없애는 곳은 둘이다: 뒤에 결론이 있는 빈 리드·예고("이렇게 하면 돼요." "아래 순서대로 따라 하시면 됩니다." "두 가지 답드릴게요.")와
 *   끝에 겹친 끝맺음 틀 줄(CLOSING_TEMPLATE_LINES 와 글자까지 같은 줄만 — 사실·단서가 든 줄은 끝맺음처럼 보여도 지우지 않는다). 둘 다 결과에 따로
 *   적어 돌려준다(시험이 전체 카드로 대조한다). 사람이 쓴 글(policy·fixed)과 공백 답은 끝맺음을 지우지 않는다(shapeOptionsFor).
 * - 말투: CHATBOT_COMPILED_TONE=yo(기본)이면 니다체 문장 끝을 요체로 바꾼다(yo-tone.ts, R3 a1·D1). 정책 글·말투 잠금 카드는 부르는 쪽이
 *   tone: "off" 로 넘긴다(shapeOptionsFor·respond.ts). off 면 R2 처럼 말투를 바꾸지 않는다.
 * - 표기(R3 a1, 규격 S3): CHATBOT_COMPILED_ARROW=arrow(기본)이면 경로 기호를 → 로 맞추고([A] > [B]·A > [B]·-> → [A] → [B]), 「」는 문서 제목
 *   (뒤에 문서·가이드·안내·도움말)일 때만 남기고 나머지 「옵션 이름」은 [ ] 로, 옛 메뉴 이름([기관 관리])은 현행명([학사 관리], MENU_RENAMES)으로,
 *   줄 앞 '※ '는 뗀다. gt 면 R2 와 같다(→ 를 > 로, 「」를 [ ] 로).
 * - 위젯이 그리는 규칙에 맞춘다(components/ui/chatbot/MessageList.tsx): 빈 줄로 덩이를 나누고, 덩이의 줄이 전부 "1." 이거나 전부 "-" 일 때만 목록으로 그린다.
 *   리드 줄 바로 아래 번호 목록이 붙으면 목록이 생글자로 나오므로, 문장 줄과 목록 사이에는 늘 빈 줄을 둔다. 번호 목록은 덩이 안에서 끊기지 않게 한 덩이로 모으고
 *   (빈 줄로 갈라진 "1)" "2)" 는 위젯이 각각 "1." 로 그린다) 번호는 1부터 다시 매긴다. 목록 항목 안에서는 줄을 나누지 않는다(이어지는 줄이 있으면 목록이 깨진다).
 *   번호 목록과 점 목록이 한 답에 섞이면 점 목록은 표시를 떼어 한 줄씩 둔다(순서 없는 점검 항목에 번호를 붙이면 "1. 1단계 …"처럼 읽힌다). 점 목록만 있으면 "-" 그대로다.
 * - 줄맞춤 뒤에 안전 규칙(safety-rules.ts)을 다시 검사한다. 원문에 없던 위반이 생기면 다듬지 않은 글을 그대로 낸다.
 * - 스위치 CHATBOT_COMPILED_SHAPE(기본 on, off·0·false 로 끈다). compiled 경로(respond.ts)에서만 돈다.
 */
import { splitIntoSentences } from "@/lib/chatbot/source-grounding"
import { findSafetyViolations } from "./safety-rules"
import { compiledTone, toYoTone, yoToneForSignature, type CompiledTone } from "./yo-tone"

type Env = Record<string, string | undefined>

/** CHATBOT_COMPILED_SHAPE: on(기본) · off. */
export function compiledShapeEnabled(env: Env = process.env): boolean {
  const value = env.CHATBOT_COMPILED_SHAPE?.trim().toLowerCase()
  return !(value === "off" || value === "0" || value === "false")
}

/** 답 꼴 판(R3 a1): r3 = 공백 답 한 문장(S11)·6단계 자르기(S2)·두 문장 마무리 줄 한 줄 유지(S6), r2 = R2 그대로. */
export type CompiledForm = "r3" | "r2"

/** CHATBOT_COMPILED_FORM: r3(기본) · r2. */
export function compiledForm(env: Env = process.env): CompiledForm {
  return env.CHATBOT_COMPILED_FORM?.trim().toLowerCase() === "r2" ? "r2" : "r3"
}

/** 경로 기호·표기 판(R3 a1). arrow: [A] → [B]·「문서 제목」만·현행 메뉴 이름·'※' 뗌(기본). gt: R2 표기([A] > [B], 「」 → [ ]). */
export type ArrowMode = "arrow" | "gt"

/** CHATBOT_COMPILED_ARROW: arrow(기본) · gt(R2 로 되돌림). 점검기(style-audit L7)도 같은 스위치를 읽는다. */
export function compiledArrowMode(env: Env = process.env): ArrowMode {
  return env.CHATBOT_COMPILED_ARROW?.trim().toLowerCase() === "gt" ? "gt" : "arrow"
}

/**
 * 옛 메뉴 이름 → 현행명(규격 S3, doc_137 현행 명칭 기록). [ ] 안의 이름과 경로 기호(>·→)에 붙은 이름만 바꾼다('기관 관리자' 같은 낱말 안은 그대로).
 * 옛 이름은 질문을 알아듣는 동의어로만 남는다(색인 낱말 사전). 문서센터 원문이 고쳐지면 여기서 뺀다. 점검 사본: style-audit-core LEGACY_MENU_NAMES.
 */
export const MENU_RENAMES: ReadonlyArray<{ legacy: string; current: string }> = [{ legacy: "기관 관리", current: "학사 관리" }]

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

/**
 * 끝맺음 틀 문구(상담 안내만 있고 사실이 없는 고정 줄): 증상·가이드 답(symptom-triage.ts)과 복합 답(respond.ts)이 붙이는 줄이다.
 * 겹친 끝맺음 정리·복합 답의 끝맺음 거두기는 이 줄과 글자까지 같은 줄만 다룬다(R2 검토 회귀-3·품질-2·품질-4).
 */
export const CLOSING_TEMPLATE_LINES: readonly string[] = [
  "그래도 안 되면 담당자 상담으로 이어 드릴게요.",
  "따라 하다 막히는 부분이 있으면 담당자 상담으로 이어 드릴게요.",
  "더 궁금한 점은 \"상담원 연결\"이라고 남겨 주세요.",
  "더 궁금한 점은 \"상담원 연결\"이라고 말씀해 주시면 이어서 도와드릴게요.",
]

export function isClosingTemplate(line: string): boolean {
  return CLOSING_TEMPLATE_LINES.includes(line.trim())
}

/**
 * 카드 종류별 다듬기 선택: 사람이 쓴 글(policy·fixed)·공백 답·상담 연결은 끝맺음을 지우지 않는다(doc·howto 만 틀 줄 겹침을 정리한다).
 * 말투는 정책 글(policy)과 말투 잠금(toneLocked)만 바꾸지 않고, 나머지는 CHATBOT_COMPILED_TONE 을 따른다. 표기는 CHATBOT_COMPILED_ARROW.
 */
export function shapeOptionsFor(kind: string, extra: { toneLocked?: boolean; env?: Env } = {}): ShapeOptions {
  const env = extra.env ?? process.env
  return {
    keepClosings: !(kind === "doc" || kind === "howto"),
    tone: kind === "policy" || extra.toneLocked ? "off" : compiledTone(env),
    arrow: compiledArrowMode(env),
    form: compiledForm(env),
  }
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

/** 「」 뒤에 오면 문서 제목으로 보는 낱말(규격 S3·S8: "「제목」 문서에 있어요"). 점검 L7 corner_not_title 과 같은 낱말. */
const DOC_TITLE_FOLLOW_RE = /^\s?(?:문서|가이드|안내|도움말)/

/** 따옴표 구간(화면 문구)을 건드리지 않고 그 밖의 글만 바꾼다. */
function mapOutsideQuotes(line: string, map: (part: string) => string): string {
  let out = ""
  let cursor = 0
  for (const match of line.matchAll(/'[^'\n]*'|"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’/g)) {
    const at = match.index ?? 0
    out += map(line.slice(cursor, at)) + match[0]
    cursor = at + match[0].length
  }
  return out + map(line.slice(cursor))
}

/**
 * R3 경로 기호: [ ] 에 붙은 > 와 -> · ⇒ 를 → 로(양쪽 공백 한 칸). 한 줄에 [ ] 에 붙은 > 가 있거나 '경로:' 줄이면 그 줄의 ' > ' 를 모두 → 로 바꾼다
 * ("프로필 > [계정 및 설정] > [기기 테스트]"의 첫 > 도 같은 경로다). 따옴표 안 화면 문구는 그대로 둔다.
 */
function arrowPaths(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const isPath = /\]\s*>|>\s*\[|경로\s*[:：]/.test(line)
      return mapOutsideQuotes(line, (part) => {
        let out = part.replace(/\s*(?:->|⇒)\s*/g, " → ")
        if (isPath) out = out.replace(/\]\s*>\s*/g, "] → ").replace(/\s*>\s*\[/g, " → [").replace(/\s>\s/g, " → ")
        return out.replace(/\]\s*→\s*/g, "] → ").replace(/\s*→\s*\[/g, " → [")
      })
    })
    .join("\n")
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** 옛 메뉴 이름을 현행명으로: [옛 이름] 과 경로 기호에 붙은 옛 이름만(점검 L8 legacyMenuNamesIn 과 같은 자리). */
export function renameMenus(text: string): string {
  let out = text
  for (const { legacy, current } of MENU_RENAMES) {
    const name = escapeRe(legacy)
    out = out
      .replace(new RegExp(`\\[\\s*${name}\\s*\\]`, "g"), `[${current}]`)
      .replace(new RegExp(`${name}(?=\\s*[>→])`, "g"), current)
      .replace(new RegExp(`((?:^|[>→]|경로\\s*[:：])\\s*)${name}(?=\\s*$)`, "gm"), `$1${current}`)
  }
  return out
}

/** 줄 앞 '※'(목록 표시 뒤 포함)를 뗀다(규격 S5). 줄 가운데 ※ 는 그대로. */
function dropNoteMarks(text: string): string {
  return text.replace(/(^|\n)([ \t]*(?:\d+[.)]\s+|[-•·*–]\s+)?)※[ \t]*/g, "$1$2")
}

/**
 * 메뉴·탭·버튼 표기. 공통: **굵게** 를 풀고 '이름' 메뉴 → [이름] 메뉴.
 * - arrow(R3 기본): 「제목」은 뒤에 문서·가이드·안내·도움말이 올 때만 남기고(『』도 「」로) 나머지는 [이름], 경로 기호는 → (arrowPaths),
 *   옛 메뉴 이름은 현행명(renameMenus), 줄 앞 ※ 는 뗀다.
 * - gt(R2): 「이름」 → [이름], [A] → [B] 사이 화살표 → ">". 일반 인용·그 밖의 화살표는 그대로 둔다.
 */
export function unifyNotation(text: string, arrow: ArrowMode = compiledArrowMode()): string {
  const base = text.replace(/\*\*([^*\n]+)\*\*/g, "$1")
  if (arrow === "gt") {
    return base
      .replace(/[「『]([^」』\n]{1,40})[」』]/g, "[$1]")
      .replace(QUOTED_NAME_RE, (_whole, a, b, c, d, space, noun) => `[${a ?? b ?? c ?? d}]${space}${noun}`)
      .replace(/\]\s*(?:→|->|⇒)\s*\[/g, "] > [")
  }
  const cornered = base.replace(/[「『]([^」』\n]{1,40})[」』]/g, (whole: string, inner: string, at: number, all: string) =>
    DOC_TITLE_FOLLOW_RE.test(all.slice(at + whole.length)) ? `「${inner}」` : `[${inner}]`
  )
  const named = cornered.replace(QUOTED_NAME_RE, (_whole, a, b, c, d, space, noun) => `[${a ?? b ?? c ?? d}]${space}${noun}`)
  return dropNoteMarks(renameMenus(arrowPaths(named)))
}

const PATH_ROOTS = ["관리자 대시보드", "대시보드"]

/** "경로: A > [B] > [C] 뒤 글" 한 줄을 [경로 줄, 뒤 글]로 나눈다(경로가 줄 끝까지면 뒤 글 없음). 경로 줄이 아니면 null. arrow 면 → 도 경로 기호다. */
function splitPathLine(line: string, arrow: ArrowMode): { before: string; path: string; after: string } | null {
  const marker = /경로\s*[:：]\s*/.exec(line)
  if (!marker) return null
  const before = line.slice(0, marker.index).trim()
  const rest = line.slice(marker.index + marker[0].length)
  const arrows = [...rest.matchAll(arrow === "gt" ? /\s>\s/g : /\s(?:>|→)\s/g)]
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
  const root = PATH_ROOTS.find((name) => pathBody.startsWith(`${name} > `) || (arrow === "arrow" && pathBody.startsWith(`${name} → `)))
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

/**
 * 공백·줄바꿈·표기 기호·목록 표시를 뺀 글자열(글자 보존 시험이 쓴다). R3 의 뜻을 바꾸지 않는 고침 — 요체 어미(yo-tone 같은 규칙)·옛 메뉴 이름·
 * 줄 앞 ※ — 은 양쪽에 같게 맞춘 뒤 비교한다(고친 글과 원문이 같은 서명을 낸다).
 */
export function contentSignature(text: string): string {
  // 목록 표시를 떼고 문단 안 줄바꿈을 한 칸으로 모은 뒤(줄맞춤이 한 줄짜리 인용을 여러 줄로 나눠도 양쪽이 같은 인용 구간을 보게) 문단마다 어미·메뉴
  // 이름을 맞춘다. '이름' 메뉴 → [이름] 메뉴 도 먼저 맞춘다(따옴표 짝이 바뀌면 인용 구간이 달라진다).
  const flat = text
    .replace(/(^|\n)\s*(?:\d+[.)]\s+|[①-⑩]\s*|[-•·*–]\s+)/g, "$1")
    .split(/\n[ \t]*\n+/)
    .map((paragraph) =>
      yoToneForSignature(paragraph.replace(/\s+/g, " ").replace(QUOTED_NAME_RE, (_whole, a, b, c, d, space, noun) => `[${a ?? b ?? c ?? d}]${space}${noun}`))
    )
    .join(" ")
  return renameAll(flat).replace(/[\s\[\]()<>「」『』'"“”‘’→⇒>*※-]|->/g, "")
}

/** 서명용: 옛 메뉴 이름을 자리와 상관없이 현행명으로(낱말 '…자'가 붙은 것은 그대로). */
function renameAll(text: string): string {
  let out = text
  for (const { legacy, current } of MENU_RENAMES) out = out.replace(new RegExp(`${escapeRe(legacy)}(?!자)`, "g"), current)
  return out
}

export interface ShapeResult {
  text: string
  /** 뺀 빈 리드·예고 문장. */
  removedLeads: string[]
  /** 뺀 겹친 끝맺음 줄. */
  removedClosings: string[]
  /** 안전 규칙 때문에 다듬지 않고 그대로 냈는지. */
  reverted: boolean
  /** 요체로 바꾼 문장 끝 수(R3 a1). 토큰 보존 검사에 걸려 되돌렸으면 0 이고 toneReverted 가 true. */
  toned?: number
  toneReverted?: boolean
  /** 6단계 넘는 번호 목록에서 뺀 단계(steps 를 줬을 때만, 규격 S2). */
  removedSteps?: string[]
}

export interface ShapeOptions {
  /** 끝맺음 겹침을 정리하지 않는다(복합 답은 조각마다 끝맺음을 따로 거둔다). */
  keepClosings?: boolean
  /** 말투(R3 a1). 없으면 CHATBOT_COMPILED_TONE(기본 yo). 정책 글·말투 잠금 카드는 off 로 넘긴다. */
  tone?: CompiledTone
  /** 표기 판(R3 a1). 없으면 CHATBOT_COMPILED_ARROW(기본 arrow). */
  arrow?: ArrowMode
  /** 답 꼴 판(R3 a1). 없으면 CHATBOT_COMPILED_FORM(기본 r3). r3 면 두 문장 마무리 줄을 한 줄로 둔다. */
  form?: CompiledForm
  /**
   * 번호 목록 단계 상한(규격 S2): 6단계 이상이면 앞 max 단계만 두고 "이어지는 순서는 「{title}」 문서에 있어요." 한 줄을 붙인다.
   * 문서 제목을 아는 doc·howto 답에만 넘긴다(respond.ts). 없으면 자르지 않는다.
   */
  steps?: { max: number; title: string }
  /** 스위치를 읽을 환경(없으면 process.env). */
  env?: Env
}

/** 6단계 이상 번호 목록 뒤에 붙이는 줄(규격 S2). */
export function moreStepsLine(title: string) {
  return `이어지는 순서는 「${title}」 문서에 있어요.`
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

/**
 * 줄 나누기 선택(R3 form 이면 둘 다 켠다).
 * - keepClosingLine: 마무리 줄('그래도 안 되면 "상담원 연결"이라고 남겨 주세요. … 알려 주시면 …')은 두 문장이어도 한 줄로 둔다(규격 S6 "한 줄 두 문장", 설계 §3-4).
 * - leadBullets: 한 덩이 안에서 문장 줄 바로 뒤에 점 목록이 덩이 끝까지 이어지면 한 덩이로 둔다(위젯이 "리드 + 목록"으로 그린다 — 되묻기 카드의
 *   "어느 화면이 안 나오나요?" + 선택지). 답에 번호 목록이 있으면 점 목록 표시를 떼는 R2 규칙과 섞이지 않게 나눈다.
 */
interface LayoutOptions {
  arrow: ArrowMode
  keepClosingLine: boolean
  leadBullets: boolean
}

function layoutBlocks(input: readonly (readonly string[])[], layout: LayoutOptions): string[][] {
  const { arrow } = layout
  const leadBullets = layout.leadBullets && !input.some((lines) => lines.some((line) => lineKind(line) === "ordered"))
  const blocks: string[][] = []
  for (const lines of input) {
    const runs = splitRuns(lines)
    for (let at = 0; at < runs.length; at += 1) {
      const run = runs[at]
      if (blockKind(run) !== "plain") {
        const previous = blocks.at(-1)
        if (leadBullets && previous && blockKind(run) === "bullet" && at === runs.length - 1 && at > 0 && blockKind(runs[at - 1]) === "plain") {
          previous.push(...run.map((line) => `- ${itemText(line)}`))
          continue
        }
        blocks.push(run)
        continue
      }
      const out: string[] = []
      for (const line of run) {
        const path = splitPathLine(line, arrow)
        const pieces = path ? [path.before, path.path, path.after].filter(Boolean) : [line]
        for (const piece of pieces) {
          if (/^경로:/.test(piece) || (layout.keepClosingLine && isClosingLine(piece))) out.push(piece)
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

/** 번호를 뗀 단일 항목 글: 한 문장 한 줄로 나눈다. 나눈 줄이 목록 표시로 시작하면(글 안의 "2) …") 위젯이 목록으로 그려 깨지므로 나누지 않는다. */
export function singleItemLines(text: string): string[] {
  const lines = sentenceLines(text)
  return lines.some((line) => lineKind(line) !== "plain") ? [text] : lines
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
      // 항목이 하나뿐인 번호 목록은 번호를 떼어 문장으로 둔다(위젯이 번호를 다시 1로 그리므로 번호가 틀려 보인다). 뗀 글도 한 문장 한 줄로 나눈다.
      out.push(lines.length === 1 ? singleItemLines(itemText(lines[0])) : lines.map((line, at) => `${at + 1}. ${itemText(line)}`))
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

/**
 * 끝 세 줄 안에 끝맺음이 둘 이상이면 틀 줄(CLOSING_TEMPLATE_LINES)만 지운다: 다른 끝맺음 줄(사실·단서가 든 상담 안내)이 있으면 틀 줄을 모두,
 * 틀 줄만 겹쳤으면 마지막 하나를 남긴다. 틀이 아닌 줄은 끝맺음처럼 보여도 지우지 않는다.
 */
function dedupeClosings(blocks: string[][], removed: string[]): string[][] {
  const flat: { block: number; line: number }[] = []
  blocks.forEach((lines, block) => lines.forEach((_line, line) => flat.push({ block, line })))
  const tail = flat.slice(-3)
  const closings = tail.filter((at) => isClosingLine(blocks[at.block][at.line]) || isClosingTemplate(blocks[at.block][at.line]))
  if (closings.length < 2) return blocks
  const templates = closings.filter((at) => isClosingTemplate(blocks[at.block][at.line]))
  if (templates.length === 0) return blocks
  const drop = templates.length === closings.length ? templates.slice(0, -1) : templates
  const out = blocks.map((lines) => [...lines])
  for (const at of drop) {
    removed.push(out[at.block][at.line])
    out[at.block][at.line] = ""
  }
  return out.map((lines) => lines.filter(Boolean)).filter((lines) => lines.length > 0)
}

/** 줄맞춤만(글자·순서 불변): 시험이 contentSignature 로 전후를 대조한다. 말투는 바꾸지 않는다. */
export function shapeLayout(text: string, arrow: ArrowMode = compiledArrowMode(), form: CompiledForm = compiledForm()): string {
  return fromBlocks(unifyListMarks(layoutBlocks(toBlocks(unifyNotation(text, arrow)), { arrow, keepClosingLine: form === "r3", leadBullets: form === "r3" })))
}

/** 6단계 이상 번호 목록을 앞 max 단계로 자르고 문서 제목 줄을 그 목록 바로 뒤 덩이로 둔다(규격 S2). */
function capSteps(blocks: string[][], steps: { max: number; title: string }, removed: string[]): string[][] {
  const out: string[][] = []
  for (const lines of blocks) {
    if (blockKind(lines) === "ordered" && lines.length > steps.max) {
      removed.push(...lines.slice(steps.max))
      out.push(lines.slice(0, steps.max), [moreStepsLine(steps.title)])
    } else out.push(lines)
  }
  return out
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
  const env = options.env ?? process.env
  const arrow = options.arrow ?? compiledArrowMode(env)
  const tone = options.tone ?? compiledTone(env)
  const form = options.form ?? compiledForm(env)
  const removedLeads: string[] = []
  const removedClosings: string[] = []
  const removedSteps: string[] = []
  const original = text
  const notated = unifyNotation(text, arrow)
  // 요체 변환(R3, 규격 S7 다듬기 ⑤): 토큰 보존·안전 규칙 검사에 걸리면 바꾸지 않은 글로 이어 간다.
  const toned = tone === "yo" ? toYoTone(notated) : null
  // 빈 리드는 줄 나누기 전에 걷는다(길이로 줄을 나누므로 걷은 뒤 글 기준으로 나눠야 한다).
  let blocks = layoutBlocks(stripEmptyLead(toBlocks(toned?.text ?? notated), removedLeads), { arrow, keepClosingLine: form === "r3", leadBullets: form === "r3" })
  if (!options.keepClosings) blocks = dedupeClosings(blocks, removedClosings)
  blocks = unifyListMarks(blocks)
  if (options.steps) blocks = capSteps(blocks, options.steps, removedSteps)
  const shaped = fromBlocks(blocks)
  const before = violationKeys(original)
  const introduced = [...violationKeys(shaped)].filter((key) => !before.has(key))
  if (introduced.length > 0) return { text: original, removedLeads: [], removedClosings: [], reverted: true }
  return {
    text: shaped,
    removedLeads,
    removedClosings,
    reverted: false,
    ...(toned ? { toned: toned.changed, toneReverted: toned.reverted } : {}),
    ...(removedSteps.length > 0 ? { removedSteps } : {}),
  }
}
