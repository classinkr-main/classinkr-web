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
  LayoutDashboard,
  Magnet,
  Megaphone,
  MessageSquare,
  PackageCheck,
  ReceiptText,
  Search,
  Send,
  Settings,
  UserCog,
  Users,
} from "lucide-react"

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER" | "BRANCH" | "PARTNER"
export type AdminNavSection = "home" | "sales" | "marketing" | "cs" | "performance" | "system"

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

// IA 재편(2026-06-29): 직무 흐름대로 섹션 정렬 + 중복/오배치 정리.
// - 자료 퍼널(/materials)은 리드마그넷의 읽기 facade라 nav에서 제거하고, /lead-magnets를 "자료 퍼널"로 통일해 marketing으로 이동.
//   (/admin/materials 라우트 자체도 /admin/lead-magnets redirect 스텁으로 정리됨, 2026-07-02)
// - 하드웨어 재고는 분석이 아니라 SCM 운영 콘솔이라 system(운영·시스템)으로 이동.
// - 고객 지원은 docs → chatbot → channel-talk 파이프라인 순서.
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard, roles: [...ALL_STAFF, "BRANCH"], section: "home", keywords: "홈 대시보드 overview home" },

  // 영업
  { href: "/admin/crm", label: "CRM", icon: Users, roles: [...ALL_STAFF, "BRANCH"], section: "sales", keywords: "crm 한국팀 매출 korea" },
  { href: "/admin/calendar", label: "캘린더", icon: CalendarDays, roles: [...ALL_STAFF, "BRANCH"], section: "sales", keywords: "캘린더 일정 calendar schedule" },
  { href: "/admin/quotes", label: "견적·문서", icon: FileText, roles: STAFF_ADMIN, section: "sales", keywords: "견적 계약 영수증 quote contract receipt" },

  // 마케팅
  { href: "/admin/campaigns", label: "캠페인", icon: Megaphone, roles: STAFF_ADMIN, section: "marketing", keywords: "캠페인 이메일 campaign email" },
  { href: "/admin/marketing", label: "메시지 발송", icon: Send, roles: STAFF_ADMIN, section: "marketing", keywords: "메시지 발송 문자 sms 카카오 kakao 알림톡 이메일 email 솔라피 solapi" },
  { href: "/admin/blog", label: "콘텐츠", icon: FileText, roles: STAFF_EDITOR, section: "marketing", keywords: "블로그 콘텐츠 blog content" },
  { href: "/admin/lead-magnets", label: "자료 퍼널", icon: Magnet, roles: STAFF_EDITOR, section: "marketing", keywords: "자료 퍼널 리드마그넷 material funnel download lead magnet" },
  { href: "/admin/events", label: "공개 행사", icon: Globe, roles: STAFF_ADMIN, section: "marketing", keywords: "행사 이벤트 event 웨비나" },

  // 고객 지원 (docs → docs?tab=gaps → chatbot → channel-talk)
  { href: "/admin/docs", label: "가이드 문서", icon: BookOpen, roles: STAFF_EDITOR, section: "cs", keywords: "가이드 문서 docs guide" },
  // 보강 큐는 문서 센터(/admin/docs)의 "보강 큐" 탭으로 병합됨 — nav는 탭 딥링크를 직접 가리켜
  // active 하이라이트가 동작하게 한다. /admin/docs/gaps는 북마크 호환용 redirect 스텁으로만 유지.
  { href: "/admin/docs?tab=gaps", label: "문서 보강 큐", icon: Search, roles: STAFF_EDITOR, section: "cs", badge: "Alpha", keywords: "챗봇 질문 보강 큐 gaps faq 문서 검색 초안" },
  { href: "/admin/chatbot", label: "챗봇 운영", icon: Bot, roles: STAFF_EDITOR, section: "cs", badge: "Ops", keywords: "챗봇 질문 추천 문서 chatbot ai faq" },
  { href: "/admin/channel-talk", label: "채널톡 상담", icon: MessageSquare, roles: STAFF_ADMIN, section: "cs", badge: "New", keywords: "채널톡 상담 문의 채팅 channel talk chat inbox" },

  // 분석
  { href: "/admin/analytics", label: "Analytics", icon: BarChart2, roles: [...ALL_STAFF, "BRANCH"], section: "performance", keywords: "analytics 분석 통계" },
  { href: "/admin/traffic", label: "방문자/트래픽", icon: Eye, roles: [...ALL_STAFF, "BRANCH"], section: "performance", keywords: "방문자 트래픽 추적 현황 홈페이지 흐름 tracking client events pixel 계측 traffic" },
  { href: "/admin/branch", label: "KR Team", icon: Building2, roles: [...STAFF_ADMIN, "BRANCH"], section: "performance", keywords: "지사 브랜치 branch kr team 매출" },
  { href: "/admin/branch/ledger", label: "매출 장부", icon: ReceiptText, roles: [...STAFF_ADMIN, "BRANCH"], section: "performance", badge: "MVP", keywords: "매출 장부 ledger rev dsh kpi 수치 검수 sales 콕핏" },

  // 운영·시스템
  { href: "/admin/ops", label: "Ops Health", icon: Activity, roles: STAFF_ADMIN, section: "system", badge: "New", keywords: "ops health 상태 통합 크론 cron automation" },
  { href: "/admin/hardware", label: "하드웨어 재고", icon: PackageCheck, roles: STAFF_ADMIN, section: "system", badge: "Ops", keywords: "하드웨어 재고 입고 출고 hardware inventory stock ops" },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: STAFF_ADMIN, section: "system", keywords: "설정 settings 환경" },
  { href: "/admin/users", label: "회원 관리", icon: UserCog, roles: STAFF_ADMIN, section: "system", keywords: "회원 사용자 users 권한" },
  { href: "/admin/dev", label: "Dev Mode", icon: Code2, roles: STAFF_ADMIN, section: "system", badge: "Beta", keywords: "개발 dev 버그 패치노트 roadmap" },
]

export const ADMIN_NAV_SECTION_META: Record<AdminNavSection, { label: string; description: string }> = {
  home: { label: "홈", description: "오늘 먼저 볼 운영 허브" },
  sales: { label: "영업", description: "CRM, 일정, 딜·문서" },
  marketing: { label: "마케팅", description: "캠페인, 콘텐츠, 자료 퍼널" },
  cs: { label: "고객 지원", description: "가이드 문서, 챗봇, 채널톡" },
  performance: { label: "분석", description: "비즈니스·웹·팀 성과" },
  system: { label: "운영·시스템", description: "상태, 재고, 설정, 권한" },
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
// CRM 핵심 3탭 — 현황(후속조치+분석+시각화) · 고객(DB·360·연락입력·라벨링) · 기록(전체 로그).
// 돈흐름/인사이트/연동은 어드민(딜보드·견적·Analytics)과 겹치거나 백오피스라 최상위에서 내림.
// 라우트(deals/insights/matching/revenue/partners)는 보존 — 딥링크·북마크는 현황 탭 active로 귀속.
export const CRM_CHILD_NAV: CrmChildNavItem[] = [
  {
    href: "/admin/crm",
    label: "현황",
    keywords: "crm 현황 후속조치 인사이트 딜 매출",
    match: (p) =>
      p === "/admin/crm" ||
      p.startsWith("/admin/crm/insights") ||
      p.startsWith("/admin/crm/deals") ||
      p.startsWith("/admin/crm/revenue") ||
      p.startsWith("/admin/crm/matching") ||
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
    label: "참석자 입력",
    keywords: "참석자 입력 캡처 capture 행사 명함",
    match: (p) => p.startsWith("/admin/crm/capture"),
  },
]
