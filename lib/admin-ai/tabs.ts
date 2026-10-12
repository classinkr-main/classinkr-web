// AI 올인원 탭(/admin/ai)의 하위 탭. 서버 페이지가 ?tab= 을 검증하고 클라이언트가 그리므로
// 양쪽에서 부를 수 있게 "use client" 밖에 둔다.
export const ADMIN_AI_TABS = ["chat", "orders", "tools", "catalog"] as const
export type AdminAiTab = (typeof ADMIN_AI_TABS)[number]

export function isAdminAiTab(value: unknown): value is AdminAiTab {
  return typeof value === "string" && (ADMIN_AI_TABS as readonly string[]).includes(value)
}
