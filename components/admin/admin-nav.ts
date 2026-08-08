// 어드민 네비게이션 SSOT — 사이드바(AdminSidebar)와 커맨드 팔레트(AdminCommandPalette)가
// 공유하는 순수 데이터/타입 모듈. React 상태·브라우저 API를 쓰지 않으므로 "use client" 불필요.
import type { LucideIcon } from "lucide-react"
import {
  Activity,
  BarChart2,
  BookOpen,
  Bot,
  Building2,
  CalendarDays,
  Code2,
  FileText,
  FolderKanban,
  Headset,
  Layers,
  LayoutDashboard,
  Magnet,
  Megaphone,
  PackageCheck,
  ReceiptText,
  Settings,
  Users,
} from "lucide-react"

/**
 * 운영 정본 역할은 SUPER_ADMIN / ADMIN / BRANCH 3종이다.
 * EDITOR / VIEWER / PARTNER는 기존 프로필·세션을 깨지 않기 위한 nav 호환 값이며,
 * 신규 권한 모델의 역할 단계로 취급하지 않는다.
 *
 * 이 roles 필드는 nav 소비자가 적용하는 UX 가시성 메타데이터다. 실제 데이터·동작 권한은
 * 각 API의 관리자 가드와 capability 검사에서 강제해야 한다. 현재 커맨드 팔레트처럼 이 필드를
 * 소비하지 않는 표면도 있으므로 보안 경계로 간주하면 안 된다.
 */
export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER" | "BRANCH" | "PARTNER"
export type AdminNavSection = "home" | "sales" | "marketing" | "cs" | "system"

export type AdminNavCategory = "customer" | "growth" | "system"

export interface AdminNavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: AdminRole[]
  section: AdminNavSection
  badge?: string
  /** 커맨드 팔레트 검색어 — 공백 구분, 한/영 병기 */
  keywords?: string
  /**
   * "기타" 접힘 그룹에 들어갔을 때 묶이는 범주.
   * 상시 후보 7개도 포함해 전 항목에 지정한다 — 프리셋에 따라 상시 항목도 기타로 내려갈 수
   * 있고, 그때 범주가 없으면 "system" 폴백에 걸려 엉뚱한 그룹에 박힌다(예: 하드웨어 재고).
   */
  category?: AdminNavCategory
  /** 아직 다듬는 중인 화면 — 사이드바에서 회색 톤 + 뱃지로 렌더한다. */
  maturity?: "wip"
}

export const ADMIN_NAV_CATEGORY_META: Record<AdminNavCategory, { label: string }> = {
  customer: { label: "고객·매출" },
  growth: { label: "마케팅·분석" },
  system: { label: "시스템" },
}

export const ADMIN_NAV_CATEGORIES = Object.keys(ADMIN_NAV_CATEGORY_META) as AdminNavCategory[]

const ALL_STAFF: AdminRole[]    = ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"]
// CS 콘솔 가로 메뉴(cs/CsConsoleNav)도 같은 롤 묶음을 써야 사이드바와 가시성이 어긋나지 않는다.
export const STAFF_ADMIN: AdminRole[]  = ["SUPER_ADMIN", "ADMIN"]
export const STAFF_EDITOR: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR"]

/**
 * 세션에 저장된 role 문자열(대소문자·레거시 소문자 혼재)을 AdminRole로 정규화한다.
 * AdminSidebar에 있던 것을 nav SSOT로 올린 것 — CS 콘솔 내비도 같은 정규화를 써야
 * 두 내비의 권한 필터가 갈리지 않는다. 로직 변경 없음.
 */
export function normalizeAdminRole(role: string): AdminRole {
  const normalized = role.trim()

  if (normalized === "admin" || normalized === "ADMIN") return "ADMIN"
  if (normalized === "branch" || normalized === "BRANCH") return "BRANCH"
  if (normalized === "partner" || normalized === "PARTNER") return "PARTNER"
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN"
  if (normalized === "EDITOR") return "EDITOR"
  if (normalized === "VIEWER") return "VIEWER"

  return "ADMIN"
}

