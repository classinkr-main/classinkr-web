import { redirect } from "next/navigation"

// 메시지 발송 허브(이메일·문자·카카오)는 캠페인(/admin/campaigns)의 "메시지" 탭으로 흡수되었습니다
// (admin-ia-redesign §3 고아 화면 / admin-organic-audit §5 막다른 페이지).
// 기존 북마크/링크 호환을 위해 해당 탭으로 리다이렉트합니다.
export default function AdminMarketingPage() {
  redirect("/admin/campaigns?tab=email")
}
