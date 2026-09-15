import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  COMPASS_CARE_STAGE_LABEL,
  COMPASS_INBOUND_CHANNELS,
  COMPASS_STAGE_LABEL,
  compassLeadUrl,
  isCompassMarketingChannel,
  normalizePhoneKey,
} from "@/lib/compass/normalize"

// ─── 전화 키 진리표 ──────────────────────────────────────────────────────────
//
// 기준(N) = Compass lib/format.ts normPhone(전화 저장 정본, integrate/2026-09-14).
// 옛 규칙(K) = 20260828 compass_leads_v 의 phone_key SQL 식(숫자만 → ^0082→82 → ^82→0) —
// 2026-09-14 이전 normalizePhoneKey 본문과 같다. 표의 22개 입력은 Compass 감사 D-borrow-crm.md
// "전화 키 진리표"와 scratchpad/phone/normsql.ts 에서 가져왔다.

/** Compass normPhone 사본 — 비교 기준. 규칙이 바뀌면 여기와 lib/compass/normalize.ts 를 같이 바꾼다. */
function compassNormPhone(p: string | null | undefined): string | null {
  let d = (p ?? "").replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("0082")) d = d.slice(4)
  else if (d.startsWith("82")) d = d.slice(2)
  else if (d.startsWith("10") && d.length >= 10) return `0${d}`
  else return d
  return d.startsWith("0") ? d : `0${d}`
}

/** 옛 normalizePhoneKey = compass_leads_v phone_key 식(K). 뷰는 Compass 저장값에 이 식을 쓴다. */
function legacyViewKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, "").replace(/^0082/, "82").replace(/^82/, "0")
  return digits.length > 0 ? digits : null
}

/** [입력, 기대 키(N), 옛 규칙과 다른가] — 다른 것은 원문에 K식을 쓰면 조인이 빠지던 3가지 형태뿐이다. */
const TRUTH_TABLE: Array<[string | null, string | null, "changed" | "same"]> = [
  ["010-1234-5678", "01012345678", "same"],
  ["+82 10-1234-5678", "01012345678", "same"],
  ["0082-10-1234-5678", "01012345678", "same"],
  ["82-10-1234-5678", "01012345678", "same"],
  ["8227956720", "027956720", "same"],
  ["02-795-6720", "027956720", "same"],
  ["031-123-4567", "0311234567", "same"],
  ["1588-1234", "15881234", "same"],
  // 내선 숫자가 붙는다 — Compass 와 같게 틀린다(입력 정리의 몫).
  ["010 1234 5678 (내선 2)", "010123456782", "same"],
  ["", null, "same"],
  [null, null, "same"],
  // 두 번호가 한 칸에 — 분리 규칙 없음(Compass 실측 1행과 같은 모양).
  ["010-1234-5678 / 02-795-6720", "01012345678027956720", "same"],
  // ① 국가번호 뒤 국내 0 이 남은 형태 — 옛 규칙은 001012345678
  ["+82 010-1234-5678", "01012345678", "changed"],
  ["0082-010-1234-5678", "01012345678", "changed"],
  // ② 시트·엑셀이 앞 0 을 떨어뜨린 형태 — 옛 규칙은 1012345678
  ["1012345678", "01012345678", "changed"],
  ["10-1234-5678", "01012345678", "changed"],
  // 다른 나라 국가번호는 그대로.
  ["+86 138 0013 8000", "8613800138000", "same"],
  ["0082", "0", "same"],
  ["82", "0", "same"],
  ["008613800138000", "008613800138000", "same"],
  ["233271578859", "233271578859", "same"],
  ["82313130979821044450979", "0313130979821044450979", "same"],
]

/** 20260914 마이그레이션 norm_phone_key 자기검증 DO 블록의 픽스처 — SQL 함수와 같은 값을 내는지 대조한다. */
const MIGRATION = "supabase/migrations/20260914_compass_integration_bridge.sql"
const SQL_FIXTURES: Array<[string | null, string | null]> = (() => {
  const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8")
  const block = sql.slice(sql.indexOf("select * from (values"), sql.indexOf(") as t(input, expected)"))
  const literal = (token: string) => (token === "null" ? null : token.slice(1, -1))
  return [...block.matchAll(/\(\s*(null|'[^']*')\s*,\s*(null|'[^']*')\s*\)/g)].map(
    (m) => [literal(m[1]), literal(m[2])] as [string | null, string | null]
  )
})()

