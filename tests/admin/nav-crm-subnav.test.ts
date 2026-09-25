import { describe, expect, it } from "vitest"

import { resolveAdminCommands } from "@/components/admin/AdminCommandPalette"
import { ADMIN_NAV, CRM_CHILD_NAV, CRM_CUSTOMERS_CHILD_NAV } from "@/components/admin/admin-nav"
import {
  buildCrmSubnavPreferenceRows,
  buildNavPreferenceRows,
  CRM_SUBNAV_DEFAULT_HIDDEN_HREFS,
  CRM_SUBNAV_KEY_PREFIX,
  CRM_SUBNAV_PREFERENCE_ITEMS,
  CRM_SUBNAV_UNHIDEABLE_HREFS,
  crmSubnavKey,
  getAccessibleAdminNavItems,
  isCrmSubnavHideable,
  normalizeNavOverrides,
  resolveAdminNavAccess,
  resolveCrmSubnavAccess,
  resolveCrmSubnavDefault,
  resolveCrmSubnavPreference,
  setCrmSubnavOverride,
  setNavOverride,
  type NavAccessContext,
  type NavOverrides,
} from "@/components/admin/admin-nav-access"
import { NAV_CMDS, matchesNavCommand } from "@/components/admin/crm/CrmCommandPalette"

// CRM 하위 탭 개인 숨김(2026-09-25, 2단계) — nav_overrides 의 `crm:<href>` 키.
// 규칙 정본: components/admin/admin-nav-access.ts 상단 주석. 이 파일이 고정하는 것:
//  1. 레지스트리 정합(숨길 수 있는 탭 = 1차 진입 탭 제외 + 고객DB 보조 착지 제외)
//  2. 정규화(보존·버림 표) — 세 저장 경로가 모두 이 함수를 거친다
//  3. 최상위 격리 — crm: 키는 사이드바 배치·accessible 17 불변식에 영향이 0
//  4. setCrmSubnavOverride(기본과 같으면 키 삭제·숨김 불가 no-op·입력 불변)
//  5. ⌘K 도달성 — 숨겨도 두 팔레트(전역·CRM)에서 라벨로 찾힌다

const ctx = (over: Partial<NavAccessContext> = {}): NavAccessContext => ({
  role: "ADMIN",
  overrides: {},
  ...over,
})

const REGISTRY_HREFS = CRM_SUBNAV_PREFERENCE_ITEMS.map((item) => item.href)
const HIDE_ALL_CRM: NavOverrides = Object.fromEntries(
  CRM_SUBNAV_PREFERENCE_ITEMS.map((item) => [crmSubnavKey(item.href), "hidden" as const])
)
const HIDE_EVERYTHING_TOP: NavOverrides = Object.fromEntries(
  ADMIN_NAV.map((item) => [item.href, "hidden" as const])
)

