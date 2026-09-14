/** 칸반 한 줄 입력 해석 — 아무렇게나 적어도 담당자·날짜를 뽑아내고 나머지를 할 일로 남긴다.
 *  이식 출처: /home/user/crm/lib/taskParse.ts (Compass 칸반 파서) — 담당자·날짜 추출 로직과
 *  정규식은 원본과 동일하게 옮겼다. taskType 키워드 추론은 Admin 전용 신규 로직으로,
 *  Compass 원본(lib/taskParse.ts)에는 없다.
 *
 *  예) "내일까지 신희성 광고 소재 정리" → 제목 "광고 소재 정리" · 담당 신희성 · 마감 내일
 *      "8/5~8/9 랜딩 개편"           → 기간 8/5–8/9
 *      "@소망 다음주 월요일 견적서"    → 담당 진소망 · 마감 다음 주 월요일 · 유형 견적 */

import type { CrmTaskType } from "@/lib/repositories/crm-tasks"

const pad2 = (n: number) => String(n).padStart(2, "0")

function shift(iso: string, days: number) {
  const t = new Date(`${iso}T00:00:00Z`).getTime() + days * 86400000
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** M/D → 오늘 기준 가장 가까운 날짜 (반년 이상 지났으면 내년). 달·일이 범위 밖이면 null —
 *  "19/99" 같은 게 날짜로 둔갑해 DB insert가 터지던 사고 방지 */
function mkDate(mm: number, dd: number, today: string) {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const year = Number(today.slice(0, 4))
  const d = `${year}-${pad2(mm)}-${pad2(dd)}`
  return d < shift(today, -180) ? `${year + 1}${d.slice(4)}` : d
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"]

/** 요일 이름 → 이번 주(지났으면 다음 주) 그 요일. nextWeek면 한 주 더 민다 */
function dowDate(name: string, today: string, nextWeek: boolean) {
  const want = DOW.indexOf(name)
  if (want < 0) return null
  const cur = new Date(`${today}T00:00:00Z`).getUTCDay()
  let diff = want - cur
  if (diff < 0) diff += 7
  return shift(today, diff + (nextWeek ? 7 : 0))
}

// Admin 전용 taskType 키워드 추론(Compass 원본에는 없음). 토큰(공백 분리) 단위로만 검사해
// "리콜"이 "콜"에, "회의실" 같은 합성어 조각이 잘못 걸리지 않게 한다 — 한국어는 조사가
// 항상 뒤에 붙으므로 토큰 접두(prefix) 일치면 충분하다. 키워드는 제목에서 제거하지
// 않는다(제목은 사람이 읽는 문장이라 그대로 둔다). 우선순위는 배열 순서.
const TASK_TYPE_KEYWORDS: Array<[CrmTaskType, string[]]> = [
  ["call", ["콜", "전화", "통화"]],
  ["kakao", ["카톡", "카카오"]],
  ["email", ["메일", "이메일"]],
  ["meeting", ["미팅", "회의", "방문"]],
  ["quote", ["견적"]],
  ["demo", ["데모", "시연"]],
  ["install", ["설치"]],
  ["renewal", ["갱신", "재계약"]],
  ["cs_checkin", ["cs", "체크인"]],
  ["data_fix", ["데이터", "정정"]],
]

function inferTaskType(raw: string): CrmTaskType | null {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase())
  for (const [type, keywords] of TASK_TYPE_KEYWORDS) {
    if (tokens.some((token) => keywords.some((keyword) => token.startsWith(keyword)))) return type
  }
  return null
}

export interface ParsedQuickTask {
  title: string
  ownerNames: string[]
  start: string | null
  due: string | null
  taskType: CrmTaskType | null
}

export interface ParseQuickTaskOptions {
  /** 담당자 후보 — displayName·ownerAliases를 합친 목록. */
  memberNames: string[]
  /** 호출자가 KST 기준으로 넘기는 오늘 날짜, YYYY-MM-DD. (이 모듈은 순수 함수만 둔다) */
  today: string
}

export function parseQuickTask(raw: string, opts: ParseQuickTaskOptions): ParsedQuickTask {
  const members = opts.memberNames
  const today = opts.today
  let s = ` ${raw.trim()} `
  let start: string | null = null
  let due: string | null = null
  const owners: string[] = []

  // take가 false를 돌려주면(날짜가 유효 범위 밖) 소비하지 않는다 — 제목이 안 잘려나가게
  const eat = (re: RegExp, take: (m: RegExpMatchArray) => unknown) => {
    const m = s.match(re)
    if (!m) return false
    if (take(m) === false) return false
    s = s.replace(re, " ")
    return true
  }

  // 1) 기간 — 8/5~8/9 · 8/5 ~ 8/9. 숫자 경계 필수("2026/09"의 26/09 오인 방지)
  eat(/(?<!\d)(\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})(?!\d)/, (m) => {
    const a = mkDate(+m[1], +m[2], today)
    const b = mkDate(+m[3], +m[4], today)
    if (!a || !b) return false
    start = a
    due = b
  })
  // 2) 마감만 — ~8/9 · 8/9까지 · 8월 9일 · 8/9(단독 토큰만 — "3/4분기"는 안 먹는다)
  // (eslint no-unused-expressions 회피용 void — 순서대로 시도해 먼저 먹힌 패턴에서 멈추는
  //  단락(short-circuit) 체인 자체는 원본과 동일하다)
  if (!due) {
    void (
      eat(/~\s*(\d{1,2})\/(\d{1,2})(?!\d)/, (m) => (due = mkDate(+m[1], +m[2], today)) !== null || false) ||
      eat(/(?<!\d)(\d{1,2})월\s*(\d{1,2})일(?:까지)?/, (m) => (due = mkDate(+m[1], +m[2], today)) !== null || false) ||
      eat(/(?<=\s)(\d{1,2})\/(\d{1,2})(?:까지)?(?=\s)/, (m) => (due = mkDate(+m[1], +m[2], today)) !== null || false)
    )
  }
  // 3) 말로 쓴 날짜 — 오늘·내일·모레·글피 / (이번주·다음주) 요일 / 다음주
  if (!due) {
    void (
      eat(/\s(오늘)(?:까지)?\s/, () => (due = today)) ||
      eat(/\s(내일)(?:까지)?\s/, () => (due = shift(today, 1))) ||
      eat(/\s(모레)(?:까지)?\s/, () => (due = shift(today, 2))) ||
      eat(/\s글피(?:까지)?\s/, () => (due = shift(today, 3))) ||
      eat(/\s(?:다음\s?주|담주)\s*([월화수목금토일])요일(?:까지)?\s/, (m) => (due = dowDate(m[1], today, true))) ||
      eat(/\s(?:이번\s?주|금주)\s*([월화수목금토일])요일(?:까지)?\s/, (m) => (due = dowDate(m[1], today, false))) ||
      eat(/\s([월화수목금토일])요일(?:까지)?\s/, (m) => (due = dowDate(m[1], today, false))) ||
      eat(/\s(?:다음\s?주|담주)(?:까지)?\s/, () => (due = dowDate("금", today, true)))
    )
  }
  if (start && due && start > due) [start, due] = [due, start]

  // 4) 담당자 — @이름 먼저, 그다음 팀원 이름(성 뺀 두 글자도 인정).
  // 이름은 정규식 이스케이프(특수문자 이름이 파서 전체를 죽이지 않게), 겹치는 두 글자는 안 쓴다
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const shortCount = new Map<string, number>()
  for (const n of members)
    if (n.length === 3) shortCount.set(n.slice(1), (shortCount.get(n.slice(1)) ?? 0) + 1)
  for (const name of members) {
    const short = name.length === 3 && shortCount.get(name.slice(1)) === 1 ? name.slice(1) : name
    for (const key of [name, short]) {
      const re = new RegExp(`\\s@?${esc(key)}(?:님|씨)?\\s`)
      if (re.test(s)) {
        if (!owners.includes(name)) owners.push(name)
        s = s.replace(re, " ")
        break
      }
    }
  }

  const title = s.replace(/\s+/g, " ").replace(/^[\s·,]+|[\s·,]+$/g, "").trim()
  return { title, ownerNames: owners, start, due, taskType: inferTaskType(raw) }
}
