"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, Layers } from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import { formatCNY } from "@/lib/crm/money-format"

// Account 360 스파인 렌즈 — /api/admin/crm/account-master 읽기 뷰.
// 리포(lib/repositories/account-master.ts)는 server-only이므로 응답 shape만 로컬 선언한다.
// 통화 규범: REV 매출은 CNY(¥)만 합산·표기하고, 외부 CRM 레코드는 통화 혼재 위험 때문에
// 금액 없이 건수만 표기한다(의도적) — grand total에 절대 섞지 않는다.
interface AccountMasterEntry {
  targetType: "customer" | "partner_account"
  targetId: string
  name: string
  campusName: string | null
  partnerName: string | null
  revenueCNY: number
  revRows: number
  leadCount: number
  externalCount: number
  sources: string[]
}
interface AccountMasterUnmatched {
  accountKey: string
  name: string
  rows: number
  revenueCNY: number
  hasCandidate: boolean
}
interface AccountMaster {
  accounts: AccountMasterEntry[]
  unmatched: AccountMasterUnmatched[]
  summary: {
    accountsWithRevenue: number
    linkedRevenueCNY: number
    unmatchedRevenueCNY: number
  }
}

const ENDPOINT = "/api/admin/crm/account-master"
const TOP_ACCOUNTS = 10
const TOP_UNMATCHED = 5

// 원천 종류(source_system) → 사람이 읽는 배지 라벨.
const SOURCE_BADGE: Record<string, string> = {
  branch_rev_sheet: "REV",
  lead: "리드",
  xiaoshouyi: "외부CRM",
}

function SourceBadges({ sources }: { sources: string[] }) {
  const labels = sources.map((s) => SOURCE_BADGE[s]).filter(Boolean)
  if (!labels.length) return <span className="text-[#1a1a1a]/25">-</span>
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded border border-[#D7EBDD] bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-semibold text-[#084734]"
        >
          {label}
        </span>
      ))}
    </span>
  )
}

