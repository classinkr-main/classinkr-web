"use client"

// CRM 오더 대사 — "CRM 에 있는데 원장에 없는 출고"를 한 줄에 하나씩 놓고, 그 자리에서 배송 예정으로
// 등록한다(입력 가속 P2-1).
//
// 출고 기록 대부분은 이미 CRM/견적에 있다. 그러면 운영자가 할 일은 "입력"이 아니라 "확인"이다 —
// 고객사·품목·수량·참조번호를 다시 치지 않는다.
//
// ⚠️ 겹침 의심 배지: 시트 이관 행에는 딜 참조가 없어 참조로 대사할 수 없다. 고객사·품목이 맞는 실제
// 출고가 원장에 있으면 배지를 붙이고 기본 동작을 막는다 — 시트가 이미 실어 온 물량을 다시 등록하면
// §8-6 이중 계상이 되는데, 링크가 없어 가져오기 때 자동 정리도 되지 않는다.
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ExternalLink, Plus, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { formatNumber, todayKey } from "./shared"

interface BacklogOverlap {
  quantity: number
  lastOccurredAt: string | null
}

export interface CrmOrderBacklogEntry {
  id: string
  source: string
  sourceLabel: string
  referenceNo: string
  title: string
  productName: string | null
  quantity: number | null
  customerName: string | null
  status: string | null
  occurredAt: string | null
  href: string | null
  reason: string
  ledgerOverlap: BacklogOverlap | null
}

interface CrmOrderBacklogSectionProps {
  /** 기록 생성 권한(표시용) — 읽기 역할은 등록 버튼을 누를 수 없다. 강제는 서버 게이트다. */
  canWrite: boolean
  /** 등록에 성공하면 부모가 원장을 다시 받는다(HardwareInventoryClient의 refresh). */
  onRegistered: () => void | Promise<void>
  /**
   * 원장 버전(이관 id·원장 건수) — 바뀌면 목록과 겹침 배지가 옛 원장 기준이 된다(하드웨어 라운드 2 H-4).
   * 펼쳐 둔 상태면 곧바로 다시 조회하고, 접혀 있으면 다음 펼칠 때 조회한다. 겹침 경고는 이 화면만의 이중 계상
   * 방어라, 가져오기 직후 옛 목록으로 첫 클릭에 등록되면 안 된다.
   */
  ledgerVersion?: string
}

