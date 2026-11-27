// 답 글 문체 점검의 순수 판정 함수. 모델·파일·네트워크를 부르지 않는다. 테스트: tests/chatbot/answer-index/style-audit.test.ts
// 점검 규칙의 정본은 docs/active 의 R2 계획 §4(문체 규칙)이다. 여기서는 규칙을 '판정'만 하고 글을 고치지 않는다.
//
// 측정 항목(글 하나마다)
// - firstLine: 첫 줄 결론 규칙 판정. 첫 문장은 리드(카드 lead 가 있으면 그것)가 먼저, 없으면 본문 첫 문장.
//     conclusion(통과) · empty_lead(내용 없는 리드: "이렇게 하면 돼요." "아래 순서대로…") · announce(예고: 끝이 ':'·"…알려드릴게요")
//     · empathy(공감·사과로 시작) · too_long(60자 초과) · yesno_miss(예/아니오 질문인데 네/아니요로 시작하지 않음)
// - noNewline: 줄바꿈이 하나도 없는 글(긴 글에서만 센다: 80자 이상).
// - maxLine: 가장 긴 줄의 길이. 120자 초과·60자 초과 줄이 있는 글을 센다(위젯 한 줄은 20~25자).
// - pathStuck: "경로:" 가 다른 글 뒤에 붙어 있는 글(자기 줄이 아님).
// - listMix: 번호·불릿 표시가 두 가지 이상 섞인 글. longNumberedItem: 번호 항목 하나에 문장이 셋 이상.
// - closingLines: 끝에서 세 줄 안에 상담·다음 행동 문구가 두 줄 이상.
// - toneMixed: ~니다체와 ~요체가 한 글에 같이 있음. 말투를 바꾸는 규칙은 이번 판에 없다(측정만 한다).
// - notation: 메뉴 표기 흔들림(→·->·「」·'이름' 따옴표·굵게·이모지).
//
// R3(아래 'R3 기계 점검' 절): 답 꼴 규격 5절의 L1~L18 판정(lintAnswer·lintCompound·lintAlreadyTried·lintYoConvert)과
// 축약 카드 꼴 점검(checkCardShape, verify V-14 가 쓴다). 위 R2 측정 칸은 전후 비교를 위해 그대로 둔다.

import { findSafetyViolations } from "@/lib/chatbot/answer-index/safety-rules"
import { findWidgetBreaks } from "@/lib/chatbot/answer-index/shape"

export const EMPTY_LEAD_RE = /^(이렇게 하면 (돼|됩)니?다?요?|아래 순서대로|다음 순서대로|아래와 같이|다음과 같이|두 가지|세 가지|먼저 .{0,12}(알려|안내)드)/
export const ANNOUNCE_RE = /(:|：)\s*$|(알려|안내|설명|말씀)\s?드(릴게요|리겠습니다|립니다)[.!]?$/
export const EMPATHY_RE = /^(불편|죄송|걱정|힘드|속상|당황|많이 놀)/
/** 인사로 시작하는 첫 줄(R3 L1 greeting). */
export const GREETING_RE = /^(안녕하(세요|십니까)|반갑습니다|반가워요|(문의|연락)(해|하여)?\s?주셔서\s?감사)/
export const YESNO_START_RE = /^(네|예|아니요|아니오|아뇨)[,.!\s]/
export const CLOSING_RE = /(상담원 연결|상담 연결|상담으로|담당자가 확인|담당자 상담|궁금하시면|궁금한 점|필요하시면|필요하면|언제든|이어 드릴|이어서 도와)/

