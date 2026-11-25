// 오더 카탈로그 — "갈매봇에게 무엇을 시킬 수 있나"의 단일 기준(기획 §4.1·§4.2).
// 지금은 화면 표시용 메타데이터다. 서버 오더 레지스트리가 생기면 거기서 파생시킨다.
import { internalHrefOf } from "./links"
import type { OrderRisk } from "./types"

export interface OrderCatalogEntry {
  id: string
  domain: string
  label: string
  risk: OrderRisk
  sensitive?: boolean
  confirm: string
  undo: string
  undoNote?: string
  roles: string
  /**
   * 같은 일을 하는 홈페이지 MCP 도구 이름(정본: lib/ops-tools/registry.ts 의 OPS_TOOLS 의 mcpName).
   * 이 칸이 그 레지스트리와 맞는지, 조회(R0)·쓰기 구분이 같은지 tests/admin-ai/catalog-and-context.test.ts 가 본다.
   * 등급 이름은 척도가 다르다 — 여기 R0~R4 는 확인 단계, 레지스트리의 R0/R1 은 조회/등록.
   */
  mcp?: readonly string[]
}

export const ORDER_CATALOG: readonly OrderCatalogEntry[] = [
  { id: "nav.open", domain: "공통", label: "화면 이동", risk: "R0", confirm: "없음", undo: "—", roles: "전원" },
  // 묻기 — 오더가 아니라 답·링크·담당자를 카드로 낸다(기획 §3.2·§11.9). 아무것도 바꾸지 않는다.
  { id: "knowledge.ask", domain: "묻기", label: "정책·절차 질문 답(근거·확정 여부)", risk: "R0", confirm: "없음", undo: "—", roles: "전원", mcp: ["chatbot_ask"] },
  { id: "contact.who", domain: "묻기", label: "담당자 찾기", risk: "R0", confirm: "없음", undo: "—", roles: "전원" },
  { id: "link.find", domain: "묻기", label: "링크 찾기(어드민 화면·고객용 공개 주소)", risk: "R0", confirm: "없음", undo: "—", roles: "전원" },
  { id: "crm.customer.search", domain: "CRM", label: "고객·리드 검색과 요약", risk: "R0", confirm: "없음", undo: "—", roles: "CRM 읽기" },
  { id: "crm.followup.today", domain: "CRM", label: "오늘 후속조치 목록", risk: "R0", confirm: "없음", undo: "—", roles: "CRM 읽기" },
  { id: "hardware.stock.read", domain: "하드웨어", label: "모델별 재고·배송예정 조회", risk: "R0", confirm: "없음", undo: "—", roles: "읽기", mcp: ["hw_stock", "hw_movements"] },
  { id: "hardware.sales.read", domain: "하드웨어", label: "HW 판매 집계 조회(회계연도 월별)", risk: "R0", confirm: "없음", undo: "—", roles: "읽기", mcp: ["hw_sales"] },
  { id: "quote.read", domain: "견적", label: "견적·딜·템플릿 조회", risk: "R0", confirm: "없음", undo: "—", roles: "읽기", mcp: ["deals_list", "quotes_list", "quote_get", "quote_templates"] },
  { id: "site.traffic.read", domain: "분석", label: "사이트 방문 조회", risk: "R0", confirm: "없음", undo: "—", roles: "읽기", mcp: ["site_traffic"] },
  { id: "marketing.perf.read", domain: "마케팅", label: "캠페인 성과 요약", risk: "R0", confirm: "없음", undo: "—", roles: "읽기" },
  { id: "ledger.summary.read", domain: "매출", label: "주간·월간 매출 요약", risk: "R0", confirm: "없음", undo: "—", roles: "읽기" },
  { id: "calendar.read", domain: "캘린더", label: "일정 조회", risk: "R0", confirm: "없음", undo: "—", roles: "읽기" },

  { id: "crm.task.create", domain: "CRM", label: "할 일 생성", risk: "R1", confirm: "1클릭", undo: "10분", roles: "CRM 스태프" },
  { id: "crm.contact.log", domain: "CRM", label: "컨택 기록 추가", risk: "R1", confirm: "1클릭", undo: "10분", roles: "CRM 스태프" },
  { id: "crm.tag.add", domain: "CRM", label: "고객 태그 추가", risk: "R1", confirm: "1클릭", undo: "10분", roles: "CRM 스태프" },
  { id: "calendar.event.create", domain: "캘린더", label: "일정 등록", risk: "R1", confirm: "1클릭", undo: "10분", roles: "스태프" },
  { id: "quote.draft.create", domain: "견적", label: "견적 초안 만들기(고객에게 나가지 않음)", risk: "R1", confirm: "1클릭", undo: "없음", undoNote: "초안은 견적 화면에서 정리", roles: "스태프", mcp: ["quote_create_draft"] },

  { id: "crm.lead.update", domain: "CRM", label: "리드 상태·담당 변경 (1건)", risk: "R2", confirm: "전/후 비교", undo: "10분", roles: "스태프" },
  { id: "crm.task.update", domain: "CRM", label: "할 일 기한 변경·완료 처리", risk: "R2", confirm: "전/후 비교", undo: "10분", roles: "CRM 스태프" },
  { id: "showroom.booking.update", domain: "쇼룸", label: "예약 확정·일정 변경", risk: "R2", confirm: "전/후 비교", undo: "10분", roles: "스태프" },
  { id: "hardware.movement.plan", domain: "하드웨어", label: "입출고 예정 등록", risk: "R2", confirm: "전/후 비교", undo: "10분", roles: "하드웨어 편집", mcp: ["hw_plan_movement"] },

  { id: "payment.confirm", domain: "결제", label: "결제(수납) 확정", risk: "R2", sensitive: true, confirm: "전/후 비교 · 1건", undo: "없음", undoNote: "수납 취소 경로 신설 전", roles: "스태프 + 결제 확정 권한" },
  { id: "hardware.movement.finalize", domain: "하드웨어", label: "입출고 확정", risk: "R2", sensitive: true, confirm: "전/후 비교 · 1건", undo: "없음", undoNote: "취소는 재고 화면에서", roles: "하드웨어 편집 + 확정 권한" },
  { id: "quote.amount.update", domain: "견적", label: "금액·단가 변경", risk: "R2", sensitive: true, confirm: "전/후 비교 · 1건", undo: "이전 버전 복귀", roles: "스태프 + 금액 변경 권한" },

  { id: "message.sms.send", domain: "메시지", label: "문자·알림톡 1건 발송", risk: "R3", confirm: "미리보기 + 30초 유예", undo: "유예 중 취소만", roles: "스태프" },
  { id: "message.email.send", domain: "메시지", label: "이메일 1건 발송", risk: "R3", confirm: "미리보기 + 30초 유예", undo: "유예 중 취소만", roles: "스태프" },
  { id: "quote.share.send", domain: "견적", label: "기존 견적 공유 링크 발송", risk: "R3", confirm: "미리보기 + 30초 유예", undo: "유예 중 취소만", roles: "스태프" },
]

