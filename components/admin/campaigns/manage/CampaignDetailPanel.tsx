"use client"

// components/admin/campaigns/manage/CampaignDetailPanel.tsx
// 캠페인 상세(D1-6) — 우측 슬라이드오버. 롤업 카드(정직 라벨) + 연결된 실행 목록 + 링크 피커.
// GET /[id] 로 캠페인 + 읽기시점 롤업을 조회한다. 마이그 미적용이면 API 가 500/404 →
// 크래시 없이 에러 카드/자동 닫힘으로 강등한다(그레이스풀).
// "편집"은 D1-5 CampaignFormDrawer 를 재사용한다(리빌드 금지).
//
// 정직 규칙(D2/롤업 순수함수와 동일):
//  - 행사 리드: API 가 0 을 v1 미집계 자리표시자로 반환 → 숫자 대신 "미집계" 라벨("리드 0" 금지).
//  - 행사 매출: null → "미입력"(0원과 구분).
//  - Meta 집행: 계정 통화 네이티브(예: "USD 1,234.5") — 절대 ₩ 로 접지 않는다.
//  - 채널·통화를 가로지르는 종합 합산·수익률(ROAS) 지표는 만들지 않는다(타입에 필드 없음).
//  - 연결 0 건 채널: 0 의 나열 대신 "연결 없음" + 점선/뉴트럴로 물러난다(0건 ≠ 성과 0).
//  - 연결된 실행: API 가 붙여준 label 우선, 없으면 raw refId 폴백(라벨 조작 금지).
// DESIGN.md 팔레트만 사용.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AlertCircle,
  CalendarDays,
  Link2,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  X,
} from "lucide-react"

import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import { useToast } from "@/components/ui/toast"
import {
  CAMPAIGN_REF_TYPES,
  CAMPAIGN_REF_TYPE_LABEL,
  type CampaignLink,
  type CampaignRefType,
  type CampaignRollup,
  type CampaignWithLinks,
} from "@/lib/types/marketing-campaign"

import { CampaignStatusChip, formatBudget, formatCampaignPeriod } from "./CampaignRow"
import { CampaignFormDrawer } from "./CampaignFormDrawer"
import { LinkPicker } from "./LinkPicker"

/* ── 포맷터(순수·모듈 스코프) ─────────────────────────────────── */

const COUNT_FMT = new Intl.NumberFormat("ko-KR")
const KRW_FMT = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
// Meta 집행은 계정 통화 네이티브 — 통화코드 접두 + 소수 보존. 절대 ₩ 로 접지 않는다.
const META_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })

const CHANNEL_ICON: Record<CampaignRefType, ReactNode> = {
  email_campaign: <Mail className="h-3.5 w-3.5" />,
  sms_campaign: <MessageSquare className="h-3.5 w-3.5" />,
  event: <CalendarDays className="h-3.5 w-3.5" />,
  meta_campaign: <Target className="h-3.5 w-3.5" />,
}

/* ── 롤업 카드(순수·프레젠테이션·테스트 대상) ─────────────────── */

