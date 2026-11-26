// 어드민 사이드바 배치 SSOT — 순수 데이터/함수만 둔다(React·브라우저 API 없음).
// 사이드바·모바일·커맨드 팔레트·권한 미리보기는 전부 이 모듈의 resolveAdminNavAccess를 거쳐야
// 서로 어긋나지 않는다.
//
// ── 2026-11-20 전체 / 간소 사이드바 (지금 규칙) ────────────────────────────────
// 정본: docs/active/sales-workspace-simplification-plan-2026-11-20.md W1 · D1 · D2.
// 2026-09-10 의 "모든 매니저가 같은 사이드바를 본다"를 **기본값만** 둘로 갈랐다.
//
//  - 전체 사이드바: SUPER_ADMIN 역할, 또는 admin_profiles.nav_preset 이 "super" 인 지정 계정
//    (hasFullAdminNav). 2026-09-10 ~ 11-19 의 사이드바와 완전히 같다(아래 단락들이 그 규칙이다).
//  - 간소 사이드바: 그 밖의 모든 계정. 기본값이 Overview + 매출 장부 + 견적·문서 + 하드웨어 재고만 상시이고
//    (SIMPLE_NAV_PRIMARY_HREFS) 나머지는 전부 기본 숨김이다.
//
// 왜 바꿨나 — 팀원이 계속 가입하는데 처음 보는 화면이 관리자용 Overview 와 16개 탭이었다.
// 지금 팀이 실제로 쓰는 표면은 장부와 견적이고(2026-11-23 부터 견적 산출물을 검증하는 하드웨어 재고까지
// 셋), 나머지는 화면을 고도화하면서 하나씩 다시 꺼낸다.
//
// 무엇을 **되살리지 않았나** — 차단(deny)이다. 2026-09-10 의 근거 1(nav 는 보안 경계가 아니다)은
// 그대로다. 숨김은 메뉴와 눈에 보이는 목록(사이드바 · 모바일 메뉴/하단 바로가기 · "기타" ·
// "숨긴 탭 N" · ⌘K 명령 목록)에서만 적용되고, 주소로 들어가면 모든 화면이 지금처럼 열린다.
// 데이터 접근은 예나 지금이나 각 API 의 역할 검사가 막는다. NavPlacement 에 "deny" 를 다시
// 넣지 말 것.
//
// 그때의 사고를 이번엔 어떻게 막나 — 2026-09-10 전환의 직접 원인은 "로그인은 전원을 Overview 로
// 보내는데 Overview 가 일부 역할에게 막혀 있던" 것, 곧 착지 경로와 숨김/차단 목록이 서로 다른
// 파일에서 따로 움직인 것이었다(아래 근거 2). 그래서 이번에는
//  1. 착지 경로를 이 파일의 resolveAdminLandingHref 하나로 정하고, 로그인
//     (app/admin/login/page.tsx)과 /admin(app/admin/page.tsx)은 이 함수만 부른다.
//  2. "숨길 수 없는 항목"을 고정 목록이 아니라 **그 계정의 착지 화면**으로 정의했다
//     (isNavHideable(href, ctx)). 착지를 바꾸면 숨김 불가도 같이 따라온다.
//  3. tests/admin/nav-access.test.ts 가 "착지 경로는 그 계정에게 숨김이 아니다"를 역할 ·
//     프리셋 · 오버라이드 조합 전체에서 고정한다.
//
// 간소 계정에게 남는 것 / 사라지는 것:
//  - getAccessibleAdminNavItems 는 간소 계정에서도 항상 ADMIN_NAV 전체다(아래 불변식 그대로).
//    주소로 들어간 화면의 모바일 헤더 라벨 · active 판정이 여기에 기댄다.
//  - ⌘K 는 팔레트 쪽에서만 거른다 — 간소 계정의 명령 목록은 보이는 탭과 그 자식뿐이다
//    (AdminCommandPalette.resolveAdminCommands, crm/CrmCommandPalette).
//  - 사이드바의 범주 소제목 · "숨긴 탭 N" 묶음 · "사이드바 편집" 진입점은 간소 계정에게 그리지
//    않는다(ResolvedNavAccess.fullNav). 거의 전부가 숨김이라 그 묶음이 곧 전체 메뉴가 되기 때문이다.
//  - 개인 오버라이드는 여전히 기본값을 이긴다. 간소 계정의 탭을 되살리는 길은 설정 › 회원에서
//    최고 관리자가 그 사람 배치를 고치거나 "전체 사이드바"를 켜는 것이다.
//
// nav_preset 컬럼은 2026-09-10 이후 "레거시, 화면을 가르지 말 것"이었다. 값 "super" 하나만
// 위 용도로 다시 쓴다 — 지정 계정의 역할을 SUPER_ADMIN 으로 올리면 API 권한까지 열리기 때문이다.
// 다른 값(staff · sales · marketing · cs · lead · branch)은 여전히 아무것도 가르지 않는다.
//
// ── 2026-09-10 전면 공개 전환 (전체 사이드바의 규칙 · 차단을 걷어낸 근거) ────────────
// 프리셋별 차등 노출(NAV_PRESETS·MOON_ONLY_HREFS·RESTRICTED_HREFS)과 "차단(deny)" 배치를
// 걷어냈다. 그때는 **모든 매니저가 같은 사이드바를 봤다**(2026-11-20 부터는 위 단락). 근거:
//
//  1. nav 는 보안 경계가 아니다. 이 파일 위쪽에 있던 경고문 그대로 — 실제 데이터 접근은 각
//     API 의 verifyAdmin()/requireVerifiedAdminContext() 역할 검사와 capability 가 강제한다
//     (docs/active/admin-guidance-map.md §2). 사이드바에서 숨기는 것은 접근 통제가 아니라
//     화면 정리였고, 그 대가로 업무 표면만 좁아졌다.
//  2. 차등 노출이 만든 실제 사고: 로그인(app/admin/login/page.tsx)은 전원을 /admin/overview 로
//     보내는데 그 경로가 MOON_ONLY_HREFS 라, 비 SUPER_ADMIN 은 로그인 직후 "접근 권한이
//     없습니다" 차단 화면부터 봤다. 두 SSOT 가 서로를 모른 채 반대로 움직인 것이다.
//  3. "저 사람 화면엔 왜 그 탭이 있지"를 매번 설명하는 비용이 숨겨서 얻는 이득보다 컸다.
//
// 남는 축은 **배치 하나뿐**이다: 자주 쓰는 표면은 상시(상단), 나머지는 범주별로 따로 접힌 "접힘"(2026-11-09 전까지는 하나로 접힌 "기타").
// 사람별 예외(nav_overrides)는 그 두 자리를 옮기는 개인 취향 설정으로만 남는다 — 더 이상
// 누구의 접근도 막지 못한다.
//
// ── 2026-09-25 개인 숨김(세 번째 값 "hidden") ─────────────────────────────────
// 매니저가 자기 사이드바에서 안 쓰는 탭을 치울 수 있게 저장값에 "hidden" 을 더했다. 이것은
// **자기 목록 정리일 뿐 도달성을 바꾸지 않는다**:
//  - getAccessibleAdminNavItems 는 숨긴 항목을 포함해 항상 ADMIN_NAV 전체를 돌려준다 —
//    ⌘K 명령 목록·active 판정의 형제 목록·모바일 헤더 라벨이 이 집합에 기대고 있다.
//  - 숨긴 탭도 주소와 ⌘K 로 그대로 열리고, 그 화면에 있으면 사이드바가 "숨긴 탭" 묶음을
//    펼쳐 현재 위치를 보여준다.
//  - 그 계정의 착지 화면은 숨길 수 없다(isNavHideable) — 전체 계정은 Overview, 간소 계정은
//    매출 장부다. 로그인·/admin 이 그 계정을 그리로 보낸다(resolveAdminLandingHref).
//  - 거의 안 쓰는 탭 몇 개는 전체 계정의 기본값이 숨김이다(DEFAULT_HIDDEN_HREFS). 사람이 "다시
//    표시"하면 그 사람 nav_overrides 에 자리(folded/primary)가 저장된다.
// 사이드바는 렌더 자리(NavPlacement)만 알고, 숨김 여부는 ResolvedNavAccess.hidden 으로 받는다.
//
// ── 2026-09-25 CRM 하위 탭 숨김(2단계, 네임스페이스 키) ───────────────────────────
// 같은 nav_overrides 에 CRM 본문 탭 줄(CrmSubnav)의 개인 숨김도 담는다. 스키마 변경은 없다
// (컬럼 CHECK 는 "JSON 객체" 하나뿐 — 20260729_admin_nav_access.sql).
//  - 키는 `crm:<href>`(예: "crm:/admin/crm/activity"). 최상위 키는 항상 "/" 로 시작하므로
//    겹치지 않는다. 값은 "hidden" | "shown" 두 가지다 — 하위 탭에는 자리(상시/접힘)가 없고,
//    "shown" 은 전원 기본 숨김 탭을 되살릴 때만 저장된다(기본값과 같으면 키를 지운다).
//  - 숨길 수 없는 탭: CRM 진입 탭 3개(현황·고객DB(통합)·검수). 전원 기본 숨김: 기록·입력함·
//    고객DB›태그(30일 사람 쓰기 0, 역할 무관).
//  - 도달성은 그대로다: 숨긴 하위 탭도 ⌘K(두 팔레트 모두 CRM 하위 명령은 정적 목록 — crm: 키로
//    거르지 않는다)·주소·맥락 딥링크로 열리고, 그 화면에 있으면 탭 줄이 그 탭을 강제로 보인다.
//    (2026-11-20 간소 계정은 CRM 최상위 탭이 숨김이면 그 자식 명령이 통째로 빠진다 — crm: 키와는
//    다른 축이다.)
//  - 최상위 판정 함수는 ADMIN_NAV href 키만 읽으므로 crm: 키는 사이드바 배치에 영향을 주지 않는다
//    (accessible 17 불변식 그대로 — tests/admin/nav-crm-subnav.test.ts).
//  - 모르는 네임스페이스 키는 정규화가 버린다 — 저장 키 수가 레지스트리 크기로 상한된다.
import {
  ADMIN_NAV,
  ADMIN_NAV_CATEGORIES,
  CRM_CHILD_NAV,
  CRM_CUSTOMERS_CHILD_NAV,
  normalizeAdminRole,
  type AdminNavCategory,
  type AdminNavItem,
} from "./admin-nav"
import { ADMIN_AI_HREF, isAdminAiPreviewEnabled } from "@/lib/admin-ai/preview"
import { ADMIN_REQUESTS_HREF, canSubmitAdminRequest } from "@/lib/admin/requests"

