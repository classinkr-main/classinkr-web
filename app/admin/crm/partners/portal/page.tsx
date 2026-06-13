import { redirect } from "next/navigation"

// 구경로 → Deals(오더·설치)로 이동. ?deal= 등 deep-link 쿼리 보존.
export default async function AdminCrmPartnerPortalRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") qs.set(key, value)
    else if (Array.isArray(value)) value.forEach((item) => qs.append(key, item))
  }
  const query = qs.toString()
  redirect(`/admin/crm/deals/orders${query ? `?${query}` : ""}`)
}
