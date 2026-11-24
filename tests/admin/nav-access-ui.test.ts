import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const sidebar = readFileSync(join(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8")

describe("AdminSidebar — 상시/접힘 2단 구조", () => {
  it("resolves placement through the shared access module, not a local copy", () => {
    expect(sidebar).toContain('from "./admin-nav-access"')
    expect(sidebar).toContain("resolveAdminNavAccess(")
  })

  it("stops rendering section headers (접힘 묶음의 범주 이름이 대신한다)", () => {
    expect(sidebar).not.toContain("ADMIN_NAV_SECTION_META[section].label")
  })

  it("remembers which fold groups are open across reloads, migrating the old 기타 key once", () => {
    // 2026-11-09 D안 — "기타" 하나(불리언 키)가 범주별 접힘(범주 목록 키)이 됐다.
    expect(sidebar).toContain('"admin_sidebar_fold_open"')
    expect(sidebar).toContain('"admin_sidebar_other_open"')
    expect(sidebar).toContain("localStorage.removeItem(LEGACY_OTHER_OPEN_STORAGE_KEY)")
  })

  it("folds each category separately and forces open the one holding the current page", () => {
    expect(sidebar).toContain("const renderFoldedGroups = (")
    expect(sidebar).toContain('renderFoldedGroups("desktop")')
    expect(sidebar).toContain('renderFoldedGroups("mobile")')
    // 펼침 규칙(저장 ∪ 강제 열림, 강제 열림을 접으면 이 화면에서만)은 sidebar-fold-state.ts — 동작은 sidebar-fold-state.test.ts.
    expect(sidebar).toContain("isFoldGroupExpanded(foldState, category, activeFoldedCategory, pathname)")
    expect(sidebar).toContain("toggleFoldGroup(foldState, category, activeFoldedCategory, pathname)")
  })

  it("greys out work-in-progress tabs", () => {
    expect(sidebar).toContain('maturity === "wip"')
    expect(sidebar).toContain("다듬는 중")
  })

  it("labels folded groups with the shared category meta", () => {
    expect(sidebar).toContain("ADMIN_NAV_CATEGORY_META")
  })

  it("groups the primary list with the shared category partition, without headers (2026-11-09)", () => {
    // 상시 묶음은 사이드바가 자체 계산하지 않고 resolveNavAccess 결과를 쓴다. 소제목은 그리지 않는다.
    expect(sidebar).toContain("navAccess.primaryGroups")
    expect(sidebar).not.toContain("showPrimaryHeaders")
  })

  it("keeps hover warm-up wired on folded items too", () => {
    // 접힌 항목도 hover 시 프리페치돼야 한다 — 접혀 있다고 느려도 되는 건 아니다.
    const foldedBlock = sidebar.slice(sidebar.indexOf("const renderFoldedGroups = ("))
    expect(foldedBlock).toContain("scheduleWarmAdminTab")
  })

  it("points the mobile bottom bar at the new IA", () => {
    expect(sidebar).toContain('href: "/admin/branch/ledger"')
    expect(sidebar).toContain('href: "/admin/quotes"')
  })
})

describe("AdminSidebar — 개인 숨김(2026-09-25)", () => {
  it("active 판정·헤더는 전체(accessible), 하단 바·유휴 프리페치는 보이는 목록(visible)을 쓴다", () => {
    expect(sidebar).toContain("siblings: accessibleNav")
    expect(sidebar).toContain("getVisibleAdminNavItems(navAccess)")
    const bottomBar = sidebar.slice(sidebar.indexOf("const mobilePrimaryNav = useMemo("))
    expect(bottomBar.slice(0, 400)).toContain("visibleNav.find(")
    expect(sidebar).toContain("visibleNav.filter((item) => item.section === currentNavItem.section)")
  })

  it("숨긴 탭 묶음을 접힘 묶음 아래에 그리고, 현재 경로가 숨긴 항목이면 강제로 펼친다", () => {
    expect(sidebar).toContain("navAccess.hidden")
    expect(sidebar).toContain("숨긴 탭")
    expect(sidebar).toContain("다시 표시")
    expect(sidebar).toContain("const hiddenExpanded = hiddenOpen || hiddenHasActiveItem")
  })

  it("편집기 열기 이벤트를 공용 상수로 듣는다 — ⌘K 명령이 같은 이름으로 쏜다", () => {
    expect(sidebar).toContain("ADMIN_OPEN_NAV_EDITOR_EVENT")
    expect(sidebar).toContain("addEventListener(ADMIN_OPEN_NAV_EDITOR_EVENT")
    expect(sidebar).toContain("사이드바 편집")
  })

  it("다시 표시는 기본 자리로 되돌려 본인 경로로 저장한다", () => {
    expect(sidebar).toContain("resolveNavPlacement(href")
    expect(sidebar).toContain("saveMyNavOverrides(")
  })
})

// 2026-11-20 — 기본값이 계정에 따라 둘이다. 사이드바는 판정을 스스로 하지 않고(역할·프리셋 비교 금지)
// resolveAdminNavAccess 에 프리셋을 넘긴 뒤 결과의 fullNav 만 읽는다. 렌더 결과는
// tests/admin/sidebar-flat-crm.test.tsx 의 "간소 사이드바" describe 가 본다.
describe("AdminSidebar — 전체 / 간소 사이드바(2026-11-20)", () => {
  it("세션의 nav_preset 을 공유 판정에 넘긴다 — 빠뜨리면 지정 계정이 간소로 떨어진다", () => {
    expect(sidebar).toContain("navPreset?: string | null")
    expect(sidebar).toMatch(/resolveAdminNavAccess\(\{\s*role: normalizedRole,\s*preset: navPreset,\s*overrides: normalizedOverrides,\s*\}\)/)
    expect(sidebar).toContain("const fullNav = navAccess.fullNav")
  })

  it("전체/간소를 스스로 판정하지 않는다 — 역할·프리셋 글자 비교가 없다", () => {
    expect(sidebar).not.toContain('=== "SUPER_ADMIN"')
    expect(sidebar).not.toContain('=== "super"')
    expect(sidebar).not.toContain("hasFullAdminNav(")
  })

  it("숨긴 탭 묶음과 사이드바 편집 진입점 세 곳을 전체 계정에게만 그린다", () => {
    expect(sidebar).toContain("if (!fullNav || navAccess.hidden.length === 0) return null")
    // 모바일 드로어 · 데스크톱 사용자 블록 · 접힌 사이드바 아이콘.
    expect(sidebar.match(/\{fullNav \? \(\s*<button\s+type="button"\s+onClick=\{openNavEditor\}/g)).toHaveLength(2)
    expect(sidebar).toContain("{effectiveCollapsed && fullNav ? (")
    expect(sidebar.match(/onClick=\{openNavEditor\}/g)).toHaveLength(3)
  })

  it("다시 표시·본인 편집기에도 같은 계정 정보를 넘긴다", () => {
    expect(sidebar).toContain("const audience = { role: normalizedRole, preset: navPreset }")
    expect(sidebar).toContain("setNavOverride(normalizedOverrides, href, seat, audience)")
    expect(sidebar).toContain("navPreset={navPreset}")
  })

  it("간소 계정의 모바일 하단 바는 그 계정의 상시 목록을 쓴다", () => {
    const bottomBar = sidebar.slice(sidebar.indexOf("const mobilePrimaryNav = useMemo("))
    expect(bottomBar.slice(0, 600)).toContain("navAccess.primary")
    expect(bottomBar.slice(0, 600)).toContain("MOBILE_SIMPLE_NAV_MAX")
  })

  it("차단 화면을 되살리지 않는다 — 숨김은 목록에서만이다", () => {
    expect(sidebar).not.toContain("접근 권한이 없습니다")
    expect(sidebar).not.toContain('"deny"')
  })
})

const preferences = readFileSync(join(process.cwd(), "components/admin/my-nav-preferences.ts"), "utf8")

describe("my-nav-preferences — 클라이언트 계약", () => {
  it("이벤트 이름은 admin:open-nav-editor 다(AdminCommandPalette 가 dispatch)", () => {
    expect(preferences).toContain('ADMIN_OPEN_NAV_EDITOR_EVENT = "admin:open-nav-editor"')
  })

  it("본인 저장은 /api/admin/me/nav PATCH 로 전체 상태를 보낸다", () => {
    expect(preferences).toContain('MY_NAV_ENDPOINT = "/api/admin/me/nav"')
    expect(preferences).toContain('method: "PATCH"')
    expect(preferences).not.toContain("userId")
  })
})

// 셸 본문은 app/admin/layout.tsx에서 components/admin/AdminShell.tsx로 옮겼다.
// (레이아웃은 서버에서 세션을 확정해 넘기는 얇은 RSC가 됐다 — 아래 두 번째 describe)
const shell = readFileSync(join(process.cwd(), "components/admin/AdminShell.tsx"), "utf8")

describe("AdminShell — 전면 공개 이후", () => {
  // 2026-09-10: 어떤 탭도 deny 되지 않으므로 "차단 탭 직접 진입" 가드와 차단 화면을 걷어냈다.
  // 이 테스트들이 그 결정을 고정한다 — 되살리려면 admin-nav-access.ts 부터 바꿔야 한다.
  it("차단 화면과 그 계산을 남겨두지 않는다", () => {
    expect(shell).not.toContain("접근 권한이 없습니다")
    expect(shell).not.toContain("resolveAdminNavParentHref(")
    expect(shell).not.toContain("getAccessibleAdminNavItems(")
  })

  it("팔레트에 세션 오버라이드를 그대로 넘긴다", () => {
    expect(shell).toContain("<AdminCommandPaletteLauncher")
    expect(shell).toContain("navOverrides={session.navOverrides}")
  })

  // 2026-11-20 — 사이드바·⌘K·본문 컨텍스트 세 곳이 같은 nav_preset 을 받아야 전체/간소 판정이 갈리지 않는다.
  it("세션의 nav_preset 을 사이드바·팔레트·본문 컨텍스트에 모두 넘긴다", () => {
    expect(shell.match(/navPreset=\{session\.navPreset\}/g)).toHaveLength(2)
    expect(shell).toContain("navPreset: session.navPreset")
    // 셸은 판정하지 않는다 — 넘기기만 한다.
    expect(shell).not.toContain("hasFullAdminNav(")
    expect(shell).not.toContain("resolveAdminLandingHref(")
  })

  it("보안 경계는 여전히 서버 가드라는 것을 주석으로 남긴다", () => {
    expect(shell).toContain("보안 경계")
  })

  it("본인 편집 저장을 받아 세션을 갱신하고 핀을 건다", () => {
    expect(shell).toContain("onNavOverridesChange={handleNavOverridesChange}")
    expect(shell).toContain("pinNavOverrides(sessionStorage, next, Date.now())")
  })

  it("본문(CrmSubnav)에 같은 세션 오버라이드·저장 콜백을 컨텍스트로 내려준다", () => {
    expect(shell).toContain("<AdminNavPreferencesProvider value={navPreferences}>")
    expect(shell).toContain("onNavOverridesChange: handleNavOverridesChange")
    expect(shell).toContain("navOverrides: session.navOverrides")
  })

  it("서버 세션을 sessionStorage 에 옮길 때 핀 창의 로컬 값을 덮지 않는다", () => {
    // 초기화·이펙트 두 경로 모두 핀을 반영한 값으로 hydrate 해야 한다.
    expect(shell).toContain("hydrateAdminSessionStorage(withPinnedNavOverrides(initialSession))")
    expect(shell).toContain("const effectiveSession = withPinnedNavOverrides(initialSession)")
    expect(shell).toContain("hydrateAdminSessionStorage(effectiveSession)")
  })
})

const layout = readFileSync(join(process.cwd(), "app/admin/layout.tsx"), "utf8")

describe("AdminLayout — 서버 셸 부트스트랩", () => {
  it("stays a server component that resolves the session before render", () => {
    // "use client"가 다시 붙으면 첫 진입 왕복 2회가 그대로 돌아온다.
    expect(layout).not.toContain('"use client"')
    expect(layout).toContain("await resolveAdminShellSession()")
    expect(layout).toContain("<AdminShell initialSession={initialSession}>")
  })

  it("keeps the surface-guard note where the guard is bootstrapped", () => {
    expect(layout).toContain("보안 경계가 아니다")
  })
})

const drawer = readFileSync(
  join(process.cwd(), "components/admin/settings/MemberNavAccessDrawer.tsx"),
  "utf8"
)
// 행 목록·미리보기·저장 푸터는 두 드로어(회원 관리·본인 편집)가 공유하는 편집기로 추출됐다.
const editor = readFileSync(
  join(process.cwd(), "components/admin/settings/NavPreferenceEditor.tsx"),
  "utf8"
)
const myDrawer = readFileSync(
  join(process.cwd(), "components/admin/settings/MyNavEditorDrawer.tsx"),
  "utf8"
)
const crmSubnav = readFileSync(join(process.cwd(), "components/admin/crm/CrmSubnav.tsx"), "utf8")

describe("NavPreferenceEditor — 두 드로어 공통 본문", () => {
  it("previews with the shared resolver instead of a second implementation", () => {
    // 미리보기가 자체 계산을 하면 실제 사이드바와 어긋나고, 어긋난 미리보기는
    // 이 기능 전체의 신뢰를 깎는다.
    expect(editor).toContain("resolveAdminNavAccess(")
    expect(editor).toContain("buildNavPreferenceRows(")
    expect(editor).toContain('from "@/components/admin/admin-nav-access"')
  })

  // (2026-09-25 재작성) 예전 테스트는 "세 번째 선택지 금지"였다 — 그 세 번째가 차단(deny)이었기
  // 때문이다. 세 번째 값 "숨김"은 목록 정리일 뿐 도달성을 줄이지 않으므로 허용하되, 그 경계를
  // 화면 문구로 고정한다: 차단·권한 제한처럼 읽히는 말은 금지, "⌘K·주소로 그대로 열린다"는 필수.
  it("상시·접힘·숨김 3단을 주되 '차단' 문구는 어디에도 쓰지 않는다", () => {
    // 2026-11-09 D안 — 사이드바의 "기타" 묶음이 범주별 접힘이 되어 라벨도 "접힘"이다(저장값 folded 그대로).
    expect(editor).toContain('label: "상시"')
    expect(editor).toContain('label: "접힘"')
    expect(editor).not.toContain('label: "기타"')
    expect(editor).toContain('label: "숨김"')
    for (const [name, source] of [
      ["editor", editor],
      ["member drawer", drawer],
      ["my drawer", myDrawer],
      ["crm subnav", crmSubnav],
    ] as const) {
      expect(source, name).not.toContain("차단")
    }
  })

  it("CRM 하위 탭 섹션을 공유 판정(buildCrmSubnavPreferenceRows)으로 그리고 표시|숨김 2단만 준다", () => {
    expect(editor).toContain("CRM 하위 탭")
    expect(editor).toContain("buildCrmSubnavPreferenceRows(")
    expect(editor).toContain("setCrmSubnavOverride(")
    expect(editor).toContain('label: "표시"')
    // 진입 탭 3개는 행이 없다는 이유를 화면에 싣는다.
    expect(editor).toContain("CRM 진입 탭이라 숨길 수 없습니다")
    // 미리보기·예외 수에 CRM 범위를 합친다(기본으로 되돌리기는 두 범위를 함께 비운다).
    expect(editor).toContain("CRM 숨긴 탭 {crmHiddenRows.length}")
    expect(editor).toContain("onChange({})")
  })

  it("숨김은 도달성을 줄이지 않는다는 안내를 편집기에 싣는다", () => {
    expect(editor).toContain("숨긴 탭도 ⌘K와 주소로 그대로 열립니다.")
    expect(editor).toContain("도달성을 줄이지 않습니다")
  })

  it("그 계정의 착지 화면은 숨김을 비활성화하고 이유를 보여준다", () => {
    // 전체 계정은 Overview, 간소 계정은 매출 장부 — 어느 행이 잠기는지는 buildNavPreferenceRows 가 정한다.
    expect(editor).toContain("로그인 첫 화면이라 숨길 수 없습니다")
    expect(editor).toContain('option.value === "hidden" && !hideable')
  })

  it("role 과 preset 을 함께 받아 판정·저장에 쓴다(2026-11-20)", () => {
    expect(editor).toContain("preset?: string | null")
    expect(editor).toContain("({ role, preset, overrides })")
    expect(editor).toContain("setNavOverride(overrides, href, next, { role, preset })")
    // "모든 매니저가 같은 메뉴"는 더 이상 사실이 아니다 — 화면 문구에 남기지 않는다.
    expect(editor).not.toContain("모든 매니저가 같은 메뉴를 갖습니다")
    expect(editor).toContain("preview.fullNav ? NAV_HIDDEN_REACH_NOTE : NAV_HIDDEN_REACH_NOTE_SIMPLE")
  })

  it("기본과 다른 행을 예외로 표시하고, 미리보기에 숨김 개수를 싣는다", () => {
    expect(editor).toContain("예외")
    expect(editor).toContain("숨김 {preview.hidden.length}")
  })

  it("renders explicit saving, saved, and error states", () => {
    expect(editor).toContain('"saving"')
    expect(editor).toContain('"saved"')
    expect(editor).toContain('role="alert"')
  })

  it("admin 트리의 fixed 오버레이를 document.body 로 포털한다", () => {
    expect(editor).toContain("createPortal(")
    expect(editor).toContain("document.body")
  })
})

describe("MemberNavAccessDrawer", () => {
  it("uses the shared editor and keeps hidden when normalizing the initial value", () => {
    expect(drawer).toContain("<NavPreferenceEditor")
    expect(drawer).toContain("normalizeNavOverrides(initialOverrides)")
  })

  it("labels the dialog as a sidebar layout, not a permission screen", () => {
    expect(drawer).toContain("사이드바 배치")
    expect(drawer).not.toContain("탭 권한")
  })

  it("always sends both nav fields — the PATCH overwrites both columns", () => {
    expect(drawer).toContain("navPreset")
    expect(drawer).toContain("navOverrides")
    expect(drawer).toContain('method: "PATCH"')
  })

  // 2026-11-20 — nav_preset "super" 가 전체 사이드바 지정이 됐다. 2026-09-10 ~ 11-19 의 이 드로어는
  // 저장할 때마다 프리셋을 null 로 밀었다 — 그대로 두면 배치만 고쳐 저장해도 지정이 조용히 꺼진다.
  it("프리셋을 무조건 null 로 밀지 않고 '전체 사이드바' 토글 값 그대로 보낸다", () => {
    expect(drawer).not.toContain("navPreset: null")
    expect(drawer).toContain("JSON.stringify({ userId, navPreset, navOverrides: overrides })")
    expect(drawer).toContain("const navPreset = fullNavDesignated ? FULL_NAV_PRESET : null")
    expect(drawer).toContain("useState(initialPreset === FULL_NAV_PRESET)")
    expect(drawer).toContain("onSaved(overrides, navPreset)")
  })

  it("토글은 '전체 사이드바'이고, 역할만으로 전체인 사람(SUPER_ADMIN)에게는 잠긴다", () => {
    expect(drawer).toContain("전체 사이드바")
    expect(drawer).toContain("const fullByRole = hasFullAdminNav({ role: targetRole })")
    expect(drawer).toContain("disabled={fullByRole || saving}")
    expect(drawer).toContain("aria-pressed={fullByRole || fullNavDesignated}")
    // 권한 화면처럼 읽히면 안 된다 — 메뉴 표시일 뿐이라는 말을 싣는다.
    expect(drawer).toContain("역할과 데이터 권한은 그대로입니다")
  })

  it("편집기 미리보기가 토글을 따라간다 — 같은 프리셋 값을 넘긴다", () => {
    expect(drawer).toContain("preset={navPreset}")
    expect(drawer).toContain("countNavPreferenceExceptions({ role: targetRole, preset: navPreset, overrides })")
  })
})

describe("MyNavEditorDrawer — 본인 편집", () => {
  it("본인 경로로 저장하고 같은 편집기를 쓴다", () => {
    expect(myDrawer).toContain("saveMyNavOverrides(")
    expect(myDrawer).toContain("<NavPreferenceEditor")
    expect(myDrawer).toContain('subject="self"')
    expect(myDrawer).not.toContain("/api/admin/users")
  })

  it("세션의 nav_preset 을 편집기에 넘긴다 — 본인은 지정을 바꿀 수 없다(읽기만)", () => {
    expect(myDrawer).toContain("preset={navPreset}")
    expect(myDrawer).not.toContain("FULL_NAV_PRESET")
  })
})

describe("CrmSubnav — CRM 하위 탭 개인 숨김(2026-09-25)", () => {
  it("셸 컨텍스트의 오버라이드를 공유 판정으로 읽는다(자체 계산 금지)", () => {
    expect(crmSubnav).toContain("useAdminNavPreferences()")
    expect(crmSubnav).toContain("normalizeNavOverrides(navOverrides)")
    expect(crmSubnav).toContain("resolveCrmSubnavAccess(overrides)")
  })

  it("현재 화면의 숨긴 탭은 강제로 보인다(1차·고객 보조 줄 모두)", () => {
    expect(crmSubnav).toContain("!crmAccess.hiddenHrefs.has(child.href) || child.match(currentPath)")
    expect(crmSubnav).toContain("!crmAccess.hiddenHrefs.has(sub.href) || customersSub === sub.key")
    expect(crmSubnav).toContain("(숨긴 탭)")
  })

  it("'숨긴 탭 N · 보기' 토글과 '다시 표시'를 두고 본인 경로로 저장한다", () => {
    expect(crmSubnav).toContain("숨긴 탭")
    expect(crmSubnav).toContain("다시 표시")
    expect(crmSubnav).toContain('aria-label="숨긴 CRM 탭"')
    expect(crmSubnav).toContain('setCrmSubnavOverride(overrides, href, "shown")')
    expect(crmSubnav).toContain("saveMyNavOverrides(")
    expect(crmSubnav).toContain("onNavOverridesChange?.(saved)")
    expect(crmSubnav).toContain('role="alert"')
  })

  it("숨겨도 열린다는 안내와 사이드바 편집 이벤트를 싣는다", () => {
    expect(crmSubnav).toContain("숨겨도 ⌘K·주소로 열립니다")
    expect(crmSubnav).toContain("new CustomEvent(ADMIN_OPEN_NAV_EDITOR_EVENT)")
  })
})

describe("MembersPanel — 탭 권한 진입점", () => {
  const panel = readFileSync(
    join(process.cwd(), "components/admin/settings/MembersPanel.tsx"),
    "utf8"
  )

  it("shows the nav access entry only to a SUPER_ADMIN viewer", () => {
    expect(panel).toContain("canManageCapabilities")
    expect(panel).toContain("MemberNavAccessDrawer")
  })

  it("회원의 현재 nav_preset 을 드로어에 넘기고, 저장된 값을 목록에 그대로 담는다(2026-11-20)", () => {
    expect(panel).toContain("initialPreset={navTarget.navPreset ?? null}")
    expect(panel).toContain("{ ...item, navPreset, navOverrides }")
    expect(panel).not.toContain("navPreset: null")
    // 버튼 옆에 전체/간소를 공유 판정으로 표시한다.
    expect(panel).toContain("hasFullAdminNav({ role: String(user.role), preset: user.navPreset })")
  })
})

describe("본문 컨텍스트 — 화면 안 탭이 사이드바와 같은 기준을 쓴다", () => {
  const context = readFileSync(
    join(process.cwd(), "components/admin/admin-nav-preferences-context.tsx"),
    "utf8"
  )

  it("navPreset 을 싣고, 판정은 소비자가 hasFullAdminNav 로 하게 한다", () => {
    expect(context).toContain("navPreset?: string | null")
    expect(context).toContain("hasFullAdminNav({ role, preset: navPreset })")
    // 컨텍스트 모듈 자신은 판정 함수를 들여오지 않는다(타입만).
    expect(context).toContain('import type { NavOverrides } from "./admin-nav-access"')
  })
})
