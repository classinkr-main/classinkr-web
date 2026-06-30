import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Customer360DetailClient from "@/components/admin/crm/Customer360DetailClient"
import { getCrmCustomer360, parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"

interface AdminCrmCustomerDetailPageProps {
  // Next 16: params is a Promise — await it. URL 세그먼트는 자동 디코드됨(`lead:123` 등).
  params: Promise<{ key: string }>
}

export async function generateMetadata({
  params,
}: AdminCrmCustomerDetailPageProps): Promise<Metadata> {
  const { key } = await params
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) return { title: "고객 360 | Admin CRM" }
  const data = await getCrmCustomer360(parsed)
  const name = data.found ? data.header?.name : null
  return { title: name ? `${name} · 고객 360 | Admin CRM` : "고객 360 | Admin CRM" }
}

export default async function AdminCrmCustomerDetailPage({
  params,
}: AdminCrmCustomerDetailPageProps) {
  const { key } = await params
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) notFound()

  // 자세히 보기는 활동/할 일을 최대치로 끌어와 한 화면에서 전부 보여준다(드로어는 요약).
  const data = await getCrmCustomer360(parsed, { eventsLimit: 50, tasksLimit: 50 })
  if (!data.found) notFound()

  return (
    <Suspense fallback={null}>
      <Customer360DetailClient data={data} customerKey={key} />
    </Suspense>
  )
}
