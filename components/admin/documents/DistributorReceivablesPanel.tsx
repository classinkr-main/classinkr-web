"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  DISTRIBUTOR_ISSUE_REASON_LABELS,
  DISTRIBUTOR_STATUS_LABELS,
  getOutstandingAmount,
  isDistributorEligibleLine,
  isSettlementOverdue,
  type DistributorPriceRule,
  type DistributorPriceTemplate,
} from "@/lib/distributor-settlements"
import type { DistributorReceivableRow } from "@/lib/repositories/distributor-settlements"
import { STANDARD_QUOTE_TEMPLATES } from "@/lib/standard-quote-template"

import {
  DISTRIBUTOR_PRICE_TEMPLATES_API,
  DISTRIBUTOR_RECEIVABLES_API,
  GHOST_BUTTON,
  INPUT,
  LABEL,
  SOLID_BUTTON,
  formatDateLabel,
  formatWon,
  parseWonInput,
  todayValue,
} from "./distributor-ui"

// 견적·문서 › 총판 미수금(2026-10-23).
// 발행된 총판 견적서의 입금 현황(남은 금액·기한 경과)과 총판 단가 템플릿을 한 화면에서 본다.
// 입금 기록·발행은 견적 상세의 총판 정산 영역에서 한다 — 행을 누르면 그 견적으로 이동한다.

type ReceivablesPayload = { available: boolean; warning: string | null; receivables: DistributorReceivableRow[] }
type TemplatesPayload = { available: boolean; warning: string | null; templates: DistributorPriceTemplate[] }

// 템플릿 품목 후보 — 기본 견적 템플릿의 총판 대상 품목(하드웨어 + AI Suite).
const ITEM_OPTIONS: Array<{ itemCode: string; itemName: string }> = (() => {
  const seen = new Set<string>()
  const options: Array<{ itemCode: string; itemName: string }> = []
  for (const template of STANDARD_QUOTE_TEMPLATES) {
    for (const line of template.lines) {
      if (!line.itemCode || seen.has(line.itemCode) || !isDistributorEligibleLine(line)) continue
      seen.add(line.itemCode)
      options.push({ itemCode: line.itemCode, itemName: line.itemName })
    }
  }
  return options
})()

type RuleDraft = { itemCode: string; minQuantity: string; unitPrice: string }
type TemplateDraft = { id: string | null; name: string; notes: string; rules: RuleDraft[] }

function emptyRule(): RuleDraft {
  return { itemCode: ITEM_OPTIONS[0]?.itemCode ?? "", minQuantity: "1", unitPrice: "" }
}

function templateToDraft(template: DistributorPriceTemplate): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    notes: template.notes ?? "",
    rules: template.rules.map((rule) => ({
      itemCode: rule.itemCode,
      minQuantity: String(rule.minQuantity),
      unitPrice: rule.unitPrice.toLocaleString("ko-KR"),
    })),
  }
}

function itemName(itemCode: string) {
  return ITEM_OPTIONS.find((option) => option.itemCode === itemCode)?.itemName ?? itemCode
}

function openQuote(quoteId: string) {
  window.location.assign(`/admin/quotes?tab=hardware&quote=${encodeURIComponent(quoteId)}`)
}