/**
 * 렌더 자리는 두 곳뿐이다. "deny" 는 2026-09-10 전면 공개 전환으로 제거됐다 —
 * 타입에서 지워야 "차단을 다시 넣는" 변경이 컴파일 단계에서 드러난다.
 */
export type NavPlacement = "primary" | "folded"

/**
 * 최상위 항목(ADMIN_NAV href 키)의 선호. "hidden" 은 **내 목록에서만 치운다** — 접근·⌘K·주소
 * 진입은 그대로다(상단 주석). 렌더 자리가 아니므로 NavPlacement 와 분리한다.
 */
export type NavPreference = NavPlacement | "hidden"

/**
 * CRM 하위 탭(`crm:<href>` 키)의 선호. 자리 개념이 없다 — "shown" 은 기본 숨김 탭을 되살린 값이다.
 */
export type CrmSubnavPreference = "hidden" | "shown"

/**
 * nav_overrides 에 저장되는 값 전체 — 최상위 키는 NavPreference, `crm:` 키는 CrmSubnavPreference.
 * 판정 코드는 키 종류에 맞는 좁은 가드(isNavPreference·isCrmSubnavPreference)로만 읽는다 —
 * "shown" 이 최상위 판정으로 새지 않는 것은 그 가드가 보장한다(넓히지 말 것).
 */