const SECTION_CARD_CLASS = "rounded-lg border border-[rgba(0,0,0,0.08)] bg-white"
const GHOST_BUTTON_CLASS =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[12px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"

function CrmOrderBacklogSection({ canWrite, onRegistered, ledgerVersion = "" }: CrmOrderBacklogSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<CrmOrderBacklogEntry[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rowResults, setRowResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  // 겹침 의심 줄은 한 번 더 누르게 한다 — 첫 클릭은 경고만 띄운다.
  const [overlapAcknowledged, setOverlapAcknowledged] = useState<ReadonlySet<string>>(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const result = await adminFetchJson<{ entries: CrmOrderBacklogEntry[]; warnings?: string[] }>(
        "/api/admin/hardware/crm-orders?scope=backlog"
      )
      setEntries(result.entries ?? [])
      setWarnings(result.warnings ?? [])
      // 행 상태는 목록과 함께 비운다 — 겹침 경고를 이미 본 것으로 남겨 두면 다시 조회한 뒤
      // 첫 클릭에 바로 등록된다(두 번 누르기 보호가 목록보다 오래 살면 안 된다).
      setOverlapAcknowledged(new Set())
      setRowResults({})
      setLoaded(true)
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const lastLedgerVersionRef = useRef(ledgerVersion)
  useEffect(() => {
    if (lastLedgerVersionRef.current === ledgerVersion) return
    lastLedgerVersionRef.current = ledgerVersion
    if (!loaded) return
    if (expanded) void load()
    else setLoaded(false)
  }, [expanded, ledgerVersion, load, loaded])

  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    if (next && !loaded && !loading) void load()
  }

  const register = async (entry: CrmOrderBacklogEntry) => {
    if (!entry.productName || !entry.quantity) return
    if (entry.ledgerOverlap && !overlapAcknowledged.has(entry.id)) {
      setOverlapAcknowledged((current) => new Set(current).add(entry.id))
      setRowResults((current) => ({
        ...current,
        [entry.id]: {
          ok: false,
          message: `원장에 같은 고객사·품목 출고 ${formatNumber(entry.ledgerOverlap!.quantity)}대가 이미 있습니다. 시트가 실어 온 물량이면 등록하지 마세요 — 다시 누르면 그래도 등록합니다.`,
        },
      }))
      return
    }

    setRegisteringId(entry.id)
    setNotice(null)
    setRowResults((current) => {
      const next = { ...current }
      delete next[entry.id]
      return next
    })
    try {
      await adminFetchJson("/api/admin/hardware/movements", {
        method: "POST",
        body: JSON.stringify({
          productName: entry.productName,
          movementType: "outbound",
          quantity: entry.quantity,
          occurredAt: todayKey(),
          fromLocation: "창고",
          toLocation: entry.customerName ?? "",
          status: "배송 예정",
          referenceNo: entry.referenceNo,
          memo: `CRM 연동: ${entry.sourceLabel} · ${entry.title}`,
          crmLink: {
            id: entry.id,
            source: entry.source,
            sourceLabel: entry.sourceLabel,
            referenceNo: entry.referenceNo,
            title: entry.title,
            href: entry.href,
          },
        }),
      })
      setEntries((current) => current.filter((row) => row.id !== entry.id))
      setOverlapAcknowledged((current) => {
        const next = new Set(current)
        next.delete(entry.id)
        return next
      })
      // 행이 목록에서 빠지므로 확인 문구는 섹션 알림으로 남긴다.
      setNotice(
        `${entry.customerName ?? "고객사 미상"} · ${entry.productName} ${formatNumber(entry.quantity ?? 0)}대를 배송 예정으로 등록했습니다.`
      )
      await onRegistered()
    } catch (err) {
      setRowResults((current) => ({
        ...current,
        [entry.id]: { ok: false, message: err instanceof Error ? err.message : String(err) },
      }))
    } finally {
      setRegisteringId(null)
    }
  }

  return (
    <section className={SECTION_CARD_CLASS}>
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-[#111110]">
            CRM 오더 대사
            {loaded ? (
              <span className="ml-1.5 rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#615D59]">
                {formatNumber(entries.length)}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-[#615D59]">
            CRM·견적에 있는데 원장에 없는 출고를 그 자리에서 배송 예정으로 등록합니다.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#A39E98] transition ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded ? (
        <div className="border-t border-[rgba(0,0,0,0.06)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] font-semibold text-[#615D59]">
              참조번호가 원장에 이미 있으면 목록에서 빠집니다. 시트 이관 행은 딜 참조가 없어 대사되지 않으므로, 고객사·품목이 겹치면 배지로 알립니다.
            </p>
            <button type="button" onClick={() => void load()} disabled={loading} className={GHOST_BUTTON_CLASS}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              다시 조회
            </button>
          </div>

          {notice ? (
            <p role="status" className="mt-2 rounded-md border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-2 text-[12px] font-semibold text-[#084734]">
              {notice}
            </p>
          ) : null}
          {!canWrite ? (
            <p className="mt-2 text-[11.5px] font-semibold text-[#A8741A]">
              읽기 권한 계정입니다 — 목록은 볼 수 있지만 등록은 하드웨어 편집 권한이 있는 관리자에게 요청하세요.
            </p>
          ) : null}
          {listError ? (
            <p role="alert" className="mt-2 rounded-md border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">
              {listError}
            </p>
          ) : null}
          {warnings.length > 0 ? (
            <p className="mt-2 rounded-md border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[11.5px] font-semibold text-[#7A520F]">
              일부 원천을 읽지 못했습니다 — {warnings.join(" · ")}
            </p>
          ) : null}

          {loading && !loaded ? (
            <p className="mt-3 text-[12px] font-semibold text-[#A39E98]">불러오는 중…</p>
          ) : null}
          {loaded && entries.length === 0 && !listError ? (
            <p className="mt-3 text-[12px] font-semibold text-[#A39E98]">원장에 없는 CRM 오더가 없습니다.</p>
          ) : null}

          <ul className="mt-2 divide-y divide-[rgba(0,0,0,0.06)]">
            {entries.map((entry) => {
              const result = rowResults[entry.id]
              const busy = registeringId === entry.id
              return (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-[#111110]">
                      <span title={entry.customerName ?? undefined} className="truncate">{entry.customerName ?? "고객사 미상"}</span>
                      <span className="text-[#A39E98]">·</span>
                      <span title={entry.productName ?? undefined} className="truncate">{entry.productName}</span>
                      <span className="tabular-nums text-[#615D59]">{formatNumber(entry.quantity ?? 0)}대</span>
                      {entry.ledgerOverlap ? (
                        <span className="rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[10.5px] font-bold text-[#7A520F]">
                          원장에 겹침 의심 {formatNumber(entry.ledgerOverlap.quantity)}대
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-[#615D59]">
                      {entry.sourceLabel} · {entry.title}
                      {entry.status ? ` · ${entry.status}` : ""}
                    </p>
                    {result ? (
                      <p
                        role={result.ok ? "status" : "alert"}
                        className={`mt-1 text-[11.5px] font-semibold ${result.ok ? "text-[#084734]" : "text-[#8F2C2C]"}`}
                      >
                        {result.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {entry.href ? (
                      <a href={entry.href} className={GHOST_BUTTON_CLASS} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        CRM
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void register(entry)}
                      disabled={!canWrite || busy || registeringId != null}
                      title={canWrite ? undefined : "하드웨어 기록 권한이 없습니다"}
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#084734] bg-white px-3 text-[12px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {busy ? "등록 중…" : entry.ledgerOverlap && overlapAcknowledged.has(entry.id) ? "그래도 예정 등록" : "예정 등록"}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export default memo(CrmOrderBacklogSection)
