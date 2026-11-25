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

export const EMPTY_LEAD_RE = /^(이렇게 하면 (돼|됩)니?다?요?|아래 순서대로|다음 순서대로|아래와 같이|다음과 같이|두 가지|세 가지|먼저 .{0,12}(알려|안내)드)/
export const ANNOUNCE_RE = /(:|：)\s*$|(알려|안내|설명|말씀)\s?드(릴게요|리겠습니다|립니다)[.!]?$/
export const EMPATHY_RE = /^(불편|죄송|걱정|힘드|속상|당황|많이 놀)/
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

export type FirstLineVerdict = "conclusion" | "empty_lead" | "announce" | "empathy" | "too_long" | "yesno_miss"

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

/** 첫 줄 결론 규칙 판정(R2 계획 §4.1 규칙 1). */
export function judgeFirstLine(first: string, asks: readonly string[] | null | undefined): FirstLineVerdict {
  const sentence = first.trim()
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
  const firstLine: Record<FirstLineVerdict, number> = { conclusion: 0, empty_lead: 0, announce: 0, empathy: 0, too_long: 0, yesno_miss: 0 }
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
