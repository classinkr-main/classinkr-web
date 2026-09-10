import { describe, expect, it } from "vitest"
import { formatWithCommas, moneyInputHint, parseMoneyInput, shouldResyncDraft } from "@/components/admin/AdminMoneyInput"

// 공용 금액 입력의 순수 로직 계약. 화면(캐럿·IME)은 DOM 없이 검증할 수 없으므로
// 여기서는 "무엇을 보여주고 무엇을 커밋하는가"만 못 박는다.

describe("formatWithCommas", () => {
  it("inserts thousand separators every three digits", () => {
    expect(formatWithCommas("12000000")).toBe("12,000,000")
    expect(formatWithCommas("1234567")).toBe("1,234,567")
    expect(formatWithCommas("999")).toBe("999")
    expect(formatWithCommas("1000")).toBe("1,000")
  })

  it("round-trips with parseMoneyInput — 콤마를 넣었다 빼도 같은 수", () => {
    for (const raw of ["0", "7", "1000", "1234567", "90071992547409"]) {
      const formatted = formatWithCommas(raw)
      expect(parseMoneyInput(formatted)).toBe(Number(raw))
      // 이미 포맷된 문자열을 다시 넣어도 콤마가 겹치지 않는다.
      expect(formatWithCommas(formatted)).toBe(formatted)
    }
  })

  it("strips leading zeros but keeps a lone zero", () => {
    expect(formatWithCommas("007")).toBe("7")
    expect(formatWithCommas("0")).toBe("0")
    expect(formatWithCommas("000")).toBe("0")
    expect(formatWithCommas("012000")).toBe("12,000")
  })

  it("returns an empty string for empty/non-numeric input so placeholder shows", () => {
    expect(formatWithCommas("")).toBe("")
    expect(formatWithCommas("   ")).toBe("")
    expect(formatWithCommas("ㅁㄴㅇㄹ")).toBe("")
  })

  it("drops 한글/문자 mixed into the digits", () => {
    expect(formatWithCommas("12만000")).toBe("12,000")
    expect(formatWithCommas("₩ 1,200,000원")).toBe("1,200,000")
    expect(formatWithCommas("abc500def")).toBe("500")
  })

  it("truncates the decimal part instead of concatenating it (12.5 는 125 가 아니다)", () => {
    expect(formatWithCommas("12.5")).toBe("12")
    expect(formatWithCommas("1234.99")).toBe("1,234")
  })
})

