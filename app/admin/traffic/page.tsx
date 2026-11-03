import { redirect } from "next/navigation"

// 방문자/트래픽은 Analytics '방문자' 탭 하나로 합쳤다(2026-11-03). 이 경로는 옛 링크·북마크용 리다이렉트.
export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<{ detail?: string }>
}) {
  const { detail } = await searchParams
  redirect(`/admin/analytics?tab=visitors${detail === "diagnostics" ? "&detail=diagnostics" : ""}`)
}