export type NavOverrideValue = NavPreference | CrmSubnavPreference

/** nav_overrides 의 저장 형태(정규화 결과). */
export type NavOverrides = Record<string, NavOverrideValue>

/**
 * 착지 화면 — 로그인(app/admin/login/page.tsx)과 /admin(app/admin/page.tsx)이 계정을 보내는 곳.
 * 두 진입점은 이 상수를 직접 읽지 않고 resolveAdminLandingHref 만 부른다.
 *
 * 착지 화면은 그 계정에게 숨길 수 없다(isNavHideable) — 숨길 수 있으면 "로그인하자마자
 * 사이드바에 없는 화면"이 된다. 2026-11-19 까지는 고정 목록 UNHIDEABLE_NAV_HREFS(["/admin/overview"])
 * 였다. 상수를 지운 것은 의도다 — "Overview 는 누구에게나 숨김 불가"를 전제한 코드가 컴파일
 * 단계에서 드러나야 한다.
 */
export const FULL_NAV_LANDING_HREF = "/admin/overview"
export const SIMPLE_NAV_LANDING_HREF = "/admin/branch/ledger"

/**
 * 간소 사이드바의 상시 항목 — Overview · 매출 장부 · 견적·문서 · 하드웨어 재고.
 * 그 밖은 전부 기본 숨김이다.
 * 탭을 다시 꺼낼 때(S2) 여기에 href 를 더한다. 두 가지를 지킬 것(테스트가 고정한다):
 *  - SIMPLE_NAV_LANDING_HREF 가 이 목록에 있어야 한다.
 *  - 간소 계정에서는 resolveDefaultNavPlacement 가 이 목록을 항상 "primary" 로 판정해
 *    접힘 묶음이 생기지 않게 한다(전체 계정의 D안에서는 매출 장부가 접힘 자리다).
 */
// (2026-11-23) 하드웨어 재고를 더했다 — 시안 확인 때 "하단에 하드웨어 탭까지" 로 정해졌다. 견적 산출물을
// 재고에서 검증하는 한 흐름이라 견적과 같이 꺼낸다.
export const SIMPLE_NAV_PRIMARY_HREFS: readonly string[] = [
  FULL_NAV_LANDING_HREF,
  SIMPLE_NAV_LANDING_HREF,
  "/admin/quotes",
  "/admin/hardware",
]

/**
 * 간소 사이드바 상시 항목의 탭 이름(선언 순서). 안내 문구가 목록을 글자로 박아 두면 상수가 바뀔 때
 * 문구만 낡는다 — 편집기·회원 서랍은 이 함수로 읽는다.
 */
export function getSimpleNavPrimaryLabels(): string[] {
  return ADMIN_NAV.filter((item) => SIMPLE_NAV_PRIMARY_HREFS.includes(item.href)).map((item) => item.label)
}

/**
 * 전체 계정의 기본값이 숨김인 항목 — 거의 안 쓰는 탭(2026-09-24 운영 조사).
 *  - 운영 상태: 설정 › 외부 연동과 같은 API(/api/admin/settings/integrations/status)를 읽는다.
 *    60일 커밋 0·인바운드 0.
 * (마케팅 프로젝트도 2026-09-25 부터 여기 있었으나, 2026-10 캠페인 관리의 "프로젝트" 탭으로 합쳐지며
 *  사이드바 항목 자체가 없어졌다. 그 href 를 가진 개인 오버라이드는 정규화가 조용히 버린다.)
 * 숨겨도 ⌘K·주소로는 그대로 열린다. 사람이 "다시 표시"하면 그 사람 오버라이드가 이긴다.
 */
export const DEFAULT_HIDDEN_HREFS: readonly string[] = ["/admin/ops"]

/**
 * nav_preset 컬럼의 키. **"super" 하나만 뜻이 있다** — 전체 사이드바 지정(hasFullAdminNav,
 * 2026-11-20). 나머지 여섯은 레거시이고 아무것도 가르지 않지만 두 가지 이유로 타입을 남긴다.
 *  - admin_profiles.nav_preset 컬럼과 20260729 마이그레이션의 CHECK 제약이 이 값들을 그대로
 *    허용한다. 타입을 지우면 기존 행(sales·branch 등)을 읽는 API 가 400 을 내기 시작한다.
 *  - 컬럼 자체를 드롭하는 마이그레이션은 되돌리기 어려워 별도 결정으로 미룬다.
 * 새 코드에서 이 키를 직접 비교해 화면을 갈라서는 안 된다 — 판정은 hasFullAdminNav 하나다.
 */
export type NavPresetKey = "staff" | "sales" | "marketing" | "cs" | "lead" | "branch" | "super"

const NAV_PRESET_KEYS: readonly NavPresetKey[] = [
  "staff",
  "sales",
  "marketing",
  "cs",
  "lead",
  "branch",
  "super",
]

/**
 * 전체 계정은 공통 상시 업무 메뉴에 일정·CRM·마케팅·콘텐츠·CS를 더한다.
 * 화면 순서는 ADMIN_NAV를 따른다.
 */
export const DEFAULT_PRIMARY_HREFS: readonly string[] = [
  ...SIMPLE_NAV_PRIMARY_HREFS,
  ...(isAdminAiPreviewEnabled() ? [ADMIN_AI_HREF] : []),
  "/admin/calendar",
  "/admin/crm",
  "/admin/campaigns",
  "/admin/blog",
  "/admin/chatbot",
]