export default function DistributorReceivablesPanel() {
  const [includePaid, setIncludePaid] = useState(false)
  const [receivables, setReceivables] = useState<ReceivablesPayload | null>(null)
  const [templates, setTemplates] = useState<TemplatesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null)
  const [templateBusy, setTemplateBusy] = useState(false)
  const [templateMessage, setTemplateMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextReceivables, nextTemplates] = await Promise.all([
        adminFetchJson<ReceivablesPayload>(`${DISTRIBUTOR_RECEIVABLES_API}${includePaid ? "?includePaid=1" : ""}`, { cache: "no-store" }),
        adminFetchJson<TemplatesPayload>(DISTRIBUTOR_PRICE_TEMPLATES_API, { cache: "no-store" }),
      ])
      setReceivables(nextReceivables)
      setTemplates(nextTemplates)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "총판 미수금을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [includePaid])

  useEffect(() => {
    void load()
  }, [load])

  const today = todayValue()
  const summary = useMemo(() => {
    const rows = receivables?.receivables ?? []
    const open = rows.filter((row) => getOutstandingAmount(row) > 0)
    const overdue = open.filter((row) => isSettlementOverdue(row, today))
    return {
      openCount: open.length,
      openAmount: open.reduce((sum, row) => sum + getOutstandingAmount(row), 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, row) => sum + getOutstandingAmount(row), 0),
      paidAmount: rows.reduce((sum, row) => sum + row.paidAmount, 0),
    }
  }, [receivables, today])

  function patchRule(index: number, patch: Partial<RuleDraft>) {
    setTemplateDraft((current) =>
      current ? { ...current, rules: current.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) } : current
    )
  }

  async function saveTemplate() {
    if (!templateDraft) return
    const rules: DistributorPriceRule[] = []
    for (const rule of templateDraft.rules) {
      const unitPrice = parseWonInput(rule.unitPrice)
      if (!rule.itemCode.trim() || unitPrice == null) continue
      rules.push({
        itemCode: rule.itemCode.trim(),
        itemName: itemName(rule.itemCode.trim()),
        minQuantity: Math.max(1, Number(rule.minQuantity) || 1),
        unitPrice,
      })
    }
    setTemplateBusy(true)
    setTemplateMessage(null)
    try {
      await adminFetchJson(
        templateDraft.id ? `${DISTRIBUTOR_PRICE_TEMPLATES_API}/${templateDraft.id}` : DISTRIBUTOR_PRICE_TEMPLATES_API,
        {
          method: templateDraft.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: templateDraft.name, notes: templateDraft.notes, rules }),
        }
      )
      setTemplateDraft(null)
      setTemplateMessage({ tone: "success", text: "총판 단가 템플릿을 저장했습니다." })
      await load()
    } catch (saveError) {
      setTemplateMessage({ tone: "error", text: saveError instanceof Error ? saveError.message : "저장하지 못했습니다." })
    } finally {
      setTemplateBusy(false)
    }
  }

  async function archiveTemplate(template: DistributorPriceTemplate) {
    if (!window.confirm(`'${template.name}' 템플릿을 보관할까요? 이미 저장된 총판 금액은 바뀌지 않습니다.`)) return
    setTemplateBusy(true)
    setTemplateMessage(null)
    try {
      await adminFetchJson(`${DISTRIBUTOR_PRICE_TEMPLATES_API}/${template.id}`, { method: "DELETE" })
      setTemplateMessage({ tone: "success", text: "템플릿을 보관했습니다." })
      await load()
    } catch (archiveError) {
      setTemplateMessage({ tone: "error", text: archiveError instanceof Error ? archiveError.message : "보관하지 못했습니다." })
    } finally {
      setTemplateBusy(false)
    }
  }

  const warning = receivables?.warning ?? templates?.warning ?? null
  const rows = receivables?.receivables ?? []

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:px-6 sm:py-5">
      <section className="rounded-lg border border-[#e8e8e4] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e4] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-[#111110]">총판 미수금</h2>
            <p className="mt-0.5 text-xs text-[#615D59]">
              고객 결제는 회사가 한 번에 받고, 하드웨어·AI Suite 물량은 총판이 회사로 입금합니다. 발행된 총판 견적서 기준입니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12.5px] text-[#31302E]">
              <input type="checkbox" checked={includePaid} onChange={(e) => setIncludePaid(e.target.checked)} className="accent-[#084734]" />
              입금 완료 포함
            </label>
            <button type="button" onClick={() => void load()} disabled={loading} className={GHOST_BUTTON}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              새로고침
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="flex items-center gap-2 px-5 py-4 text-sm text-[#B43E3E]">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        ) : warning ? (
          <p role="status" className="px-5 py-4 text-sm text-[#7A520F]">{warning}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4 border-b border-[#e8e8e4] px-5 py-4 sm:grid-cols-3">
              <div>
                <dt className="text-[11.5px] font-semibold text-[#78736D]">받을 금액</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-[#111110]">{formatWon(summary.openAmount)}</dd>
                <dd className="text-[11.5px] text-[#78736D]">{summary.openCount}건</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold text-[#78736D]">기한 경과</dt>
                <dd className={`mt-1 text-xl font-bold tabular-nums ${summary.overdueCount > 0 ? "text-[#B43E3E]" : "text-[#111110]"}`}>
                  {formatWon(summary.overdueAmount)}
                </dd>
                <dd className="text-[11.5px] text-[#78736D]">{summary.overdueCount}건</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold text-[#78736D]">입금된 금액(목록 기준)</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-[#084734]">{formatWon(summary.paidAmount)}</dd>
              </div>
            </dl>

            {loading && rows.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-6 text-xs text-[#78736D]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                불러오는 중
              </p>
            ) : rows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#615D59]">
                {includePaid ? "발행된 총판 견적서가 없습니다." : "받을 총판 입금이 없습니다."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-[#e8e8e4] text-left text-[11px] text-[#78736D]">
                      <th className="px-5 py-2 font-semibold">견적</th>
                      <th className="py-2 font-semibold">총판</th>
                      <th className="py-2 font-semibold">발행</th>
                      <th className="py-2 text-right font-semibold">청구</th>
                      <th className="py-2 text-right font-semibold">입금</th>
                      <th className="py-2 text-right font-semibold">남은 금액</th>
                      <th className="px-5 py-2 text-right font-semibold">기한 · 상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const overdue = isSettlementOverdue(row, today)
                      const outstanding = getOutstandingAmount(row)
                      return (
                        <tr
                          key={row.id}
                          onClick={() => openQuote(row.quoteDocumentId)}
                          className="cursor-pointer border-b border-[#f0f0ec] hover:bg-[#F6F5F4]"
                        >
                          <td className="px-5 py-2.5">
                            <span className="block font-semibold text-[#111110]">{row.customerName ?? "고객 미상"}</span>
                            <span className="font-mono text-[11px] text-[#78736D]">{row.quoteNumber ?? "—"}</span>
                          </td>
                          <td className="py-2.5 text-[#31302E]">{row.distributorName}</td>
                          <td className="py-2.5 text-[#31302E]">
                            {formatDateLabel(row.issuedAt) ?? "—"}
                            {row.issueReason && (
                              <span className="block text-[11px] text-[#78736D]">{DISTRIBUTOR_ISSUE_REASON_LABELS[row.issueReason]}</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{formatWon(row.totalAmount)}</td>
                          <td className="py-2.5 text-right tabular-nums text-[#615D59]">{formatWon(row.paidAmount)}</td>
                          <td className={`py-2.5 text-right font-semibold tabular-nums ${outstanding > 0 ? "text-[#111110]" : "text-[#084734]"}`}>
                            {formatWon(outstanding)}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <span className={`block ${overdue ? "font-semibold text-[#B43E3E]" : "text-[#31302E]"}`}>
                              {row.dueDate ?? "기한 없음"}
                              {overdue ? " · 경과" : ""}
                            </span>
                            <span className="text-[11px] text-[#78736D]">{DISTRIBUTOR_STATUS_LABELS[row.status]}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {!error && !warning && (
        <section className="rounded-lg border border-[#e8e8e4] bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">총판 단가 템플릿</h2>
              <p className="mt-0.5 text-xs text-[#615D59]">
                품목별·구매 대수별 총판 단가입니다. 견적의 총판 정산에서 고르면 단가가 채워지고, 고객마다 직접 고칠 수 있습니다.
              </p>
            </div>
            {!templateDraft && (
              <button
                type="button"
                onClick={() => setTemplateDraft({ id: null, name: "", notes: "", rules: [emptyRule()] })}
                className={GHOST_BUTTON}
              >
                <Plus className="h-3.5 w-3.5" />
                새 템플릿
              </button>
            )}
          </div>

          {templateMessage && (
            <p role="status" className={`mt-2 text-[12px] ${templateMessage.tone === "success" ? "text-[#084734]" : "text-[#B43E3E]"}`}>
              {templateMessage.text}
            </p>
          )}

          {templateDraft ? (
            <div className="mt-4 rounded-lg border border-[#31302E] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>템플릿 이름 *</span>
                  <input
                    className={INPUT}
                    value={templateDraft.name}
                    onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })}
                    placeholder="예: 2026 하반기 총판가"
                  />
                </label>
                <label className="block">
                  <span className={LABEL}>메모</span>
                  <input
                    className={INPUT}
                    value={templateDraft.notes}
                    onChange={(e) => setTemplateDraft({ ...templateDraft, notes: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-3 space-y-2">
                <div className="hidden grid-cols-[1fr_100px_160px_32px] gap-2 text-[11px] font-semibold text-[#78736D] sm:grid">
                  <span>품목</span>
                  <span>최소 대수</span>
                  <span>총판 단가(원)</span>
                  <span />
                </div>
                {templateDraft.rules.map((rule, index) => (
                  <div key={index} className="grid grid-cols-[1fr_100px] gap-2 sm:grid-cols-[1fr_100px_160px_32px]">
                    <select
                      aria-label="품목"
                      className={INPUT}
                      value={rule.itemCode}
                      onChange={(e) => patchRule(index, { itemCode: e.target.value })}
                    >
                      {ITEM_OPTIONS.map((option) => (
                        <option key={option.itemCode} value={option.itemCode}>{option.itemName}</option>
                      ))}
                      {!ITEM_OPTIONS.some((option) => option.itemCode === rule.itemCode) && (
                        <option value={rule.itemCode}>{rule.itemCode}</option>
                      )}
                    </select>
                    <input
                      aria-label="최소 대수"
                      inputMode="numeric"
                      className={INPUT}
                      value={rule.minQuantity}
                      onChange={(e) => patchRule(index, { minQuantity: e.target.value.replace(/[^\d]/g, "") })}
                    />
                    <input
                      aria-label="총판 단가"
                      inputMode="numeric"
                      className={`${INPUT} text-right tabular-nums`}
                      value={rule.unitPrice}
                      onChange={(e) => {
                        const parsed = parseWonInput(e.target.value)
                        patchRule(index, { unitPrice: parsed == null ? "" : parsed.toLocaleString("ko-KR") })
                      }}
                      placeholder="5,300,000"
                    />
                    <button
                      type="button"
                      aria-label="줄 삭제"
                      onClick={() =>
                        setTemplateDraft({ ...templateDraft, rules: templateDraft.rules.filter((_, i) => i !== index) })
                      }
                      className="text-[#A39E98] hover:text-[#B43E3E]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTemplateDraft({ ...templateDraft, rules: [...templateDraft.rules, emptyRule()] })}
                  className={GHOST_BUTTON}
                >
                  <Plus className="h-3.5 w-3.5" />
                  줄 추가
                </button>
                <p className="text-[11.5px] text-[#78736D]">
                  같은 품목을 여러 줄로 넣으면 구매 대수 구간이 됩니다(예: 1대 이상 5,500,000 · 5대 이상 5,300,000).
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setTemplateDraft(null)} disabled={templateBusy} className={GHOST_BUTTON}>
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => void saveTemplate()}
                  disabled={templateBusy || !templateDraft.name.trim()}
                  className={SOLID_BUTTON}
                >
                  {templateBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  템플릿 저장
                </button>
              </div>
            </div>
          ) : (templates?.templates.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-[#615D59]">아직 템플릿이 없습니다. 총판 금액은 견적마다 직접 입력할 수도 있습니다.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#f0f0ec]">
              {templates?.templates.map((template) => (
                <li key={template.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#111110]">{template.name}</p>
                    <p className="mt-0.5 text-[12px] text-[#615D59]">
                      {template.rules
                        .map((rule) => `${itemName(rule.itemCode)} ${rule.minQuantity}대↑ ${formatWon(rule.unitPrice)}`)
                        .join(" · ")}
                    </p>
                    {template.notes && <p className="mt-0.5 text-[11.5px] text-[#78736D]">{template.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTemplateDraft(templateToDraft(template))} disabled={templateBusy} className={GHOST_BUTTON}>
                      수정
                    </button>
                    <button type="button" onClick={() => void archiveTemplate(template)} disabled={templateBusy} className={GHOST_BUTTON}>
                      보관
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
