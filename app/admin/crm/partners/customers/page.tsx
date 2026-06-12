import { redirect } from "next/navigation"

// 구경로 → 고객(계정)으로 이동. ?customer= 등 deep-link 쿼리 보존.
export default async function AdminCrmPartnerCustomersRedirect({
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
  redirect(`/admin/crm/customers/accounts${query ? `?${query}` : ""}`)
}
