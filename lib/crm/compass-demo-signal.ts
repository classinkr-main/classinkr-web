/**
 * compass-demo-signal.ts — 데모를 CRM 우선순위 축으로 바꾼다. 근거는 **실측**이다.
 *
 * 앞선 구현(lib/crm/demo-signal.ts, 삭제됨)은 쇼룸 구글 캘린더 ICS 제목을 키워드로
 * 긁어 고객명을 추측했다. 제목이 자유 텍스트라 전수 매칭이 불가능했고(2026-08-05 실측
 * 7건 중 3건), 파일 스스로 그 오차를 자백하고 있었다.
 *
 * 이제 원천은 Compass(마케팅팀 앱)의 `crm.lead_demos` 실측 레코드다:
 *   데모 행 → lead_id → Compass 리드의 정규화 전화키(phone_key) → 우리 리드/계정의 전화
 * 전 구간이 동등 비교다. 이름 유사도·부분 문자열 추측은 이 모듈에 없다.
 *
 * 붙지 않은 데모는 버리지 않고 unmatched 건수로 남긴다 — "데모가 없다"로 오인되면 안 된다.
 *
 * 단계 규칙(이전 구현과 동일하게 유지 — 점수 연속성):
 *   예정 / 오늘 = 최우선, 최근 완료(14일) = 높음, 그보다 오래된 완료 = 신호 없음.
 */
import { normalizePhoneKey } from "@/lib/compass/normalize"

const DAY_MS = 86_400_000
/** 데모 직후 후속 대화가 유효한 기간. 이 뒤로는 신호를 끈다. */
export const RECENT_DEMO_DAYS = 14

export type CompassDemoPhase = "upcoming" | "today" | "recent"

/** 브리지 행에서 신호에 실제로 쓰는 필드만. memo(자유 텍스트)는 의도적으로 제외한다. */
export interface CompassDemoLike {
  id: number
  lead_id: number | null
  day: string | null
  status: string | null
  owner: string | null
  day_approx: boolean | null
}

/** 소스 수집 결과(원본). 단계 판정은 요청 시각으로 다시 하므로 여기엔 phase가 없다. */
export interface CompassDemoSource {
  demos: CompassDemoLike[]
  /** Compass lead_id → 그 리드의 정규화 전화키(우리 쪽과 교집합인 것만) */
  phoneKeysByCompassLeadId: Map<number, string[]>
  /** 브리지가 끊겼는지 — 화면은 "데모 없음"이 아니라 "연결 끊김"으로 말해야 한다 */
  down: boolean
}

export interface CompassDemoSignal {
  /** crm.lead_demos.id */
  demoId: number
  compassLeadId: number
  /** 매칭 근거(정규화 전화키) — 추측이 아니라 동등 비교임을 증명하는 필드 */
  phoneKey: string
  date: string
  phase: CompassDemoPhase
  /** 오늘 기준 며칠 뒤(음수면 지났음) */
  daysFromNow: number
  /** Compass 기록 상태(booked·done 등) */
  status: string | null
  owner: string | null
  /** Compass가 날짜를 대략치로 기록한 건 — 라벨에 그대로 드러낸다 */
  dayApprox: boolean
}

export interface CompassDemoIndex {
  /** 정규화 전화키 → 신호. 같은 고객에 여럿이면 가장 임박한 것 하나. */
  byPhoneKey: Map<string, CompassDemoSignal>
  /** 단계에 걸렸지만 우리 쪽 전화로 붙지 않은 데모 수 — 숨기지 않고 노출한다 */
  unmatched: number
  /** 단계에 걸린 전체 데모 수(예정+오늘+최근) */
  total: number
  down: boolean
}

export const EMPTY_COMPASS_DEMO_SOURCE: CompassDemoSource = {
  demos: [],
  phoneKeysByCompassLeadId: new Map(),
  down: false,
}