/**
 * 오더로 실행하지 않는 것(R4) — 해당 화면에서 직접 한다. 거절 카드가 그 화면으로 안내한다(점검 R15).
 * 화면 주소는 링크 목록(links.ts)의 id 로만 가리킨다 — 손으로 쓴 경로를 두지 않는다.
 */
const FORBIDDEN_ORDER_SOURCES: ReadonlyArray<{ label: string; linkId: string }> = [
  { label: "삭제", linkId: "admin:crm-customers-unified" },
  { label: "계약 서명", linkId: "admin:quotes" },
  { label: "입출고 취소", linkId: "admin:hardware" },
  { label: "매출 마감", linkId: "admin:branch-ledger" },
  { label: "네오CRM 되밀기 실행", linkId: "admin:crm-customers-unified" },
  { label: "대량 일괄 변경", linkId: "admin:crm-customers-segments" },
  { label: "권한·설정 변경", linkId: "admin:settings-tab-members" },
  { label: "문서·블로그 발행", linkId: "admin:blog" },
]

export interface ForbiddenOrder {
  label: string
  linkId: string
  /** 링크 목록에서 꺼낸 화면 주소. 목록에 없으면 빈 문자열(시험이 막는다). */
  href: string
}

export const FORBIDDEN_ORDERS: readonly ForbiddenOrder[] = FORBIDDEN_ORDER_SOURCES.map((entry) => ({
  ...entry,
  href: internalHrefOf(entry.linkId) ?? "",
}))

export const FORBIDDEN_ORDER_LABELS: readonly string[] = FORBIDDEN_ORDERS.map((entry) => entry.label)

export interface AdminAiTool {
  href: string
  label: string
  description: string
}

/**
 * 흩어진 기존 AI 기능의 바로가기. 기능을 AI 올인원 탭으로 옮기지 않는다 — 각 화면이 정본이다.
 */
export const ADMIN_AI_TOOLS: readonly AdminAiTool[] = [
  { href: "/admin/cs-chatbot", label: "CS 코파일럿", description: "상담 답변 초안과 검토 대기. 고객에게 나가는 답변은 계속 여기서 만든다." },
  { href: "/admin/blog", label: "블로그 글 보조", description: "초안 생성, 제목·요약 다듬기." },
  { href: "/admin/campaigns", label: "마케팅 문구 · 소재 제안", description: "캠페인 문구, 광고 소재 아이디어, 채널별 성과 해설." },
  { href: "/admin/branch", label: "KR Team 인사이트", description: "지사 성과 요약과 주간 해설." },
  { href: "/admin/docs?tab=gaps", label: "문서 보강 초안", description: "답하지 못한 질문에서 가이드 초안 만들기." },
]
