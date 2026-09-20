import IntakeQueueClient from "@/components/admin/crm/intake/IntakeQueueClient"

export const metadata = {
  title: "접수 | Admin CRM",
}

export const dynamic = "force-dynamic"

/**
 * 쇼룸 예약·도입 신청 접수 큐.
 *
 * 두 접수 모두 저장·알림·리드 미러까지 동작하는데 확정할 화면이 없어 상태가 첫 값에
 * 머물렀다. 목록·전이 API 는 이미 있어 이 화면은 그 위의 얇은 표면이다.
 */
export default function AdminCrmIntakePage() {
  return <IntakeQueueClient />
}