/** 전체 사이드바 지정에 쓰는 nav_preset 값. 설정 › 회원의 "전체 사이드바" 토글이 이 값을 쓴다. */
export const FULL_NAV_PRESET: NavPresetKey = "super"

/**
 * 전체/간소 판정에 필요한 최소 컨텍스트. preset 은 DB·세션의 원본 문자열을 그대로 받는다 —
 * "super" 가 아닌 값(레거시 sales·branch, 빈 문자열, 모르는 값)은 전부 간소다.
 */
export interface NavAudienceContext {
  role: string
  preset?: string | null
}

/**
 * 전체 사이드바를 보는 계정인지 — 2026-11-20 결정(docs/active/sales-workspace-simplification-plan-2026-11-20.md D1).
 *
 * 전체: SUPER_ADMIN 역할, 또는 nav_preset 이 "super" 인 지정 계정. 그 밖은 "간소"(매출 장부 + 견적·문서 + 하드웨어 재고).
 * 지정 계정은 **역할을 올리지 않는다** — 역할은 API 권한이고, 이것은 메뉴 표시일 뿐이다. 그래서
 * 레거시였던 nav_preset 컬럼의 "super" 값 하나만 이 용도로 다시 쓴다(다른 프리셋 값은 여전히
 * 화면을 가르지 않는다).
 *
 * 보안 경계가 아니다. 간소 계정도 주소로는 모든 화면에 들어가고, 데이터는 각 API 가 막는다(D2).
 * 사이드바·⌘K·화면 안 탭(견적·문서, 매출 장부 렌즈)이 같은 기준을 쓰도록 판정을 여기 한 곳에 둔다.
 */
export function hasFullAdminNav(ctx: NavAudienceContext): boolean {
  if (normalizeAdminRole(ctx.role) === "SUPER_ADMIN") return true
  return ctx.preset === FULL_NAV_PRESET
}

/**
 * 로그인 · /admin 이 그 계정을 보내는 화면. 전체 → Overview, 간소 → 매출 장부(2026-11-20 S3).
 *
 * 착지를 정하는 곳은 여기 하나다. 이 함수가 돌려준 경로는 그 계정에게 숨길 수 없으므로
 * (isNavHideable) 개인 오버라이드가 무엇이든 착지 화면은 사이드바에 있다 — 오버라이드를 인자로
 * 받지 않는 이유다. 세션을 모르는 호출부는 FULL_NAV_LANDING_HREF 로 떨어지면 된다(주소 진입은
 * 막히지 않고, 미인증이면 proxy 가 로그인으로 돌린다).
 */
export function resolveAdminLandingHref(ctx: NavAudienceContext): string {
  return hasFullAdminNav(ctx) ? FULL_NAV_LANDING_HREF : SIMPLE_NAV_LANDING_HREF
}

export function isNavPresetKey(value: unknown): value is NavPresetKey {
  return typeof value === "string" && (NAV_PRESET_KEYS as readonly string[]).includes(value)
}

export function isNavPlacement(value: unknown): value is NavPlacement {
  return value === "primary" || value === "folded"
}

/** 최상위 키의 값인지 — "shown"(CRM 하위 탭 전용)은 통과시키지 않는다. */
export function isNavPreference(value: unknown): value is NavPreference {
  return isNavPlacement(value) || value === "hidden"
}

export function isCrmSubnavPreference(value: unknown): value is CrmSubnavPreference {
  return value === "hidden" || value === "shown"
}

/** 이 계정이 이 항목을 숨길 수 있는지 — 그 계정의 착지 화면만 불가(전체: Overview, 간소: 매출 장부). */
export function isNavHideable(href: string, ctx: NavAudienceContext): boolean {
  return href !== FULL_NAV_LANDING_HREF && href !== resolveAdminLandingHref(ctx)
}

/**
 * DB의 nav_overrides(JSONB)를 신뢰하지 않고 정규화한다 — 모르는 키·값은 버린다.
 *
 * 레거시 "deny" 는 버리지 않고 "folded" 로 강등한다. 그냥 버리면 그 항목이 상시로 튀어올라
 * "숨겨 뒀던 게 갑자기 맨 위에" 가 되고, 남겨두면 전면 공개 전환이 무의미해진다. 접힘으로
 * 내리는 것이 두 의도를 모두 존중하는 유일한 처리다. **"hidden" 으로 옮기지 않는다** —
 * deny 는 관리자가 남에게 건 제한이었고, hidden 은 본인이 고른 정리라 의미가 다르다.
 *
 * 예외 — 기본 숨김 항목(DEFAULT_HIDDEN_HREFS)의 deny 는 키째 버려 기본값(숨김)을 따르게 한다.
 * folded 로 강등하면 deny 가 남아 있던 사람만 그 항목이 접힘 묶음에 "보이게" 돼, 숨기려던 제한이
 * 오히려 노출로 뒤집힌다. 키를 버려도 hidden 을 저장하는 것이 아니다(본인 선택으로 위장하지 않음).
 *
 * "hidden" 은 보존하되 Overview 의 hidden 은 키째 지운다. 정규화는 계정을 모르므로(저장 라우트
 * 세 곳이 계정 없이 부른다) 공통 상시 메뉴인 Overview의 숨김만 지운다. 간소 계정의 착지(매출
 * 장부) hidden 은 전체 계정에게는 정당한 선택이라 여기서 지우지 않고, resolveNavPreference 가
 * 계정을 보고 무시한다(역할·지정이 나중에 바뀌어도 저장값을 고칠 필요가 없다).
 *
 * 네임스페이스 키("/" 로 시작하지 않는 키)는 먼저 갈라 처리한다. `crm:<href>` 는 레지스트리
 * (CRM_SUBNAV_PREFERENCE_ITEMS)에 있는 숨길 수 있는 탭이고 값이 hidden|shown 일 때만 보존하고,
 * 그 밖의 네임스페이스·값은 버린다. 저장 경로 세 곳(본인 PATCH·회원 PATCH·사이드바 다시 표시)이
 * 모두 이 함수를 거치므로 어느 경로로 저장해도 CRM 하위 탭 선택이 살아남는다.
 */
