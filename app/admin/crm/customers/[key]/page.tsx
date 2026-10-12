import { Suspense, cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Customer360DetailClient from "@/components/admin/crm/Customer360DetailClient"
import {
  getCrmCustomer360,
  normalizeUnifiedCustomerKeyParam,
  parseUnifiedCustomerKey,
} from "@/lib/repositories/crm-customer-360"

interface AdminCrmCustomerDetailPageProps {
  // Next 16: params is a Promise — await it. 본문의 params 는 퍼센트 인코딩된 채(`lead%3A123`) 오고
  // generateMetadata 는 디코드된 값(`lead:123`)을 받는다(Next 16.2 — 2026-09-29 운영 404 원인).
  // 두 곳 모두 normalizeUnifiedCustomerKeyParam 으로 같은 모양을 만든 뒤 쓴다.
  params: Promise<{ key: string }>
}

// generateMetadata와 본문이 같은 360 페이로드를 각각 부른다 → 요청 스코프 cache()로 1회 fetch로 합침.
// 키는 정규화한 원시 문자열 — parseUnifiedCustomerKey 결과는 매 호출 새 객체라 캐시 키로 부적합하고,
// 인코딩 모양이 다른 두 키는 캐시를 나눠 360 을 두 번 읽는다.
const loadCustomer360 = cache(async (key: string) => {
  const parsed = parseUnifiedCustomerKey(key)
  if (!parsed) return null
  // 자세히 보기는 활동/할 일을 최대치로 끌어와 한 화면에서 전부 보여준다(드로어는 요약).
  // 상세 페이지는 요약 집계(진행 딜·예상금액)가 전체를 덮어야 한다 — 드로어 기본 20건으로는
  // 딜이 20건을 넘는 고객에서 금액이 조용히 일부만 합산된다.
  return getCrmCustomer360(parsed, { eventsLimit: 50, tasksLimit: 50, dealsLimit: 200 })
})

export async function generateMetadata({
  params,
}: AdminCrmCustomerDetailPageProps): Promise<Metadata> {
  const key = normalizeUnifiedCustomerKeyParam((await params).key)
  const data = await loadCustomer360(key)
  const name = data?.found ? data.header?.name : null
  return { title: name ? `${name} · 고객 360 | Admin CRM` : "고객 360 | Admin CRM" }
}

export default async function AdminCrmCustomerDetailPage({
  params,
}: AdminCrmCustomerDetailPageProps) {
  // 클라이언트에도 디코드된 키를 넘긴다 — 인코딩된 모양이 화면 쪽 키 비교·요청 URL 로 새지 않게.
  const key = normalizeUnifiedCustomerKeyParam((await params).key)
  const data = await loadCustomer360(key)
  if (!data || !data.found) notFound()

  return (
    <Suspense fallback={null}>
      <Customer360DetailClient data={data} customerKey={key} />
    </Suspense>
  )
}