// IA 재편(2026-07-04): 6섹션 → 4섹션 병합. "너무 세분화" 해소 — 비즈니스 분석(Analytics)은
// marketing으로, 매출 성과(KR Team·매출 장부)는 sales로 옮겨 잡탕이던 "분석" 섹션을 해체.
// 트래픽은 nav에서만 내렸고 /admin/traffic 독립 화면을 유지한다. Analytics가 그 화면으로 링크한다.
// Overview는 헤더 없는 최상위 단독 항목으로 렌더(AdminSidebar가 home 섹션 헤더를 생략).
// 섹션 부제(설명 줄)는 사이드바에서 미렌더 — 시각 밀도만 낮춘다(팔레트 그룹은 label만 사용).
// (이전 재편) 자료 퍼널=/lead-magnets 통일, 하드웨어=SCM 운영 콘솔이라 system, 챗봇→docs?tab=gaps 흡수.
// (2026-07-17) CS 탭 외부/내부 이원화 — "챗봇 운영·보강 큐" 겸직 항목을 "챗봇 운영"(/admin/chatbot,
// 외부 공개 운영 대시보드)과 "문서 보강 큐"(/admin/docs?tab=gaps, 챗봇+내부CS 공유 큐)로 재분리.
// (2026-07-27) CS 어드민 콘솔 IA 재구성 — cs 섹션 5 → 3항목. 아래 cs 블록 주석 참조.
// (2026-07-29 탭 재구성) 배열 순서 = 사이드바 상시 목록 순서다(resolveNavAccess가 선언 순서를 그대로 쓴다).
// 캘린더가 첫 화면이라 맨 앞으로 올렸다. section 필드는 팔레트 그룹 라벨용으로 그대로 둔다.
// 상시 후보에도 category를 붙인다 — 프리셋에 따라 이 항목들이 기타로 내려갈 수 있고,
// 그때 범주가 없으면 "시스템" 폴백에 걸려 하드웨어 재고가 시스템 그룹에 박힌다.
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/calendar", label: "캘린더", icon: CalendarDays, roles: [...ALL_STAFF, "BRANCH"], section: "sales", category: "customer", keywords: "캘린더 일정 calendar schedule 행사 이벤트 event 웨비나 공개 행사" },
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard, roles: [...ALL_STAFF, "BRANCH"], section: "home", category: "system", keywords: "홈 대시보드 overview home" },

  // 영업·매출 — 성과(KR Team)·검수(매출 장부)·파이프라인(CRM)·산출물(견적)·재고(하드웨어)
  // (2026-07-18 재정렬) KR Team·매출 장부를 섹션 상단으로 — 사이드바 탭 우선순위 요청 반영.
  { href: "/admin/branch", label: "KR Team", icon: Building2, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", category: "customer", keywords: "지사 브랜치 branch kr team 매출 성과" },
  { href: "/admin/branch/ledger", label: "매출 장부", icon: ReceiptText, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", badge: "MVP", category: "customer", maturity: "wip", keywords: "매출 장부 ledger rev dsh kpi 수치 검수 sales 콕핏" },
  { href: "/admin/crm", label: "CRM", icon: Users, roles: [...ALL_STAFF, "BRANCH"], section: "sales", category: "customer", keywords: "crm 한국팀 매출 korea" },
  { href: "/admin/quotes", label: "견적·문서", icon: FileText, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", category: "customer", keywords: "견적 계약 영수증 quote contract receipt" },
  // 하드웨어 재고는 견적서 산출물과 바로 이어지는 재고 검증 표면이라 견적·문서 바로 아래에 둔다(2026-07-18 재배치, 이전엔 system 섹션).
  { href: "/admin/hardware", label: "하드웨어 재고", icon: PackageCheck, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", category: "customer", keywords: "하드웨어 재고 입고 출고 hardware inventory stock ops" },

  // 마케팅·분석 — 캠페인·콘텐츠·리드 + 웹/비즈니스 분석
  // 메시지 발송 허브(이메일·문자·카카오, /admin/marketing)는 캠페인의 "메시지" 탭으로 흡수 — 라우트는 redirect 유지.
  { href: "/admin/campaigns", label: "캠페인", icon: Megaphone, roles: [...STAFF_ADMIN, "BRANCH"], section: "marketing", category: "growth", keywords: "캠페인 이메일 campaign email 메시지 발송 문자 sms 카카오 kakao 알림톡 솔라피 solapi" },
  // 크로스채널 캠페인 관리 — 이메일·문자·행사·Meta 실행을 하나의 캠페인 개체로 묶고 롤업(D1).
  { href: "/admin/campaigns/manage", label: "캠페인 관리", icon: Layers, roles: [...STAFF_ADMIN, "BRANCH"], section: "marketing", category: "growth", keywords: "캠페인 관리 크로스채널 통합 롤업 연결 campaign manage cross-channel rollup" },
  // 마케팅 프로젝트 — 여러 캠페인을 묶는 상위 개체. 멤버 캠페인 롤업 + 예산 소진(D3).
  { href: "/admin/campaigns/projects", label: "마케팅 프로젝트", icon: FolderKanban, roles: [...STAFF_ADMIN, "BRANCH"], section: "marketing", category: "growth", keywords: "마케팅 프로젝트 캠페인 묶음 롤업 예산 소진 project rollup budget" },
  { href: "/admin/blog", label: "콘텐츠", icon: FileText, roles: [...STAFF_EDITOR, "BRANCH"], section: "marketing", category: "growth", keywords: "블로그 콘텐츠 blog content" },
  { href: "/admin/lead-magnets", label: "자료 퍼널", icon: Magnet, roles: [...STAFF_EDITOR, "BRANCH"], section: "marketing", category: "growth", keywords: "자료 퍼널 리드마그넷 material funnel download lead magnet" },
  // (2026-07-29 탭 재구성) 공개 행사(/admin/events)는 캘린더 항목으로 흡수됐다 —
  // 캘린더는 이미 source: "event"로 공개 행사를 그리고 있어 화면 병합이 아니라 nav 항목만 내린 것이다.
  // 방문자/트래픽(/admin/traffic)은 nav에서만 내렸다. 화면·라우트는 독립 유지하며 Analytics가 링크한다.
  { href: "/admin/analytics", label: "Analytics", icon: BarChart2, roles: [...ALL_STAFF, "BRANCH"], section: "marketing", category: "growth", keywords: "analytics 분석 통계 방문자 트래픽 traffic 추적 pixel 계측 홈페이지 흐름" },

  // 고객 지원 — CS 콘솔 IA 재구성(2026-07-27, docs/active/cs-admin-console-ia-2026-07-27.md §2)으로
  // 5항목 → 3항목. 사라진 화면은 없고, 진입점이 콘솔 가로 메뉴(components/admin/cs/CsConsoleNav.tsx)로
  // 옮겨갔다. 흡수 관계:
  //   문서 보강 큐(/admin/docs?tab=gaps) → 콘솔 외부 축 "미해결 큐"
  //   채널톡 상담(/admin/channel-talk)   → 콘솔 외부 축 "상담 Inbox"
  // 두 URL은 그대로 살아 있고(딥링크·북마크 무손실) ⌘K 팔레트에도 자식 커맨드로 남아 있다.
  // 가이드 문서는 콘텐츠 파트 공용 표면이라 사이드바에도 유지한다(§2 흡수 관계 표).
  { href: "/admin/docs", label: "가이드 문서", icon: BookOpen, roles: [...STAFF_EDITOR, "BRANCH"], section: "cs", category: "system", keywords: "가이드 문서 docs guide 챗봇 chatbot faq 추천질문 카테고리 리디렉트" },
  // CS 콘솔 — 외부(고객용) 축의 첫 화면. 대시보드·상담 Inbox·미해결 큐·품질 검수·가이드 문서·추천 질문이
  // 이 화면 상단의 콘솔 가로 메뉴로 이어진다(구 "챗봇 운영"). redirect 스텁이 아닌 운영 대시보드다.
  { href: "/admin/chatbot", label: "CS 콘솔", icon: Bot, roles: [...STAFF_EDITOR, "BRANCH"], section: "cs", category: "system", keywords: "cs 콘솔 챗봇 운영 지표 골든셋 품질 평가 알파 준비도 chatbot ops console 채널톡 상담 문의 채팅 channel talk chat inbox 보강 큐 미해결 gaps 질문 패턴" },
  // 내부 CS — 내부(사내) 축 전체의 진입점. 상담원용 워크스페이스(AI 초안·대기열·운영 도구).
  // (2026-07-29) 이 항목은 반드시 "가이드 문서" 아래에 남아야 한다. sidebar-docs-gaps.test.ts가
  // cs 섹션 선언 순서를 [docs, chatbot, cs-chatbot]로 고정하고 있고, 상시 목록도 같은 배열을
  // filter로 읽어 선언 순서를 그대로 쓴다 — 둘 다 순서를 보존하므로 "cs-chatbot이 docs보다 앞"은
  // 표현 자체가 불가능하다. IA상으로도 이게 맞다: 가이드 문서는 전원 상시, 내부 CS는 cs 프리셋 전용이라
  // 보편적인 쪽이 위로 간다.
  { href: "/admin/cs-chatbot", label: "내부 CS", icon: Headset, roles: [...STAFF_EDITOR, "BRANCH"], section: "cs", category: "system", keywords: "내부 cs 챗봇 상담 도우미 소통 가이드 템플릿 큐 아카이브 대기열 본사 확인 internal support assistant" },

  // 운영·시스템
  { href: "/admin/ops", label: "운영 상태", icon: Activity, roles: [...STAFF_ADMIN, "BRANCH"], section: "system", category: "system", keywords: "ops health 상태 통합 크론 cron automation" },
  // 회원 관리는 Settings "회원" 탭(?tab=members)으로 흡수됨 — /admin/users는 그 탭으로 redirect 스텁.
  // ⌘K 검색어(회원·사용자·권한)를 Settings 항목 keywords에 병합해 검색성 보존.
  { href: "/admin/settings", label: "설정", icon: Settings, roles: STAFF_ADMIN, section: "system", category: "system", keywords: "설정 settings 환경 회원 사용자 users 권한 계정" },
  { href: "/admin/dev", label: "개발 도구", icon: Code2, roles: STAFF_ADMIN, section: "system", category: "system", keywords: "개발 dev 버그 패치노트 roadmap" },
]

// 섹션 부제(description)는 사이드바에서 미렌더 — 팔레트 그룹 라벨과 코드 문서용으로만 유지.
export const ADMIN_NAV_SECTION_META: Record<AdminNavSection, { label: string; description: string }> = {
  home: { label: "홈", description: "오늘 먼저 볼 운영 허브" },
  sales: { label: "영업·매출", description: "CRM·견적·하드웨어 재고·매출 성과·장부" },
  marketing: { label: "마케팅·분석", description: "캠페인·콘텐츠·리드·웹 분석" },
  cs: { label: "고객 지원", description: "가이드 문서·CS 콘솔(외부)·내부 CS" },
  system: { label: "운영·시스템", description: "상태·설정·권한" },
}

/** 섹션 렌더 순서 — ADMIN_NAV_SECTION_META 선언 순서를 따른다. */
export const ADMIN_NAV_SECTIONS = Object.keys(ADMIN_NAV_SECTION_META) as AdminNavSection[]

export interface CrmChildNavItem {
  href: string
  label: string
  /** 커맨드 팔레트 검색어 */
  keywords?: string
  /** pathname prefix 기반 active 판별(순수 함수) */
  match: (pathname: string) => boolean
}

// CRM 진입 시 사이드바에서 펼치는 하위 섹션(= 기존 상단 탭의 이전). 활성 판별은 경로 prefix.
// CRM 핵심 탭 — 현황(후속조치+분석+시각화) · 고객(DB·360·연락입력·라벨링) · 기록(전체 로그) · 참석자 입력
// · 검수(매칭 인박스·인사이트·매출시트 = 백오피스 표면의 상설 진입점, top-nav 재팽창 없이 하위탭으로만).
// 돈흐름(deals)은 어드민(딜보드·견적)과 겹쳐 최상위에서 내림 — 라우트는 보존, active는 현황 탭 귀속.
export const CRM_CHILD_NAV: CrmChildNavItem[] = [
  {
    href: "/admin/crm",
    label: "현황",
    keywords: "crm 현황 후속조치 인사이트 딜 매출",
    match: (p) =>
      p === "/admin/crm" ||
      (p.startsWith("/admin/crm/deals") && !p.startsWith("/admin/crm/deals/rev-sheet")) ||
      p.startsWith("/admin/crm/revenue") ||
      (p.startsWith("/admin/crm/partners") && !p.startsWith("/admin/crm/partners/customers")),
  },
  {
    href: "/admin/crm/customers/unified",
    label: "고객DB",
    keywords: "고객 통합 거래처 unified customers db 360",
    match: (p) => p.startsWith("/admin/crm/customers") || p.startsWith("/admin/crm/partners/customers"),
  },
  {
    href: "/admin/crm/activity",
    label: "기록",
    keywords: "기록 활동 로그 activity log 히스토리",
    match: (p) => p.startsWith("/admin/crm/activity"),
  },
  {
    href: "/admin/crm/capture",
    label: "입력함",
    keywords: "입력함 참석자 입력 캡처 capture 행사 명함 붙여넣기",
    match: (p) => p.startsWith("/admin/crm/capture"),
  },
  // 검수·백오피스 — 매칭 인박스가 홈. 강등 표면(매칭/인사이트/매출시트)의 상설 도달 경로(CRM-4).
  {
    href: "/admin/crm/matching",
    label: "검수",
    keywords: "검수 매칭 인박스 데이터 점검 matching 인사이트 insights 매출시트 rev sheet 백오피스",
    match: (p) =>
      p.startsWith("/admin/crm/matching") ||
      p.startsWith("/admin/crm/insights") ||
      p.startsWith("/admin/crm/deals/rev-sheet"),
  },
]
