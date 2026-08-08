/**
 * demo-signal.ts — 쇼룸/데모 일정을 CRM 우선순위 신호로 바꾼다.
 *
 * 데모는 퍼널에서 매출에 가장 가까운 상태다. 그런데 지금까지 우선순위는 데모를 전혀
 * 보지 않았다. 데모가 기록되지 않아서가 아니라, **기록되는 곳이 CRM 밖(쇼룸 구글
 * 캘린더 ICS)이었기 때문**이다. lib/showroom-ics-calendar.ts 가 이미 읽고 있었지만
 * 어드민 캘린더 화면에만 쓰였다.
 *
 * 이 모듈이 그 캘린더를 우선순위 축으로 옮긴다:
 *   예정(오늘 이후)  — 최우선. 약속이 잡힌 거래가 아직 말도 못 붙인 리드보다 위다.
 *   오늘             — 최우선.
 *   최근 완료        — 높음. 데모 직후가 후속 대화를 걸 최적 시점이다.
 *   오래된 완료      — 신호 없음. 두 달 전 데모는 지금의 온도가 아니다.
 *
 * ── 매칭의 한계(정직하게) ──────────────────────────────────────
 * 캘린더 제목은 자유 텍스트다("갈무리국어학원 데모(쇼룸)", "왕수학 커밍(희성)").
 * 고객을 가리키는 명시적 키가 없어서 이름으로 맞춰야 하고, 그래서 전수 매칭은 안 된다
 * (2026-08-05 실측 7건 중 3건). 못 붙인 일정은 버리지 않고 unmatched 로 돌려준다 —
 * 화면에서 "데모 N건 · 고객 연결 안 됨"으로 보여야지, 조용히 사라지면 안 된다.
 */
import type { CalendarEvent } from "@/lib/calendar-data"

const DAY_MS = 86_400_000
/** 데모 직후 후속 대화가 유효한 기간. 이 뒤로는 신호를 끈다. */
const RECENT_DEMO_DAYS = 14
/**
 * 이름 매칭 최소 길이. 실측상 org 가 "수학"·"학원" 처럼 두 글자짜리 쓰레기 값인 리드가
 * 있어서, 이 가드가 없으면 "홍성 프라임수학" 이 "수학" 리드에 붙는 오검출이 난다.
 */
const MIN_MATCH_LENGTH = 4

/** 제목에서 고객명이 아닌 부분 — 정제해서 매칭 후보를 만든다. */
const TITLE_NOISE = /(데모|쇼룸|방문|미팅|설치팀|hw|설치|커밍|만남|상담|일정|예약|\(.*?\))/gi

export type DemoPhase = "upcoming" | "today" | "recent"

export interface DemoSignal {
  /** 캘린더 원본 제목 */
  title: string
  /** 제목에서 뽑아낸 고객명 후보 */
  customerName: string
  date: string
  phase: DemoPhase
  /** 오늘 기준 며칠 뒤(음수면 지났음) */
  daysFromNow: number
}

export interface DemoSignalIndex {
  /** 정규화된 고객명 → 신호. 가장 임박한(또는 가장 최근) 것 하나만 남긴다. */
  byName: Map<string, DemoSignal>
  /** 고객을 못 붙인 일정 — 숨기지 않고 화면에 건수로 노출한다. */
  unmatched: DemoSignal[]
  /** 신호로 살아남은 전체 수(예정+오늘+최근) */
  total: number
}

export function normalizeDemoName(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s()[\]·・_-]/g, "")
}

/** "갈무리국어학원 데모(쇼룸)" → "갈무리국어학원" */
export function extractDemoCustomerName(title: string): string {
  return title.replace(TITLE_NOISE, " ").replace(/\s+/g, " ").trim()
}

/** 캘린더 일정이 데모/방문 성격인지 — 쇼룸 캘린더에는 설치팀 미팅 같은 것도 섞인다. */
function isDemoLike(event: CalendarEvent): boolean {
  const haystack = `${event.title} ${event.description ?? ""}`.toLowerCase()
  return /데모|쇼룸|방문|커밍|demo/.test(haystack)
}

function classify(dateKey: string, todayKey: string, daysFromNow: number): DemoPhase | null {
  if (dateKey === todayKey) return "today"
  if (daysFromNow > 0) return "upcoming"
  if (daysFromNow >= -RECENT_DEMO_DAYS) return "recent"
  return null
}

/**
 * 캘린더 이벤트 목록을 데모 신호 색인으로 바꾼다.
 * 캘린더 조회 자체는 호출자가 한다(서버 전용 의존을 이 모듈에 들이지 않기 위해).
 */
export function buildDemoSignalIndex(events: CalendarEvent[], now: Date): DemoSignalIndex {
  const todayKey = toDateKey(now)
  const todayMs = new Date(`${todayKey}T00:00:00`).getTime()
  const byName = new Map<string, DemoSignal>()
  const unmatched: DemoSignal[] = []
  let total = 0

  for (const event of events) {
    if (!isDemoLike(event)) continue
    const dateKey = event.date
    if (!dateKey) continue

    const daysFromNow = Math.round((new Date(`${dateKey}T00:00:00`).getTime() - todayMs) / DAY_MS)
    const phase = classify(dateKey, todayKey, daysFromNow)
    if (!phase) continue

    const customerName = extractDemoCustomerName(event.title)
    const signal: DemoSignal = { title: event.title, customerName, date: dateKey, phase, daysFromNow }
    total += 1

    const key = normalizeDemoName(customerName)
    if (!key || key.length < MIN_MATCH_LENGTH) {
      unmatched.push(signal)
      continue
    }

    // 같은 고객에 일정이 여럿이면 더 임박한 쪽(예정 > 오늘 > 최근)을 남긴다.
    const existing = byName.get(key)
    if (!existing || phaseRank(signal.phase) < phaseRank(existing.phase)) byName.set(key, signal)
  }

  return { byName, unmatched, total }
}

function phaseRank(phase: DemoPhase) {
  return phase === "today" ? 0 : phase === "upcoming" ? 1 : 2
}

/**
 * 이 고객명에 걸린 데모 신호를 찾는다.
 * 완전일치 → 포함관계(양방향) 순. 둘 다 MIN_MATCH_LENGTH 가드를 지난 이름끼리만 본다.
 */
export function findDemoSignal(
  index: DemoSignalIndex,
  customerName: string | null | undefined
): DemoSignal | null {
  const key = normalizeDemoName(customerName)
  if (!key || key.length < MIN_MATCH_LENGTH) return null

  const exact = index.byName.get(key)
  if (exact) return exact

  for (const [name, signal] of index.byName) {
    if (name.includes(key) || key.includes(name)) return signal
  }
  return null
}

/** 우선순위 가산점. 예정·당일이 가장 무겁다. */
export function demoSignalLift(signal: DemoSignal | null): number {
  if (!signal) return 0
  if (signal.phase === "today") return 46
  if (signal.phase === "upcoming") return signal.daysFromNow <= 7 ? 44 : 34
  // 최근 완료 — 직후일수록 후속 대화가 유효하다.
  return signal.daysFromNow >= -3 ? 30 : 18
}

export function demoSignalLabel(signal: DemoSignal): string {
  if (signal.phase === "today") return "오늘 데모"
  if (signal.phase === "upcoming") {
    return signal.daysFromNow === 1 ? "내일 데모" : `데모 ${signal.daysFromNow}일 뒤`
  }
  const ago = Math.abs(signal.daysFromNow)
  return ago === 0 ? "데모 완료" : `데모 ${ago}일 전 완료`
}

function toDateKey(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