export function normalizeNavOverrides(value: unknown): NavOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const known = new Set(ADMIN_NAV.map((item) => item.href))
  const result: NavOverrides = {}

  for (const [href, placement] of Object.entries(value as Record<string, unknown>)) {
    if (!href.startsWith("/")) {
      const crmHref = parseCrmSubnavKey(href)
      if (crmHref !== null && isCrmSubnavHideable(crmHref) && isCrmSubnavPreference(placement)) {
        result[href] = placement
      }
      continue
    }
    if (!known.has(href)) continue
    if (isNavPlacement(placement)) result[href] = placement
    else if (placement === "hidden") {
      if (href !== FULL_NAV_LANDING_HREF) result[href] = "hidden"
    } else if (placement === "deny") {
      if (!DEFAULT_HIDDEN_HREFS.includes(href)) result[href] = "folded"
    }
  }

  return result
}

export interface NavAccessContext extends NavAudienceContext {
  /**
   * 역할. SUPER_ADMIN 이면 전체 사이드바다(hasFullAdminNav). 그 밖의 역할끼리는 배치가 갈리지
   * 않는다 — 레거시 소문자 값은 hasFullAdminNav 가 normalizeAdminRole 로 읽는다.
   */
  role: string
  /**
   * admin_profiles.nav_preset 원본값. **"super" 면 전체 사이드바**(지정 계정, 2026-11-20)이고
   * 그 밖의 값·null·생략은 역할만으로 판정한다. 호출부가 이 값을 빠뜨리면 지정 계정이 간소로
   * 떨어진다 — 세션의 navPreset 을 그대로 넘길 것.
   */
  preset?: string | null
  /** crm: 키가 섞여 있어도 된다 — 최상위 판정은 ADMIN_NAV href 키만 읽는다. */
  overrides: Readonly<NavOverrides>
}

/** 보일 때 앉는 기본 자리. 상시 기본 항목은 두 모드에서 같은 자리를 쓴다. */
function resolveDefaultNavPlacement(href: string): NavPlacement {
  return DEFAULT_PRIMARY_HREFS.includes(href) ? "primary" : "folded"
}

/**
 * 오버라이드가 없을 때 그 계정의 기본값. setNavOverride 의 "기본과 같으면 키 삭제" 기준이기도 하다.
 *  - 착지 화면은 항상 보인다(숨김 불가).
 *  - 전체 계정: 기본 숨김(DEFAULT_HIDDEN_HREFS) → 상시 → 접힘.
 *  - 간소 계정: SIMPLE_NAV_PRIMARY_HREFS와 접수 권한이 있는 요청 메뉴를 표시한다.
 */
export function resolveDefaultNavPreference(href: string, ctx: NavAudienceContext): NavPreference {
  if (href === ADMIN_REQUESTS_HREF) return canSubmitAdminRequest(ctx.role) ? "folded" : "hidden"
  if (!isNavHideable(href, ctx)) return resolveDefaultNavPlacement(href)
  const hiddenByDefault = hasFullAdminNav(ctx)
    ? DEFAULT_HIDDEN_HREFS.includes(href)
    : !SIMPLE_NAV_PRIMARY_HREFS.includes(href)
  return hiddenByDefault ? "hidden" : resolveDefaultNavPlacement(href)
}

/**
 * 한 항목의 최종 선호 — 사람별 예외가 있으면 그것, 없으면 그 계정의 기본값(전체/간소).
 * 숨길 수 없는 항목(그 계정의 착지)의 hidden 은 무시한다 — 정규화를 거치지 않은 컨텍스트가
 * 들어오거나, 전체 계정일 때 매출 장부를 숨겼던 사람이 간소 계정이 돼도 착지가 사라지지 않게.
 */
export function resolveNavPreference(href: string, ctx: NavAccessContext): NavPreference {
  const override = ctx.overrides[href]
  if (isNavPreference(override)) {
    if (override === "hidden" && !isNavHideable(href, ctx)) return resolveDefaultNavPlacement(href)
    return override
  }

  return resolveDefaultNavPreference(href, ctx)
}

/** 내 사이드바 목록에서 치워졌는지. 도달성과는 무관하다. */
export function isNavHidden(href: string, ctx: NavAccessContext): boolean {
  return resolveNavPreference(href, ctx) === "hidden"
}

/**
 * 렌더 자리 판정 — 보일 때 앉는 자리(상시/접힘)만 돌려준다. 숨김은 무시한다: 숨긴 항목은
 * 기본 자리를 돌려주므로 "다시 표시"가 그 자리로 되돌아간다. 숨김 여부는 isNavHidden.
 */
export function resolveNavPlacement(href: string, ctx: NavAccessContext): NavPlacement {
  const override = ctx.overrides[href]
  if (isNavPlacement(override)) return override

  return resolveDefaultNavPlacement(href)
}

/**
 * 한 항목의 선호를 바꾼 새 오버라이드를 돌려준다(원본은 건드리지 않는다).
 * 결과가 **그 계정의** 기본값과 같으면 키를 지운다 — 불필요한 예외가 쌓이면 읽기 어렵고, 기본값이
 * 나중에 바뀌어도 그 사람에게 전달되지 않는다. 모르는 href·숨길 수 없는 항목의 hidden 은 무시한다.
 * 다른 키(crm: 하위 탭 포함)는 그대로 복사된다 — 사이드바 "다시 표시"가 CRM 선택을 지우지 않는다.
 *
 * audience 는 오버라이드의 주인이다(편집하는 사람이 아니다) — 설정 › 회원에서 최고 관리자가 간소
 * 계정을 고칠 때는 그 회원의 역할·지정을 넘긴다.
 */
