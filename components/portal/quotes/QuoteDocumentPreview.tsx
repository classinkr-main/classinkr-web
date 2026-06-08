import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"
import { formatStandardQuoteCurrency } from "@/lib/standard-quote-template"

type QuoteDocumentPreviewProps = {
  quote: PartnerQuoteDetailsInput
  documentNumber?: string | null
  title?: string | null
}

function valueOrBlank(value?: string | null) {
  return value?.trim() || " "
}

function formatCurrency(value?: number | null) {
  if (value == null) return "-"
  return `${formatStandardQuoteCurrency(value)}원`
}

function formatLineAmount(line: PartnerQuoteLineItemInput) {
  if (line.lineSupplyAmount != null) return formatCurrency(line.lineSupplyAmount)
  if (line.lineStatus === "separate_billing" || line.billingMode === "separate_invoice") return "별도"
  if (line.lineStatus === "pending_price" || line.billingMode === "tbd") return "협의"
  return "-"
}

function MetaField({
  label,
  value,
  align = "left",
}: {
  label: string
  value?: string | null
  align?: "left" | "right"
}) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-black/70 pb-1 text-[12px] leading-6 text-black">
      <span className="break-keep">{label}</span>
      <span className={`break-keep whitespace-pre-wrap ${align === "right" ? "text-right" : ""}`}>
        {valueOrBlank(value)}
      </span>
    </div>
  )
}

export default function QuoteDocumentPreview({
  quote,
  documentNumber,
  title,
}: QuoteDocumentPreviewProps) {
  const lineItems = quote.lineItems ?? []
  const fillerRowCount = Math.max(0, 4 - lineItems.length)
  const supplierContact = [quote.supplierContactName, quote.supplierContactPhone]
    .filter(Boolean)
    .join("/")

  return (
    <section className="border-t border-black/8 bg-white px-6 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto max-w-[720px] text-black print:max-w-none">
        <div className="text-center">
          <p className="text-[22px] font-semibold tracking-normal">견적서</p>
          {title ? <p className="mt-2 text-sm text-black/60">{title}</p> : null}
          {documentNumber ? <p className="mt-1 text-xs text-black/45">No. {documentNumber}</p> : null}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <MetaField label="발행일" value={quote.issuedAt} />
            <MetaField label="수신" value={quote.recipientCompanyName} />
            <MetaField label="참조" value={quote.referenceName} />
            <MetaField label="유효기한" value={quote.validUntil} />
          </div>
          <div className="space-y-3">
            <MetaField label="상호명" value={quote.supplierBusinessName} align="right" />
            <MetaField label="사업자등록번호" value={quote.supplierBusinessRegistrationNumber} align="right" />
            <MetaField label="대표이사" value={quote.supplierRepresentativeName} align="right" />
            <MetaField label="주소" value={quote.supplierAddress} align="right" />
            <MetaField label="담당자/연락처" value={supplierContact} align="right" />
          </div>
        </div>

        <p className="mt-10 text-center text-[14px] text-black">{quote.subjectText}</p>
        <div className="mt-4 text-right text-[12px] text-black">{quote.vatPolicyLabel}</div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-[12px] text-black">
            <colgroup>
              <col className="w-[36px]" />
              <col className="w-[124px]" />
              <col />
              <col className="w-[94px]" />
              <col className="w-[64px]" />
              <col className="w-[106px]" />
            </colgroup>
            <thead className="bg-[#ecebea]">
              <tr className="border-y border-black">
                <th className="px-1 py-2 text-left font-normal">No</th>
                <th className="px-1 py-2 text-left font-normal">품목</th>
                <th className="px-1 py-2 text-left font-normal">세부내역</th>
                <th className="px-1 py-2 text-right font-normal">단가</th>
                <th className="px-1 py-2 text-right font-normal">수량</th>
                <th className="px-1 py-2 text-right font-normal">공급가액</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => (
                <tr key={`${line.sortOrder}-${line.itemCode ?? line.itemName}`} className="border-b border-black">
                  <td className="px-1 py-2 align-top">{line.lineNumber}</td>
                  <td className="px-1 py-2 align-top break-keep">{line.itemName}</td>
                  <td className="px-1 py-2 align-top break-keep">{line.itemDescription || "-"}</td>
                  <td className="px-1 py-2 text-right align-top whitespace-nowrap">
                    {line.unitPrice == null ? "-" : formatStandardQuoteCurrency(line.unitPrice)}
                  </td>
                  <td className="px-1 py-2 text-right align-top whitespace-nowrap">
                    {line.quantity ?? "-"}
                    {line.quantityUnit ? ` ${line.quantityUnit}` : ""}
                  </td>
                  <td className="px-1 py-2 text-right align-top whitespace-nowrap">{formatLineAmount(line)}</td>
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
                <td className="px-1 py-2" colSpan={4} />
                <td className="px-1 py-2 text-right">공급가액</td>
                <td className="px-1 py-2 text-right whitespace-nowrap">{formatCurrency(quote.subtotalAmount)}</td>
              </tr>
              {quote.vatAmount ? (
                <tr className="border-b border-black">
                  <td className="px-1 py-2" colSpan={4} />
                  <td className="px-1 py-2 text-right">VAT</td>
                  <td className="px-1 py-2 text-right whitespace-nowrap">{formatCurrency(quote.vatAmount)}</td>
                </tr>
              ) : null}
              <tr className="border-b border-black">
                <td className="px-1 py-3" colSpan={4} />
                <td className="px-1 py-3 text-right font-medium">합계</td>
                <td className="px-1 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(quote.grandTotalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {quote.pendingAmountNote ? (
          <p className="mt-3 text-right text-[12px] text-[#B85C33]">{quote.pendingAmountNote}</p>
        ) : null}

        <div className="mt-10 border-b border-black pb-2 text-[12px] font-medium text-black">&gt;기타사항</div>
        <div className="pt-2 whitespace-pre-line text-[12px] leading-6 text-black">
          {quote.generalNotes || " "}
        </div>

        {quote.specialTerms ? (
          <div className="mt-6 border-t border-black pt-3 whitespace-pre-line text-[12px] leading-6 text-black">
            {quote.specialTerms}
          </div>
        ) : null}
      </div>
    </section>
  )
}
