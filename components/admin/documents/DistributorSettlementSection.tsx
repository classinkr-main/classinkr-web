"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Eye, EyeOff, ExternalLink, Link2, Loader2, Mail, Trash2 } from "lucide-react"

import QuoteDocumentPreview from "@/components/portal/quotes/QuoteDocumentPreview"
import { adminFetchJson } from "@/lib/admin-client"
import {
  DISTRIBUTOR_FULFILLMENT_MODES,
  DISTRIBUTOR_ISSUE_REASON_LABELS,
  DISTRIBUTOR_MODE_LABELS,
  DISTRIBUTOR_STATUS_LABELS,
  DISTRIBUTOR_TRIGGER_LABELS,
  applyPriceTemplate,
  buildDistributorQuoteDetails,
  computeDistributorTotals,
  getDistributorIssueBlocker,
  getOutstandingAmount,
  type DistributorFulfillmentMode,
  type DistributorSettlementLine,
  type DistributorSettlementRecord,
  type DistributorSettlementTrigger,
} from "@/lib/distributor-settlements"
import type { DistributorSettlementPayload } from "@/lib/server/distributor-settlement-api"

import {
  DISTRIBUTOR_SETTLEMENT_API,
  GHOST_BUTTON,
  INPUT,
  LABEL,
  SOLID_BUTTON,
  formatDateLabel,
  formatWon,
  parseWonInput,
  todayValue,
} from "./distributor-ui"

// 견적 상세 · 총판 정산(2026-10-23). 방식은 견적마다 C/H 중 하나다(docs/hardware-ops/distributor-settlement.md).
//  - C방식: 회사가 하드웨어를 원가로 미리 사 두고, 고객은 총액을 총판에게 내고, 총판이 원가를 회사로 입금한다.
//    원가(하드웨어 + AI Suite)를 미리 정해 두고, 고객 동의 또는 설치 완료(직원이 누름) 때 총판용 견적서를 발행한 뒤
//    총판 입금을 기록한다. 입금이 확인되면 그 입금분을 매출 원장 입력 큐에 초안으로 올린다.
//  - H방식: 총판이 먼저 사 둔 물량. 총판 견적서·원가 미수 없이, 직원이 설치 완료를 누르면 매출 초안을 올린다.

type Draft = {
  fulfillmentMode: DistributorFulfillmentMode
  distributorName: string
  distributorContactName: string
  distributorEmail: string
  distributorPhone: string
  issueTrigger: DistributorSettlementTrigger
  autoEmail: boolean
  priceTemplateId: string
  vatIncluded: boolean
  dueDate: string
  notes: string
  lines: DistributorSettlementLine[]
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: DistributorSettlementPayload }

const TRIGGER_OPTIONS: DistributorSettlementTrigger[] = ["on_accept", "on_install", "manual"]

// 입금별 매출 원장 초안 상태(C1 매출 = 총판 입금 확인 시점). none = 초안 없음(원장 미적용·실패 등).
const LEDGER_STATUS_LABELS: Record<string, string> = {
  draft: "초안(검수 대기)",
  checked: "체크됨",
  applied: "반영됨",
  cancelled: "취소됨",
  none: "초안 없음",
}

function draftFromPayload(payload: DistributorSettlementPayload): Draft {
  const settlement = payload.settlement
  return {
    fulfillmentMode: settlement?.fulfillmentMode ?? "C",
    distributorName: payload.defaults.distributorName ?? "",
    distributorContactName: payload.defaults.distributorContactName ?? "",
    distributorEmail: payload.defaults.distributorEmail ?? "",
    distributorPhone: payload.defaults.distributorPhone ?? "",
    issueTrigger: settlement?.issueTrigger ?? "on_accept",
    autoEmail: settlement?.autoEmail ?? true,
    priceTemplateId: settlement?.priceTemplateId ?? "",
    vatIncluded: settlement?.vatIncluded ?? payload.quote.vatIncluded,
    dueDate: settlement?.dueDate ?? "",
    notes: settlement?.notes ?? "",
    lines: payload.draftLines,
  }
}