export function setNavOverride(
  overrides: Readonly<NavOverrides>,
  href: string,
  next: NavPreference,
  audience: NavAudienceContext
): NavOverrides {
  const draft: NavOverrides = { ...overrides }
  if (!ADMIN_NAV.some((item) => item.href === href)) return draft
  if (next === "hidden" && !isNavHideable(href, audience)) return draft

  if (next === resolveDefaultNavPreference(href, audience)) delete draft[href]
  else draft[href] = next

  return draft
}

export interface NavPreferenceRow {
  item: AdminNavItem
  /** 지금 선택된 값(숨김 포함). */
  preference: NavPreference
  /** 그 계정의 기본값(전체/간소). */
  base: NavPreference
  /** 기본과 다른지 — 편집기의 "예외" 표시. */
  isException: boolean
  /** 숨김 선택지를 열어도 되는지(그 계정의 착지 화면은 false). */
  hideable: boolean
}

/** 편집기 행 목록 — ADMIN_NAV 선언 순서. 사이드바 편집기 두 곳(본인·회원 관리)이 공유한다. */
export function buildNavPreferenceRows(ctx: NavAccessContext): NavPreferenceRow[] {
  return ADMIN_NAV.map((item) => {
    const preference = resolveNavPreference(item.href, ctx)
    const base = resolveDefaultNavPreference(item.href, ctx)
    return {
      item,
      preference,
      base,
      isException: preference !== base,
      hideable: isNavHideable(item.href, ctx),
    }
  })
}

export interface FoldedNavGroup {
  category: AdminNavCategory
  items: AdminNavItem[]
}

export interface ResolvedNavAccess {
  /**
   * 전체 사이드바 계정인지(hasFullAdminNav). false(간소)면 사이드바는 "숨긴 탭 N" 묶음과
   * "사이드바 편집" 진입점을 그리지 않고, ⌘K 는 hidden 의 탭과 그 자식 명령을 뺀다. 사이드바 ·
   * 팔레트 · 미리보기가 각자 판정하면 어긋나므로 여기서 한 번만 계산한다.
   */
  fullNav: boolean
  /** 상시 항목 — ADMIN_NAV 선언 순서 그대로(렌더에서 재정렬하지 않는다). */
  primary: AdminNavItem[]
  /**
   * primary를 접힘과 같은 범주로 묶은 것 — 상시 목록의 범주 사이 간격 렌더용.
   * ADMIN_NAV 선언이 범주 연속 블록이라 이 묶음은 재정렬 없는 분할이며,
   * 항목을 이어 붙이면 primary와 순서가 완전히 같다.
   * (2026-11-09 D안) 상시 목록은 소제목을 그리지 않는다 — 묶음 사이에 간격만 둔다. 2026-08-18부터
   * 있던 showPrimaryHeaders 판정은 그래서 지웠다.
   */
  primaryGroups: FoldedNavGroup[]
  /**
   * 접힘 자리 — 범주별 묶음. 사이드바는 묶음마다 따로 접는다(범주 이름 = 접힘 토글 라벨).
   * 빈 범주는 없다(groupNavByCategory 가 버린다).
   */
  folded: FoldedNavGroup[]
  /**
   * 내 목록에서 숨긴 항목 — ADMIN_NAV 선언 순서. primary·folded 어디에도 들어가지 않는다.
   * 전체 계정의 사이드바는 접힘 묶음 아래 "숨긴 탭 N" 묶음으로 보여주고, 간소 계정에게는 그리지
   * 않는다(fullNav). 도달성은 어느 쪽이든 그대로다(getAccessibleAdminNavItems 가 이 목록까지 포함한다).
   */
  hidden: AdminNavItem[]
}

/** 항목들을 범주 선언 순서(ADMIN_NAV_CATEGORY_META)로 묶는다. 빈 범주는 사라진다. */
function groupNavByCategory(items: readonly AdminNavItem[]): FoldedNavGroup[] {
  const byCategory = new Map<AdminNavCategory, AdminNavItem[]>()

  for (const item of items) {
    const category = item.category ?? "system"
    const bucket = byCategory.get(category)
    if (bucket) bucket.push(item)
    else byCategory.set(category, [item])
  }

  return ADMIN_NAV_CATEGORIES.flatMap((category) => {
    const group = byCategory.get(category)
    return group && group.length > 0 ? [{ category, items: group }] : []
  })
}

/** 순서는 유지하고 이웃한 같은 범주 항목에만 간격을 같이 적용한다. */
function groupPrimaryNav(items: readonly AdminNavItem[]): FoldedNavGroup[] {
  const groups: FoldedNavGroup[] = []
  for (const item of items) {
    const category = item.category ?? "system"
    const last = groups.at(-1)
    if (last?.category === category) last.items.push(item)
    else groups.push({ category, items: [item] })
  }
  return groups
}

/**
 * 항목들을 상시/접힘/숨김으로 나눈다(저장값 "folded" = 접힘 자리 — 편집기 라벨은 2026-11-09 "기타" → "접힘").
 * 상시 순서는 ADMIN_NAV 선언 순서를 그대로 따르고(렌더에서 재정렬하지 않는다),
 * 상시·접힘 모두 같은 범주로 묶는다. 숨김은 평면 목록이다.
 */
export function resolveNavAccess(
  ctx: NavAccessContext,
  items: readonly AdminNavItem[] = ADMIN_NAV
): ResolvedNavAccess {
  const primary: AdminNavItem[] = []
  const foldedItems: AdminNavItem[] = []
  const hidden: AdminNavItem[] = []

  for (const item of items) {
    if (isNavHidden(item.href, ctx)) hidden.push(item)
    else if (resolveNavPlacement(item.href, ctx) === "primary") primary.push(item)
    else foldedItems.push(item)
  }

  return {
    fullNav: hasFullAdminNav(ctx),
    primary,
    primaryGroups: groupPrimaryNav(primary),
    folded: groupNavByCategory(foldedItems),
    hidden,
  }
}

