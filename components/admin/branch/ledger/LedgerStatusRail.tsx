"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"

import { describeLedgerStatus, type LedgerCrmInput, type LedgerIntegrityInput, type LedgerStatusTone } from "@/lib/branch/ledger-status-summary"
import { describeSyncHealth } from "@/lib/branch/sync-health-copy"
import { CrmSyncDetail, stripStateFromResponse, type CrmCoverageResponse } from "../CrmSyncStrip"
import { IntegrityDetail, useIntegrityData } from "../IntegrityStrip"
import type { BranchSyncHealth } from "../types"
import { branchSyncScheduleLabel } from "@/lib/branch/sync/schedule"

// 장부 상단 상태 한 줄(2026-09-14) — 정합 체크·CRM 연결·동기화 끊김 세 줄을 칸 하나씩으로 합친다.
// 요약은 한 줄, 상세는 누른 칸 하나만 아래로 펼친다. 가장 심각한 톤은 테두리 한 곳에만 쓰고
// 채움은 쓰지 않는다(아웃라인 강조). 판정은 lib/branch/ledger-status-summary.ts 순수 함수.

type SegmentId = "sync" | "integrity" | "crm"

const IDLE_ENABLE_MS = 300

const DOT: Record<LedgerStatusTone, string> = {
  danger: "bg-[#B43E3E]",
  warning: "bg-[#A8741A]",
  ok: "bg-[#084734]",
  neutral: "bg-[#A39E98]",
  low: "bg-[#B85C33]",
  partial: "bg-[#A8741A]",
  healthy: "bg-[#084734]",
}

const TEXT: Record<LedgerStatusTone, string> = {
  danger: "text-[#8F2C2C]",
  warning: "text-[#7A520F]",
  ok: "text-[#084734]",
  neutral: "text-[#615D59]",
  low: "text-[#8A3F1D]",
  partial: "text-[#7A520F]",
  healthy: "text-[#084734]",
}

const BORDER = {
  danger: "border-[#B43E3E]",
  warning: "border-[#A8741A]",
  neutral: "border-[rgba(0,0,0,0.08)]",
  ok: "border-[rgba(0,0,0,0.08)]",
} as const