describe("CRM 하위 탭 레지스트리", () => {
  it("숨길 수 있는 탭 = 기록·입력함 + 고객DB 보조(통합 제외) — 선언 순서 그대로", () => {
    expect(CRM_SUBNAV_PREFERENCE_ITEMS.map((item) => item.displayLabel)).toEqual([
      "기록",
      "입력함",
      "고객DB › 리드",
      "고객DB › 접수",
      "고객DB › 원천 고객",
      "고객DB › 세그먼트",
      "고객DB › 지도",
      "고객DB › 태그",
    ])
  })

  it("모든 href 가 CRM_CHILD_NAV ∪ CRM_CUSTOMERS_CHILD_NAV 에 있고 중복이 없다", () => {
    const known = new Set([...CRM_CHILD_NAV, ...CRM_CUSTOMERS_CHILD_NAV].map((item) => item.href))
    for (const href of REGISTRY_HREFS) expect(known.has(href), href).toBe(true)
    // 같은 href 가 두 줄에 있으면 crm: 키 하나가 두 탭을 동시에 제어한다 — 막는다.
    expect(new Set(REGISTRY_HREFS).size).toBe(REGISTRY_HREFS.length)
  })

  it("숨길 수 없는 3개는 CRM 1차 진입 탭(현황·고객DB·검수)이고 레지스트리에 없다", () => {
    const entryHrefs = CRM_CHILD_NAV.filter((child) => ["현황", "고객DB", "검수"].includes(child.label)).map(
      (child) => child.href
    )
    expect([...CRM_SUBNAV_UNHIDEABLE_HREFS].sort()).toEqual(entryHrefs.sort())
    for (const href of CRM_SUBNAV_UNHIDEABLE_HREFS) {
      expect(REGISTRY_HREFS, href).not.toContain(href)
      expect(isCrmSubnavHideable(href), href).toBe(false)
    }
    // 고객DB 보조 착지 "통합"은 1차 "고객DB"와 href 가 같아 함께 잠긴다.
    const unified = CRM_CUSTOMERS_CHILD_NAV.find((sub) => sub.key === "unified")
    expect(CRM_SUBNAV_UNHIDEABLE_HREFS).toContain(unified?.href)
  })

  it("기본 숨김은 기록·입력함·고객DB›태그이고 레지스트리 안에 있다", () => {
    expect([...CRM_SUBNAV_DEFAULT_HIDDEN_HREFS].sort()).toEqual(
      ["/admin/crm/activity", "/admin/crm/capture", "/admin/crm/customers/tags"].sort()
    )
    for (const href of CRM_SUBNAV_DEFAULT_HIDDEN_HREFS) {
      expect(REGISTRY_HREFS, href).toContain(href)
      expect(resolveCrmSubnavDefault(href), href).toBe("hidden")
    }
    expect(resolveCrmSubnavDefault("/admin/crm/customers/segments")).toBe("shown")
  })

  it("세그먼트 보조 탭은 원천 고객 뒤·지도 앞이다", () => {
    const keys = CRM_CUSTOMERS_CHILD_NAV.map((sub) => sub.key)
    expect(keys.indexOf("segments")).toBe(keys.indexOf("accounts") + 1)
    expect(keys.indexOf("map")).toBe(keys.indexOf("segments") + 1)
  })

  it("키는 crm: 접두 + href 다 — 최상위 키('/' 시작)와 겹치지 않는다", () => {
    expect(crmSubnavKey("/admin/crm/activity")).toBe("crm:/admin/crm/activity")
    expect(CRM_SUBNAV_KEY_PREFIX.startsWith("/")).toBe(false)
  })
})

describe("normalizeNavOverrides — crm: 네임스페이스", () => {
  it("레지스트리 탭의 hidden|shown 은 보존한다", () => {
    expect(
      normalizeNavOverrides({
        "crm:/admin/crm/activity": "shown",
        "crm:/admin/crm/customers/leads": "hidden",
        "/admin/quotes": "hidden",
      })
    ).toEqual({
      "crm:/admin/crm/activity": "shown",
      "crm:/admin/crm/customers/leads": "hidden",
      "/admin/quotes": "hidden",
    })
  })

  it.each([
    ["숨김 불가 진입 탭(현황)", { "crm:/admin/crm": "hidden" }],
    ["숨김 불가 진입 탭(통합)", { "crm:/admin/crm/customers/unified": "hidden" }],
    ["숨김 불가 진입 탭(검수)", { "crm:/admin/crm/matching": "shown" }],
    ["하위 탭에 자리 값", { "crm:/admin/crm/activity": "primary" }],
    ["하위 탭에 레거시 deny", { "crm:/admin/crm/activity": "deny" }],
    ["레지스트리에 없는 href", { "crm:/admin/crm/deals": "hidden" }],
    ["모르는 네임스페이스", { "cs:/admin/docs": "hidden" }],
    ["접두어 없는 하위 탭 href", { "/admin/crm/activity": "hidden" }],
    ["접두어만", { "crm:": "hidden" }],
  ])("%s 는 버린다", (_name, input) => {
    expect(normalizeNavOverrides(input)).toEqual({})
  })

  it("기존 최상위 기대값은 그대로다(deny→folded, Overview hidden 삭제)", () => {
    expect(
      normalizeNavOverrides({
        "/admin/settings": "deny",
        "/admin/overview": "hidden",
        "crm:/admin/crm/capture": "shown",
      })
    ).toEqual({ "/admin/settings": "folded", "crm:/admin/crm/capture": "shown" })
  })
})