const LIST_MARKERS: ReadonlyArray<[string, RegExp]> = [
  ["1.", /^\s*\d+\.\s/m],
  ["1)", /^\s*\d+\)\s/m],
  ["-", /^\s*[-–]\s/m],
  ["·", /^\s*[·•ㆍ]\s/m],
  ["①", /^\s*[①-⑩]/m],
  ["*", /^\s*\*\s/m],
  ["▶", /^\s*[▶▷►]\s/m],
]

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** 문장 끝의 말투: 니다체·요체·다(평서)·기타. */
export function endingTone(sentence: string): "nida" | "yo" | "da" | "other" {
  const body = sentence.trim().replace(/[.!?)"'”\s]+$/, "")
  if (/(니다|습니다|입니다|ㅂ니다)$/.test(body)) return "nida"
  if (/(요|죠|세요|까요)$/.test(body)) return "yo"
  if (/다$/.test(body)) return "da"
  return "other"
}

export type FirstLineVerdict = "conclusion" | "greeting" | "empty_lead" | "announce" | "empathy" | "too_long" | "yesno_miss"

export const FIRST_LINE_MAX_CHARS = 60

export interface StyleInput {
  /** 답 본문. */
  text: string
  /** 카드 lead 문장(있으면 첫 문장은 이것). */
  lead?: string | null
  /** 카드가 답하는 물음 종류(yesno 면 예/아니오 규칙을 건다). */
  asks?: readonly string[] | null
}

export interface StyleRecord {
  chars: number
  lines: number
  firstSentence: string
  firstLine: FirstLineVerdict
  noNewline: boolean
  maxLine: number
  longLine120: boolean
  longLine60: boolean
  pathStuck: boolean
  listKinds: string[]
  listMix: boolean
  longNumberedItem: boolean
  closingLines: number
  toneMixed: boolean
  notation: { arrow: boolean; quoteName: boolean; corner: boolean; bold: boolean; emoji: boolean }
}

/** 첫 줄 결론 규칙 판정(R2 계획 §4.1 규칙 1, R3 규격 S1: 인사 greeting 을 더함). */
export function judgeFirstLine(first: string, asks: readonly string[] | null | undefined): FirstLineVerdict {
  const sentence = first.trim()
  if (GREETING_RE.test(sentence)) return "greeting"
  if (EMPTY_LEAD_RE.test(sentence)) return "empty_lead"
  if (ANNOUNCE_RE.test(sentence)) return "announce"
  if (EMPATHY_RE.test(sentence)) return "empathy"
  if (sentence.length > FIRST_LINE_MAX_CHARS) return "too_long"
  if (asks?.includes("yesno") && !YESNO_START_RE.test(sentence)) return "yesno_miss"
  return "conclusion"
}

export function analyzeStyle(input: StyleInput): StyleRecord {
  const text = input.text.replace(/\r\n/g, "\n").trim()
  const lines = text.split("\n")
  const nonEmpty = lines.filter((line) => line.trim())
  const maxLine = nonEmpty.reduce((max, line) => Math.max(max, line.length), 0)
  // 목록 표시("1.")는 문장이 아니다: 첫 문장을 고를 때 줄 앞 표시를 뗀다.
  const first = input.lead?.trim() || splitSentences(text.replace(/(^|\n)\s*(?:\d+[.)]|[-•·*–])\s+/g, "$1"))[0] || ""
  const listKinds = LIST_MARKERS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  const numbered = nonEmpty.filter((line) => /^\s*\d+[.)]\s/.test(line))
  const tail = nonEmpty.slice(-3)
  const tones = new Set(splitSentences(text).filter((sentence) => sentence.length > 3).map(endingTone))
  return {
    chars: text.length,
    lines: nonEmpty.length,
    firstSentence: first,
    firstLine: judgeFirstLine(first, input.asks),
    noNewline: text.length >= 80 && !text.includes("\n"),
    maxLine,
    longLine120: maxLine > 120,
    longLine60: maxLine > 60,
    // 목록 항목 맨 앞의 "경로:"("1. 경로: …")는 자기 줄이다. 다른 글 뒤에 붙은 것만 센다.
    pathStuck: lines.some((raw) => {
      const line = raw.replace(/^\s*(?:\d+[.)]|[-•·*–])\s+/, "")
      return /\S[^\n]*\s경로\s*[:：]/.test(line) || /\S경로\s*[:：]/.test(line)
    }),
    listKinds,
    listMix: listKinds.length >= 2,
    longNumberedItem: numbered.some((line) => splitSentences(line).length >= 3),
    closingLines: tail.filter((line) => CLOSING_RE.test(line)).length,
    toneMixed: tones.has("nida") && tones.has("yo"),
    notation: {
      arrow: /→|->/.test(text),
      quoteName: /'[^'\n]{1,14}'\s?(메뉴|탭|버튼|항목)/.test(text),
      corner: /[「『]/.test(text),
      bold: /\*\*/.test(text),
      emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text),
    },
  }
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10)

export interface StyleGroupSummary {
  n: number
  firstLine: Record<FirstLineVerdict, number>
  firstLineConclusionRatio: number
  noNewline: number
  noNewlineRatio: number
  longLine120: number
  longLine60: number
  pathStuck: number
  listMix: number
  longNumberedItem: number
  closingTwoPlus: number
  toneMixed: number
  notation: { arrow: number; quoteName: number; corner: number; bold: number; emoji: number }
  chars: { median: number; p90: number; max: number }
  maxLine: { median: number; p90: number }
}

const quantile = (values: number[], q: number) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
}

export function summarizeStyle(records: readonly StyleRecord[]): StyleGroupSummary {
  const firstLine: Record<FirstLineVerdict, number> = { conclusion: 0, greeting: 0, empty_lead: 0, announce: 0, empathy: 0, too_long: 0, yesno_miss: 0 }
  for (const record of records) firstLine[record.firstLine] += 1
  const count = (pick: (record: StyleRecord) => boolean) => records.filter(pick).length
  const noNewline = count((r) => r.noNewline)
  return {
    n: records.length,
    firstLine,
    firstLineConclusionRatio: pct(firstLine.conclusion, records.length),
    noNewline,
    noNewlineRatio: pct(noNewline, records.length),
    longLine120: count((r) => r.longLine120),
    longLine60: count((r) => r.longLine60),
    pathStuck: count((r) => r.pathStuck),
    listMix: count((r) => r.listMix),
    longNumberedItem: count((r) => r.longNumberedItem),
    closingTwoPlus: count((r) => r.closingLines >= 2),
    toneMixed: count((r) => r.toneMixed),
    notation: {
      arrow: count((r) => r.notation.arrow),
      quoteName: count((r) => r.notation.quoteName),
      corner: count((r) => r.notation.corner),
      bold: count((r) => r.notation.bold),
      emoji: count((r) => r.notation.emoji),
    },
    chars: { median: quantile(records.map((r) => r.chars), 0.5), p90: quantile(records.map((r) => r.chars), 0.9), max: Math.max(0, ...records.map((r) => r.chars)) },
    maxLine: { median: quantile(records.map((r) => r.maxLine), 0.5), p90: quantile(records.map((r) => r.maxLine), 0.9) },
  }
}

