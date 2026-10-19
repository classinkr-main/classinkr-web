import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const sidebar = readFileSync(join(process.cwd(), "components/admin/AdminSidebar.tsx"), "utf8")

describe("AdminSidebar — 상시/기타 2단 구조", () => {
  it("resolves placement through the shared access module, not a local copy", () => {
    expect(sidebar).toContain('from "./admin-nav-access"')
    expect(sidebar).toContain("resolveAdminNavAccess(")
  })

  it("stops rendering section headers (기타 범주 소제목이 대신한다)", () => {
    expect(sidebar).not.toContain("ADMIN_NAV_SECTION_META[section].label")
  })

  it("remembers the 기타 open state across reloads", () => {
    expect(sidebar).toContain("admin_sidebar_other_open")
  })

  it("greys out work-in-progress tabs", () => {
    expect(sidebar).toContain('maturity === "wip"')
    expect(sidebar).toContain("다듬는 중")
  })

  it("labels folded groups with the shared category meta", () => {
    expect(sidebar).toContain("ADMIN_NAV_CATEGORY_META")
  })

  it("groups the primary list with the shared category partition (2026-08-18)", () => {
    // 상시 소제목의 표시 여부·묶음은 사이드바가 자체 계산하지 않고 resolveNavAccess 결과를 쓴다.
    expect(sidebar).toContain("navAccess.primaryGroups")
    expect(sidebar).toContain("navAccess.showPrimaryHeaders")
  })

  it("keeps hover warm-up wired on folded items too", () => {
    // 기타 항목도 hover 시 프리페치돼야 한다 — 접혀 있다고 느려도 되는 건 아니다.
    const foldedBlock = sidebar.slice(sidebar.indexOf("navAccess.folded"))
    expect(foldedBlock).toContain("scheduleWarmAdminTab")
  })

  it("points the mobile bottom bar at the new IA", () => {
    expect(sidebar).toContain('href: "/admin/calendar"')
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

  it("숨긴 탭 묶음을 기타 아래에 그리고, 현재 경로가 숨긴 항목이면 강제로 펼친다", () => {
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
  it("상시·기타·숨김 3단을 주되 '차단' 문구는 어디에도 쓰지 않는다", () => {
    expect(editor).toContain('label: "상시"')
    expect(editor).toContain('label: "기타"')
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

  it("Overview 는 숨김을 비활성화하고 이유를 보여준다", () => {
    expect(editor).toContain("로그인 첫 화면이라 숨길 수 없습니다")
    expect(editor).toContain('option.value === "hidden" && !hideable')
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
})

describe("MyNavEditorDrawer — 본인 편집", () => {
  it("본인 경로로 저장하고 같은 편집기를 쓴다", () => {
    expect(myDrawer).toContain("saveMyNavOverrides(")
    expect(myDrawer).toContain("<NavPreferenceEditor")
    expect(myDrawer).toContain('subject="self"')
    expect(myDrawer).not.toContain("/api/admin/users")
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
})