export const EMPTY_COMPASS_DEMO_INDEX: CompassDemoIndex = {
  byPhoneKey: new Map(),
  unmatched: 0,
  total: 0,
  down: false,
}

function toDateKey(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function classify(dateKey: string, todayKey: string, daysFromNow: number): CompassDemoPhase | null {
  if (dateKey === todayKey) return "today"
  if (daysFromNow > 0) return "upcoming"
  if (daysFromNow >= -RECENT_DEMO_DAYS) return "recent"
  return null
}

function phaseRank(phase: CompassDemoPhase) {
  return phase === "today" ? 0 : phase === "upcoming" ? 1 : 2
}

/** 수집한 원본을 요청 시각(now) 기준 신호 색인으로 바꾼다. 순수 함수. */
export function buildCompassDemoIndex(source: CompassDemoSource, now: Date): CompassDemoIndex {
  const todayKey = toDateKey(now)
  const todayMs = new Date(`${todayKey}T00:00:00`).getTime()
  const byPhoneKey = new Map<string, CompassDemoSignal>()
  let unmatched = 0
  let total = 0

  for (const demo of source.demos) {
    const dateKey = demo.day?.slice(0, 10)
    if (!dateKey) continue

    const daysFromNow = Math.round((new Date(`${dateKey}T00:00:00`).getTime() - todayMs) / DAY_MS)
    if (!Number.isFinite(daysFromNow)) continue
    const phase = classify(dateKey, todayKey, daysFromNow)
    if (!phase) continue

    total += 1

    const phoneKeys = demo.lead_id != null ? source.phoneKeysByCompassLeadId.get(demo.lead_id) : undefined
    if (!phoneKeys || phoneKeys.length === 0) {
      unmatched += 1
      continue
    }

    for (const phoneKey of phoneKeys) {
      const signal: CompassDemoSignal = {
        demoId: demo.id,
        compassLeadId: demo.lead_id as number,
        phoneKey,
        date: dateKey,
        phase,
        daysFromNow,
        status: demo.status,
        owner: demo.owner,
        dayApprox: Boolean(demo.day_approx),
      }
      const existing = byPhoneKey.get(phoneKey)
      if (!existing || phaseRank(signal.phase) < phaseRank(existing.phase)) {
        byPhoneKey.set(phoneKey, signal)
      }
    }
  }

  return { byPhoneKey, unmatched, total, down: source.down }
}

/** 이 전화번호에 걸린 데모 신호. 정규화 키 완전일치만 본다(부분일치·이름 추측 없음). */
export function findCompassDemoSignal(
  index: CompassDemoIndex,
  phone: string | null | undefined
): CompassDemoSignal | null {
  const key = normalizePhoneKey(phone)
  if (!key) return null
  return index.byPhoneKey.get(key) ?? null
}

/** 우선순위 가산점. 예정·당일이 가장 무겁다(이전 demo-signal 과 동일 값). */
export function compassDemoLift(signal: CompassDemoSignal | null): number {
  if (!signal) return 0
  if (signal.phase === "today") return 46
  if (signal.phase === "upcoming") return signal.daysFromNow <= 7 ? 44 : 34
  return signal.daysFromNow >= -3 ? 30 : 18
}

export function compassDemoLabel(signal: CompassDemoSignal): string {
  const base =
    signal.phase === "today"
      ? "오늘 데모"
      : signal.phase === "upcoming"
        ? signal.daysFromNow === 1
          ? "내일 데모"
          : `데모 ${signal.daysFromNow}일 뒤`
        : Math.abs(signal.daysFromNow) === 0
          ? "데모 완료"
          : `데모 ${Math.abs(signal.daysFromNow)}일 전 완료`
  // Compass가 날짜를 대략치로 적은 건은 그렇다고 말한다 — 확정 일정처럼 보이면 안 된다.
  return signal.dayApprox ? `${base} · 날짜 추정` : base
}