// ═══ R3 기계 점검(lint) L1~L18 ═══════════════════════════════════════════
// 규격: R3 답 꼴 규격 5절(scratchpad 설계 문서). 판정만 하고 글을 고치지 않는다. 카드 렌더(style-audit --cards)와 답 파일(--answers)이 같이 쓴다.
// - 실패(fail)는 0 이어야 하는 규칙, 경고(warn)는 세기만 하는 규칙이다. L1 은 비율 지표라 결론이 아니면 fail 로 적고 비율로 묶는다.
// - L7 화살표 판정은 스위치 CHATBOT_COMPILED_ARROW(arrow 기본 | gt)를 따른다: arrow 면 [A] > [B]·-> 가 실패, gt 면 → 가 실패.
// - L13(복합 꼴)·L16(이미 해 본 것)·L18(요체 변환 보존)은 질문·조각 수·변환 전 글이 있어야 해서 따로 부르는 함수도 둔다.

export const LINT_RULES = [
  { id: "L1", name: "firstLine", title: "첫 줄 결론(인사·빈 리드·예고·공감·60자 초과·예/아니오 불일치가 아님). 복합은 조각마다 머리 다음 줄" },
  { id: "L2", name: "emptyLead", title: "내용 없는 리드·예고" },
  { id: "L3", name: "lineLen", title: "문장 줄 60자·단계 줄 80자 초과 경고, 120자 초과 실패" },
  { id: "L4", name: "midBreak", title: "문장 중간 줄바꿈(줄 끝이 쉼표·연결 어미이고 다음 줄이 같은 문장)" },
  { id: "L5", name: "blocks", title: "단일 답 덩이 4개 초과·덩이 5줄 초과·문단 문장 3개 초과(경고)" },
  { id: "L6", name: "list", title: "목록 섞임·항목 문장 3개 이상·단계 6개 이상·단일 항목 번호" },
  { id: "L7", name: "notation", title: "경로 기호(스위치), 문서 제목이 아닌 「」, **, 이모지, 백틱" },
  { id: "L8", name: "menuName", title: "옛 메뉴 이름 노출(LEGACY_MENU_NAMES)" },
  { id: "L9", name: "toneMixed", title: "인용 밖 니다체와 요체 혼재" },
  { id: "L10", name: "closing", title: "끝맺음 2줄 이상·감사·덕담 마무리·이모지" },
  { id: "L11", name: "cautionPrefix", title: "주의:·참고:·※·💡 접두(경고)" },
  { id: "L12", name: "linkInBody", title: "본문 URL·마크다운 링크·이미지 경로·'스크린샷 참고'" },
  { id: "L13", name: "compound", title: "복합 꼴: 번호 수 + 묶임 = 조각 수, 번호 순서, 머리 단독 덩이 0, 조각마다 결론 줄, 알림이 제 자리" },
  { id: "L14", name: "askInfo", title: "식별 정보 요구(V-3 pii_request)·받을 항목 4개 초과" },
  { id: "L15", name: "gapForm", title: "공백 답 4줄 초과·'추측' 메타 문장" },
  { id: "L16", name: "alreadyTried", title: "이미 해 봤다는 문항에서 첫 행동이 이미 한 동작" },
  { id: "L17", name: "widgetBreak", title: "위젯이 생글자로 그리는 덩이(shape.ts findWidgetBreaks)" },
  { id: "L18", name: "yoConvert", title: "요체 변환 전후 숫자·[ ]·영문·부정어 수 같음(실패), 바뀌지 않은 니다체 문장(경고)" },
] as const

export type LintRuleId = (typeof LINT_RULES)[number]["id"]
export type LintLevel = "warn" | "fail"

export interface LintFinding {
  rule: LintRuleId
  level: LintLevel
  /** 규칙 안의 세부 판정 이름(예: line_120, list_mix). */
  code: string
  /** 걸린 글 조각(앞 40자). 손님 글을 길게 옮기지 않는다. */
  detail?: string
}

/** L7 경로 기호 판정 방향(CHATBOT_COMPILED_ARROW). */
export type ArrowMode = "arrow" | "gt"

export function arrowModeFromEnv(env: Record<string, string | undefined> = process.env): ArrowMode {
  return env.CHATBOT_COMPILED_ARROW?.trim().toLowerCase() === "gt" ? "gt" : "arrow"
}

/**
 * 옛 메뉴 이름 → 현행명(규격 S3). 렌더 치환 표(a1 의 MENU_RENAMES)와 같은 뜻의 점검용 사본이다. 옛 이름은 질문을 알아듣는 동의어로만 둔다.
 * '관리자 대시보드'와 '[관리자 페이지]'의 혼용은 정본 확인 전이라 넣지 않는다(규격 7절).
 */
export const LEGACY_MENU_NAMES: ReadonlyArray<{ legacy: string; current: string }> = [{ legacy: "기관 관리", current: "학사 관리" }]

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** 글에 드러난 옛 메뉴 이름: [옛 이름] 또는 경로 기호(>·→)로 이어진 옛 이름. '기관 관리자' 같은 낱말 안은 세지 않는다. */
export function legacyMenuNamesIn(text: string): string[] {
  const found: string[] = []
  for (const { legacy } of LEGACY_MENU_NAMES) {
    const name = escapeRe(legacy)
    const bracketed = new RegExp(`\\[\\s*${name}\\s*\\]`)
    const inPath = new RegExp(`(?:^|[>→]|경로\\s*[:：])\\s*${name}(?=\\s*(?:[>→]|$))|${name}\\s*(?:[>→])`, "m")
    if (bracketed.test(text) || inPath.test(text)) found.push(legacy)
  }
  return found
}

/** 인용(따옴표·「」·[ ]) 안 글을 지운다: 화면 문구를 그대로 옮긴 글의 말투는 따지지 않는다(규격 S7). */
export function stripQuoted(text: string): string {
  return text.replace(/'[^'\n]*'|"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』|\[[^\]\n]*\]/g, " ")
}

