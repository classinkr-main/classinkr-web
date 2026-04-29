import { redirect } from "next/navigation"

interface AdminPartnerDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminPartnerDetailPage({
  params,
  searchParams,
}: AdminPartnerDetailPageProps) {
  const { id } = await params
  const query = new URLSearchParams()
  const resolvedSearchParams = await searchParams

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item))
    } else if (value) {
      query.set(key, value)
    }
  }

  const queryString = query.toString()
  redirect(`/admin/crm/partners/${id}${queryString ? `?${queryString}` : ""}`)
}