describe("최상위 격리 — crm: 키는 사이드바 배치에 영향이 없다", () => {
  it("CRM 하위 탭을 전부 숨겨도 resolveAdminNavAccess 결과가 설정 없음과 같다", () => {
    expect(resolveAdminNavAccess(ctx({ overrides: HIDE_ALL_CRM }))).toEqual(resolveAdminNavAccess(ctx()))
  })

  it("최상위 전부 숨김 + CRM 전부 숨김이어도 accessible 은 17 전부다", () => {
    const access = resolveAdminNavAccess(ctx({ overrides: { ...HIDE_EVERYTHING_TOP, ...HIDE_ALL_CRM } }))
    expect(getAccessibleAdminNavItems(access)).toHaveLength(ADMIN_NAV.length)
    expect(getAccessibleAdminNavItems(access).map((item) => item.href)).toEqual(ADMIN_NAV.map((item) => item.href))
    expect(ADMIN_NAV).toHaveLength(17)
  })

  it("편집기 최상위 행은 17행 그대로다", () => {
    const rows = buildNavPreferenceRows(ctx({ overrides: { ...HIDE_ALL_CRM } }))
    expect(rows).toHaveLength(ADMIN_NAV.length)
    expect(rows.filter((row) => row.isException)).toHaveLength(0)
  })

  it("사이드바 '다시 표시'(setNavOverride)는 crm: 키를 지우지 않는다", () => {
    const next = setNavOverride({ "crm:/admin/crm/activity": "shown" }, "/admin/ops", "folded")
    expect(next).toEqual({ "crm:/admin/crm/activity": "shown", "/admin/ops": "folded" })
  })
})

describe("resolveCrmSubnavAccess / resolveCrmSubnavPreference", () => {
  it("설정이 없으면 기본 숨김 3개가 숨김이다", () => {
    const access = resolveCrmSubnavAccess({})
    expect(access.hidden.map((item) => item.href)).toEqual([
      "/admin/crm/activity",
      "/admin/crm/capture",
      "/admin/crm/customers/tags",
    ])
    expect([...access.hiddenHrefs].sort()).toEqual([...CRM_SUBNAV_DEFAULT_HIDDEN_HREFS].sort())
  })

  it("shown 은 기본 숨김을 되살리고, hidden 은 기본 표시 탭을 숨긴다", () => {
    const access = resolveCrmSubnavAccess({
      "crm:/admin/crm/activity": "shown",
      "crm:/admin/crm/customers/map": "hidden",
    })
    expect(access.hidden.map((item) => item.href)).toEqual(["/admin/crm/capture", "/admin/crm/customers/map", "/admin/crm/customers/tags"])
  })

  it("정규화를 거치지 않은 값에서도 숨김 불가 탭은 항상 shown 이다", () => {
    expect(resolveCrmSubnavPreference("/admin/crm/matching", { "crm:/admin/crm/matching": "hidden" })).toBe("shown")
    expect(resolveCrmSubnavPreference("/admin/crm/activity", { "crm:/admin/crm/activity": "이상한값" })).toBe("hidden")
  })

  it("편집기 행은 레지스트리 8행이고 기본 숨김 행은 예외가 아니다", () => {
    const rows = buildCrmSubnavPreferenceRows({})
    expect(rows).toHaveLength(CRM_SUBNAV_PREFERENCE_ITEMS.length)
    expect(rows.filter((row) => row.isException)).toHaveLength(0)
    const exceptions = buildCrmSubnavPreferenceRows({ "crm:/admin/crm/capture": "shown", "crm:/admin/crm/customers/leads": "hidden" })
      .filter((row) => row.isException)
      .map((row) => row.item.href)
    expect(exceptions).toEqual(["/admin/crm/capture", "/admin/crm/customers/leads"])
  })
})