function statusTone(settlement: DistributorSettlementRecord) {
  if (settlement.status === "paid") return "text-[#084734]"
  if (settlement.status === "cancelled") return "text-[#78736D]"
  if (settlement.status === "draft") return "text-[#31302E]"
  if (settlement.dueDate && settlement.dueDate < todayValue()) return "text-[#B43E3E]"
  return "text-[#7A520F]"
}

export default function DistributorSettlementSection({ quoteId }: { quoteId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentDate, setPaymentDate] = useState(todayValue())
  const [paymentMemo, setPaymentMemo] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<DistributorSettlementPayload>(DISTRIBUTOR_SETTLEMENT_API(quoteId), {
        cache: "no-store",
      })
      setState({ status: "ready", payload })
      return payload
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "총판 정산을 불러오지 못했습니다." })
      return null
    }
  }, [quoteId])

  useEffect(() => {
    setState({ status: "loading" })
    setEditing(false)
    setDraft(null)
    setMessage(null)
    setPreviewOpen(false)
    void load()
  }, [load])

  const payload = state.status === "ready" ? state.payload : null
  const settlement = payload?.settlement ?? null
  const draftTotals = useMemo(
    () => (draft ? computeDistributorTotals(draft.lines, draft.vatIncluded) : null),
    [draft]
  )
  // 총판 견적서 미리보기 — 고객 견적서와 같은 승인 양식(QuoteDocumentPreview)으로, 편집 중인 원가를 바로 그린다.
  const previewDetails = useMemo(() => {
    if (!previewOpen || !payload?.customerQuoteDetails) return null
    const source = draft
      ? {
          ...draft,
          distributorContactName: draft.distributorContactName || null,
          distributorPhone: draft.distributorPhone || null,
          distributorEmail: draft.distributorEmail || null,
          notes: draft.notes || null,
        }
      : settlement
    if (!source) return null
    return buildDistributorQuoteDetails(payload.customerQuoteDetails, source, {
      issuedAt: settlement?.issuedAt ?? todayValue(),
      customerName: payload.quote.customerName,
    })
  }, [draft, payload, previewOpen, settlement])

  function startEditing() {
    if (!payload) return
    setDraft(draftFromPayload(payload))
    setEditing(true)
    setMessage(null)
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  function patchLine(index: number, patch: Partial<DistributorSettlementLine>) {
    setDraft((current) =>
      current
        ? { ...current, lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }
        : current
    )
  }

  function applyTemplate(templateId: string) {
    // 템플릿을 고르면 포함된 품목의 원가를 템플릿 값으로 채운다(이후 줄별로 덮어쓸 수 있다).
    const template = payload?.templates.find((item) => item.id === templateId)
    setDraft((current) =>
      current
        ? { ...current, priceTemplateId: templateId, lines: template ? applyPriceTemplate(current.lines, template.rules) : current.lines }
        : current
    )
  }

  async function run<T>(key: string, action: () => Promise<T>, success?: string) {
    setBusy(key)
    setMessage(null)
    try {
      const result = await action()
      if (success) setMessage({ tone: "success", text: success })
      return result
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "요청에 실패했습니다." })
      return null
    } finally {
      setBusy(null)
    }
  }

  async function handleSave() {
    if (!draft) return
    const saved = await run(
      "save",
      () =>
        adminFetchJson<{ settlement: DistributorSettlementRecord }>(DISTRIBUTOR_SETTLEMENT_API(quoteId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, priceTemplateId: draft.priceTemplateId || null, dueDate: draft.dueDate || null }),
        }),
      "원가를 저장했습니다."
    )
    if (saved) {
      setEditing(false)
      setDraft(null)
      await load()
    }
  }

  async function handleIssue(reason: "installation_completed" | "manual") {
    const isHMode = settlement?.fulfillmentMode === "H"
    const confirmText = isHMode
      ? "설치 완료로 처리할까요? H방식이라 총판 견적서 없이 이 시점으로 매출 원장 초안을 올립니다."
      : reason === "installation_completed"
        ? "설치 완료로 처리하고 총판 견적서를 발행할까요? 총판 이메일이 있으면 바로 발송됩니다."
        : "지금 총판 견적서를 발행할까요? 총판 이메일이 있으면 바로 발송됩니다."
    if (!window.confirm(confirmText)) return
    const result = await run(
      "issue",
      () =>
        adminFetchJson<{ settlement: DistributorSettlementRecord; shareUrl?: string; ledger?: { status: string } }>(
          `${DISTRIBUTOR_SETTLEMENT_API(quoteId)}/issue`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }
        )
    )
    if (result && result.settlement.fulfillmentMode === "H") {
      setMessage(
        result.ledger?.status === "created"
          ? { tone: "success", text: "설치 완료로 처리하고 매출 원장 입력 큐에 초안을 올렸습니다. CNY 금액은 원장에서 입력해 주세요." }
          : { tone: "error", text: "설치 완료는 기록했지만 매출 원장 초안을 올리지 못했습니다. 매출 원장에 직접 입력해 주세요." }
      )
      await load()
      return
    }
    if (result) {
      const emailNote =
        result.settlement.emailStatus === "sent"
          ? "총판 이메일로 발송했습니다."
          : result.settlement.emailStatus === "failed"
            ? `이메일 발송 실패(${result.settlement.emailError ?? "원인 미상"}) — 링크를 직접 전달해 주세요.`
            : "총판 이메일이 없어 링크만 만들었습니다 — 링크를 전달해 주세요."
      setMessage({ tone: result.settlement.emailStatus === "failed" ? "error" : "success", text: `총판 견적서를 발행했습니다. ${emailNote}` })
      await load()
    }
  }

  async function handleResendEmail() {
    const result = await run("email", () =>
      adminFetchJson<{ settlement: DistributorSettlementRecord }>(`${DISTRIBUTOR_SETTLEMENT_API(quoteId)}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_email" }),
      })
    )
    if (result) {
      setMessage(
        result.settlement.emailStatus === "sent"
          ? { tone: "success", text: "총판 이메일을 다시 보냈습니다." }
          : { tone: "error", text: `이메일 발송 실패: ${result.settlement.emailError ?? "원인 미상"}` }
      )
      await load()
    }
  }

  async function handleCancel() {
    if (!window.confirm("총판 정산을 취소할까요? 발행된 총판 링크는 더 이상 열리지 않습니다.")) return
    const result = await run(
      "cancel",
      () => adminFetchJson(DISTRIBUTOR_SETTLEMENT_API(quoteId), { method: "DELETE" }),
      "총판 정산을 취소했습니다."
    )
    if (result) await load()
  }

  async function handleAddPayment() {
    const amount = parseWonInput(paymentAmount)
    if (!amount) {
      setMessage({ tone: "error", text: "입금액을 입력해 주세요." })
      return
    }
    const result = await run("payment", () =>
      adminFetchJson<{ ledger?: { status: string } }>(`${DISTRIBUTOR_SETTLEMENT_API(quoteId)}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paidOn: paymentDate, memo: paymentMemo }),
      })
    )
    if (result) {
      setMessage(
        result.ledger?.status === "created"
          ? { tone: "success", text: "총판 입금을 기록하고 매출 원장 입력 큐에 초안을 올렸습니다. CNY 금액은 원장에서 입력해 주세요." }
          : { tone: "error", text: "총판 입금은 기록했지만 매출 원장 초안을 올리지 못했습니다. 매출 원장에 직접 입력해 주세요." }
      )
      setPaymentAmount("")
      setPaymentMemo("")
      await load()
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm("이 입금 기록을 지울까요?")) return
    const result = await run("payment", () =>
      adminFetchJson<{ ledger?: { status: string } }>(
        `${DISTRIBUTOR_SETTLEMENT_API(quoteId)}/payments?paymentId=${encodeURIComponent(paymentId)}`,
        { method: "DELETE" }
      )
    )
    if (result) {
      setMessage(
        result.ledger?.status === "kept"
          ? { tone: "error", text: "입금 기록을 지웠습니다. 매출 원장 초안은 이미 체크·적용돼 남아 있으니 원장에서 직접 정정해 주세요." }
          : { tone: "success", text: "입금 기록을 지웠습니다(아직 검수 전인 매출 초안도 함께 지웠습니다)." }
      )
      await load()
    }
  }

  async function handleCopyLink() {
    if (!payload?.shareUrl) return
    try {
      await navigator.clipboard.writeText(payload.shareUrl)
      setMessage({ tone: "success", text: "총판 견적서 링크를 복사했습니다." })
    } catch {
      setMessage({ tone: "error", text: `복사하지 못했습니다. 링크: ${payload.shareUrl}` })
    }
  }

  /* ─── 렌더 ─────────────────────────────────────────────── */

  const header = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11.5px] font-semibold text-[#78736D]">총판 정산 · 원가 입금(C1)</h3>
      {settlement && settlement.status !== "draft" && (
        <span className={`text-[11.5px] font-semibold ${statusTone(settlement)}`}>
          {DISTRIBUTOR_STATUS_LABELS[settlement.status]}
        </span>
      )}
    </div>
  )

  const notice = message && (
    <p
      role="status"
      className={`mt-2 flex items-start gap-1.5 text-[12px] ${message.tone === "success" ? "text-[#084734]" : "text-[#B43E3E]"}`}
    >
      {message.tone === "error" && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {message.text}
    </p>
  )

  // 고객 견적서와 같은 승인 양식(웹·PDF 공용)으로 총판용 견적서를 미리 본다.
  const previewPanel =
    previewOpen &&
    (previewDetails ? (
      <div className="mt-3 overflow-x-auto rounded-lg border border-[#e8e8e4] bg-[#F6F5F4] p-3">
        <QuoteDocumentPreview
          quote={previewDetails}
          documentNumber={`${payload?.quote.quoteNumber ?? ""}-D`}
          title="총판 견적서"
        />
      </div>
    ) : (
      <p className="mt-3 text-xs text-[#78736D]">고객 견적 본문이 없어 미리보기를 그릴 수 없습니다.</p>
    ))

  if (state.status === "loading") {
    return (
      <section className="rounded-lg border border-[#e8e8e4] px-4 py-3.5">
        {header}
        <p className="flex items-center gap-2 text-xs text-[#78736D]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          총판 정산을 불러오는 중
        </p>
      </section>
    )
  }

  if (state.status === "error" || !payload) {
    return (
      <section className="rounded-lg border border-[#e8e8e4] px-4 py-3.5">
        {header}
        <p className="text-xs text-[#B43E3E]">{state.status === "error" ? state.message : "총판 정산을 불러오지 못했습니다."}</p>
        <button type="button" onClick={() => void load()} className={`${GHOST_BUTTON} mt-2`}>
          다시 시도
        </button>
      </section>
    )
  }

  if (!payload.available) {
    return (
      <section className="rounded-lg border border-[#e8e8e4] px-4 py-3.5">
        {header}
        <p className="text-xs text-[#7A520F]">{payload.warning}</p>
      </section>
    )
  }

  if (editing && draft && draftTotals) {
    const blocker = getDistributorIssueBlocker(draft)
    return (
      <section className="rounded-lg border border-[#31302E] px-4 py-4">
        {header}
        <fieldset className="mb-4">
          <legend className={LABEL}>방식</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DISTRIBUTOR_FULFILLMENT_MODES.map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2.5 text-[12.5px] ${
                  draft.fulfillmentMode === mode ? "border-[#084734] bg-[#ECFDF5]" : "border-[#e8e8e4] bg-white"
                }`}
              >
                <input
                  type="radio"
                  name={`distributor-mode-${quoteId}`}
                  checked={draft.fulfillmentMode === mode}
                  onChange={() => patchDraft({ fulfillmentMode: mode })}
                  className="mt-0.5 accent-[#084734]"
                />
                <span>
                  <span className="block font-semibold text-[#111110]">{DISTRIBUTOR_MODE_LABELS[mode].title}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[#615D59]">{DISTRIBUTOR_MODE_LABELS[mode].summary}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>총판 이름 *</span>
            <input className={INPUT} value={draft.distributorName} onChange={(e) => patchDraft({ distributorName: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>총판 담당자</span>
            <input className={INPUT} value={draft.distributorContactName} onChange={(e) => patchDraft({ distributorContactName: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>총판 이메일(발행 시 발송)</span>
            <input type="email" className={INPUT} value={draft.distributorEmail} onChange={(e) => patchDraft({ distributorEmail: e.target.value })} />
          </label>
          <label className="block">
            <span className={LABEL}>총판 연락처</span>
            <input className={INPUT} value={draft.distributorPhone} onChange={(e) => patchDraft({ distributorPhone: e.target.value })} />
          </label>
        </div>

        {draft.fulfillmentMode === "H" ? (
          <p className="mt-4 rounded-md bg-[#F6F5F4] px-3 py-2.5 text-[12px] leading-relaxed text-[#615D59]">
            H방식은 총판이 먼저 사 둔 물량이라 총판 견적서와 원가 미수가 없습니다. 저장한 뒤 설치가 끝나면
            &ldquo;설치 완료&rdquo;를 눌러 주세요 — 그 시점으로 매출 원장 입력 큐에 초안이 올라갑니다.
          </p>
        ) : (
        <>
        <fieldset className="mt-4">
          <legend className={LABEL}>발행 시점</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {TRIGGER_OPTIONS.map((trigger) => (
              <label key={trigger} className="flex items-center gap-1.5 text-[12.5px] text-[#31302E]">
                <input
                  type="radio"
                  name={`distributor-trigger-${quoteId}`}
                  checked={draft.issueTrigger === trigger}
                  onChange={() => patchDraft({ issueTrigger: trigger })}
                  className="accent-[#084734]"
                />
                {DISTRIBUTOR_TRIGGER_LABELS[trigger]}
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#31302E]">
            <input type="checkbox" checked={draft.autoEmail} onChange={(e) => patchDraft({ autoEmail: e.target.checked })} className="accent-[#084734]" />
            발행할 때 총판 이메일로 바로 보내기
          </label>
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className={LABEL}>원가 템플릿</span>
            <select className={INPUT} value={draft.priceTemplateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">직접 입력</option>
              {payload.templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>입금 기한</span>
            <input type="date" className={INPUT} value={draft.dueDate} onChange={(e) => patchDraft({ dueDate: e.target.value })} />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e8e8e4] text-left text-[11px] text-[#78736D]">
                <th className="w-8 py-1.5 font-semibold">포함</th>
                <th className="py-1.5 font-semibold">품목</th>
                <th className="w-12 py-1.5 text-right font-semibold">수량</th>
                <th className="w-24 py-1.5 text-right font-semibold">고객 단가</th>
                <th className="w-32 py-1.5 text-right font-semibold">원가(입금가)</th>
                <th className="w-28 py-1.5 text-right font-semibold">원가 합계</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((line, index) => (
                <tr key={`${line.sourceLineNumber}-${line.itemCode ?? index}`} className="border-b border-[#f0f0ec]">
                  <td className="py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`${line.itemName} 총판 청구에 포함`}
                      checked={line.included}
                      onChange={(e) => patchLine(index, { included: e.target.checked })}
                      className="accent-[#084734]"
                    />
                  </td>
                  <td className={`py-1.5 ${line.included ? "text-[#111110]" : "text-[#A39E98]"}`}>{line.itemName}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#78736D]">{line.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#78736D]">{formatWon(line.customerUnitPrice)}</td>
                  <td className="py-1.5 text-right">
                    <input
                      inputMode="numeric"
                      aria-label={`${line.itemName} 원가`}
                      disabled={!line.included}
                      value={line.unitPrice == null ? "" : line.unitPrice.toLocaleString("ko-KR")}
                      onChange={(e) => patchLine(index, { unitPrice: parseWonInput(e.target.value) })}
                      placeholder="금액 입력"
                      className={`${INPUT} h-8 text-right tabular-nums disabled:bg-[#F6F5F4]`}
                    />
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">
                    {line.included && line.unitPrice != null ? formatWon(line.quantity * line.unitPrice) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {draft.lines.length === 0 && <p className="py-3 text-xs text-[#78736D]">고객 견적에 품목이 없습니다.</p>}
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <label className="flex items-center gap-1.5 text-[12.5px] text-[#31302E]">
            <input type="checkbox" checked={!draft.vatIncluded} onChange={(e) => patchDraft({ vatIncluded: !e.target.checked })} className="accent-[#084734]" />
            원가는 VAT 별도(10% 가산)
          </label>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right text-[12.5px]">
            <dt className="text-[#78736D]">고객 견적 합계</dt>
            <dd className="tabular-nums">{formatWon(payload.quote.customerTotalAmount)}</dd>
            <dt className="font-bold text-[#111110]">총판에게 받을 원가</dt>
            <dd className="font-bold tabular-nums text-[#084734]">{formatWon(draftTotals.totalAmount)}</dd>
          </dl>
        </div>

        <label className="mt-3 block">
          <span className={LABEL}>총판 견적서 특약사항(선택)</span>
          <textarea
            rows={2}
            className={`${INPUT} h-auto py-2`}
            value={draft.notes}
            onChange={(e) => patchDraft({ notes: e.target.value })}
            placeholder="비우면 고객 견적서의 특약사항을 그대로 씁니다."
          />
        </label>

        {blocker && <p className="mt-2 text-[12px] text-[#7A520F]">발행 전 확인: {blocker}</p>}

        <button type="button" onClick={() => setPreviewOpen((open) => !open)} className={`${GHOST_BUTTON} mt-3`}>
          {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {previewOpen ? "총판 견적서 미리보기 닫기" : "총판 견적서 미리보기"}
        </button>
        {previewPanel}
        </>
        )}
        {notice}

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => { setEditing(false); setDraft(null) }} className={GHOST_BUTTON} disabled={busy !== null}>
            닫기
          </button>
          <button type="button" onClick={() => void handleSave()} className={SOLID_BUTTON} disabled={busy !== null || !draft.distributorName.trim()}>
            {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            저장
          </button>
        </div>
      </section>
    )
  }

  if (!settlement || settlement.status === "cancelled") {
    return (
      <section className="rounded-lg border border-[#e8e8e4] px-4 py-3.5">
        {header}
        <p className="text-xs text-[#615D59]">
          {settlement?.status === "cancelled"
            ? "취소된 총판 정산입니다. 다시 설정하면 발행 전 상태로 돌아갑니다."
            : "하드웨어 물량의 방식을 정합니다. C방식(회사 선매입)은 원가를 정해 두면 고객 동의 또는 설치 완료 때 같은 양식의 총판 견적서를 발행하고 총판 입금 확인 시 매출을 잡습니다. H방식(총판 선매입)은 설치 완료 시 매출을 잡습니다."}
        </p>
        {notice}
        <button type="button" onClick={startEditing} className={`${GHOST_BUTTON} mt-2.5`}>
          방식·원가 설정
        </button>
      </section>
    )
  }

  if (settlement.fulfillmentMode === "H") {
    const installed = settlement.status === "completed"
    return (
      <section className="rounded-lg border border-[#e8e8e4] px-4 py-3.5">
        {header}
        <dl className="grid grid-cols-[96px_1fr] gap-x-2.5 gap-y-1.5 text-xs">
          <dt className="text-[#78736D]">방식</dt>
          <dd className="text-[#31302E]">{DISTRIBUTOR_MODE_LABELS.H.title}</dd>
          <dt className="text-[#78736D]">총판</dt>
          <dd className="text-[#31302E]">{settlement.distributorName}</dd>
          <dt className="text-[#78736D]">고객 견적 합계</dt>
          <dd className="tabular-nums text-[#31302E]">{formatWon(settlement.customerTotalAmount || payload.quote.customerTotalAmount)}</dd>
          <dt className="text-[#78736D]">설치 완료</dt>
          <dd className="text-[#31302E]">{installed ? formatDateLabel(settlement.installedAt) : "아직 — 설치가 끝나면 아래 버튼을 눌러 주세요"}</dd>
          {installed && (
            <>
              <dt className="text-[#78736D]">매출 원장</dt>
              <dd className="text-[#31302E]">{LEDGER_STATUS_LABELS[payload.installationLedgerStatus ?? "none"]}</dd>
            </>
          )}
        </dl>
        {notice}
        {!installed && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={startEditing} disabled={busy !== null} className={GHOST_BUTTON}>
              방식 수정
            </button>
            <button type="button" onClick={() => void handleIssue("installation_completed")} disabled={busy !== null} className={SOLID_BUTTON}>
              {busy === "issue" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              설치 완료 → 매출 잡기
            </button>
            <button type="button" onClick={() => void handleCancel()} disabled={busy !== null} className={`${GHOST_BUTTON} text-[#B43E3E]`}>
              정산 취소
            </button>
          </div>
        )}
      </section>
    )
  }

  const outstanding = getOutstandingAmount(settlement)
  const isIssued = settlement.status !== "draft"

  return (
    <section className="rounded-lg border border-[#e8e8e4] px-4 py-3.5">
      {header}
      <dl className="grid grid-cols-[96px_1fr] gap-x-2.5 gap-y-1.5 text-xs">
        <dt className="text-[#78736D]">총판</dt>
        <dd className="text-[#31302E]">
          {settlement.distributorName}
          {settlement.distributorEmail ? ` · ${settlement.distributorEmail}` : " · 이메일 없음"}
        </dd>
        <dt className="text-[#78736D]">발행 시점</dt>
        <dd className="text-[#31302E]">
          {isIssued
            ? `${formatDateLabel(settlement.issuedAt)} · ${settlement.issueReason ? DISTRIBUTOR_ISSUE_REASON_LABELS[settlement.issueReason] : "발행"}`
            : DISTRIBUTOR_TRIGGER_LABELS[settlement.issueTrigger]}
        </dd>
        <dt className="text-[#78736D]">고객 견적 합계</dt>
        <dd className="tabular-nums text-[#31302E]">{formatWon(settlement.customerTotalAmount || payload.quote.customerTotalAmount)}</dd>
        <dt className="font-semibold text-[#111110]">받을 원가</dt>
        <dd className="font-semibold tabular-nums text-[#111110]">{formatWon(settlement.totalAmount)}</dd>
        {isIssued && (
          <>
            <dt className="text-[#78736D]">입금 / 남은 금액</dt>
            <dd className="tabular-nums text-[#31302E]">
              {formatWon(settlement.paidAmount)} / <span className={outstanding > 0 ? "font-semibold text-[#7A520F]" : ""}>{formatWon(outstanding)}</span>
            </dd>
            <dt className="text-[#78736D]">총판 메일</dt>
            <dd className="text-[#31302E]">
              {settlement.emailStatus === "sent"
                ? `발송 ${formatDateLabel(settlement.emailedAt) ?? ""}`
                : settlement.emailStatus === "failed"
                  ? `발송 실패 — ${settlement.emailError ?? "원인 미상"}`
                  : "보내지 않음(링크 직접 전달)"}
            </dd>
          </>
        )}
        <dt className="text-[#78736D]">입금 기한</dt>
        <dd className="text-[#31302E]">{settlement.dueDate ?? "미정"}</dd>
      </dl>

      {!isIssued && payload.versionChanged && (
        <p className="mt-2 text-[12px] text-[#7A520F]">
          원가를 저장한 뒤 고객 견적이 v{payload.quote.versionNumber}로 바뀌었습니다. 원가를 확인하고 다시 저장해야 발행됩니다.
        </p>
      )}
      {!isIssued && settlement.reviewRequiredReason && (
        <p className="mt-2 text-[12px] text-[#7A520F]">자동 발행 보류: {settlement.reviewRequiredReason}</p>
      )}

      {isIssued && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold text-[#78736D]">입금 기록</p>
          {payload.payments.length === 0 ? (
            <p className="text-xs text-[#78736D]">아직 입금 기록이 없습니다.</p>
          ) : (
            <ul>
              {payload.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-2 border-b border-[#f0f0ec] py-1.5 text-[12.5px]">
                  <span className="min-w-0 truncate">
                    {payment.paidOn}
                    {payment.memo ? <span className="text-[#78736D]"> · {payment.memo}</span> : null}
                    <span className="text-[11px] text-[#78736D]"> · 매출 원장 {LEDGER_STATUS_LABELS[payload.ledgerStatuses[payment.id] ?? "none"]}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatWon(payment.amount)}</span>
                    <button
                      type="button"
                      aria-label="입금 기록 삭제"
                      onClick={() => void handleDeletePayment(payment.id)}
                      disabled={busy !== null}
                      className="text-[#A39E98] hover:text-[#B43E3E]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {outstanding > 0 && (
            <div className="mt-2 grid grid-cols-[1fr_140px] gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
              <input
                inputMode="numeric"
                aria-label="입금액"
                placeholder={`입금액 (남은 ${outstanding.toLocaleString("ko-KR")})`}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className={INPUT}
              />
              <input type="date" aria-label="입금일" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={INPUT} />
              <input aria-label="입금 메모" placeholder="메모(선택)" value={paymentMemo} onChange={(e) => setPaymentMemo(e.target.value)} className={INPUT} />
              <button type="button" onClick={() => void handleAddPayment()} disabled={busy !== null} className={SOLID_BUTTON}>
                {busy === "payment" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                입금 기록
              </button>
            </div>
          )}
        </div>
      )}

      {notice}

      <div className="mt-3 flex flex-wrap gap-2">
        {!isIssued && (
          <>
            <button type="button" onClick={startEditing} disabled={busy !== null} className={GHOST_BUTTON}>
              원가 수정
            </button>
            <button type="button" onClick={() => setPreviewOpen((open) => !open)} className={GHOST_BUTTON}>
              {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              미리보기
            </button>
            {settlement.issueTrigger === "on_install" ? (
              <button type="button" onClick={() => void handleIssue("installation_completed")} disabled={busy !== null} className={SOLID_BUTTON}>
                {busy === "issue" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                설치 완료 → 총판 견적서 발행
              </button>
            ) : (
              <button type="button" onClick={() => void handleIssue("manual")} disabled={busy !== null} className={settlement.issueTrigger === "manual" ? SOLID_BUTTON : GHOST_BUTTON}>
                {busy === "issue" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                지금 발행
              </button>
            )}
          </>
        )}
        {isIssued && payload.shareUrl && (
          <>
            <button type="button" onClick={() => void handleCopyLink()} className={GHOST_BUTTON}>
              <Link2 className="h-3.5 w-3.5" />
              총판 링크 복사
            </button>
            <a href={payload.shareUrl} target="_blank" rel="noopener noreferrer" className={GHOST_BUTTON}>
              <ExternalLink className="h-3.5 w-3.5" />
              총판 견적서 보기
            </a>
            {settlement.distributorEmail && settlement.status !== "paid" && (
              <button type="button" onClick={() => void handleResendEmail()} disabled={busy !== null} className={GHOST_BUTTON}>
                {busy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                메일 다시 보내기
              </button>
            )}
          </>
        )}
        {(settlement.status === "draft" || (settlement.status === "issued" && settlement.paidAmount === 0)) && (
          <button type="button" onClick={() => void handleCancel()} disabled={busy !== null} className={`${GHOST_BUTTON} text-[#B43E3E]`}>
            정산 취소
          </button>
        )}
      </div>
      {!isIssued && previewPanel}
    </section>
  )
}
