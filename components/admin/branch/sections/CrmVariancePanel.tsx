"use client"

const CHECKS = [
  { id: "CRM-REV-01", label: "고객 ID 매칭", scope: "REV 고객사 ↔ CRM 계정", status: "준비중" },
  { id: "CRM-REV-02", label: "담당 매니저 오차", scope: "REV 담당자 ↔ CRM owner", status: "준비중" },
  { id: "CRM-REV-03", label: "월별 매출 합계 차이", scope: "REV 월별 금액 ↔ CRM 매출 필드", status: "준비중" },
  { id: "CRM-REV-04", label: "누락·중복 레코드", scope: "고객사/월/담당자 복합키", status: "준비중" },
]

export default function CrmVariancePanel() {
  return (
    <section>
      <h2 className="mb-3 text-[13px] font-semibold text-[#111110]/70">CRM 오차·이슈 점검</h2>
      <div className="rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="border-b border-[#f0f0ec] px-4 py-3">
          <p className="text-[12px] font-semibold text-[#111110]">매출 시트 ↔ CRM 대조</p>
          <p className="mt-1 text-[11px] text-[#1a1a1a]/45">연동 전 점검 항목</p>
        </div>
        <div className="divide-y divide-[#f0f0ec]">
          {CHECKS.map((check) => (
            <div key={check.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[12px] font-medium text-[#111110]">{check.label}</p>
                <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">{check.id} · {check.scope}</p>
              </div>
              <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55">
                {check.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