/** 문장 하나의 체(L9·L18): 니다체(…니다·…니까)·요체·그 밖. */
export function sentenceTone(sentence: string): "nida" | "yo" | "other" {
  const body = sentence.trim().replace(/[.!?)"'”’\s]+$/, "")
  if (/(니다|니까)$/.test(body)) return "nida"
  const tone = endingTone(sentence)
  return tone === "yo" ? "yo" : "other"
}

const LIST_LINE_RE = /^\s*(?:\d+[.)]|[-•·*–]|[①-⑩])\s*/
const ORDERED_LINE_RE = /^\s*\d+[.)]\s/
const BULLET_LINE_RE = /^\s*[-•·*–]\s/
const CIRCLED_LINE_RE = /^\s*[①-⑩]/
const BRACKET_HEAD_RE = /^\s*【[^】\n]+】\s*$/
const NUMBER_HEAD_RE = /^\s*(\d+)\.\s+\S/
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
/** 줄 끝 연결(문장이 다음 줄로 이어짐): 쉼표·연결 어미. 마침표·물음표로 끝난 줄은 들지 않는다. */
const MID_BREAK_END_RE = /(?:[,，]|(?:고|며|는데|은데|지만|면서|으며|으나|거나|어서|아서|해서))\s*$/
const MID_BREAK_NOUN_RE = /(?:참고|광고|최고|공고|창고|보고|경고|재고|원고|신고)\s*$/
/** 상담을 권하는 줄(L10 끝맺음 겹침). CLOSING_RE 에서 '담당자가 확인'·'상담으로'처럼 권유의 이어짐인 말을 뺐다. */
const CLOSING_CTA_RE = /(상담원 연결|상담 연결|담당자 상담|궁금하시면|궁금한 점|언제든|이어 드릴|이어서 도와)/
const THANKS_END_RE = /(감사합니다|감사해요|고맙습니다|고마워요|좋은 하루|즐거운 하루|행복한 하루)/
const CAUTION_PREFIX_RE = /^\s*(?:주의|참고|알림|팁|Tip)\s*[:：]|※|💡/
const URL_RE = /https?:\/\/|www\.[a-z0-9-]+\./i
const MARKDOWN_LINK_RE = /\[[^\]\n]+\]\([^)\n]+\)|!\[/
const IMAGE_PATH_RE = /\.(?:png|jpe?g|gif|webp|svg)(?![A-Za-z])/i
const SCREENSHOT_RE = /스크린샷(?:을|를)?\s*참고/
/** 받을 정보를 나열하는 문장(L14): "…을/를 (함께) 알려·남겨·보내 주…". */
const ASK_INFO_RE = /(?:^|[.?!]\s|남기고\s|남겨\s주시고\s)([^.?!]+?)(?:을|를)\s*(?:함께\s*)?(?:알려|남겨|보내|적어)\s?주/
/** 복합 답 알림 줄(chatbot-live-eval-probes UNANSWERED_NOTICE_PATTERNS 와 같은 줄). */
const NOTICE_LINE_RE = /함께 물어보신 다른 내용은|이 질문만 따로 보내 주시면|공개 안내에는 없는 내용이|따로 한 번 더 물어봐 주세요|공개 안내에서 바로 찾지 못했어요|딱 맞는 해결 안내는 아직 찾지 못했어요/

const clip = (text: string, max = 40) => {
  const one = text.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max)}…` : one
}

function blocksOf(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").filter((line) => line.trim()))
    .filter((lines) => lines.length > 0)
}

/** 복합 답의 머리 줄 꼴: 【이름】 줄이 있으면 bracket(R2), 없으면 null(부르는 쪽이 number — R3 D2 "1. 이름" — 로 본다). */
export function compoundHeadMode(text: string): "bracket" | null {
  return /^\s*【[^】\n]+】\s*$/m.test(text) ? "bracket" : null
}

export interface CompoundHead {
  /** 머리 줄 번호(1부터). 【이름】 꼴이면 차례. */
  n: number
  label: string
  /** 머리 줄 다음 줄(결론 줄). 없으면 null. */
  next: string | null
  /** 머리 덩이 줄들(머리 줄 포함). */
  lines: string[]
}

/**
 * 복합 답의 머리 덩이를 찾는다. bracket 은 【이름】 줄, number 는 덩이 첫 줄이 "n. 이름"이고 다음 줄이 목록 줄이 아닌 덩이
 * (번호 단계 목록과 가리려고: 단계 목록 덩이는 줄이 전부 번호 줄이다). 머리 줄만 있는 덩이도 머리로 센다(L13 head_alone).
 */
export function compoundHeads(text: string, mode: "bracket" | "number"): CompoundHead[] {
  const heads: CompoundHead[] = []
  for (const lines of blocksOf(text)) {
    const first = lines[0]
    if (mode === "bracket") {
      if (!BRACKET_HEAD_RE.test(first)) continue
      heads.push({ n: heads.length + 1, label: first.trim().replace(/^【|】$/g, ""), next: lines[1]?.trim() ?? null, lines })
      continue
    }
    const match = first.match(NUMBER_HEAD_RE)
    if (!match) continue
    if (lines.length > 1 && lines.every((line) => ORDERED_LINE_RE.test(line))) continue
    heads.push({ n: Number(match[1]), label: first.trim().replace(/^\d+\.\s+/, ""), next: lines[1]?.trim() ?? null, lines })
  }
  return heads
}

export interface CompoundLintInput {
  /** 질문 조각 수(답 색인 흔적의 segments). */
  segments: number
  /** 같은 카드로 이미 답한 조각이라 번호 하나로 묶인 조각 수. */
  bound?: number
  /** 머리 꼴. 없으면 글에서 찾는다(【】가 있으면 bracket, 아니면 number). */
  head?: "bracket" | "number"
}

/** L13 복합 꼴(규격 S10·4.3 마감 점검). 조각이 1개 이하면 판정하지 않는다. 질문 순서는 조각 글이 없어 여기서 보지 않는다. */
export function lintCompound(text: string, input: CompoundLintInput): LintFinding[] {
  if (input.segments < 2) return []
  const out: LintFinding[] = []
  const mode = input.head ?? compoundHeadMode(text) ?? "number"
  const heads = compoundHeads(text, mode)
  const expected = input.segments - (input.bound ?? 0)
  // 모든 조각이 한 카드로 묶였으면(번호 1 + 묶임) 머리 없는 단일 답이 맞다.
  if (expected === 1 && heads.length === 0) return out
  if (heads.length !== expected) out.push({ rule: "L13", level: "fail", code: "head_count", detail: `머리 ${heads.length} ≠ 조각 ${input.segments} − 묶임 ${input.bound ?? 0}` })
  if (mode === "number" && heads.some((head, at) => head.n !== at + 1)) out.push({ rule: "L13", level: "fail", code: "head_order", detail: heads.map((head) => head.n).join(",") })
  for (const head of heads) {
    if (head.lines.length === 1) out.push({ rule: "L13", level: "fail", code: "head_alone", detail: clip(head.label, 24) })
    else if (head.next && LIST_LINE_RE.test(head.next)) out.push({ rule: "L13", level: "fail", code: "no_conclusion", detail: clip(head.label, 24) })
  }
  // 알림 줄은 번호째 그 자리(머리 덩이 안)에 있어야 한다. 머리가 하나도 없으면 head_count 가 이미 잡는다.
  if (heads.length > 0) {
    const inHeads = new Set(heads.flatMap((head) => head.lines))
    for (const lines of blocksOf(text)) {
      for (const line of lines) if (NOTICE_LINE_RE.test(line) && !inHeads.has(line)) out.push({ rule: "L13", level: "fail", code: "notice_outside", detail: clip(line, 30) })
    }
  }
  return out
}

/** S14 '이미 해 본 것' 표지와 동작. */
export const TRIED_MARKER_RE = /(이미|벌써|몇\s?번|여러\s?번|계속|했는데|했지만|했어도|해\s?봤|해\s?보았|다시\s?깔았|지웠다)/
export const TRIED_ACTIONS: ReadonlyArray<{ id: string; question: RegExp; step: RegExp }> = [
  { id: "reinstall", question: /재설치|다시\s?(?:설치|깔)|지웠다\s?다시|삭제\s?(?:후|하고)\s?(?:다시\s?)?설치/, step: /재설치|다시\s?설치|삭제한?\s?(?:뒤|후)|지우고|삭제해/ },
  { id: "restart", question: /재시작|재부팅|다시\s?(?:시작|켜)|껐다\s?(?:가\s?)?(?:켜|켰)/, step: /재시작|재부팅|다시\s?(?:시작|실행|켜)|껐다\s?(?:가\s?)?켜/ },
  { id: "update", question: /업데이트/, step: /업데이트/ },
  { id: "relogin", question: /로그아웃|다시\s?로그인|재로그인/, step: /로그아웃|다시\s?로그인/ },
]

/** 질문에서 이미 해 봤다는 동작 id. 표지가 없으면 빈 배열. */
export function triedActionsOf(question: string): string[] {
  if (!TRIED_MARKER_RE.test(question)) return []
  return TRIED_ACTIONS.filter((action) => action.question.test(question)).map((action) => action.id)
}

/** L16: 이미 해 봤다는 문항에서 답의 첫 행동(첫 목록 줄, 없으면 첫 줄)이 그 동작이면 실패. */
export function lintAlreadyTried(question: string, answer: string): LintFinding[] {
  const tried = triedActionsOf(question)
  if (tried.length === 0) return []
  const lines = answer.split("\n").map((line) => line.trim()).filter(Boolean)
  const firstAction = lines.find((line) => LIST_LINE_RE.test(line)) ?? lines[0] ?? ""
  const hit = TRIED_ACTIONS.filter((action) => tried.includes(action.id) && action.step.test(firstAction)).map((action) => action.id)
  return hit.length > 0 ? [{ rule: "L16", level: "fail", code: "repeat_tried", detail: hit.join(",") }] : []
}

const NEGATION_TOKEN_RE = /(않|없|못|안\s|불가|아니|말고|금지|지\s?마)/g

function tokenBag(text: string) {
  const sorted = (values: string[]) => values.sort().join("|")
  return {
    numbers: sorted(Array.from(text.matchAll(/\d+(?:[.,]\d+)*/g), (m) => m[0])),
    brackets: sorted(Array.from(text.matchAll(/\[[^\]\n]+\]/g), (m) => m[0].replace(/\s+/g, ""))),
    english: sorted(Array.from(text.matchAll(/[A-Za-z][A-Za-z0-9.+-]*/g), (m) => m[0].toLowerCase())),
    negations: String(Array.from(text.matchAll(NEGATION_TOKEN_RE)).length),
  }
}

/** L18: 요체 변환 전후 보존(숫자·[ ]·영문 토큰과 부정어 수가 같아야 한다)과 바뀌지 않은 니다체 문장(경고, 어간 사전 채우기용). */
export function lintYoConvert(before: string, after: string): LintFinding[] {
  const out: LintFinding[] = []
  const a = tokenBag(before)
  const b = tokenBag(after)
  for (const key of Object.keys(a) as Array<keyof typeof a>) if (a[key] !== b[key]) out.push({ rule: "L18", level: "fail", code: `token_${key}` })
  for (const sentence of splitSentences(stripQuoted(after))) if (sentenceTone(sentence) === "nida") out.push({ rule: "L18", level: "warn", code: "unconverted", detail: clip(sentence, 30) })
  return out
}

export interface LintOptions {
  /** 카드·답 종류(doc·fixed·policy·howto·gap·answer…). gap 이면 L15 를 건다. */
  kind?: string | null
  /** 카드가 답하는 물음 종류(yesno 면 L1 예/아니오 규칙). */
  asks?: readonly string[] | null
  /** 카드 리드(있으면 첫 문장). */
  lead?: string | null
  /** L7 화살표 판정 방향. 없으면 arrow. */
  arrow?: ArrowMode
  /** 질문 글(있으면 L16). */
  question?: string | null
  /** 질문 조각 수(2 이상이면 L13·조각마다 L1). */
  segments?: number | null
  /** 번호 하나로 묶인 조각 수(L13). */
  bound?: number
  /** 말투 잠금 카드(L9 를 보지 않는다). */
  toneLocked?: boolean
}

/** 답 글 하나의 L1~L17 판정(L18 은 lintYoConvert). 걸린 것만 돌려준다. */
export function lintAnswer(rawText: string, options: LintOptions = {}): LintFinding[] {
  const text = rawText.replace(/\r\n/g, "\n").trim()
  const out: LintFinding[] = []
  const add = (rule: LintRuleId, level: LintLevel, code: string, detail?: string) => out.push({ rule, level, code, ...(detail ? { detail: clip(detail) } : {}) })
  const lines = text.split("\n").map((line) => line.trimEnd())
  const nonEmpty = lines.filter((line) => line.trim())
  const blocks = blocksOf(text)
  const compound = (options.segments ?? 0) >= 2
  const headMode = compound ? (compoundHeadMode(text) ?? "number") : null
  const heads = headMode ? compoundHeads(text, headMode) : []
  const headLines = new Set(heads.map((head) => head.lines[0]))
  const english = /^[\x00-\x7F\s]+$/.test(text.replace(/[→「」【】·…]/g, ""))

  // L1·L2 첫 줄(복합이면 머리 다음 줄마다).
  const firstOf = () => options.lead?.trim() || splitSentences(text.replace(/(^|\n)\s*(?:\d+[.)]|[-•·*–])\s+/g, "$1"))[0] || ""
  const firsts = compound && heads.length > 0 ? heads.map((head) => head.next ?? "") : [firstOf()]
  for (const first of firsts) {
    const verdict = judgeFirstLine(first, compound ? null : options.asks)
    if (verdict !== "conclusion") add("L1", "fail", verdict, first)
    if (verdict === "empty_lead" || verdict === "announce") add("L2", "fail", verdict, first)
  }
  for (const lines of blocks) if (lines[0] !== nonEmpty[0] && EMPTY_LEAD_RE.test(lines[0].trim()) && lines[0].trim().length <= 30) add("L2", "fail", "empty_lead_block", lines[0])

  // L3 줄 길이.
  for (const line of nonEmpty) {
    const length = line.trim().length
    const list = LIST_LINE_RE.test(line) && !headLines.has(line)
    if (length > 120) add("L3", "fail", "line_120", line)
    else if (list && length > 80) add("L3", "warn", "step_80", line)
    else if (!list && length > 60 && !CLOSING_RE.test(line)) add("L3", "warn", "line_60", line)
  }

  // L4 문장 중간 줄바꿈: 같은 덩이 안 다음 줄이 목록 줄이 아닐 때.
  for (const lines of blocks) {
    lines.forEach((line, at) => {
      const next = lines[at + 1]
      if (!next || LIST_LINE_RE.test(next) || LIST_LINE_RE.test(line) || headLines.has(line)) return
      if (MID_BREAK_END_RE.test(line) && !MID_BREAK_NOUN_RE.test(line)) add("L4", "fail", "mid_break", line)
    })
  }

  // L5 덩이(경고).
  if (!compound && blocks.length > 4) add("L5", "warn", "blocks_4", String(blocks.length))
  for (const lines of blocks) {
    if (lines.length > 5) add("L5", "warn", "block_lines_5", lines[0])
    if (lines.every((line) => !LIST_LINE_RE.test(line)) && lines.some((line) => splitSentences(line).length > 3)) add("L5", "warn", "paragraph_sentences_3", lines[0])
  }

  // L6 목록.
  const listLines = nonEmpty.filter((line) => !headLines.has(line))
  const ordered = listLines.filter((line) => ORDERED_LINE_RE.test(line))
  const bullets = listLines.filter((line) => BULLET_LINE_RE.test(line))
  const circled = listLines.filter((line) => CIRCLED_LINE_RE.test(line))
  if ([ordered.length, bullets.length, circled.length].filter((count) => count > 0).length >= 2) add("L6", "fail", "list_mix")
  for (const line of [...ordered, ...bullets, ...circled]) if (splitSentences(line.replace(LIST_LINE_RE, "")).length >= 3) add("L6", "fail", "item_sentences_3", line)
  for (const lines of blocks) {
    let run = 0
    let longest = 0
    for (const line of lines) {
      run = ORDERED_LINE_RE.test(line) && !headLines.has(line) ? run + 1 : 0
      longest = Math.max(longest, run)
    }
    if (longest >= 6) add("L6", "fail", "steps_6", String(longest))
  }
  if (ordered.length === 1) add("L6", "fail", "single_numbered", ordered[0])

  // L7 표기.
  const arrow = options.arrow ?? "arrow"
  if (arrow === "arrow" && /\]\s*(?:>|->)\s*\S|\S\s*(?:>|->)\s*\[|\s->\s/.test(text)) add("L7", "fail", "path_gt")
  if (arrow === "gt" && /→/.test(text)) add("L7", "fail", "path_arrow")
  for (const match of text.matchAll(/「([^」\n]+)」\s*(\S{0,3})/g)) if (!/^(?:문서|가이드|안내|도움말)/.test(match[2])) add("L7", "fail", "corner_not_title", match[0])
  if (/\*\*/.test(text)) add("L7", "fail", "bold")
  if (EMOJI_RE.test(text)) add("L7", "fail", "emoji")
  if (/`/.test(text)) add("L7", "fail", "backtick")

  // L8 옛 메뉴 이름.
  for (const name of legacyMenuNamesIn(text)) add("L8", "fail", "legacy_menu", name)

  // L9 말투 혼재(인용 밖).
  if (!options.toneLocked && !english) {
    const tones = new Set(splitSentences(stripQuoted(text)).filter((sentence) => sentence.trim().length > 3).map(sentenceTone))
    if (tones.has("nida") && tones.has("yo")) add("L9", "fail", "tone_mixed")
  }

  // L10 끝맺음.
  const tail = nonEmpty.slice(-3)
  // 상담을 권하는 줄이 끝에 두 번(같은 권유가 겹침). "…남겨 주세요." 다음 줄의 "…알려 주시면 담당자가 확인해 드려요."는 한 권유의 이어짐이라 세지 않는다.
  if (tail.filter((line) => CLOSING_CTA_RE.test(line)).length >= 2) add("L10", "fail", "closing_2")
  const last = nonEmpty.at(-1) ?? ""
  if (THANKS_END_RE.test(last)) add("L10", "fail", "closing_thanks", last)
  if (EMOJI_RE.test(last)) add("L10", "fail", "closing_emoji")

  // L11 주의 접두(경고).
  for (const line of nonEmpty) if (CAUTION_PREFIX_RE.test(line)) add("L11", "warn", "caution_prefix", line)

  // L12 본문 링크.
  if (URL_RE.test(text)) add("L12", "fail", "url")
  if (MARKDOWN_LINK_RE.test(text)) add("L12", "fail", "markdown_link")
  if (IMAGE_PATH_RE.test(text)) add("L12", "fail", "image_path")
  if (SCREENSHOT_RE.test(text)) add("L12", "fail", "screenshot_ref")

  // L13 복합 꼴.
  if (compound) out.push(...lintCompound(text, { segments: options.segments ?? 0, bound: options.bound, head: headMode ?? undefined }))

  // L14 받을 정보.
  if (findSafetyViolations(text).some((rule) => rule.key === "pii_request")) add("L14", "fail", "pii_request")
  for (const sentence of splitSentences(text)) {
    const match = sentence.match(ASK_INFO_RE)
    if (!match) continue
    // '·'는 한 항목 안의 짝(날짜·시각)이라 나누지 않는다.
    const items = match[1].split(/\s*(?:,|\/|과\s|와\s|및\s|그리고\s|이나\s)\s*/).filter((item) => item.trim())
    if (items.length > 4) add("L14", "fail", "ask_items_4", sentence)
  }

  // L15 공백 답.
  if (options.kind === "gap") {
    if (nonEmpty.length > 4) add("L15", "fail", "gap_lines_4", String(nonEmpty.length))
    if (/추측/.test(text)) add("L15", "fail", "gap_guess")
  }

  // L16 이미 해 본 것.
  if (options.question) out.push(...lintAlreadyTried(options.question, text))

  // L17 위젯 깨짐. 복합 답의 머리 덩이("1. 주제" + 결론 줄 + 점 단계)는 위젯이 생글자 문단으로 그리는 것이 규격 꼴이라 뺀다(S10).
  const headBlocks = new Set(heads.map((head) => head.lines.join("\n")))
  for (const broken of findWidgetBreaks(text)) if (!headBlocks.has(broken.split("\n").filter((line) => line.trim()).join("\n"))) add("L17", "fail", "widget_break", broken)
  return out
}

