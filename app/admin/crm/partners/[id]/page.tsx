import { redirect } from "next/navigation"

// 구경로 → Deals(KPI) 파트너 상세로 이동. ?tab= 등 쿼리 보존.
export default async function AdminCrmPartnerDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") qs.set(key, value)
    else if (Array.isArray(value)) value.forEach((item) => qs.append(key, item))
  }
  const query = qs.toString()
  redirect(`/admin/crm/deals/kpi/${id}${query ? `?${query}` : ""}`)
}
