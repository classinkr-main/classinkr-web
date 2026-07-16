import { redirect } from "next/navigation"

// 회원 관리는 Settings의 "회원" 탭으로 흡수되었습니다(2026-07-04, admin-ia-redesign §4 "회원관리 Settings 흡수").
// 기존 북마크/링크 호환을 위해 해당 탭으로 리다이렉트합니다.
export default function AdminUsersPage() {
  redirect("/admin/settings?tab=members")
}
