/**
 * A안(2026-09-25) "기록은 Compass에서" — 기록 위치 판정(lib/crm/write-surface) 진리표.
 * 360 드로어·상세, 리드 드로어, 기록 탭 리드 포커스가 같은 판정을 쓴다.
 */
import { describe, expect, it } from "vitest"

import {
  COMPASS_DOWN_WRITE_CAPTION,
  HOME_ONLY_CAPTION,
  HOME_SEPARATE_LOG_LABEL,
  isCompassWriteSurface,
  resolveCrmWriteSurface,
} from "@/lib/crm/write-surface"

const HREF = "https://mkt.classin.co.kr/leads?open=77"

describe("resolveCrmWriteSurface — 판정 규칙", () => {
  it("1. source 없음·found=false 는 home/unknown(지금 화면 그대로)", () => {
    expect(resolveCrmWriteSurface({ source: null, compassHref: HREF })).toMatchObject({ surface: "home", reason: "unknown" })
    expect(resolveCrmWriteSurface({ source: undefined, compassHref: null })).toMatchObject({ surface: "home", reason: "unknown" })
    expect(resolveCrmWriteSurface({ source: "lead", found: false, compassHref: HREF })).toMatchObject({
      surface: "home",
      reason: "unknown",
    })
  })

  it("2. NEO 계정은 Home 정본 — 같은 전화의 Compass 리드는 보조 링크로만 넘긴다", () => {
    const result = resolveCrmWriteSurface({ source: "neo_account", found: true, compassHref: HREF })
    expect(result).toEqual({ surface: "home", reason: "neo_account", compassHref: HREF, secondaryCompassHref: HREF })
    // Compass 매칭이 없으면 보조 링크도 없다(지어내지 않는다).
    expect(resolveCrmWriteSurface({ source: "neo_account", found: true, compassHref: null }).secondaryCompassHref).toBeNull()
  })

  it("3. 전환 리드·NEO 등록 확정 리드는 Compass 매칭이 있어도 Home 정본(보조 링크)", () => {
    const converted = resolveCrmWriteSurface({ source: "lead", found: true, compassHref: HREF, leadStatus: "converted" })
    expect(converted).toEqual({ surface: "home", reason: "converted_lead", compassHref: HREF, secondaryCompassHref: HREF })
    const registered = resolveCrmWriteSurface({ source: "lead", found: true, compassHref: HREF, leadStatus: "contacted", crmRegistered: true })
    expect(registered).toMatchObject({ surface: "home", reason: "converted_lead" })
  })

  it("4. Compass 에 매칭된 리드는 단계·Home 상태와 무관하게 compass — 주 링크, 보조 링크 없음", () => {
    for (const leadStatus of ["new", "contacted", "closed", null, undefined] as const) {
      const result = resolveCrmWriteSurface({ source: "lead", found: true, compassHref: HREF, leadStatus })
      expect(result).toEqual({ surface: "compass", reason: "compass_lead", compassHref: HREF, secondaryCompassHref: null })
      expect(isCompassWriteSurface(result)).toBe(true)
    }
    // 리드 보드처럼 found 를 넘기지 않는 호출부도 같은 판정.
    expect(resolveCrmWriteSurface({ source: "lead", compassHref: HREF }).surface).toBe("compass")
  })

  it("4-1. 활동 조회만 끊긴 경우(down=true 인데 href 있음)는 매칭이 확인됐으므로 compass", () => {
    expect(resolveCrmWriteSurface({ source: "lead", found: true, compassHref: HREF, compassDown: true })).toMatchObject({
      surface: "compass",
      reason: "compass_lead",
    })
  })

  it("5. Compass 연결 끊김 + 링크 없음은 home/compass_down — '매칭 없음'과 구분한다", () => {
    const result = resolveCrmWriteSurface({ source: "lead", found: true, compassHref: null, compassDown: true })
    expect(result).toEqual({ surface: "home", reason: "compass_down", compassHref: null, secondaryCompassHref: null })
  })

  it("6. Compass 에 없는 리드는 home/no_compass_match — Home 기록이 주 행동", () => {
    expect(resolveCrmWriteSurface({ source: "lead", found: true, compassHref: null })).toMatchObject({
      surface: "home",
      reason: "no_compass_match",
    })
    // 공백 링크는 없는 것과 같다.
    expect(resolveCrmWriteSurface({ source: "lead", found: true, compassHref: "   " })).toMatchObject({
      surface: "home",
      reason: "no_compass_match",
      compassHref: null,
    })
    expect(isCompassWriteSurface(null)).toBe(false)
  })

  it("화면 문구 상수 — Home 에 따로 남긴 기록이 Compass 에 보이지 않는다는 사실을 밝힌다", () => {
    expect(HOME_SEPARATE_LOG_LABEL).toBe("Home에 따로 남기기")
    expect(HOME_ONLY_CAPTION).toContain("Compass 담당자에게는 보이지 않습니다")
    expect(COMPASS_DOWN_WRITE_CAPTION).toContain("Compass 연결 끊김")
  })
})