export interface LintRuleSummary {
  /** 실패가 하나라도 있는 글 수. */
  fail: number
  /** 경고가 하나라도 있는 글 수. */
  warn: number
  /** 세부 판정별 글 수. */
  codes: Record<string, number>
}

/** 글 여럿의 lint 요약: 규칙마다 실패·경고가 있는 글 수. L1 은 결론 비율도 같이 본다(summarizeStyle firstLineConclusionRatio). */
export function summarizeLint(reports: ReadonlyArray<readonly LintFinding[]>): { n: number; rules: Record<LintRuleId, LintRuleSummary> } {
  const rules = Object.fromEntries(LINT_RULES.map((rule) => [rule.id, { fail: 0, warn: 0, codes: {} as Record<string, number> }])) as Record<LintRuleId, LintRuleSummary>
  for (const findings of reports) {
    const seen = new Set<string>()
    for (const finding of findings) {
      const bucket = rules[finding.rule]
      const levelKey = `${finding.rule}:${finding.level}`
      if (!seen.has(levelKey)) {
        seen.add(levelKey)
        bucket[finding.level] += 1
      }
      const codeKey = `${finding.rule}:${finding.code}`
      if (!seen.has(codeKey)) {
        seen.add(codeKey)
        bucket.codes[finding.code] = (bucket.codes[finding.code] ?? 0) + 1
      }
    }
  }
  return { n: reports.length, rules }
}