describe("normalizePhoneKey — Compass normPhone 등가 진리표", () => {
  it("진리표 22개 입력이 모두 들어 있다", () => {
    expect(TRUTH_TABLE).toHaveLength(22)
  })

  it.each(TRUTH_TABLE)("%j → %j", (input, expected) => {
    expect(normalizePhoneKey(input)).toBe(expected)
    expect(compassNormPhone(input)).toBe(expected)
  })

  it("옛 규칙(compass_leads_v K식)과 결과가 다른 입력은 조인 누락 3형태뿐이다", () => {
    const changed = TRUTH_TABLE.filter(([input]) => normalizePhoneKey(input) !== legacyViewKey(input)).map(
      ([input]) => input
    )
    expect(changed).toEqual(TRUTH_TABLE.filter(([, , mark]) => mark === "changed").map(([input]) => input))
  })

  it("Compass 저장값 기준으로는 결과가 그대로다 — 뷰 phone_key 와의 기존 매칭을 깨지 않는다", () => {
    for (const [input] of TRUTH_TABLE) {
      const stored = compassNormPhone(input)
      // 뷰는 저장값에 K식을 쓴다: K(N(x)) === N(x)
      expect(legacyViewKey(stored), String(input)).toBe(stored)
      // 새 규칙으로 원문을 키로 만들면 그 뷰 키와 같다 — 옛 규칙이 빠뜨리던 형태까지 포함해서.
      expect(normalizePhoneKey(input), String(input)).toBe(legacyViewKey(stored))
      // 이미 키인 값(intake-feed 가 뷰 phone_key 를 한 번 더 통과시킨다)은 바뀌지 않는다.
      expect(normalizePhoneKey(stored), String(input)).toBe(stored)
    }
  })

  it("SQL 함수 public.norm_phone_key 의 자기검증 픽스처와 같은 값을 낸다", () => {
    expect(SQL_FIXTURES.length).toBeGreaterThanOrEqual(20)
    for (const [input, expected] of SQL_FIXTURES) {
      expect(normalizePhoneKey(input), String(input)).toBe(expected)
    }
  })

  it("기존 실측 형태를 그대로 모은다", () => {
    expect(normalizePhoneKey("01012345678")).toBe("01012345678")
    // 실측: Compass UI 는 0082-1090152356 형태를 쓴다
    expect(normalizePhoneKey("0082-1090152356")).toBe("01090152356")
    // 실측: public.leads 201/213건이 8210… 형태였다
    expect(normalizePhoneKey("821012345678")).toBe("01012345678")
    expect(normalizePhoneKey("0082 10 1234 5678")).toBe("01012345678")
    expect(normalizePhoneKey("00821012345678")).toBe("01012345678")
  })

  it("빈 값·숫자 없는 입력은 null", () => {
    expect(normalizePhoneKey(undefined)).toBeNull()
    expect(normalizePhoneKey("asdf")).toBeNull()
    expect(normalizePhoneKey("  -  ")).toBeNull()
  })
})

/**
 * Compass lib/stages.ts STAGE_LABEL 사본 — 통합 기준 integrate/2026-09-14 @ 18135ce (결정 K11).
 * Compass 쪽 라벨이 바뀌면 이 사본과 lib/compass/normalize.ts 를 같이 고친다.
 */
const COMPASS_STAGES_TS_LABEL: Record<string, string> = {
  new: "유입",
  demo: "데모",
  quote: "미팅",
  won: "결제",
  bd: "BD인계",
  lost: "종료",
}

describe("compass label vocabularies", () => {
  it("covers the live crm.stages keys (2026-08-28 실측)", () => {
    for (const key of ["new", "contact", "consult", "demo", "quote", "bd", "won", "lost"]) {
      expect(COMPASS_STAGE_LABEL[key]).toBeTruthy()
    }
  })

  it("Compass 단계 라벨은 Compass lib/stages.ts 정본과 같다(K11: quote=미팅, lost=종료)", () => {
    for (const [key, label] of Object.entries(COMPASS_STAGES_TS_LABEL)) {
      expect(COMPASS_STAGE_LABEL[key]).toBe(label)
    }
    // crm.stages.label·옛 어드민 사전의 라벨이 되돌아오지 않게
    expect(Object.values(COMPASS_STAGE_LABEL)).not.toContain("견적")
    expect(Object.values(COMPASS_STAGE_LABEL)).not.toContain("이탈")
    expect(Object.values(COMPASS_STAGE_LABEL)).not.toContain("신규유입")
  })

  it("covers the live care_stage keys", () => {
    for (const key of ["member", "leader", "ceo", "paid", "closed"]) {
      expect(COMPASS_CARE_STAGE_LABEL[key]).toBeTruthy()
    }
  })
})

describe("compassLeadUrl", () => {
  it("builds the ?open= deep link (라이브 확인된 파라미터)", () => {
    expect(compassLeadUrl(771)).toBe("https://mkt.classin.co.kr/leads?open=771")
  })
})

describe("Compass 인바운드 채널 — mktLeadCond 등가", () => {
  it("인바운드 목록은 Compass lib/taxonomy/defs.ts CHANNELS(group='inbound')와 같다", () => {
    expect([...COMPASS_INBOUND_CHANNELS]).toEqual(["channeltalk", "direct", "walkin", "referral"])
  })

  it.each([
    ["channeltalk", false],
    ["direct", false],
    ["walkin", false],
    ["referral", false],
    ["sms", true],
    ["email", true],
    ["", true],
    [null, true],
    [undefined, true],
    // SQL coalesce(channel,'') <> all(...) 는 값을 다듬지 않는다 — 같게 둔다.
    [" walkin", true],
    ["Walkin", true],
  ] as Array<[string | null | undefined, boolean]>)("channel %j → 마케팅 %j", (channel, expected) => {
    expect(isCompassMarketingChannel(channel)).toBe(expected)
  })
})