/**
 * 실제 사용자 컨텍스트용 단일 진입점.
 *
 * 여기서 항목을 걸러내지 않는다 — 결과의 primary · folded · hidden 을 합치면 항상 ADMIN_NAV
 * 전체다. role · preset 은 기본값(전체/간소, 2026-11-20)만 가르고, 개인 예외는 그 위에서 상시/접힘
 * 자리를 옮기거나 내 목록에서 숨길(hidden) 뿐이다. role 은 정규화해서 넘긴다(레거시 소문자·대문자
 * 혼재 대비).
 */
export function resolveAdminNavAccess(ctx: NavAccessContext): ResolvedNavAccess {
  return resolveNavAccess(
    {
      role: normalizeAdminRole(ctx.role),
      preset: ctx.preset ?? null,
      overrides: normalizeNavOverrides(ctx.overrides),
    },
    ADMIN_NAV
  )
}

/**
 * 도달 가능한 항목을 ADMIN_NAV 선언 순서로 되돌린다.
 *
 * **불변식: 숨긴 항목까지 포함해 항상 ADMIN_NAV 전체와 같은 집합이다 — 간소 계정에서도.**
 * 전체 계정의 커맨드 팔레트 명령 목록, active 판정의 형제 목록(nav-active.ts), 모바일 헤더
 * 라벨이 이 집합에 기댄다 — 여기서 숨긴 항목을 빼면 주소로 들어간 화면의 헤더가 엉뚱한 이름을
 * 낸다. 간소 계정의 ⌘K 가 숨긴 탭을 빼는 것은 팔레트가 이 함수 **밖에서** 거른다
 * (getPaletteAdminNavItems) — 이 함수의 반환을 좁혀서 해결하지 말 것.
 * 사이드바 목록에 그릴 항목이 필요하면 getVisibleAdminNavItems 를 쓴다.
 */
export function getAccessibleAdminNavItems(access: ResolvedNavAccess): AdminNavItem[] {
  const accessibleHrefs = new Set([
    ...access.primary.map((item) => item.href),
    ...access.folded.flatMap((group) => group.items.map((item) => item.href)),
    ...access.hidden.map((item) => item.href),
  ])

  return ADMIN_NAV.filter((item) => accessibleHrefs.has(item.href))
}

/**
 * 사이드바 목록에 실제로 그리는 항목(상시 + 접힘) — ADMIN_NAV 선언 순서.
 * 모바일 하단 바로가기·유휴 프리페치 이웃처럼 "목록에 보이는 것"이 기준인 곳이 쓴다.
 */
export function getVisibleAdminNavItems(access: ResolvedNavAccess): AdminNavItem[] {
  const visibleHrefs = new Set([
    ...access.primary.map((item) => item.href),
    ...access.folded.flatMap((group) => group.items.map((item) => item.href)),
  ])

  return ADMIN_NAV.filter((item) => visibleHrefs.has(item.href))
}

/**
 * ⌘K 명령 목록의 숙주가 되는 최상위 항목 — ADMIN_NAV 선언 순서.
 *  - 전체 계정: 숨긴 항목까지 전부(2026-09-25 규칙 그대로 — 숨긴 탭도 ⌘K 로 찾는다).
 *  - 간소 계정: 목록에 보이는 항목만(2026-11-20 D2 — ⌘K 명령 목록은 "눈에 보이는 목록"이다).
 *    본인 예외로 되살린 탭은 보이는 항목이므로 함께 나온다.
 * 두 팔레트(AdminCommandPalette · crm/CrmCommandPalette)가 이 함수 하나로 거른다.
 */
export function getPaletteAdminNavItems(access: ResolvedNavAccess): AdminNavItem[] {
  return access.fullNav ? getAccessibleAdminNavItems(access) : getVisibleAdminNavItems(access)
}

// ── CRM 하위 탭 개인 숨김(2026-09-25) ───────────────────────────────────────────
// 상단 주석의 "CRM 하위 탭 숨김" 단락이 규칙 정본이다. 최상위 함수와 같은 모델(기본값·숨김
// 불가 목록·기본값과 같으면 키 삭제)을 병렬 함수로 둔다 — 최상위 로직은 건드리지 않는다.

export const CRM_SUBNAV_KEY_PREFIX = "crm:"

/**
 * 숨길 수 없는 CRM 탭 — 1차 진입 탭 3개(현황·고객DB·검수). 고객DB 보조 탭 "통합"은 1차
 * "고객DB"와 href 가 같아 함께 잠긴다. 사이드바의 CRM 링크·⌘K 가 이 화면들로 착지한다.
 */
export const CRM_SUBNAV_UNHIDEABLE_HREFS: readonly string[] = [
  "/admin/crm",
  "/admin/crm/customers/unified",
  "/admin/crm/matching",
]

/**
 * 전원 기본 숨김 CRM 탭 — 30일 사람 쓰기 0(docs/active/admin-usage-triage-2026-09-25.md).
 * 리드 응대·기록은 Compass 에서 한다(A안). 숨겨도 ⌘K·주소·맥락 딥링크(오늘 연락 → 기록,
 * 세그먼트 허브 → 태그 관리 등)로 그대로 열린다. 역할과 무관하다(2026-09-10 전면 공개 원칙).
 */
export const CRM_SUBNAV_DEFAULT_HIDDEN_HREFS: readonly string[] = [
  "/admin/crm/activity",
  "/admin/crm/capture",
  "/admin/crm/customers/tags",
]

/** 탭이 놓이는 줄 — 1차(CRM 주요 메뉴) 또는 고객DB 보조 줄. */
export type CrmSubnavBand = "primary" | "customers"

