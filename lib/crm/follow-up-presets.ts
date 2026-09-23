/**
 * 리드 드로어 팔로업 프리셋 — 날짜 계산은 전부 KST(UTC+9) 일 경계로 고정한다.
 *
 * 서버 런타임 타임존(대개 UTC)이나 브라우저 로컬 타임존에 계산을 맡기면 자정 근처에서 "오늘"이
 * "내일"로 밀리는 사고가 난다. lib/crm/leads-board-state.ts 의 toLocalDateKey 는 호스트 타임존
 * (`Date#getTimezoneOffset`)을 쓰므로 이 목적에는 맞지 않는다 — 이 파일은 그 헬퍼를 재사용하지
 * 않고, KST 오프셋을 코드에 고정해 호스트 환경과 무관하게 같은 날짜를 낸다.
 *
 * 순수 함수만 둔다 — LeadDrawer.tsx/ContactLogForm.tsx 에서 값을 만들 뿐 여기서 입출력을 하지 않는다.
 */

export type FollowUpPresetId = "today" | "tomorrow" | "in3" | "next_monday"

export interface FollowUpPreset {
  id: FollowUpPresetId
  label: string
}

export const FOLLOW_UP_PRESETS: FollowUpPreset[] = [
  { id: "today", label: "오늘" },
  { id: "tomorrow", label: "내일" },
  { id: "in3", label: "3일 뒤" },
  { id: "next_monday", label: "다음 주 월" },
]

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAY_LABEL_KO = ["일", "월", "화", "수", "목", "금", "토"] as const

/** 임의 시각(ms)이 속하는 KST 달력일 키("YYYY-MM-DD"). UTC getter로 읽어 호스트 타임존 영향을 없앤다. */
function toKstDateKey(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0")
  const d = String(kst.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** "YYYY-MM-DD" → 그 날짜 KST 자정에 해당하는 UTC ms. 날짜 간 간격 계산에만 쓴다. */
function kstDateKeyToUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1) - KST_OFFSET_MS
}

/** KST 기준 요일(0=일 … 6=토). Date.UTC 계산이라 호스트 타임존 영향을 받지 않는다. */
function kstDayOfWeek(ms: number): number {
  return new Date(ms + KST_OFFSET_MS).getUTCDay()
}

/**
 * 프리셋 id → "YYYY-MM-DD"(KST 일 경계).
 * "다음 주 월"은 오늘이 월요일이면 +7일(그다음 주 월요일), 그 외에는 이번 주 안에 남은 가장 가까운
 * 월요일(내일일 수도 있다 — 예: 오늘이 일요일이면 다음 주 월 == 내일)이다.
 */
export function resolveFollowUpPreset(id: FollowUpPresetId, nowMs: number): string {
  if (id === "today") return toKstDateKey(nowMs)
  if (id === "tomorrow") return toKstDateKey(nowMs + DAY_MS)
  if (id === "in3") return toKstDateKey(nowMs + 3 * DAY_MS)
  // next_monday
  const dow = kstDayOfWeek(nowMs) // 0=일 ... 1=월 ... 6=토
  const daysUntilMonday = (1 - dow + 7) % 7 || 7 // 오늘이 월요일(dow=1)이면 나머지가 0 → 7로 보정.
  return toKstDateKey(nowMs + daysUntilMonday * DAY_MS)
}

/**
 * 날짜 키를 짧은 한국어 라벨로. 오늘/내일은 고정 문구, 그 뒤 엿새(D-1~D-6)는 D-day 카운트,
 * 그보다 멀거나 지난 날짜는 "M/D (요일)". 지난 날짜에 음수 D-day("D-3"이 "3일 전"으로 오독될 수
 * 있다)를 만들지 않으려고 과거는 항상 M/D 포맷으로 떨어뜨린다 — 지남 경고 자체는 드로어가 별도로 그린다.
 */
export function describeFollowUpDate(dateKey: string, nowMs: number): string {
  const todayKey = toKstDateKey(nowMs)
  if (dateKey === todayKey) return "오늘"
  const tomorrowKey = toKstDateKey(nowMs + DAY_MS)
  if (dateKey === tomorrowKey) return "내일"
  const diffDays = Math.round((kstDateKeyToUtcMs(dateKey) - kstDateKeyToUtcMs(todayKey)) / DAY_MS)
  if (diffDays > 0 && diffDays <= 6) return `D-${diffDays}`
  const [y, m, d] = dateKey.split("-").map(Number)
  const weekday = WEEKDAY_LABEL_KO[new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()]
  return `${m}/${d} (${weekday})`
}

export interface FollowUpQuickSuggestion {
  id: "tomorrow" | "in3"
  label: string
  dateKey: string
}

/**
 * ContactLogForm이 연락 결과 저장 성공 직후 보여줄 제안 칩. 이미 그 날짜가 현재 팔로업이면
 * 같은 날짜를 다시 제안하지 않는다(둘 다 지워지는 일은 없다 — tomorrow/in3는 서로 다른 날짜다).
 */
export function buildFollowUpQuickSuggestions(input: {
  nowMs: number
  currentFollowUpDate?: string | null
}): FollowUpQuickSuggestion[] {
  const current = input.currentFollowUpDate || ""
  const candidates: FollowUpQuickSuggestion[] = [
    { id: "tomorrow", label: "팔로업 내일", dateKey: resolveFollowUpPreset("tomorrow", input.nowMs) },
    { id: "in3", label: "팔로업 3일 뒤", dateKey: resolveFollowUpPreset("in3", input.nowMs) },
  ]
  return candidates.filter((item) => item.dateKey !== current)
}
