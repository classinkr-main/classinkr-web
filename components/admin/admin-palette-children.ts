// 커맨드 팔레트의 자식 명령 표 — 순수 데이터만 둔다("use client" 컴포넌트 밖).
// 팔레트(AdminCommandPalette)와 갈매봇 링크 목록(lib/admin-ai/links.ts)이 같은 표를 본다. 팔레트 컴포넌트는
// 클라이언트 모듈이라 서버 코드가 그 안의 상수를 import 하면 값이 아니라 참조가 된다 — 그래서 표만 따로 뺐다.
import { CRM_CHILD_NAV } from "./admin-nav"

export interface AdminPaletteChildCommand {
  label: string
  href: string
  keywords?: string
}

// 팔레트 전용 딥링크 — nav에는 없는 하위 라우트·빠른 작업. 부모 nav href 바로 뒤에 이어 붙는다.
export const PALETTE_CHILD_COMMANDS: Record<string, AdminPaletteChildCommand[]> = {
  "/admin/calendar": [
    { label: "행사 관리", href: "/admin/events", keywords: "행사 공개 행사 이벤트 웨비나 event 관리" },
    { label: "새 행사 등록", href: "/admin/events/new", keywords: "새 행사 등록 new event" },
  ],
  "/admin/crm": [
    // CRM 드릴인 하위 nav(admin-nav SSOT) 파생 — '현황'(/admin/crm)은 부모 항목과 중복이라 제외.
    // CRM 하위 탭 개인 숨김(기록·입력함·태그 기본 숨김, 2026-09-25)으로 거르지 않는다 — 이 목록은
    // 정적이고, 숨긴 CRM 탭의 ⌘K 도달성이 이것에 기댄다(tests/admin/nav-crm-subnav.test.ts 고정).
    ...CRM_CHILD_NAV.filter((child) => child.href !== "/admin/crm").map((child) => ({
      label: `CRM ${child.label}`,
      href: child.href,
      keywords: child.keywords,
    })),
    // 보조 탭 라벨("원천 고객")로도 찾혀야 한다 — 보조 탭을 숨긴 사람의 ⌘K 진입로(2026-09-25).
    { label: "고객 (Accounts)", href: "/admin/crm/customers/accounts", keywords: "원천 고객 neo 거래처 account customer" },
    { label: "리드", href: "/admin/crm/customers/leads", keywords: "리드 잠재고객 lead 문의" },
    // 방문·문의 바로 보기(2026-11-04) — Overview "지금" 띠의 칸과 같은 착지. 리드 보드 기본 범위는 전체 담당자다.
    { label: "오늘 문의", href: "/admin/crm/customers/leads?sort=newest&unconfirmed=1", keywords: "오늘 문의 새 문의 최근 유입 홈페이지 문의 신규 리드 today inquiry new lead" },
    { label: "응대 전 문의", href: "/admin/crm/customers/leads?filter=unresponded", keywords: "응대 전 미응답 미처리 문의 응대 대기 안 본 문의 unresponded" },
    { label: "미배정 리드", href: "/admin/crm/customers/leads?owner=__unassigned", keywords: "미배정 담당 없음 배정 unassigned owner" },
    // 고객 보조 탭(CrmSubnav)과 같은 라벨. 2026-09-20·21 신설 화면이라 ⌘K 도달이 빠져 있었다.
    { label: "접수", href: "/admin/crm/customers/intake", keywords: "접수 쇼룸 예약 도입 신청 접수 큐 intake showroom booking application queue" },
    // 세그먼트 허브(C안 ②, 2026-09-25) — 고객DB 보조 탭 "세그먼트"와 같은 라벨. 리드 보드의 리드
    // 세그먼트(메타 광고·인계 등, lib/crm/lead-segments.ts)와는 다른 화면이라 검색어로 "허브"를 붙인다.
    { label: "세그먼트", href: "/admin/crm/customers/segments", keywords: "세그먼트 허브 저장 세그먼트 조건 빌더 자동 태그 오늘 연락 일괄 segment segments saved filter hub" },
    { label: "지도", href: "/admin/crm/customers/map", keywords: "고객 지역 지도 분포 지역분포 원천 map source region" },
    { label: "태그", href: "/admin/crm/customers/tags", keywords: "태그 라벨 고객 분류 태그 관리 tag tags label" },
    { label: "Deals", href: "/admin/crm/deals", keywords: "딜 거래 오더 order deal" },
    // 화면 제목(rev-sheet/page.tsx h1)·교차 링크가 전부 "매출시트"라 그 표기로 통일했다.
    // 옛 라벨 "REV 스냅샷"은 검색어로 남겨 손에 익은 검색이 계속 걸리게 한다.
    { label: "매출시트", href: "/admin/crm/deals/rev-sheet", keywords: "매출시트 매출 시트 rev 스냅샷 snapshot revenue sheet 검수" },
    { label: "오더·설치", href: "/admin/crm/deals/orders", keywords: "오더 설치 일정 주문 order installation" },
    { label: "워크스페이스", href: "/admin/crm/deals/kpi", keywords: "파트너 계약 정산 큐 kpi workspace" },
    { label: "인사이트", href: "/admin/crm/insights", keywords: "crm 인사이트 분석 insight analytics" },
  ],
  // 견적 빠른 작업은 redirect 스텁(app/admin/quotes/{new,recording-studio}/page.tsx)을
  // 거치지 않고 스텁이 보내는 최종 URL로 곧장 간다 — 서버 왕복 한 번과 히스토리 한 칸을 던다.
  // 스텁 파일은 북마크·외부 링크 보호용으로 남아 있다(목적지를 바꾸면 여기도 함께 바꿀 것).
  "/admin/quotes": [
    { label: "빠른 견적 작성", href: "/admin/quotes?tab=hardware&action=new", keywords: "견적 작성 빠른 견적 quick quote" },
    { label: "녹화 세트 견적", href: "/admin/quotes?tab=hardware&action=recording_studio", keywords: "녹화 세트 omo1 studio recording 견적" },
  ],
  "/admin/campaigns": [
    // 라벨은 허브 탭 이름(lib/marketing/hub-tabs.ts CAMPAIGN_TABS의 email 탭 = "메시지")과 같다.
    { label: "메시지", href: "/admin/campaigns?tab=email", keywords: "메시지 발송 이메일 자동화 문자 카카오 구독자 message email sms kakao automation logs" },
    // 캠페인 관리는 그 자체가 사이드바(ADMIN_NAV) 항목이라 평소에는 최상위 명령으로 뜨고 여기 자식은
    // 중복이라 방출되지 않는다(buildAdminCommands). 사이드바 SSOT에서 빠지는 날(허브 흡수 결정 D2)
    // 이 자식이 ⌘K 도달 경로를 자동으로 이어받는 안전망이다.
    { label: "캠페인 관리", href: "/admin/campaigns/manage", keywords: "캠페인 관리 크로스채널 통합 롤업 연결 campaign manage cross-channel rollup" },
    // 마케팅 프로젝트는 2026-10 캠페인 관리의 "프로젝트" 탭이 됐다 — 사이드바 항목이 없으니 ⌘K 는
    // 이 자식이 맡고, 탭을 바로 연다(예전 /admin/campaigns/projects 는 같은 곳으로 넘기는 스텁).
    { label: "마케팅 프로젝트", href: "/admin/campaigns/manage?view=projects", keywords: "마케팅 프로젝트 캠페인 묶음 롤업 예산 소진 페이싱 project rollup budget pacing" },
  ],
  "/admin/blog": [
    { label: "새 블로그 글 작성", href: "/admin/blog/new", keywords: "새글 작성 write new post 블로그" },
  ],
  "/admin/analytics": [
    { label: "방문자·트래픽", href: "/admin/analytics?tab=visitors", keywords: "방문자 오늘 방문 방문 분석 트래픽 홈페이지 흐름 전환 traffic visitor" },
  ],
  // CS 진입점 단일화(2026-08-18) — 사이드바 cs 섹션이 CS 콘솔 1항목이 되면서 가이드 문서·내부 CS의
  // nav 항목도 콘솔 가로 메뉴로 흡수됐다. URL은 전부 그대로이므로 ⌘K 도달성은 자식 커맨드로 보존한다
  // (라벨은 콘솔 메뉴명과 일치시켜 두 표면의 어휘가 갈리지 않게 한다).
  //
  // 자식 커맨드는 부모 nav 항목이 ADMIN_COMMANDS에 살아남을 때만 방출된다(아래 flatMap).
  // `/admin/chatbot`은 같은 단일화로 MOON_ONLY에서 풀려 전 프리셋 접근 + `staff` 프리셋 상시가
  // 됐으므로 이제 안전한 숙주다(이전 숙주는 그때의 OPEN 묶음이던 `/admin/docs` — nav에서 내려가며
  // 자식들이 이 항목으로 옮겨왔다). section이 같아(cs) 그룹 라벨("고객 지원")은 이관 전후로 동일하다.
  "/admin/chatbot": [
    { label: "가이드 문서", href: "/admin/docs", keywords: "가이드 문서 docs guide 챗봇 faq 카테고리 리디렉트 발행" },
    { label: "새 가이드 문서", href: "/admin/docs/new", keywords: "가이드 문서 새 문서 작성 new docs guide" },
    { label: "추천 질문 관리", href: "/admin/docs?tab=recommended", keywords: "추천 질문 starter chatbot recommended" },
    { label: "상담 Inbox (채널톡)", href: "/admin/channel-talk", keywords: "채널톡 상담 문의 채팅 channel talk chat inbox" },
    { label: "미해결 큐", href: "/admin/docs?tab=gaps", keywords: "보강 큐 gaps faq 문서 검색 초안 질문 패턴 미해결" },
    { label: "AI 품질 검수", href: "/admin/docs?tab=quality", keywords: "ai 품질 평가 알파 준비도 quality readiness" },
    { label: "내부 CS", href: "/admin/cs-chatbot", keywords: "내부 cs 챗봇 상담 도우미 소통 가이드 템플릿 대기열 본사 확인 운영 도구 internal support assistant" },
  ],
  "/admin/settings": [
    { label: "통합 설정", href: "/admin/settings?tab=integrations", keywords: "설정 settings integrations webhook api key" },
    { label: "회원 관리", href: "/admin/settings?tab=members", keywords: "회원 사용자 권한 계정 users members role" },
  ],
}