export default function Account360Lens() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<AccountMaster | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const toggle = () => {
    const next = !open
    setOpen(next)
    // 펼칠 때만 lazy fetch — 이미 성공적으로 받았으면 재요청하지 않는다.
    if (next && !data && !loading) {
      setLoading(true)
      setFailed(false)
      adminFetchJsonCached<AccountMaster>(ENDPOINT, undefined, {
        cacheKey: ENDPOINT,
        ttlMs: 90_000,
        staleWhileRevalidateMs: 5 * 60_000,
      })
        .then((d) => {
          setData(d)
          setFailed(false)
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false))
    }
  }

  const summary = data?.summary
  const topAccounts = data?.accounts.slice(0, TOP_ACCOUNTS) ?? []
  const topUnmatched = data?.unmatched.slice(0, TOP_UNMATCHED) ?? []
  const hasUnmatchedRevenue = (summary?.unmatchedRevenueCNY ?? 0) > 0

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <Layers className="h-4 w-4 shrink-0 text-[#084734]" />
        <span className="text-[13px] font-bold text-[#111110]">Account 360</span>
        <span className="text-[12px] text-[#1a1a1a]/42">
          REV 원장 기준 매출 계정 스파인
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-[#1a1a1a]/35 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t border-[#f0f0ec] px-4 py-4">
          {loading && !data ? (
            <p className="text-[13px] text-[#1a1a1a]/40">Account 360 스파인을 불러오는 중입니다...</p>
          ) : failed && !data ? (
            <p className="text-[12px] font-medium text-[#B43E3E]">
              Account 360 스파인을 불러오지 못했습니다.
            </p>
          ) : summary ? (
            <>
              {/* 요약 3스탯 — CNY만 합산, 통화 혼합 없음 */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-[#fafaf8] p-3">
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">매출 보유 계정</p>
                  <p className="mt-1 text-xl font-bold text-[#111110]">
                    {summary.accountsWithRevenue.toLocaleString("ko-KR")}
                    <span className="ml-1 text-[13px] font-semibold text-[#1a1a1a]/40">곳</span>
                  </p>
                </div>
                <div className="rounded-xl bg-[#fafaf8] p-3">
                  <p className="text-[11px] font-semibold text-[#1a1a1a]/35">연결된 REV 누적</p>
                  <p className="mt-1 text-xl font-bold text-[#084734]">
                    {formatCNY(summary.linkedRevenueCNY)}
                  </p>
                </div>
                <div
                  className={`rounded-xl p-3 ${hasUnmatchedRevenue ? "bg-[#FCE9E9]" : "bg-[#fafaf8]"}`}
                >
                  <p
                    className={`text-[11px] font-semibold ${hasUnmatchedRevenue ? "text-[#B43E3E]/70" : "text-[#1a1a1a]/35"}`}
                  >
                    미연결 매출
                  </p>
                  <p
                    className={`mt-1 text-xl font-bold ${hasUnmatchedRevenue ? "text-[#B43E3E]" : "text-[#111110]"}`}
                  >
                    {formatCNY(summary.unmatchedRevenueCNY)}
                  </p>
                </div>
              </div>

              {/* 매출 상위 계정 (최대 10행) */}
              {topAccounts.length ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/35">
                      <tr>
                        <th className="px-2 py-2">계정</th>
                        <th className="px-2 py-2 text-right">REV 누적</th>
                        <th className="px-2 py-2">연결 원천</th>
                        <th className="px-2 py-2 text-right">리드 · 외부</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0f0ec]">
                      {topAccounts.map((account) => {
                        const subLabel = account.campusName ?? account.partnerName
                        return (
                          <tr key={`${account.targetType}:${account.targetId}`}>
                            <td className="px-2 py-2">
                              {/* 고객 360 라우트(/admin/crm/customers/[key])는 lead:/neo: 접두 키만
                                  받아 portal customer UUID로는 이동 불가 — 링크 없이 표시만 한다. */}
                              <span className="inline-flex max-w-full flex-col">
                                <span className="truncate text-[13px] font-semibold text-[#111110]">
                                  {account.name}
                                </span>
                                {subLabel ? (
                                  <span className="truncate text-[11px] text-[#1a1a1a]/40">{subLabel}</span>
                                ) : null}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right text-[12px] font-semibold tabular-nums text-[#084734]">
                              {formatCNY(account.revenueCNY)}
                            </td>
                            <td className="px-2 py-2">
                              <SourceBadges sources={account.sources} />
                            </td>
                            <td className="px-2 py-2 text-right text-[12px] tabular-nums text-[#1a1a1a]/55">
                              {account.leadCount.toLocaleString("ko-KR")} ·{" "}
                              {account.externalCount.toLocaleString("ko-KR")}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-[12px] text-[#1a1a1a]/40">연결된 매출 계정이 아직 없습니다.</p>
              )}

              {/* 미연결(needs link) 리스트 (최대 5행) */}
              {topUnmatched.length ? (
                <div className="mt-4 rounded-xl border border-[#f0f0ec] bg-[#fafaf8] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/40">
                      미연결 계정 (needs link)
                    </p>
                    <Link
                      href="/admin/crm/matching"
                      className="inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
                    >
                      매칭 인박스에서 정리
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <ul className="divide-y divide-[#f0f0ec]">
                    {topUnmatched.map((entry) => (
                      <li key={entry.accountKey} className="flex items-center gap-2 py-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#111110]">
                          {entry.name}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#1a1a1a]/60">
                          {formatCNY(entry.revenueCNY)}
                        </span>
                        {entry.hasCandidate ? (
                          <span className="shrink-0 rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-2 py-0.5 text-[10px] font-semibold text-[#A8741A]">
                            검토 대기
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-[#F2B8B8] bg-[#FCE9E9] px-2 py-0.5 text-[10px] font-semibold text-[#B43E3E]">
                            미연결
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
