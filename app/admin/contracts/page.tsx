import { redirect } from "next/navigation"

// 구경로 → 견적·문서 허브의 계약서 탭. 북마크/외부 링크 보존용 redirect 스텁.
// ContractsPanel은 /admin/quotes?tab=contracts에서 계속 서비스된다.
export default function AdminContractsRedirect() {
  redirect("/admin/quotes?tab=contracts")
}
