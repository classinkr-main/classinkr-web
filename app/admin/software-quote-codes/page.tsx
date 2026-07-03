import { redirect } from "next/navigation"

// 구경로 → 견적·문서 허브의 SW 견적 코드 탭. 북마크/외부 링크 보존용 redirect 스텁.
// SoftwareQuoteCodesPanel은 /admin/quotes?tab=software에서 계속 서비스된다.
export default function AdminSoftwareQuoteCodesRedirect() {
  redirect("/admin/quotes?tab=software")
}