describe("parseMoneyInput", () => {
  it("returns null for empty input — 미입력은 0 이 아니다", () => {
    expect(parseMoneyInput("")).toBeNull()
    expect(parseMoneyInput("   ")).toBeNull()
  })

  it("returns null when nothing numeric survives", () => {
    expect(parseMoneyInput("없음")).toBeNull()
    expect(parseMoneyInput("abc")).toBeNull()
  })

  it("parses formatted and unformatted digits identically", () => {
    expect(parseMoneyInput("12,000,000")).toBe(12_000_000)
    expect(parseMoneyInput("12000000")).toBe(12_000_000)
    expect(parseMoneyInput("₩12,000,000")).toBe(12_000_000)
  })

  it("keeps 0 distinct from null — 측정된 0 은 보존한다", () => {
    expect(parseMoneyInput("0")).toBe(0)
    expect(parseMoneyInput("000")).toBe(0)
  })

  it("floors decimals (원화는 정수 도메인)", () => {
    expect(parseMoneyInput("1234.9")).toBe(1234)
    expect(parseMoneyInput("0.9")).toBe(0)
    // 정수부가 없으면 금액으로 보지 않는다.
    expect(parseMoneyInput(".5")).toBeNull()
  })

  it("clamps negatives to 0 rather than flipping the sign", () => {
    // 정책: 음수는 금액 도메인에 없다 → 0. 부호만 지우면 -5000 이 5000 으로 조용히 뒤집힌다.
    expect(parseMoneyInput("-5000")).toBe(0)
    expect(parseMoneyInput("−5000")).toBe(0)
    expect(parseMoneyInput("-")).toBe(0)
  })

  it("clamps very large numbers to MAX_SAFE_INTEGER", () => {
    expect(parseMoneyInput("999999999999999999999")).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseMoneyInput(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("strips 한글 mixed with digits instead of returning NaN", () => {
    expect(parseMoneyInput("12만")).toBe(12)
    expect(parseMoneyInput("1,200원")).toBe(1200)
  })
})

/* ─── 편집 경로 합성 (applyRaw → commit) ──────────────────────────────────────
 *
 * 위의 두 describe 는 파서·포매터를 각각 직접 부른다. 그것만으로는 실제 사고를 못 잡는다 —
 * 런타임에서 parseMoneyInput 은 사용자의 원본 문자열을 절대 보지 못하고, applyRaw 가 만든
 * draft(=formatWithCommas 결과)만 본다. 실측 결함(2026-09-10): "-5000" 을 타이핑하면
 * 포매터가 부호를 먼저 지워 draft 가 "5,000" 이 되고, 커밋도 5000(양수)으로 실렸다.
 * "음수는 0" 계약이 파서 단위테스트에서만 통과하고 실사용 경로에서는 부호가 뒤집힌 것이다.
 *
 * 그래서 여기서는 화면 없이도 그 합성을 그대로 흉내 낸다.
 */

/** 붙여넣기 한 번 = 원본 문자열이 통째로 draft 가 되는 경로. */
function pasteThenCommit(raw: string): { draft: string; committed: number | null } {
  const draft = formatWithCommas(raw)
  return { draft, committed: parseMoneyInput(draft) }
}

/**
 * 한 글자씩 타이핑 = 매 keystroke 마다 직전 draft 에 글자가 붙고 다시 포맷된다.
 * (붙여넣기만 막고 타이핑을 놓치는 반쪽 수정을 걸러내는 게 이 헬퍼의 목적이다.)
 */
function typeThenCommit(keys: string): { draft: string; committed: number | null } {
  let draft = ""
  for (const key of keys) draft = formatWithCommas(draft + key)
  return { draft, committed: parseMoneyInput(draft) }
}

describe("applyRaw → commit 합성", () => {
  it("붙여넣은 음수의 부호를 도중에 잃지 않는다", () => {
    const { draft, committed } = pasteThenCommit("-5000")
    expect(draft).toBe("-5,000")
    expect(committed).toBe(0)
  })

  it("한 글자씩 타이핑한 음수도 0 으로 커밋된다 (부호 뒤집힘 금지)", () => {
    const { draft, committed } = typeThenCommit("-5000")
    expect(draft).toBe("-5,000")
    expect(committed).toBe(0)
    // 핵심 회귀: 5000 으로 뒤집히면 안 된다.
    expect(committed).not.toBe(5000)
  })

  it("유니코드 빼기표·대시류도 같은 경로에서 0 이다", () => {
    for (const raw of ["−5000", "–5000", "—5000"]) {
      expect(pasteThenCommit(raw).committed).toBe(0)
      expect(typeThenCommit(raw).committed).toBe(0)
    }
  })

  it("부호만 남은 초안은 파서 계약대로 0 (부호가 살아 있어야 다음 숫자도 음수로 읽힌다)", () => {
    expect(formatWithCommas("-")).toBe("-")
    expect(pasteThenCommit("-").committed).toBe(0)
  })

  it("이미 포맷된 음수를 다시 포맷해도 부호·콤마가 겹치지 않는다", () => {
    expect(formatWithCommas("-5,000")).toBe("-5,000")
    expect(formatWithCommas("-1,234,567")).toBe("-1,234,567")
  })

  it("숫자 뒤의 빼기표는 부호가 아니다 (raw.includes('-') 식 수정 방지)", () => {
    const { draft, committed } = pasteThenCommit("5-000")
    expect(draft).toBe("5,000")
    expect(committed).toBe(5000)
  })

  it("양수 경로는 한 글자도 달라지지 않는다", () => {
    expect(typeThenCommit("12000000")).toEqual({ draft: "12,000,000", committed: 12_000_000 })
    expect(typeThenCommit("0")).toEqual({ draft: "0", committed: 0 })
    expect(pasteThenCommit("₩ 1,200,000원")).toEqual({ draft: "1,200,000", committed: 1_200_000 })
    expect(pasteThenCommit("")).toEqual({ draft: "", committed: null })
  })
})

describe("moneyInputHint", () => {
  it("걸러낸 문자가 있으면 숫자만 받는다고 알린다", () => {
    expect(moneyInputHint("12만")).toBe("숫자만 입력할 수 있습니다")
    expect(moneyInputHint("abc")).toBe("숫자만 입력할 수 있습니다")
  })

  it("음수는 '숫자만' 이 아니라 0 으로 저장된다고 알린다 (부호는 화면에 남아 있으므로)", () => {
    expect(moneyInputHint("-5000")).toBe("음수는 0 으로 저장됩니다")
    expect(moneyInputHint("-")).toBe("음수는 0 으로 저장됩니다")
    expect(moneyInputHint("−5,000")).toBe("음수는 0 으로 저장됩니다")
  })

  it("우리가 넣은 콤마는 사용자의 비숫자 입력이 아니다", () => {
    expect(moneyInputHint("1,200,000")).toBe("")
    expect(moneyInputHint("12000")).toBe("")
    expect(moneyInputHint("")).toBe("")
  })
})

/* ─── 되먹임 호스트 (onLiveChange → value → 초안 재동기화) ────────────────────
 *
 * 위 합성 테스트는 컴포넌트가 홀로 있을 때의 경로다. 장부 주차 그리드
 * (WeeklyAmountGrid)와 입력 레일은 onLiveChange 로 받은 값을 곧바로 value 로 되먹인다
 * (value={parseMoneyInput(weekly[i])} · onLiveChange={pushAmount}).
 *
 * 그러면 음수 초안("-")이 parseMoneyInput 계약대로 0 을 올리고, 상위가 그 0 을 value 로
 * 돌려주며, 렌더 중 prop 동기화가 초안을 "0" 으로 덮어써 부호가 한 키만에 사라진다.
 * 이어지는 숫자는 다시 양수로 쌓여 결국 5000 이 저장된다 — 부호 보존만으로는 못 막는 구멍.
 */

/** toDraft(비공개)와 같은 규칙 — value 로부터 초안 문자열을 만든다. */
function draftFromValue(value: number | null, allowNull: boolean): string {
  if (value == null) return ""
  if (!allowNull && value === 0) return ""
  return formatWithCommas(String(value))
}

/** 되먹임 호스트에서 한 글자씩 타이핑 — 매 키마다 상위가 value 를 되돌려준다. */
function typeIntoLiveHost(keys: string, allowNull = true): { draft: string; committed: number | null } {
  let draft = ""
  let syncedValue: number | null = null
  for (const key of keys) {
    // applyRaw — 초안 갱신 후 onLiveChange 로 값을 올린다.
    draft = formatWithCommas(draft + key)
    const live = parseMoneyInput(draft)
    const hostValue = live == null && !allowNull ? 0 : live
    // 렌더 중 prop 동기화(react.dev 패턴) — 상위가 돌려준 canonical 값을 초안에 반영한다.
    if (hostValue !== syncedValue) {
      syncedValue = hostValue
      if (shouldResyncDraft(draft, hostValue, allowNull)) draft = draftFromValue(hostValue, allowNull)
    }
  }
  return { draft, committed: parseMoneyInput(draft) }
}

describe("shouldResyncDraft", () => {
  it("초안이 이미 그 값을 뜻하면 덮어쓰지 않는다 — 되먹임이 부호를 지우지 못하게", () => {
    // "-5,000" 은 커밋되면 0 이다. 상위가 그 0 을 돌려줬다고 초안을 "0" 으로 바꾸면
    // 사용자가 치던 부호가 사라진다.
    expect(shouldResyncDraft("-5,000", 0, true)).toBe(false)
    expect(shouldResyncDraft("-", 0, true)).toBe(false)
  })

  it("표현이 같은 값이면 재동기화하지 않는다", () => {
    expect(shouldResyncDraft("1,200", 1200, true)).toBe(false)
    expect(shouldResyncDraft("", null, true)).toBe(false)
    // allowNull=false 인 칸의 빈 초안은 0 을 뜻한다(placeholder 가 0 을 대신 보여준다).
    expect(shouldResyncDraft("", 0, false)).toBe(false)
  })

  it("상위가 진짜 다른 값을 내려주면 재동기화한다", () => {
    expect(shouldResyncDraft("5,000", 12_000, true)).toBe(true)
    expect(shouldResyncDraft("0", null, true)).toBe(true)
    expect(shouldResyncDraft("", 3_000, true)).toBe(true)
  })
})

describe("되먹임 호스트에서의 편집 (장부 주차 그리드·입력 레일)", () => {
  it("음수를 한 글자씩 쳐도 되먹임이 부호를 지우지 못한다", () => {
    const { draft, committed } = typeIntoLiveHost("-5000")
    expect(draft).toBe("-5,000")
    expect(committed).toBe(0)
    expect(committed).not.toBe(5000)
  })

  it("allowNull=false 인 칸에서도 마찬가지다", () => {
    expect(typeIntoLiveHost("-5000", false).committed).toBe(0)
  })

  it("양수 타이핑은 되먹임과 무관하게 그대로다", () => {
    expect(typeIntoLiveHost("12000000")).toEqual({ draft: "12,000,000", committed: 12_000_000 })
    expect(typeIntoLiveHost("450")).toEqual({ draft: "450", committed: 450 })
  })
})
