// lib/marketing/input-normalize.ts
// 마케팅/캠페인 입력 화면의 숫자 정규화 SSOT.
//
// 정본 규칙 = Math.floor + ">= 0 클램프". 원래 ChannelBudgetTable·EventMetricsQuickTable 이
// 각자 들고 있던 규칙인데, 같은 저장소의 다른 입력 화면(MetricsEditor·캠페인/프로젝트 드로어)이
// 서로 다른 검증(음수 통과, 소수 통과, 음수를 조용히 null 로 버림)을 하고 있어 여기로 모았다.
//
// 정직 규칙: 0 과 null(미입력)은 반드시 구분한다. 빈 입력은 "0 건"이 아니라 "아직 안 셈"이므로
// null 을 돌려주고, 소비처(퍼널·경제성 계산)는 그 차이로 "—" 와 "0" 을 갈라 표시한다.

/** 입력값을 숫자로 읽어본다. 빈값/비수치는 null(미입력). */
function toFiniteNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * 건수 입력 정규화. 빈값·비수치 → null(미입력), 음수 → 0, 소수 → floor.
 * 건수는 음수가 의미를 갖지 않으므로 0 으로 클램프한다(저장은 되게 하되 거짓 음수는 남기지 않는다).
 */
export function clampCount(raw: string | number | null | undefined): number | null {
  const n = toFiniteNumber(raw)
  if (n == null) return null
  return Math.max(0, Math.floor(n))
}

/**
 * 금액(원) 입력 정규화. 규칙은 clampCount 와 같다 — 원 단위 정수만 저장한다.
 * 이름을 나눠 둔 이유는 호출부에서 "건수인지 금액인지"가 드러나게 하기 위함이다.
 */
export function clampMoney(raw: string | number | null | undefined): number | null {
  return clampCount(raw)
}

/** 예산 입력 판정 결과 — 정수 ≥ 0, null(미설정), "invalid"(음수·비수치). */
export type BudgetInput = number | null | "invalid"

/** 예산 입력 시 보여줄 문구(캠페인·프로젝트 드로어 공용). */
export const BUDGET_INVALID_MESSAGE = "예산은 0 이상만 입력할 수 있습니다."

/**
 * 예산 문자열 판정. 빈값 → null(예산 미설정), 정수 ≥ 0 → number, 그 외 → "invalid".
 *
 * 건수/금액과 달리 0 으로 클램프하지 않는다. 서버 sanitizer 가 음수 예산을 하드 게이트로
 * 거부하는데(lib/marketing/campaign-sanitize.ts·project-sanitize.ts), 클라이언트가 음수를
 * 조용히 null 로 바꿔 보내면 "예산 없음"으로 저장돼 사용자는 유실 사실조차 모른다.
 * 그래서 여기서는 판정만 하고, 호출부가 폼 검증 에러로 표면화한다.
 */
export function parseBudgetInput(raw: string): BudgetInput {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return "invalid"
  if (n < 0) return "invalid"
  return Math.floor(n)
}
