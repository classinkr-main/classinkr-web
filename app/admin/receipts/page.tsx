import { redirect } from "next/navigation"

// 구경로 → 견적·문서 허브의 영수증 탭. 북마크/외부 링크 보존용 redirect 스텁.
// ReceiptsPanel은 /admin/quotes?tab=receipts에서 계속 서비스된다.
export default function AdminReceiptsRedirect() {
  redirect("/admin/quotes?tab=receipts")
}