export default function LedgerStatusRail({
  syncHealth,
  lastSyncAttemptLabel,
  now,
  crmCoverage,
  refreshKey,
  canRunAdminOperations,
}: {
  syncHealth: BranchSyncHealth | undefined
  /** 마지막 동기화 시도(성공·실패 무관) 표시 문구 — 부모의 상대시간 포맷을 그대로 받는다. */
  lastSyncAttemptLabel: string
  now: number
  crmCoverage: { data: CrmCoverageResponse | null; loading: boolean; error: string | null }
  refreshKey: number
  canRunAdminOperations: boolean
}) {
  const detailId = useId()
  const [open, setOpen] = useState<SegmentId | null>(null)

  // data-quality는 시트 QC 레인이라 무겁다 — 첫 렌더 직후가 아니라 유휴 시점에 켠다.
  const [integrityEnabled, setIntegrityEnabled] = useState(false)
  useEffect(() => {
    const handle = setTimeout(() => setIntegrityEnabled(true), IDLE_ENABLE_MS)
    return () => clearTimeout(handle)
  }, [])
  const integrity = useIntegrityData(refreshKey, { enabled: integrityEnabled })

  const integrityInput: LedgerIntegrityInput = integrity.error
    ? { state: "error" }
    : !integrityEnabled || (integrity.loading && !integrity.data) || !integrity.data
      ? { state: "loading" }
      : { state: "ready", warnCount: integrity.warnCount, errorCount: integrity.errorCount }

  const crmState =
    crmCoverage.loading && !crmCoverage.data
      ? ({ status: "loading" } as const)
      : crmCoverage.data
        ? stripStateFromResponse(crmCoverage.data)
        : ({ status: "unavailable" } as const)
  const crmInput: LedgerCrmInput =
    crmState.status === "ready"
      ? {
          state: "ready",
          health: crmState.summary.health,
          accountConnected: crmState.summary.accountConnected,
          accountTotal: crmState.summary.accountTotal,
          revenuePctLabel: crmState.summary.revenuePctLabel,
        }
      : { state: crmState.status }

  const status = describeLedgerStatus({ sync: syncHealth, integrity: integrityInput, crm: crmInput, now: new Date(now) })
  const syncCopy = describeSyncHealth(syncHealth, new Date(now))

  return (
    <div className={`rounded-lg border bg-white ${BORDER[status.worst]}`}>
      <div className="flex flex-wrap items-stretch" role="group" aria-label="장부 상태">
        {status.segments.map((segment, index) => {
          const expanded = open === segment.id
          return (
            <button
              key={segment.id}
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setOpen((current) => (current === segment.id ? null : segment.id))}
              className={`inline-flex min-h-11 min-w-0 flex-1 basis-full items-center gap-1.5 px-3 py-1.5 text-left text-[11.5px] font-semibold transition hover:bg-[#F6F5F4] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#084734] sm:basis-auto md:min-h-0 ${
                index > 0 ? "border-t border-[rgba(0,0,0,0.08)] sm:border-l sm:border-t-0" : ""
              } ${TEXT[segment.tone]}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[segment.tone]}`} aria-hidden="true" />
              <span className="min-w-0 truncate tabular-nums">{segment.label}</span>
              <ChevronDown
                className={`ml-auto h-3 w-3 shrink-0 opacity-60 transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>

      {open && (
        <div id={detailId} className="border-t border-[rgba(0,0,0,0.08)]">
          {open === "sync" && (
            <div className="space-y-1 px-3.5 py-2.5 text-[12px] text-[#31302E]">
              {syncCopy ? (
                <>
                  <p className="font-bold text-[#111110]">{syncCopy.title}</p>
                  <p>{syncCopy.detail}</p>
                  <p className="font-semibold">{syncCopy.action}</p>
                </>
              ) : (
                <p>매출 시트가 정상적으로 동기화되고 있습니다.</p>
              )}
              <p className="text-[11px] text-[#615D59]">마지막 시도 {lastSyncAttemptLabel} · {branchSyncScheduleLabel()}, 2일 연속 실패 시 운영방 알림</p>
            </div>
          )}

          {open === "integrity" && (
            integrity.error ? (
              <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 text-[12px] text-[#31302E]">
                <span>
                  {syncHealth && syncHealth.failedDays > 0 && syncHealth.permissionDenied
                    ? "정합 체크는 시트를 직접 읽습니다 — 시트 공유가 복구되면 다시 동작합니다."
                    : "정합 체크 결과를 불러오지 못했습니다."}
                </span>
                <button
                  type="button"
                  onClick={integrity.retry}
                  className="inline-flex min-h-11 items-center font-semibold text-[#111110] underline underline-offset-2 md:min-h-0"
                >
                  다시 시도
                </button>
              </div>
            ) : integrity.data ? (
              <IntegrityDetail
                data={integrity.data}
                loading={integrity.loading}
                actionable={integrity.actionable}
                toneText={integrity.errorCount > 0 ? "text-[#8F2C2C]" : integrity.warnCount > 0 ? "text-[#7A520F]" : "text-[#084734]"}
                canRunAdminOperations={canRunAdminOperations}
              />
            ) : (
              <p className="px-3.5 py-2.5 text-[12px] text-[#615D59]">정합 체크를 불러오는 중입니다.</p>
            )
          )}

          {open === "crm" && (
            crmState.status === "ready" ? (
              <CrmSyncDetail rev={crmState.rev} summary={crmState.summary} />
            ) : (
              <p className="px-3.5 py-2.5 text-[12px] text-[#615D59]">
                CRM 연결 현황을 불러오지 못했습니다 — 매칭 현황은{" "}
                <Link href="/admin/crm/matching" className="font-semibold text-[#111110] underline underline-offset-2">
                  매칭 인박스
                </Link>
                에서 볼 수 있습니다.
              </p>
            )
          )}
        </div>
      )}
    </div>
  )
}
