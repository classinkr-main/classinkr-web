import Link from "next/link"

// 고객 360 상세에서 고객을 찾지 못했을 때 — 공개 사이트 404 전체 화면 대신 어드민 셸 안에서 돌아갈 곳을 준다.
export default function AdminCrmCustomerNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <div
        role="status"
        aria-labelledby="admin-crm-customer-not-found-title"
        className="w-full max-w-md rounded-2xl border border-[#E5E5E0] bg-white px-6 py-8 text-center"
      >
        <p id="admin-crm-customer-not-found-title" className="text-[15px] font-bold text-[#111110]">
          고객을 찾을 수 없습니다.
        </p>
        <p className="mt-1.5 text-[12px] text-[#1a1a1a]/55">
          삭제·병합됐거나 주소가 잘못됐을 수 있습니다. 통합 고객에서 다시 찾아 주세요.
        </p>
        <Link
          href="/admin/crm/customers/unified"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#084734] px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
        >
          통합 고객으로
        </Link>
      </div>
    </div>
  )
}
