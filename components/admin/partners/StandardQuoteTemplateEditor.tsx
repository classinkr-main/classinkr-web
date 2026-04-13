"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"
import {
  buildStandardQuoteDetails,
  calculateStandardQuoteTotals,
  formatStandardQuoteCurrency,
  getStandardQuoteTemplate,
  getTemplateLinePreset,
  STANDARD_QUOTE_SUPPLIER,
  STANDARD_QUOTE_TEMPLATES,
  type StandardQuoteTemplateId,
} from "@/lib/standard-quote-template"

const TEXTAREA_CLASSNAME =
  "flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

type Props = {
  value?: PartnerQuoteDetailsInput
  issuedAt?: string
  validUntil?: string
  onIssuedAtChange: (value: string) => void
  onValidUntilChange: (value: string) => void
  onChange: (value: PartnerQuoteDetailsInput) => void
}

function parseNumberInput(value: string) {
  if (!value.trim()) return undefined
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function updateLineItem(
  items: PartnerQuoteLineItemInput[] | undefined,
  index: number,
  patch: Partial<PartnerQuoteLineItemInput>
) {
  const currentItems = Array.isArray(items) ? items : []
  return currentItems.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
}

function PreviewField({
  label,
  value,
  align = "left",
}: {
  label: string
  value?: string
  align?: "left" | "right"
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 border-b border-black/80 pb-1 text-[12px] text-black">
      <span>{label}</span>
      <span className={align === "right" ? "text-right" : ""}>{value || " "}</span>
    </div>
  )
}

export default function StandardQuoteTemplateEditor({
  value,
  issuedAt,
  validUntil,
  onIssuedAtChange,
  onValidUntilChange,
  onChange,
}: Props) {
  const quote = buildStandardQuoteDetails({
    ...value,
    issuedAt: issuedAt || value?.issuedAt,
    validUntil: validUntil || value?.validUntil,
  })
  const templateId = getStandardQuoteTemplate(quote.templateId).id as StandardQuoteTemplateId
  const template = getStandardQuoteTemplate(templateId)
  const lineItems = quote.lineItems ?? []
  const totals = calculateStandardQuoteTotals(lineItems, quote.vatIncluded ?? true)
  const fillerRowCount = Math.max(0, 4 - lineItems.length)

  const updateQuote = (patch: Partial<PartnerQuoteDetailsInput>) => {
    onChange(buildStandardQuoteDetails({ ...quote, ...patch }, templateId))
  }

  const handleTemplateChange = (nextTemplateId: StandardQuoteTemplateId) => {
    onChange(
      buildStandardQuoteDetails(
        {
          ...quote,
          templateId: nextTemplateId,
          lineItems: undefined,
        },
        nextTemplateId
      )
    )
  }

  const handleLineChange = (
    index: number,
    patch: Partial<PartnerQuoteLineItemInput>
  ) => {
    updateQuote({
      lineItems: updateLineItem(quote.lineItems, index, patch),
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
          <div className="flex flex-wrap gap-2">
            {STANDARD_QUOTE_TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTemplateChange(item.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  item.id === templateId
                    ? "bg-[#111110] text-white"
                    : "bg-white text-[#1a1a1a]/60 ring-1 ring-[#e8e8e4] hover:text-[#111110]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-[#1a1a1a]/55">{template.description}</p>
        </section>

        <section className="grid gap-4 rounded-2xl border border-[#e8e8e4] bg-white p-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="quote-recipient-company">고객사 *</Label>
            <Input
              id="quote-recipient-company"
              value={quote.recipientCompanyName ?? ""}
              onChange={(event) => updateQuote({ recipientCompanyName: event.target.value })}
              placeholder="예: 권경옥어학원"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-issued-at">발행일 *</Label>
            <Input
              id="quote-issued-at"
              type="date"
              value={issuedAt ?? ""}
              onChange={(event) => onIssuedAtChange(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-reference-name">참조</Label>
            <Input
              id="quote-reference-name"
              value={quote.referenceName ?? ""}
              onChange={(event) => updateQuote({ referenceName: event.target.value })}
              placeholder="비워두면 공란으로 표시됩니다."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quote-valid-until">유효기한</Label>
            <Input
              id="quote-valid-until"
              type="date"
              value={validUntil ?? ""}
              onChange={(event) => onValidUntilChange(event.target.value)}
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="quote-delivery-location">납품장소</Label>
            <Input
              id="quote-delivery-location"
              value={quote.deliveryLocationNote ?? ""}
              onChange={(event) => updateQuote({ deliveryLocationNote: event.target.value })}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">공급자 정보</p>
          <div className="mt-4 grid gap-3 text-sm text-[#1a1a1a]/70 md:grid-cols-2">
            <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
              <p className="text-[11px] text-[#1a1a1a]/40">상호명</p>
              <p className="mt-1 font-medium text-[#111110]">{STANDARD_QUOTE_SUPPLIER.businessName}</p>
            </div>
            <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
              <p className="text-[11px] text-[#1a1a1a]/40">사업자등록번호</p>
              <p className="mt-1 font-medium text-[#111110]">{STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber}</p>
            </div>
            <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
              <p className="text-[11px] text-[#1a1a1a]/40">대표이사</p>
              <p className="mt-1 font-medium text-[#111110]">{STANDARD_QUOTE_SUPPLIER.representativeName}</p>
            </div>
            <div className="rounded-xl bg-[#fafaf8] px-3 py-2">
              <p className="text-[11px] text-[#1a1a1a]/40">담당자/연락처</p>
              <p className="mt-1 font-medium text-[#111110]">
                {STANDARD_QUOTE_SUPPLIER.contactName}/{STANDARD_QUOTE_SUPPLIER.contactPhone}
              </p>
            </div>
            <div className="rounded-xl bg-[#fafaf8] px-3 py-2 md:col-span-2">
              <p className="text-[11px] text-[#1a1a1a]/40">주소</p>
              <p className="mt-1 font-medium text-[#111110]">{STANDARD_QUOTE_SUPPLIER.address}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">품목</p>
              <p className="mt-1 text-sm text-[#1a1a1a]/55">품목명과 설명은 고정하고, 수량과 단가만 빠르게 조정합니다.</p>
            </div>
            <div className="rounded-full bg-[#f6f5f2] px-3 py-1 text-xs font-medium text-[#1a1a1a]/55">
              {quote.vatPolicyLabel}
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#ecebe6]">
            <table className="w-full text-sm">
              <thead className="bg-[#f7f6f3] text-[#1a1a1a]/55">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium">No</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">품목</th>
                  <th className="px-3 py-2 text-left text-xs font-medium">세부내역</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">단가</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">수량</th>
                  <th className="px-3 py-2 text-right text-xs font-medium">공급가액</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((line, index) => {
                  const preset = getTemplateLinePreset(templateId, line.lineNumber)
                  return (
                    <tr key={`${line.itemCode ?? line.itemName}-${index}`} className="border-t border-[#f0efea] align-top">
                      <td className="px-3 py-3 text-xs text-[#1a1a1a]/45">{line.lineNumber}</td>
                      <td className="px-3 py-3 font-medium text-[#111110]">{line.itemName}</td>
                      <td className="px-3 py-3 text-xs text-[#1a1a1a]/55">{line.itemDescription || "-"}</td>
                      <td className="px-3 py-3">
                        <div className="ml-auto w-28">
                          <Input
                            type="number"
                            min={0}
                            value={line.unitPrice ?? ""}
                            disabled={preset?.priceEditable === false}
                            onChange={(event) =>
                              handleLineChange(index, { unitPrice: parseNumberInput(event.target.value) })
                            }
                            className="text-right"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="ml-auto w-20">
                          <Input
                            type="number"
                            min={0}
                            value={line.quantity ?? ""}
                            disabled={preset?.quantityEditable === false}
                            onChange={(event) =>
                              handleLineChange(index, { quantity: parseNumberInput(event.target.value) })
                            }
                            className="text-right"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-[#111110]">
                        {line.lineSupplyAmount == null ? "-" : `${formatStandardQuoteCurrency(line.lineSupplyAmount)}원`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="grid gap-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <div className="grid gap-2">
              <Label htmlFor="quote-general-notes">기타사항</Label>
              <textarea
                id="quote-general-notes"
                value={quote.generalNotes ?? ""}
                onChange={(event) => updateQuote({ generalNotes: event.target.value })}
                className={TEXTAREA_CLASSNAME}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quote-special-terms">특약사항</Label>
              <textarea
                id="quote-special-terms"
                value={quote.specialTerms ?? ""}
                onChange={(event) => updateQuote({ specialTerms: event.target.value })}
                className={TEXTAREA_CLASSNAME}
                placeholder="필요 시에만 입력합니다."
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">금액 요약</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between text-[#1a1a1a]/55">
                <span>공급가액 합계</span>
                <span className="font-medium text-[#111110]">{formatStandardQuoteCurrency(totals.subtotalAmount)}원</span>
              </div>
              <div className="flex items-center justify-between text-[#1a1a1a]/55">
                <span>VAT</span>
                <span className="font-medium text-[#111110]">{formatStandardQuoteCurrency(totals.vatAmount)}원</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#ebeae3] pt-3 text-base">
                <span className="font-semibold text-[#111110]">합계</span>
                <span className="font-bold text-[#111110]">{formatStandardQuoteCurrency(totals.grandTotalAmount)}원</span>
              </div>
              {totals.hasPendingAmounts && (
                <p className="pt-2 text-xs leading-5 text-[#B85C33]">{totals.pendingAmountNote}</p>
              )}
            </div>
          </div>
        </section>
      </div>

      <aside className="rounded-[28px] border border-[#e8e8e4] bg-[#f6f5f2] p-4">
        <div className="mx-auto w-full max-w-[360px] rounded-[24px] bg-white px-6 py-8 shadow-[0_12px_32px_rgba(17,17,16,0.08)]">
          <p className="text-center text-[18px] font-semibold tracking-tight text-black">견적서</p>

          <div className="mt-8 grid grid-cols-2 gap-10">
            <div className="space-y-3">
              <PreviewField label="발행일" value={quote.issuedAt} />
              <PreviewField label="수신" value={quote.recipientCompanyName} />
              <PreviewField label="참조" value={quote.referenceName} />
            </div>
            <div className="space-y-3">
              <PreviewField label="상호명" value={STANDARD_QUOTE_SUPPLIER.businessName} align="right" />
              <PreviewField label="사업자등록번호" value={STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber} align="right" />
              <PreviewField label="대표이사" value={STANDARD_QUOTE_SUPPLIER.representativeName} align="right" />
              <PreviewField label="주소" value={STANDARD_QUOTE_SUPPLIER.address} align="right" />
              <PreviewField
                label="담당자/연락처"
                value={`${STANDARD_QUOTE_SUPPLIER.contactName}/${STANDARD_QUOTE_SUPPLIER.contactPhone}`}
                align="right"
              />
            </div>
          </div>

          <p className="mt-10 text-center text-[13px] text-black">{quote.subjectText}</p>

          <div className="mt-4 text-right text-[12px] text-black">{quote.vatPolicyLabel}</div>

          <table className="mt-3 w-full border-collapse text-[12px] text-black">
            <thead className="bg-[#ecebea]">
              <tr className="border-y border-black">
                <th className="px-1 py-2 text-left font-normal">No</th>
                <th className="px-1 py-2 text-left font-normal">품목</th>
                <th className="px-1 py-2 text-left font-normal">세부내역</th>
                <th className="px-1 py-2 text-right font-normal">단가</th>
                <th className="px-1 py-2 text-right font-normal">수량(대)</th>
                <th className="px-1 py-2 text-right font-normal">공급가액</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => (
                <tr key={`preview-${line.lineNumber}-${line.itemName}`} className="border-b border-black">
                  <td className="px-1 py-2 align-top">{line.lineNumber}</td>
                  <td className="px-1 py-2 align-top">{line.itemName}</td>
                  <td className="px-1 py-2 align-top">{line.itemDescription || "-"}</td>
                  <td className="px-1 py-2 text-right align-top">
                    {line.unitPrice == null ? "-" : formatStandardQuoteCurrency(line.unitPrice)}
                  </td>
                  <td className="px-1 py-2 text-right align-top">{line.quantity ?? "-"}</td>
                  <td className="px-1 py-2 text-right align-top">
                    {line.lineSupplyAmount == null ? "-" : formatStandardQuoteCurrency(line.lineSupplyAmount)}
                  </td>
                </tr>
              ))}
              {Array.from({ length: fillerRowCount }).map((_, index) => (
                <tr key={`filler-${index}`} className="border-b border-black">
                  <td className="px-1 py-4">&nbsp;</td>
                  <td className="px-1 py-4" />
                  <td className="px-1 py-4" />
                  <td className="px-1 py-4" />
                  <td className="px-1 py-4" />
                  <td className="px-1 py-4" />
                </tr>
              ))}
              <tr className="border-b border-black">
                <td className="px-1 py-3" colSpan={4} />
                <td className="px-1 py-3 text-right">합계</td>
                <td className="px-1 py-3 text-right">{formatStandardQuoteCurrency(quote.grandTotalAmount)} </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-10 border-b border-black pb-2 text-[12px] font-medium text-black">&gt;기타사항</div>
          <div className="pt-2 text-[12px] leading-6 text-black whitespace-pre-line">
            {quote.generalNotes || " "}
          </div>

          {quote.specialTerms && (
            <div className="mt-6 border-t border-black pt-3 text-[12px] leading-6 text-black whitespace-pre-line">
              {quote.specialTerms}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