describe("setCrmSubnavOverride", () => {
  it("기본값과 같으면 키를 지운다", () => {
    expect(setCrmSubnavOverride({ "crm:/admin/crm/activity": "shown" }, "/admin/crm/activity", "hidden")).toEqual({})
    expect(setCrmSubnavOverride({ "crm:/admin/crm/customers/map": "hidden" }, "/admin/crm/customers/map", "shown")).toEqual({})
  })

  it("기본 숨김 탭의 shown·기본 표시 탭의 hidden 은 남긴다", () => {
    expect(setCrmSubnavOverride({}, "/admin/crm/activity", "shown")).toEqual({ "crm:/admin/crm/activity": "shown" })
    expect(setCrmSubnavOverride({}, "/admin/crm/customers/segments", "hidden")).toEqual({
      "crm:/admin/crm/customers/segments": "hidden",
    })
  })

  it("숨김 불가·모르는 href 는 no-op 이고, 입력을 변형하지 않으며 다른 키를 복사한다", () => {
    const input: NavOverrides = { "/admin/blog": "primary" }
    expect(setCrmSubnavOverride(input, "/admin/crm/matching", "hidden")).toEqual(input)
    expect(setCrmSubnavOverride(input, "/admin/crm/없는탭", "hidden")).toEqual(input)
    const next = setCrmSubnavOverride(input, "/admin/crm/capture", "shown")
    expect(next).toEqual({ "/admin/blog": "primary", "crm:/admin/crm/capture": "shown" })
    expect(input).toEqual({ "/admin/blog": "primary" })
  })

  it("저장 → 정규화 왕복에서 살아남는다", () => {
    const saved = normalizeNavOverrides(setCrmSubnavOverride({}, "/admin/crm/customers/tags", "shown"))
    expect(resolveCrmSubnavAccess(saved).hiddenHrefs.has("/admin/crm/customers/tags")).toBe(false)
  })
})

describe("⌘K 도달성 — 숨긴 CRM 하위 탭도 두 팔레트에서 찾힌다", () => {
  it.each(CRM_SUBNAV_PREFERENCE_ITEMS.map((item) => [item.displayLabel, item] as const))(
    "CRM 팔레트: %s 가 탭 라벨로 찾힌다",
    (_name, item) => {
      const matches = NAV_CMDS.filter((nav) => !nav.event && matchesNavCommand(nav, item.label))
      expect(matches.map((nav) => nav.href), item.label).toContain(item.href)
    }
  )

  it.each(CRM_SUBNAV_PREFERENCE_ITEMS.map((item) => [item.displayLabel, item] as const))(
    "전역 팔레트: CRM 전부 숨김에서도 %s 가 탭 라벨로 찾힌다",
    (_name, item) => {
      const commands = resolveAdminCommands({ role: "ADMIN", overrides: HIDE_ALL_CRM })
      const q = item.label.toLowerCase()
      const matches = commands.filter(
        (cmd) => cmd.label.toLowerCase().includes(q) || (cmd.keywords ?? "").toLowerCase().includes(q)
      )
      expect(matches.map((cmd) => cmd.href), item.label).toContain(item.href)
    }
  )

  it("전역 팔레트 명령 목록은 CRM 숨김과 무관하게 설정 없음과 같다", () => {
    expect(resolveAdminCommands({ role: "ADMIN", overrides: HIDE_ALL_CRM })).toEqual(
      resolveAdminCommands({ role: "ADMIN", overrides: {} })
    )
  })

  it("CRM 팔레트에서 '입력함'·'세그먼트'로 찾힌다(탭 이름 검색)", () => {
    const hrefsFor = (query: string) => NAV_CMDS.filter((nav) => matchesNavCommand(nav, query)).map((nav) => nav.href)
    expect(hrefsFor("입력함")).toContain("/admin/crm/capture")
    expect(hrefsFor("세그먼트")).toContain("/admin/crm/customers/segments")
    expect(hrefsFor("segment")).toContain("/admin/crm/customers/segments")
  })
})
