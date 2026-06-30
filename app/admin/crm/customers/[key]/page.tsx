import { Suspense, cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Customer360DetailClient from "@/components/admin/crm/Customer360DetailClient"
import { getCrmCustomer360, parseUnifiedCustomerKey } from "@/lib/repositories/crm-customer-360"

interface AdminCrmCustomerDetailPageProps {
  // Next 16: params is a Promise — await it. URL 세그먼트는 자동 디코드됨(`lead:123` 등).
  params: Promise<{ key: string }>
}

// generateMetadata와 본문이 같은 360 페이로드를 각각 부른다 → 요청 스코프 cache()로 1회 fetch로 합침.
// 키는 원시 문자열(key) — parseUnifiedCustomerKey 결과는 매 호출 새 객체라 캐시 키로 부적합.
const loadCustomer360 = cache(async (key: string) => {
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) return null
  // 자세히 보기는 활동/할 일을 최대치로 끌어와 한 화면에서 전부 보여준다(드로어는 요약).
  return getCrmCustomer360(parsed, { eventsLimit: 50, tasksLimit: 50 })
})

export async function generateMetadata({
  params,
}: AdminCrmCustomerDetailPageProps): Promise<Metadata> {
  const { key } = await params
  const data = await loadCustomer360(key)
  const name = data?.found ? data.header?.name : null
  return { title: name ? `${name} · 고객 360 | Admin CRM` : "고객 360 | Admin CRM" }
}

export default async function AdminCrmCustomerDetailPage({
  params,
}: AdminCrmCustomerDetailPageProps) {
  const { key } = await params
  const data = await loadCustomer360(key)
  if (!data || !data.found) notFound()

  return (
    <Suspense fallback={null}>
      <Customer360DetailClient data={data} customerKey={key} />
    </Suspense>
  )
}