// ─── 카드 꼴 점검(V-14, 설계 §1-2·관문 G4) ─────────────────────────────

/** 축약 카드 꼴 상한. 길이는 공백을 넣고 줄바꿈을 빼고 센다. */
export const CARD_SHAPE_LIMITS = {
  firstLine: 60,
  stepLine: 80,
  line: 120,
  steps: 4,
  minChars: 150,
  maxChars: 300,
  /** 순서가 결과를 바꾸는 4단계 카드. */
  maxCharsOrdered: 350,
  blocks: 4,
  clarifyOptionsMin: 2,
  clarifyOptionsMax: 3,
  clarifyOptionChars: 25,
} as const

export function cardChars(text: string): number {
  return text.replace(/\r?\n/g, "").length
}

export interface CardShapeFinding {
  code: string
  /** error: 새 조각 카드에서 오류(기존 카드는 경고로 낮춘다). warning: 늘 경고. */
  level: "error" | "warning"
  detail: string
}

/** 되묻기 선택지: "…?"로 끝나는 줄 바로 뒤에 이어지는 점 목록 줄. 없으면 null(되묻기 카드가 아님). */
export function clarifyOptionsOf(text: string): string[] | null {
  for (const lines of blocksOf(text)) {
    const at = lines.findIndex((line) => /[?？]\s*$/.test(line.trim()))
    if (at < 0) continue
    const options: string[] = []
    for (const line of lines.slice(at + 1)) {
      if (!BULLET_LINE_RE.test(line)) break
      options.push(line.replace(LIST_LINE_RE, "").trim())
    }
    if (options.length > 0) return options
  }
  return null
}

