import Link from "next/link"
import { ExternalLink } from "lucide-react"

import type { AdminCrmOverview, AdminCrmOverviewStatus } from "@/lib/admin-crm-overview"

function formatOverviewDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function getOverviewStatusLabel(status: AdminCrmOverviewStatus) {
  if (status === "ok") return "정상"
  if (status === "warning") return "주의"
  return "막힘"
}

function getOverviewStatusTone(status: AdminCrmOverviewStatus) {
  if (status === "ok") return "border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]"
  if (status === "warning") return "border-amber-100 bg-amber-50 text-amber-700"
  return "border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]"
}

// 운영 보조 정합성(스키마·외부 CRM·시트 링크·snapshot·write queue) 점검 패널.
// 일상 운영 화면(현황)에서 분리해 유지보수 탭(연동/매칭)에서 노출한다.
export default function CrmDataCheckPanel({
  overview,
  loading = false,
  error = null,
}: {
  overview: AdminCrmOverview | null
  loading?: boolean
  error?: string | null
}) {
  const status = overview?.overallStatus ?? "warning"
  const schemaDetail = overview
    ? overview.schema.blocked > 0
      ? overview.schema.firstBlocked ?? `${overview.schema.blocked}개 blocked`
      : `${overview.schema.ok}개 check 통과`
    : loading
      ? "불러오는 중"
      : "미점검"
  const xiaoshouyiDetail = overview
    ? overview.xiaoshouyi.configured
      ? `${overview.xiaoshouyi.authMode} · ${overview.xiaoshouyi.objectCount} objects`
      : overview.xiaoshouyi.missingEnvGroups.join(", ") || "credential 미설정"
    : "-"
  const sourceLinkDetail = overview
    ? `${overview.sourceLinks.confirmed}/${overview.sourceLinks.total} 확정 · 후보 ${overview.sourceLinks.candidate} · 재검수 ${overview.sourceLinks.stale}`
    : "-"
  const snapshotDetail = overview
    ? `${overview.externalSnapshots.recordCount.toLocaleString("ko-KR")} records · ${overview.externalSnapshots.latestRunObject ?? "sync"} ${overview.externalSnapshots.latestRunStatus ?? "-"}`
    : "-"
  const hasXiaoshouyiSnapshot = Boolean(overview?.externalSnapshots.recordCount)
  const xiaoshouyiCardDetail = hasXiaoshouyiSnapshot && overview
    ? `snapshot ${overview.externalSnapshots.recordCount.toLocaleString("ko-KR")} records`
    : xiaoshouyiDetail
  const writeQueueDetail = overview
    ? `draft ${overview.writeQueue.draft} · approved ${overview.writeQueue.approved} · sent ${overview.writeQueue.sent} · failed ${overview.writeQueue.failed}`
    : "-"
  const warning =
    error ??
    overview?.business.error ??
    overview?.business.warning ??
    overview?.schema.firstAction ??
    overview?.sourceLinks.error ??
    overview?.externalSnapshots.error ??
    overview?.writeQueue.error ??
    null

  return (
    // 참조 표면(정합성 점검) — 행동 표면(매칭 인박스)과의 톤차 위계(W2-6): 베이지로 가라앉히고
    // 내부 상태 칩만 흰색으로 띄운다(레이어드 베이지, 장식 없음).
    <div className="mb-6 rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Data Check</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getOverviewStatusTone(status)}`}>
              {loading && !overview ? "점검 중" : getOverviewStatusLabel(status)}
            </span>
          </div>
          <h2 className="mt-1 text-[17px] font-bold text-[#111110]">운영 보조 정합성</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/35">시트/외부 CRM은 내부 대조와 오류 체크용 · 최근 점검 {formatOverviewDate(overview?.generatedAt)}</p>
        </div>
        <Link
          href="/admin/crm/deals"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
        >
          매출 상세
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "스키마", value: schemaDetail, tone: overview?.schema.blocked ? "text-[#B85C33]" : "text-[#084734]" },
          { label: "Xiaoshouyi", value: xiaoshouyiCardDetail, tone: hasXiaoshouyiSnapshot || overview?.xiaoshouyi.configured ? "text-[#084734]" : "text-[#B85C33]" },
          { label: "시트·외부 링크", value: sourceLinkDetail, tone: overview?.sourceLinks.candidate || overview?.sourceLinks.stale ? "text-amber-700" : "text-[#111110]" },
          {
            label: `Snapshot · ${formatOverviewDate(overview?.externalSnapshots.latestSyncedAt)}`,
            value: snapshotDetail,
            tone: overview?.externalSnapshots.ok ? "text-[#111110]" : "text-[#B85C33]",
          },
          { label: "Write queue", value: writeQueueDetail, tone: overview?.writeQueue.failed ? "text-[#B85C33]" : "text-[#111110]" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-white px-3 py-3">
            <p className="text-[11px] font-medium text-[#1a1a1a]/40">{item.label}</p>
            <p className={`mt-1 truncate text-[12px] font-semibold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {warning ? (
        <p className="mt-3 rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] leading-relaxed text-[#B85C33]">
          {warning}
        </p>
      ) : null}
    </div>
  )
}
