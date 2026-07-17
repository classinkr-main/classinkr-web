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
  Eye,
  FileText,
  Globe,
  Headset,
  LayoutDashboard,
  Magnet,
  Megaphone,
  MessageSquare,
  PackageCheck,
  ReceiptText,
  Search,
  Settings,
  Users,
} from "lucide-react"

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER" | "BRANCH" | "PARTNER"
export type AdminNavSection = "home" | "sales" | "marketing" | "cs" | "system"

export interface AdminNavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: AdminRole[]
  section: AdminNavSection
  badge?: string
  /** 커맨드 팔레트 검색어 — 공백 구분, 한/영 병기 */
  keywords?: string
}

const ALL_STAFF: AdminRole[]    = ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"]
const STAFF_ADMIN: AdminRole[]  = ["SUPER_ADMIN", "ADMIN"]
const STAFF_EDITOR: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR"]

// IA 재편(2026-07-04): 6섹션 → 4섹션 병합. "너무 세분화" 해소 — 웹 분석(Analytics·트래픽)은
// marketing으로, 매출 성과(KR Team·매출 장부)는 sales로 흡수해 잡탕이던 "분석" 섹션을 해체.
// Overview는 헤더 없는 최상위 단독 항목으로 렌더(AdminSidebar가 home 섹션 헤더를 생략).
// 섹션 부제(설명 줄)는 사이드바에서 미렌더 — 시각 밀도만 낮춘다(팔레트 그룹은 label만 사용).
// (이전 재편) 자료 퍼널=/lead-magnets 통일, 하드웨어=SCM 운영 콘솔이라 system, 챗봇→docs?tab=gaps 흡수.
// (2026-07-17) CS 탭 외부/내부 이원화 — "챗봇 운영·보강 큐" 겸직 항목을 "챗봇 운영"(/admin/chatbot,
// 외부 공개 운영 대시보드)과 "문서 보강 큐"(/admin/docs?tab=gaps, 챗봇+내부CS 공유 큐)로 재분리.
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard, roles: [...ALL_STAFF, "BRANCH"], section: "home", keywords: "홈 대시보드 overview home" },

  // 영업·매출 — 파이프라인(CRM)·산출물(견적)·재고(하드웨어)·성과(KR Team)·검수(매출 장부)·일정
  { href: "/admin/crm", label: "CRM", icon: Users, roles: [...ALL_STAFF, "BRANCH"], section: "sales", keywords: "crm 한국팀 매출 korea" },
  { href: "/admin/quotes", label: "견적·문서", icon: FileText, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", keywords: "견적 계약 영수증 quote contract receipt" },
  // 하드웨어 재고는 견적서 산출물과 바로 이어지는 재고 검증 표면이라 견적·문서 바로 아래에 둔다(2026-07-18 재배치, 이전엔 system 섹션).
  { href: "/admin/hardware", label: "하드웨어 재고", icon: PackageCheck, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", keywords: "하드웨어 재고 입고 출고 hardware inventory stock ops" },
  { href: "/admin/calendar", label: "캘린더", icon: CalendarDays, roles: [...ALL_STAFF, "BRANCH"], section: "sales", keywords: "캘린더 일정 calendar schedule" },
  { href: "/admin/branch", label: "KR Team", icon: Building2, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", keywords: "지사 브랜치 branch kr team 매출 성과" },
  { href: "/admin/branch/ledger", label: "매출 장부", icon: ReceiptText, roles: [...STAFF_ADMIN, "BRANCH"], section: "sales", badge: "MVP", keywords: "매출 장부 ledger rev dsh kpi 수치 검수 sales 콕핏" },

  // 마케팅·분석 — 캠페인·콘텐츠·리드 + 웹/비즈니스 분석
  // 메시지 발송 허브(이메일·문자·카카오, /admin/marketing)는 캠페인의 "메시지" 탭으로 흡수 — 라우트는 redirect 유지.
  { href: "/admin/campaigns", label: "캠페인", icon: Megaphone, roles: [...STAFF_ADMIN, "BRANCH"], section: "marketing", keywords: "캠페인 이메일 campaign email 메시지 발송 문자 sms 카카오 kakao 알림톡 솔라피 solapi" },
  { href: "/admin/blog", label: "콘텐츠", icon: FileText, roles: [...STAFF_EDITOR, "BRANCH"], section: "marketing", keywords: "블로그 콘텐츠 blog content" },
  { href: "/admin/lead-magnets", label: "자료 퍼널", icon: Magnet, roles: [...STAFF_EDITOR, "BRANCH"], section: "marketing", keywords: "자료 퍼널 리드마그넷 material funnel download lead magnet" },
  { href: "/admin/events", label: "공개 행사", icon: Globe, roles: [...STAFF_ADMIN, "BRANCH"], section: "marketing", keywords: "행사 이벤트 event 웨비나" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart2, roles: [...ALL_STAFF, "BRANCH"], section: "marketing", keywords: "analytics 분석 통계" },
  { href: "/admin/traffic", label: "방문자/트래픽", icon: Eye, roles: [...ALL_STAFF, "BRANCH"], section: "marketing", keywords: "방문자 트래픽 추적 현황 홈페이지 흐름 tracking client events pixel 계측 traffic" },

  // 고객 지원 (가이드 문서 → 챗봇 운영 → 문서 보강 큐 → 내부 CS 챗봇 → channel-talk)
  { href: "/admin/docs", label: "가이드 문서", icon: BookOpen, roles: [...STAFF_EDITOR, "BRANCH"], section: "cs", keywords: "가이드 문서 docs guide 챗봇 chatbot faq 추천질문" },
  // 챗봇 운영 — 외부(공개) 챗봇 운영 대시보드. 과거 docs?tab=gaps로 흡수돼 redirect 스텁이었으나
  // Task X가 /admin/chatbot을 얇은 서버 페이지로 재건하며 독립 표면을 복원했다(2026-07-17).
  { href: "/admin/chatbot", label: "챗봇 운영", icon: Bot, roles: [...STAFF_EDITOR, "BRANCH"], section: "cs", keywords: "챗봇 운영 지표 골든셋 품질 평가 알파 준비도 chatbot ops" },
  // 문서 보강 큐는 문서 센터(/admin/docs)의 "보강 큐" 탭으로 병합됨 — nav는 탭 딥링크를 직접 가리켜
  // active 하이라이트가 동작하게 한다. /admin/docs/gaps는 북마크 호환용 redirect 스텁으로만 유지.
  // 챗봇 발/내부CS 발 질문이 함께 모이는 공유 큐라 "챗봇 운영"과는 별개 표면으로 유지한다.
  { href: "/admin/docs?tab=gaps", label: "문서 보강 큐", icon: Search, roles: [...STAFF_EDITOR, "BRANCH"], section: "cs", keywords: "보강 큐 gaps faq 문서 검색 초안 질문 패턴" },
  // 내부 CS 챗봇 — 상담원용 워크스페이스(내부 지식·대화 큐·아카이브). 공개 챗봇 운영과 별개 표면.
  { href: "/admin/cs-chatbot", label: "내부 CS 챗봇", icon: Headset, roles: [...STAFF_EDITOR, "BRANCH"], section: "cs", keywords: "내부 cs 챗봇 상담 도우미 소통 가이드 템플릿 큐 아카이브 internal support assistant" },
  { href: "/admin/channel-talk", label: "채널톡 상담", icon: MessageSquare, roles: [...STAFF_ADMIN, "BRANCH"], section: "cs", keywords: "채널톡 상담 문의 채팅 channel talk chat inbox" },

  // 운영·시스템
  { href: "/admin/ops", label: "운영 상태", icon: Activity, roles: [...STAFF_ADMIN, "BRANCH"], section: "system", keywords: "ops health 상태 통합 크론 cron automation" },
  // 회원 관리는 Settings "회원" 탭(?tab=members)으로 흡수됨 — /admin/users는 그 탭으로 redirect 스텁.
  // ⌘K 검색어(회원·사용자·권한)를 Settings 항목 keywords에 병합해 검색성 보존.
  { href: "/admin/settings", label: "설정", icon: Settings, roles: STAFF_ADMIN, section: "system", keywords: "설정 settings 환경 회원 사용자 users 권한 계정" },
  { href: "/admin/dev", label: "개발 도구", icon: Code2, roles: STAFF_ADMIN, section: "system", keywords: "개발 dev 버그 패치노트 roadmap" },
]

// 섹션 부제(description)는 사이드바에서 미렌더 — 팔레트 그룹 라벨과 코드 문서용으로만 유지.
export const ADMIN_NAV_SECTION_META: Record<AdminNavSection, { label: string; description: string }> = {
  home: { label: "홈", description: "오늘 먼저 볼 운영 허브" },
  sales: { label: "영업·매출", description: "CRM·견적·하드웨어 재고·매출 성과·장부" },
  marketing: { label: "마케팅·분석", description: "캠페인·콘텐츠·리드·웹 분석" },
  cs: { label: "고객 지원", description: "가이드 문서·챗봇·채널톡" },
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