export interface CrmSubnavPreferenceItem {
  href: string
  /** 탭 줄에 쓰는 라벨. */
  label: string
  band: CrmSubnavBand
  /** 편집기·숨긴 탭 줄에서 쓰는 라벨 — 보조 탭은 "고객DB › 태그"처럼 줄 이름을 붙인다. */
  displayLabel: string
}

/**
 * 숨길 수 있는 CRM 하위 탭 레지스트리 = 1차(진입 탭 제외) + 고객DB 보조(착지 제외).
 * 선언 순서 = 편집기 행·숨긴 탭 줄 순서. 이 표에 없는 href 의 crm: 키는 정규화가 버린다.
 * 돈흐름·검수 보조 줄은 이번 범위가 아니다(표에 없으면 키가 생기지 않는다).
 */
export const CRM_SUBNAV_PREFERENCE_ITEMS: readonly CrmSubnavPreferenceItem[] = [
  ...CRM_CHILD_NAV.filter((child) => !CRM_SUBNAV_UNHIDEABLE_HREFS.includes(child.href)).map(
    (child): CrmSubnavPreferenceItem => ({
      href: child.href,
      label: child.label,
      band: "primary",
      displayLabel: child.label,
    })
  ),
  ...CRM_CUSTOMERS_CHILD_NAV.filter((sub) => !CRM_SUBNAV_UNHIDEABLE_HREFS.includes(sub.href)).map(
    (sub): CrmSubnavPreferenceItem => ({
      href: sub.href,
      label: sub.label,
      band: "customers",
      displayLabel: `고객DB › ${sub.label}`,
    })
  ),
]

/** CRM 하위 탭의 nav_overrides 키. */
export function crmSubnavKey(href: string): string {
  return `${CRM_SUBNAV_KEY_PREFIX}${href}`
}

/** `crm:<href>` 키면 href, 아니면 null. */
function parseCrmSubnavKey(key: string): string | null {
  return key.startsWith(CRM_SUBNAV_KEY_PREFIX) ? key.slice(CRM_SUBNAV_KEY_PREFIX.length) : null
}

/** 숨길 수 있는 CRM 하위 탭인지 — 레지스트리에 있어야 한다(진입 탭·모르는 href 는 false). */
export function isCrmSubnavHideable(href: string): boolean {
  return CRM_SUBNAV_PREFERENCE_ITEMS.some((item) => item.href === href)
}

/** 오버라이드가 없을 때의 전원 공통 기본값. setCrmSubnavOverride 의 "기본과 같으면 키 삭제" 기준. */
export function resolveCrmSubnavDefault(href: string): CrmSubnavPreference {
  return isCrmSubnavHideable(href) && CRM_SUBNAV_DEFAULT_HIDDEN_HREFS.includes(href) ? "hidden" : "shown"
}

/**
 * 한 CRM 하위 탭의 최종 선호. 숨길 수 없는 탭은 입력과 무관하게 항상 shown 이다 — 정규화를
 * 거치지 않은 값이 들어와도 진입 탭이 사라지지 않게.
 */
export function resolveCrmSubnavPreference(
  href: string,
  overrides: Readonly<Record<string, string>>
): CrmSubnavPreference {
  if (!isCrmSubnavHideable(href)) return "shown"
  const override = overrides[crmSubnavKey(href)]
  return isCrmSubnavPreference(override) ? override : resolveCrmSubnavDefault(href)
}

/**
 * 한 CRM 하위 탭의 선호를 바꾼 새 오버라이드(원본 불변). 기본값과 같으면 키를 지운다.
 * 숨길 수 없는 탭·모르는 href 는 무시하고 사본을 그대로 돌려준다. 다른 키(최상위 포함)는 복사된다.
 */
export function setCrmSubnavOverride(
  overrides: Readonly<NavOverrides>,
  href: string,
  next: CrmSubnavPreference
): NavOverrides {
  const draft: NavOverrides = { ...overrides }
  if (!isCrmSubnavHideable(href)) return draft

  const key = crmSubnavKey(href)
  if (next === resolveCrmSubnavDefault(href)) delete draft[key]
  else draft[key] = next

  return draft
}

export interface ResolvedCrmSubnavAccess {
  /** 지금 숨김인 탭 — 레지스트리 순서. "숨긴 탭 N" 의 N 이다(현재 화면이라 강제 표시 중인 탭 포함). */
  hidden: CrmSubnavPreferenceItem[]
  hiddenHrefs: ReadonlySet<string>
}

/** CRM 탭 줄이 쓰는 숨김 판정 — 강제 표시(현재 화면)는 호출부가 경로로 더한다. */
export function resolveCrmSubnavAccess(overrides: Readonly<Record<string, string>>): ResolvedCrmSubnavAccess {
  const hidden = CRM_SUBNAV_PREFERENCE_ITEMS.filter(
    (item) => resolveCrmSubnavPreference(item.href, overrides) === "hidden"
  )
  return { hidden, hiddenHrefs: new Set(hidden.map((item) => item.href)) }
}

export interface CrmSubnavPreferenceRow {
  item: CrmSubnavPreferenceItem
  preference: CrmSubnavPreference
  base: CrmSubnavPreference
  /** 기본과 다른지 — 편집기의 "예외" 표시. */
  isException: boolean
}

/** 편집기 "CRM 하위 탭" 섹션 행 — 레지스트리 순서. 두 드로어(본인·회원 관리)가 공유한다. */
export function buildCrmSubnavPreferenceRows(overrides: Readonly<Record<string, string>>): CrmSubnavPreferenceRow[] {
  return CRM_SUBNAV_PREFERENCE_ITEMS.map((item) => {
    const preference = resolveCrmSubnavPreference(item.href, overrides)
    const base = resolveCrmSubnavDefault(item.href)
    return { item, preference, base, isException: preference !== base }
  })
}
