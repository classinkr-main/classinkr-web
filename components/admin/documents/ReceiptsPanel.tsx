"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { AlertCircle, Download, Plus, ReceiptText, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminFetch, adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
import type { Contract, Receipt, Partner, PaymentMethod } from "@/lib/supabase/database.types"
import { groupReceipts, needsCashReceipt } from "./document-queues"
import {
  DANGER_GHOST_BUTTON,
  DetailHeader,
  DocChain,
  GHOST_BUTTON,
  NextActionBox,
  NoMatch,
  QueueEmptyState,
  QueueGroupHeader,
  QueueLayout,
  QueueListItem,
  QueueLoading,
  QueueToolbar,
  SOLID_BUTTON,
  formatDay,
  formatMan,
  formatWon,
} from "./queue-ui"

// GET /api/admin/partners는 { partners }가 아니라 { workspaces }/{ summaries }를 반환한다.
// 패널은 파트너명 표시·셀렉트에 id/name만 필요하므로 summary 응답을 최소 형태로 매핑해 쓴다.
type PartnerOption = Pick<Partner, "id" | "name">

const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "계좌이체",
  card: "카드",
  cash: "현금",
}

const EMPTY_FORM = {
  contract_id: "",
  partner_id: "",
  amount: 0,
  tax_amount: 0,
  total_amount: 0,
  payment_method: "bank_transfer" as PaymentMethod,
  cash_receipt_requested: false,
  // 셀렉트 첫 칸(개인)과 저장값을 맞춘다 — 빈 값이면 화면엔 '개인'인데 null 로 저장됐다.
  cash_receipt_type: "personal",
  cash_receipt_number: "",
  paid_at: "",
  notes: "",
}

