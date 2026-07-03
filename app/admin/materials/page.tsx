import { redirect } from "next/navigation"

// 구경로 → 자료 퍼널(/admin/lead-magnets). 북마크/외부 링크 보존용 redirect 스텁.
// 이 페이지는 리드마그넷의 읽기 facade였고(인바운드 링크 0, 2026-07-02 audit),
// 자료 퍼널 운영은 /admin/lead-magnets로 통일되었다.
export default function AdminMaterialsRedirect() {
  redirect("/admin/lead-magnets")
}
