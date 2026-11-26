import { redirect } from "next/navigation"

// 구독형 AI Suite 는 2026-11 판매 중단 — 옛 북마크는 작성기 없이 견적서 탭(템플릿 화면)으로 보낸다.
export default function AdminAiSuiteQuotePage() {
  redirect("/admin/quotes?tab=hardware")
}