export function ReceiptsPanel() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [query, setQuery] = useUrlState("receipt_q", "")

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [rData, pData, cData] = await Promise.all([
        adminFetchJsonCached<{ receipts?: Receipt[] }>("/api/admin/receipts"),
        adminFetchJsonCached<{ summaries?: Array<{ partnerId: string; partnerName: string }> }>(
          "/api/admin/partners?view=summary"
        ),
        // 연결 문서 줄과 발행 폼의 계약 선택용.
        adminFetchJsonCached<{ contracts?: Contract[] }>("/api/admin/contracts").catch(() => ({ contracts: [] })),
      ])
      setReceipts(rData.receipts ?? [])
      setPartners((pData.summaries ?? []).map((s) => ({ id: s.partnerId, name: s.partnerName })))
      setContracts(cData.contracts ?? [])
    } catch (error) {
      // 기존 데이터 유지 — 일시적 네트워크 오류 시 빈 화면 방지
      setLoadError(error instanceof Error ? error.message : "영수증 목록을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function handleAmountChange(v: number) {
    const tax = Math.round(v * 0.1)
    setForm({ ...form, amount: v, tax_amount: tax, total_amount: v + tax })
  }

  function openForm() {
    setForm(EMPTY_FORM)
    setSaveError(null)
    setShowForm(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    const payload = {
      ...form,
      cash_receipt_type: form.cash_receipt_requested ? form.cash_receipt_type || null : null,
      cash_receipt_number: form.cash_receipt_requested ? form.cash_receipt_number || null : null,
      paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : null,
    }
    const res = await adminFetch("/api/admin/receipts", { method: "POST", body: JSON.stringify(payload) })
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { receipt?: { id?: string } } | null
      if (data?.receipt?.id) setSelectedId(data.receipt.id)
      clearAdminRequestCache("/api/admin/receipts")
      setShowForm(false)
      setForm(EMPTY_FORM)
      load()
    } else {
      setSaveError("영수증 발행에 실패했습니다. 계약·금액을 확인한 뒤 다시 시도하세요.")
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("이 영수증을 삭제할까요?")) return
    await adminFetch(`/api/admin/receipts/${id}`, { method: "DELETE" })
    clearAdminRequestCache("/api/admin/receipts")
    load()
  }

  const partnerName = useCallback(
    (id: string) => partners.find((p) => p.id === id)?.name ?? "파트너 미지정",
    [partners]
  )

  // 현금영수증 발행 필요가 맨 위, 나머지는 입금월 최신순.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = q
      ? receipts.filter(
          (r) =>
            r.receipt_number.toLowerCase().includes(q) ||
            partnerName(r.partner_id).toLowerCase().includes(q)
        )
      : receipts
    return groupReceipts(visible)
  }, [receipts, query, partnerName])

  const visibleReceipts = groups.flatMap((group) => group.items)
  const current = visibleReceipts.find((r) => r.id === selectedId) ?? visibleReceipts[0] ?? null

  function renderDetail(r: Receipt) {
    const needs = needsCashReceipt(r)
    const contract = contracts.find((c) => c.id === r.contract_id)
    const cashLabel = !r.cash_receipt_requested
      ? "요청 없음"
      : needs
        ? "고객 요청 · 번호 미입력"
        : `${r.cash_receipt_type === "business" ? "지출증빙(사업자)" : "소득공제(개인)"} · ${r.cash_receipt_number} · 발행 완료`

    return (
      <section aria-live="polite" aria-label="영수증 상세" className="flex min-w-0 flex-col gap-6 px-7 py-6">
        <DetailHeader
          mono={r.receipt_number}
          title={partnerName(r.partner_id)}
          meta={`${METHOD_LABEL[r.payment_method]} · ${r.paid_at ? `${formatDay(r.paid_at)} 입금` : "입금일 미입력"}`}
          amount={formatWon(r.total_amount)}
          amountNote="입금액 · VAT 포함"
        />

        <DocChain
          links={[
            { label: "견적", value: contract?.quote_id ? "연결됨" : null },
            { label: "계약", value: contract?.contract_number ?? null },
            { label: "영수증", value: r.receipt_number, current: true },
          ]}
        />

        {needs ? (
          <NextActionBox
            tone="warn"
            label="현금영수증 발행 필요"
            description="고객이 요청했지만 번호가 없습니다 — 사업자번호나 휴대폰 번호를 받아 발행하세요."
          />
        ) : (
          <NextActionBox
            tone="muted"
            label="발행 완료"
            description={r.pdf_url ? "증빙까지 끝났습니다. 필요하면 PDF를 다시 보내세요." : "발행 완료 — 저장된 PDF 파일은 아직 없습니다."}
          >
            {r.pdf_url && (
              <a href={r.pdf_url} target="_blank" rel="noreferrer" className={GHOST_BUTTON}>
                <Download className="h-3.5 w-3.5" />
                PDF
              </a>
            )}
          </NextActionBox>
        )}

        <div className="grid gap-7 xl:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-[11.5px] font-semibold text-[#78736D]">금액</h3>
            <div className="flex justify-between border-b border-[#f0f0ec] py-2 text-[12.5px]">
              <span>공급가액</span>
              <span className="tabular-nums">{formatWon(r.amount)}</span>
            </div>
            <div className="flex justify-between border-b border-[#f0f0ec] py-2 text-[12.5px]">
              <span>세액</span>
              <span className="tabular-nums">{formatWon(r.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-[#31302E] pt-2.5 text-[12.5px] font-bold">
              <span>합계</span>
              <span className="tabular-nums">{formatWon(r.total_amount)}</span>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[11.5px] font-semibold text-[#78736D]">결제 · 증빙</h3>
            <dl className="grid grid-cols-[84px_1fr] gap-x-2.5 gap-y-1.5 text-xs">
              <dt className="text-[#78736D]">결제 수단</dt>
              <dd className="text-[#31302E]">{METHOD_LABEL[r.payment_method]}</dd>
              <dt className="text-[#78736D]">입금일</dt>
              <dd className="text-[#31302E]">{formatDay(r.paid_at) ?? "—"}</dd>
              <dt className="text-[#78736D]">현금영수증</dt>
              <dd className={needs ? "font-semibold text-[#7A520F]" : "text-[#31302E]"}>{cashLabel}</dd>
              <dt className="text-[#78736D]">메일 발송</dt>
              <dd className="text-[#31302E]">{formatDay(r.emailed_at) ?? "—"}</dd>
              <dt className="text-[#78736D]">발행</dt>
              <dd className="text-[#31302E]">{formatDay(r.created_at) ?? "—"}</dd>
              <dt className="text-[#78736D]">메모</dt>
              <dd className="whitespace-pre-wrap text-[#31302E]">{r.notes?.trim() || "—"}</dd>
            </dl>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#f0f0ec] pt-4">
          <button type="button" onClick={() => void handleDelete(r.id)} className={DANGER_GHOST_BUTTON}>
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:px-6 sm:py-5">
      {loadError && receipts.length === 0 ? (
        <QueueEmptyState
          icon={<AlertCircle className="h-5 w-5 text-[#B43E3E]" />}
          title="영수증 목록을 불러오지 못했습니다."
          description={loadError}
          action={
            <button type="button" onClick={() => void load()} className={GHOST_BUTTON}>
              다시 시도
            </button>
          }
        />
      ) : loading && receipts.length === 0 ? (
        <QueueLoading label="영수증을 불러오는 중입니다." />
      ) : receipts.length === 0 ? (
        <QueueEmptyState
          icon={<ReceiptText className="h-5 w-5" />}
          title="발행된 영수증이 없습니다."
          description={
            contracts.length === 0
              ? "영수증은 계약서에 묶여 발행됩니다. 계약서 탭에서 계약을 먼저 만든 뒤 입금이 확인되면 발행하세요."
              : "입금이 확인된 계약의 영수증을 발행하면 월별로 정리되고, 현금영수증 요청 건은 맨 위에 모입니다."
          }
          action={
            <button type="button" onClick={openForm} className={SOLID_BUTTON}>
              <Plus className="h-3.5 w-3.5" />
              첫 영수증 발행
            </button>
          }
        />
      ) : (
        <QueueLayout
          label="영수증 목록"
          list={
            <>
              <QueueToolbar
                query={query}
                onQueryChange={setQuery}
                placeholder="영수증 번호, 파트너"
                loading={loading}
                onRefresh={() => void load()}
                action={
                  <button type="button" onClick={openForm} className={`${GHOST_BUTTON} shrink-0`}>
                    <Plus className="h-3.5 w-3.5" />
                    영수증 발행
                  </button>
                }
              />
              {groups.length === 0 ? (
                <NoMatch label="조건에 맞는 영수증이 없습니다." onReset={() => setQuery("")} />
              ) : (
                groups.map((group) => (
                  <section key={group.key} className="border-b border-[#f0f0ec] pb-1.5 last:border-b-0">
                    <QueueGroupHeader
                      tone={group.tone}
                      label={group.label}
                      count={group.items.length}
                      aside={`${formatMan(group.items.reduce((sum, r) => sum + r.total_amount, 0))}원`}
                    />
                    {group.items.map((r) => {
                      const needs = needsCashReceipt(r)
                      return (
                        <QueueListItem
                          key={r.id}
                          selected={r.id === current?.id}
                          onSelect={() => setSelectedId(r.id)}
                          title={partnerName(r.partner_id)}
                          subtitle={METHOD_LABEL[r.payment_method]}
                          amount={formatMan(r.total_amount)}
                          mono={r.receipt_number}
                          status={
                            needs
                              ? "번호 미입력"
                              : r.paid_at
                                ? `입금 ${formatDay(r.paid_at)}`
                                : `발행 ${formatDay(r.created_at) ?? ""}`
                          }
                          statusTone={needs ? "warn" : "neutral"}
                        />
                      )
                    })}
                  </section>
                ))
              )}
            </>
          }
          detail={
            current ? (
              renderDetail(current)
            ) : (
              <p className="px-7 py-16 text-center text-sm text-[#78736D]">왼쪽에서 영수증을 고르세요.</p>
            )
          }
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
              <h2 className="text-base font-semibold">영수증 발행</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="max-h-[calc(100dvh-5.5rem)] space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  {/* receipts.contract_id 는 NOT NULL FK — 계약 없이 보내면 DB가 거절한다. 파트너는 계약에서 따라온다. */}
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">계약 *</label>
                  <select
                    required
                    value={form.contract_id}
                    onChange={(e) => {
                      const contract = contracts.find((c) => c.id === e.target.value)
                      setForm({ ...form, contract_id: e.target.value, partner_id: contract?.partner_id ?? "" })
                    }}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734]"
                  >
                    <option value="">{contracts.length === 0 ? "계약서가 먼저 필요합니다" : "선택"}</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_number} · {partnerName(c.partner_id)} · {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1.5 block">결제수단</label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-1">
                    {(["bank_transfer", "card", "cash"] as PaymentMethod[]).map((method) => {
                      const active = form.payment_method === method
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, payment_method: method }))}
                          className={`rounded-md py-1.5 text-xs font-medium transition-all ${
                            active
                              ? "bg-white text-[#111110] shadow-xs"
                              : "text-[#615D59] hover:text-[#111110]"
                          }`}
                        >
                          {METHOD_LABEL[method]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">공급가액 (원) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={form.amount || ""}
                    onChange={(e) => handleAmountChange(+e.target.value)}
                    placeholder="0"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[#084734]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">입금일</label>
                  <input
                    type="date"
                    value={form.paid_at}
                    onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734]"
                  />
                </div>

                {/* 실시간 계산 영수증 요약 카드 */}
                <div className="sm:col-span-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3 text-xs">
                  <div className="flex justify-between text-[#1a1a1a]/60">
                    <span>공급가액</span>
                    <span className="font-mono tabular-nums">{form.amount.toLocaleString("ko-KR")}원</span>
                  </div>
                  <div className="mt-1 flex justify-between text-[#1a1a1a]/60">
                    <span>부가세 (10%)</span>
                    <span className="font-mono tabular-nums">{form.tax_amount.toLocaleString("ko-KR")}원</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-[#e8e8e4] pt-2 text-sm font-semibold text-[#111110]">
                    <span>발행 합계 (VAT 포함)</span>
                    <span className="font-mono text-[#084734] tabular-nums">{form.total_amount.toLocaleString("ko-KR")}원</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="cash_receipt"
                    checked={form.cash_receipt_requested}
                    onChange={(e) => setForm({ ...form, cash_receipt_requested: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="cash_receipt" className="text-sm text-[#1a1a1a]/70">
                    현금영수증
                  </label>
                </div>
                {form.cash_receipt_requested && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">유형</label>
                      <select
                        value={form.cash_receipt_type}
                        onChange={(e) => setForm({ ...form, cash_receipt_type: e.target.value })}
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734]"
                      >
                        <option value="personal">개인</option>
                        <option value="business">사업자</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">현금영수증 번호</label>
                      <input
                        value={form.cash_receipt_number}
                        onChange={(e) => setForm({ ...form, cash_receipt_number: e.target.value })}
                        placeholder="사업자번호 또는 휴대폰번호"
                        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734]"
                      />
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734] resize-none"
                  />
                </div>
              </div>
              {saveError && (
                <p className="rounded-lg border border-[#F2B8B8] px-3 py-2 text-xs text-[#B43E3E]">{saveError}</p>
              )}
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={saving || contracts.length === 0}>
                  {saving ? "발행 중..." : "발행"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