/**
 * 축약 카드 꼴(첫 줄 60·단계 줄 80·줄 120·단계 4개 이하·카드 150~300자, 순서 의존 4단계면 350자·되묻기 선택지 2~3개·25자 이하).
 * 하한(150자)은 기본 카드에만 두는 규칙이라 기계로는 경고만 한다(갈래·값·불가 카드는 짧아도 된다). 덩이 4개 초과·마무리 아닌 줄의 두 문장도 경고.
 */
export function checkCardShape(rawText: string): CardShapeFinding[] {
  const text = rawText.replace(/\r\n/g, "\n").trim()
  const out: CardShapeFinding[] = []
  const nonEmpty = text.split("\n").map((line) => line.trim()).filter(Boolean)
  const first = nonEmpty[0] ?? ""
  const L = CARD_SHAPE_LIMITS
  if (first.length > L.firstLine) out.push({ code: "first_line_60", level: "error", detail: `${first.length}자: ${clip(first)}` })
  for (const line of nonEmpty) {
    if (line.length > L.line) out.push({ code: "line_120", level: "error", detail: `${line.length}자: ${clip(line)}` })
    else if (LIST_LINE_RE.test(line) && line.length > L.stepLine) out.push({ code: "step_line_80", level: "error", detail: `${line.length}자: ${clip(line)}` })
  }
  const steps = nonEmpty.filter((line) => ORDERED_LINE_RE.test(line)).length
  if (steps > L.steps) out.push({ code: "steps_4", level: "error", detail: `단계 ${steps}개` })
  const chars = cardChars(text)
  const max = steps === L.steps ? L.maxCharsOrdered : L.maxChars
  if (chars > max) out.push({ code: steps === L.steps ? "chars_350" : "chars_300", level: "error", detail: `${chars}자` })
  const options = clarifyOptionsOf(text)
  if (options) {
    if (options.length < L.clarifyOptionsMin || options.length > L.clarifyOptionsMax) out.push({ code: "clarify_options", level: "error", detail: `선택지 ${options.length}개` })
    for (const option of options) if (option.length > L.clarifyOptionChars) out.push({ code: "clarify_option_25", level: "error", detail: `${option.length}자: ${clip(option)}` })
  } else if (chars < L.minChars) {
    out.push({ code: "chars_short", level: "warning", detail: `${chars}자(기본 카드면 ${L.minChars}자 이상)` })
  }
  const blocks = blocksOf(text)
  if (blocks.length > L.blocks) out.push({ code: "blocks_4", level: "warning", detail: `덩이 ${blocks.length}개` })
  for (const line of nonEmpty) {
    if (LIST_LINE_RE.test(line) || CLOSING_RE.test(line)) continue
    if (splitSentences(line).length >= 2) out.push({ code: "line_two_sentences", level: "warning", detail: clip(line) })
  }
  return out
}

/**
 * 답 색인 흔적(측정 결과 줄의 answerIndex)에서 조각 수와 번호 하나로 묶인 조각 수(L13). 조각 배열이 있으면 같은 카드로 이미 답한
 * 조각(answer·gap)을 묶임으로 센다(respond.ts buildCompound 가 그 조각을 앞 번호에 묶는다). 숫자만 있으면 묶임을 모른다(0).
 */
export function segmentShapeOfTrace(trace: unknown): { segments: number; bound: number } {
  if (typeof trace !== "object" || trace === null) return { segments: 1, bound: 0 }
  const raw = (trace as { segments?: unknown }).segments
  if (typeof raw === "number") return { segments: Math.max(1, raw), bound: 0 }
  if (!Array.isArray(raw) || raw.length === 0) return { segments: 1, bound: 0 }
  const seen = new Set<string>()
  let bound = 0
  for (const segment of raw) {
    if (typeof segment !== "object" || segment === null) continue
    const { kind, card } = segment as { kind?: unknown; card?: unknown }
    if ((kind !== "answer" && kind !== "gap") || typeof card !== "string" || !card) continue
    if (seen.has(card)) bound += 1
    else seen.add(card)
  }
  return { segments: raw.length, bound }
}
