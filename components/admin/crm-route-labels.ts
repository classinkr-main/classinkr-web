// 모바일 관리자 헤더에서 CRM의 실제 작업면을 표시하는 순수 라우트 라벨 SSOT.
//
// 글로벌 nav의 CRM 항목은 의도적으로 하나지만, CRM 안에는 고객·매출·검수 하위 화면이
// 있다. 그 하위 경로에서 헤더까지 "현황" 또는 "검수"로만 보이면 사용자는 현재 화면을
// 다시 본문에서 추론해야 한다. 가장 구체적인 경로부터 검사해 실제 작업면 이름을 돌려준다.

interface CrmRouteLabelRule {
  prefix: string
  label: string
}

// 순서가 곧 우선순위다(find). 고객 보조 탭은 반드시 "/admin/crm/customers"(= 고객 360 상세
// [key]) 규칙보다 위에 둔다 — 아래로 내려가면 그 화면이 모바일 헤더에 "고객 360"으로 뜬다
// (접수·태그가 실제로 그랬다, 2026-09-25 수정). 라벨은 CrmSubnav 보조 탭 라벨과 맞춘다.
const CRM_ROUTE_LABEL_RULES: readonly CrmRouteLabelRule[] = [
  { prefix: "/admin/crm/customers/unified", label: "통합 고객" },
  { prefix: "/admin/crm/customers/leads", label: "리드" },
  { prefix: "/admin/crm/customers/intake", label: "접수" },
  { prefix: "/admin/crm/customers/accounts", label: "원천 고객" },
  { prefix: "/admin/crm/customers/map", label: "지도" },
  { prefix: "/admin/crm/customers/tags", label: "태그" },
  { prefix: "/admin/crm/customers", label: "고객 360" },
  { prefix: "/admin/crm/partners/customers", label: "원천 고객" },
  { prefix: "/admin/crm/deals/rev-sheet", label: "매출시트" },
  { prefix: "/admin/crm/deals/orders", label: "오더·설치" },
  { prefix: "/admin/crm/deals/kpi", label: "워크스페이스" },
  { prefix: "/admin/crm/deals", label: "매출" },
  { prefix: "/admin/crm/partners", label: "워크스페이스" },
  { prefix: "/admin/crm/revenue", label: "매출" },
  { prefix: "/admin/crm/activity", label: "기록" },
  { prefix: "/admin/crm/capture", label: "입력함" },
  { prefix: "/admin/crm/matching", label: "데이터 매칭" },
  { prefix: "/admin/crm/insights", label: "인사이트" },
] as const

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** CRM 루트는 글로벌 nav 라벨("CRM")을 그대로 쓰도록 null을 반환한다. */
export function resolveCrmRouteLabel(pathname: string): string | null {
  return CRM_ROUTE_LABEL_RULES.find((rule) => matchesPathPrefix(pathname, rule.prefix))?.label ?? null
}