// 연결된 실행이 0 인 채널은 실데이터 채널과 같은 무게로 외치면 안 된다 —
// 점선 보더 + 뉴트럴로 물러나고, 0 의 나열 대신 "연결 없음"만 말한다(정직: 0 건 ≠ 성과 0).
function RollupTile({
  icon,
  label,
  count,
  children,
}: {
  icon: ReactNode
  label: string
  count: number
  children: ReactNode
}) {
  const empty = count === 0
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        empty
          ? "border-dashed border-[#e8e8e4] bg-transparent"
          : "border-[rgba(0,0,0,0.08)] bg-[#fafaf8]"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
            empty ? "text-[#A39E98]" : "text-[#111110]"
          }`}
        >
          <span className={empty ? "text-[#A39E98]" : "text-[#615D59]"}>{icon}</span>
          {label}
        </span>
        {!empty && (
          <span className="shrink-0 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-[#615D59]">
            {count}건
          </span>
        )}
      </div>
      <p
        className={`text-[12px] leading-relaxed tabular-nums ${
          empty ? "text-[#A39E98]" : "text-[#31302E]"
        }`}
      >
        {empty ? "연결 없음" : children}
      </p>
    </div>
  )
}

/* ── 연결된 실행의 라벨(순수·테스트 대상) ─────────────────────── */

// API 가 읽기시점에 붙여준 사람이 읽는 이름(label)을 우선 표기한다.
// 해석 실패(실행 삭제 · Meta 조회 지평 밖)면 label 이 없다 → raw refId 로 폴백(mono·말줄임).
// 절대 "이메일 캠페인" 같은 그럴듯한 이름을 지어내지 않는다.
export function CampaignLinkLabel({ link }: { link: CampaignLink }) {
  if (link.label) {
    return (
      <span className="truncate text-[12px] text-[#31302E]" title={`${link.label} · ${link.refId}`}>
        {link.label}
      </span>
    )
  }
  return (
    <span className="truncate font-mono text-[11px] text-[#615D59]" title={link.refId}>
      {link.refId}
    </span>
  )
}

// props: rollup — 링크된 실행의 가용 지표만 정직하게 표기하는 순수 함수(부수효과 없음).
// 종합 합산·수익률(ROAS) 지표는 만들지 않는다.
export function CampaignRollupCard({ rollup }: { rollup: CampaignRollup }) {
  const c = rollup.linkedCounts
  return (
    <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-[#111110]">채널별 지표</h3>
        <span className="text-[11px] text-[#615D59]">읽기 시점 롤업</span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <RollupTile icon={<Mail className="h-3.5 w-3.5" />} label="이메일" count={c.email}>
          수신 <b className="font-semibold text-[#111110]">{COUNT_FMT.format(rollup.emailRecipients)}</b> · 오픈{" "}
          <b className="font-semibold text-[#111110]">{COUNT_FMT.format(rollup.emailOpens)}</b>
        </RollupTile>

        <RollupTile icon={<MessageSquare className="h-3.5 w-3.5" />} label="문자" count={c.sms}>
          수신 <b className="font-semibold text-[#111110]">{COUNT_FMT.format(rollup.smsRecipients)}</b>
        </RollupTile>

        <RollupTile icon={<CalendarDays className="h-3.5 w-3.5" />} label="행사" count={c.event}>
          {/* 리드는 v1 미집계 자리표시자(0) — 숫자 대신 라벨로 표기해 "0 리드" 오독을 막는다. */}
          리드 <b className="font-semibold text-[#A8741A]">미집계</b> · 딜{" "}
          <b className="font-semibold text-[#111110]">{COUNT_FMT.format(rollup.eventDeals)}</b> · 매출{" "}
          <b className="font-semibold text-[#111110]">
            {rollup.eventRevenue == null ? "미입력" : KRW_FMT.format(rollup.eventRevenue)}
          </b>
        </RollupTile>

        <RollupTile icon={<Target className="h-3.5 w-3.5" />} label="Meta 광고" count={c.meta}>
          집행{" "}
          <b className="font-semibold text-[#111110]">
            {rollup.metaSpend == null
              ? "—"
              : `${rollup.metaCurrency} ${META_FMT.format(rollup.metaSpend)}`}
          </b>{" "}
          · 리드 <b className="font-semibold text-[#111110]">{COUNT_FMT.format(rollup.metaLeads)}</b>
        </RollupTile>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[#615D59]">
        채널·통화가 달라 종합 합산·수익률 지표는 표기하지 않습니다. 행사 리드는 v1에서 미집계이며, 매출은
        입력 기준입니다.
      </p>
    </section>
  )
}

/* ── 상세 패널 ────────────────────────────────────────────────── */

type DetailResponse = { campaign: CampaignWithLinks; rollup: CampaignRollup }

interface CampaignDetailPanelProps {
  campaign: CampaignWithLinks // 리스트 요약 — 즉시 헤더 + 폴백 링크. 상세는 GET /[id] 로 새로 조회.
  onClose: () => void // 부모에서 memoized(안정) — load 의 deps 로 안전하게 쓰인다.
  onListChanged: () => void | Promise<void> // 부모 리스트 리페치(연결 수·필드 변경 반영).
}

export default function CampaignDetailPanel({
  campaign,
  onClose,
  onListChanged,
}: CampaignDetailPanelProps) {
  const toast = useToast()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // adminFetchJson 대신 adminFetch 로 404 를 직접 구분한다(삭제됨 vs 전송 오류).
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch(`/api/admin/marketing-campaigns/${campaign.id}`)
      if (res.status === 404) {
        // 다른 곳에서 삭제됨 → 깨진 상세 대신 패널을 닫는다.
        onClose()
        return
      }
      const json = (await res.json().catch(() => null)) as
        | DetailResponse
        | { error?: string }
        | null
      if (!res.ok) {
        const msg =
          (json && "error" in json && json.error) || `${res.status} ${res.statusText}`.trim()
        throw new Error(msg || "캠페인 상세를 불러오지 못했습니다.")
      }
      setData(json as DetailResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : "캠페인 상세를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [campaign.id, onClose])

  useEffect(() => {
    void load()
  }, [load])

  // Escape: 편집 중이면 폼 드로어가 우선(자체 X 로 닫음) → 무시. 피커 열림 → 피커 닫기. 그 외 → 상세 닫기.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (editing) return
      if (pickerOpen) {
        setPickerOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editing, pickerOpen, onClose])

  // 헤더·링크는 fetch 전엔 리스트 요약으로 폴백해 빈 화면 깜빡임을 막는다.
  const head = data?.campaign ?? campaign
  const links = data?.campaign.links ?? campaign.links

  const grouped = useMemo(() => {
    const g: Record<CampaignRefType, CampaignLink[]> = {
      email_campaign: [],
      sms_campaign: [],
      event: [],
      meta_campaign: [],
    }
    for (const l of links) g[l.refType].push(l)
    return g
  }, [links])

  async function handleEditSuccess(message: string) {
    setEditing(false)
    toast.success(message)
    await onListChanged()
    await load() // 삭제였다면 GET 404 → load 가 onClose 를 호출해 패널을 닫는다.
  }

  async function handleLinked() {
    // 피커가 링크 추가 성공 후 호출 — 상세 리페치(연결 목록·롤업·피커 비활성 갱신) + 부모 리스트.
    await load()
    await onListChanged()
  }

  async function handleRemove(linkId: string) {
    setRemovingId(linkId)
    try {
      await adminFetchJson(`/api/admin/marketing-campaigns/${campaign.id}/links`, {
        method: "DELETE",
        body: JSON.stringify({ linkId }),
      })
      toast.success("링크를 해제했습니다.")
      await load()
      await onListChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "링크 해제에 실패했습니다.")
    } finally {
      setRemovingId(null)
    }
  }

  const linkCount = links.length

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex justify-end bg-black/40"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex h-full w-full max-w-xl flex-col bg-[#FAFAF8] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`캠페인 상세: ${head.name}`}
        >
          {/* 헤더(고정) */}
          <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] bg-white px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#615D59]">
                  캠페인 상세
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[18px] font-bold text-[#111110]">{head.name}</h2>
                  <CampaignStatusChip status={head.status} />
                </div>
                {head.objective && <p className="mt-1 text-[12px] text-[#615D59]">{head.objective}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="shrink-0 text-[#615D59] transition-colors hover:text-[#111110]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#615D59]">
              <span className="tabular-nums">{formatCampaignPeriod(head.startsAt, head.endsAt)}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatBudget(head.budget)}</span>
              {head.owner && (
                <>
                  <span aria-hidden>·</span>
                  <span>{head.owner}</span>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4]"
              >
                <Pencil className="h-3.5 w-3.5" />
                편집
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                새로고침
              </button>
            </div>
          </div>

          {/* 본문(스크롤) */}
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            {loading && !data ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-[176px] animate-pulse rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
                <div className="h-[120px] animate-pulse rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#f0f0ec]" />
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B43E3E]" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#8F2C2C]">상세를 불러오지 못했습니다</p>
                    <p className="mt-1 break-words text-[12px] text-[#B43E3E]">{error}</p>
                    <p className="mt-1.5 text-[11px] text-[#B43E3E]/80">
                      마이그레이션(marketing_campaigns)이 아직 적용되지 않았을 수 있습니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#F2B8B8] bg-white px-3 py-1.5 text-[12px] font-bold text-[#B43E3E] transition hover:bg-[#FCE9E9]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      다시 시도
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {data?.rollup && <CampaignRollupCard rollup={data.rollup} />}

                {/* 연결된 실행 */}
                <section className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#111110]">
                      <Link2 className="h-3.5 w-3.5 text-[#615D59]" />
                      연결된 실행
                      <span className="tabular-nums text-[#615D59]">{linkCount}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setPickerOpen((v) => !v)}
                      aria-expanded={pickerOpen}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-2.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      링크 추가
                    </button>
                  </div>

                  {pickerOpen && (
                    <div className="mb-3">
                      <LinkPicker
                        campaignId={campaign.id}
                        existingLinks={links}
                        onLinked={handleLinked}
                        onClose={() => setPickerOpen(false)}
                      />
                    </div>
                  )}

                  {linkCount === 0 ? (
                    <p className="rounded-xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-6 text-center text-[12px] text-[#615D59]">
                      아직 연결된 실행이 없습니다. “링크 추가”로 채널 실행을 묶어보세요.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {CAMPAIGN_REF_TYPES.map((refType) => {
                        const group = grouped[refType]
                        if (group.length === 0) return null
                        return (
                          <div key={refType}>
                            <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#615D59]">
                              <span className="text-[#A39E98]">{CHANNEL_ICON[refType]}</span>
                              {CAMPAIGN_REF_TYPE_LABEL[refType]}
                              <span className="tabular-nums">{group.length}</span>
                            </p>
                            <div className="space-y-1">
                              {group.map((link) => (
                                <div
                                  key={link.id}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#fafaf8] px-2.5 py-1.5"
                                >
                                  <CampaignLinkLabel link={link} />
                                  <button
                                    type="button"
                                    onClick={() => void handleRemove(link.id)}
                                    disabled={removingId === link.id}
                                    className="shrink-0 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[11px] font-medium text-[#615D59] transition hover:border-[#F2B8B8] hover:bg-[#FCE9E9] hover:text-[#B43E3E] disabled:opacity-50"
                                  >
                                    {removingId === link.id ? "해제 중..." : "해제"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 편집 — D1-5 CampaignFormDrawer 재사용(z-50, 상세 위에). 저장/삭제 성공 → handleEditSuccess. */}
      {editing && (
        <CampaignFormDrawer
          initial={data?.campaign ?? campaign}
          onClose={() => setEditing(false)}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  )
}
