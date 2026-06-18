import { redirect } from "next/navigation"

// 문서 보강 큐는 문서 센터(/admin/docs)의 "보강 큐" 탭으로 병합되었습니다.
// 기존 북마크/링크 호환을 위해 해당 탭으로 리다이렉트합니다.
export default function AdminDocsGapsPage() {
  redirect("/admin/docs?tab=gaps")
}
