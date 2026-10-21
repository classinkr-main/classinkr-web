import type { ReactNode } from "react"
import Image from "next/image"
import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"
import { formatStandardQuoteCurrency } from "@/lib/standard-quote-template"
import styles from "./quote-paper.module.css"

/** The approved ClassIn quote paper is shared by editing, viewing and browser PDF output. */
type QuoteDocumentPreviewProps = {
  quote: PartnerQuoteDetailsInput
  documentNumber?: string | null
  title?: string | null
  editing?: boolean
  slots?: Partial<Record<"recipient" | "supplier" | "issuedAt" | "vatPolicy" | "items" | "notes" | "addenda", ReactNode>>
}

const money = (value?: number | null) => value == null ? "–" : formatStandardQuoteCurrency(value)
function lineAmount(line: PartnerQuoteLineItemInput) {
  if (line.lineStatus === "separate_billing" || line.billingMode === "separate_invoice") return "별도"
  if (line.lineStatus === "pending_price" || line.billingMode === "tbd") return "협의"
  return money(line.lineSupplyAmount)
}
function Field({ label, value }: { label: string; value?: string | null }) {
  return value?.trim() ? <><dt>{label}</dt><dd>{value}</dd></> : null
}

export default function QuoteDocumentPreview({ quote, documentNumber, title, editing, slots = {} }: QuoteDocumentPreviewProps) {
  const category = quote.templateId === "online_suite" ? "AI Suite · 하드웨어 및 소프트웨어 공급"
    : quote.lineItems?.some((line) => line.itemType === "hardware") ? "하드웨어 공급" : "소프트웨어 공급"
  return (
    <article aria-label="견적서" data-quote-paper="true" data-editing={editing || undefined} data-multiple-items={(quote.lineItems?.length ?? 0) > 4 || undefined} className={styles.paper}>
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <Image unoptimized src="/images/quotes/classin-logo.png" width={674} height={244} alt="ClassIn" className={styles.logo} />
          <span>{category}</span>
        </div>
        <div className={styles.titleRow}>
          <h2>견적서</h2>
          <div className={styles.issued}>발행일 {slots.issuedAt ?? quote.issuedAt?.replaceAll("-", ".")}</div>
        </div>
      </header>
      <div className={styles.parties}>
        <section aria-label="수신처" className={styles.party}>
          <h3>수신처</h3>
          {slots.recipient ?? <>
            <p className={styles.recipientName}>{quote.recipientCompanyName}{quote.recipientCompanyName ? " 귀중" : ""}</p>
            <dl className={styles.fields}>
              <Field label="담당자" value={quote.recipientContactName} />
              <Field label="연락처" value={quote.recipientPhone} />
              <Field label="참조" value={quote.referenceName} />
              <Field label="유효기한" value={quote.validUntil?.replaceAll("-", ".")} />
            </dl>
          </>}
        </section>
        <section aria-label="공급자" className={styles.party}>
          <h3>공급자</h3>
          {slots.supplier ?? <>
            <p className={styles.supplierName}>{quote.supplierBusinessName}</p>
            <dl className={styles.fields}>
              <Field label="사업자등록번호" value={quote.supplierBusinessRegistrationNumber} />
              <Field label="대표이사" value={quote.supplierRepresentativeName} />
              <Field label="주소" value={quote.supplierAddress} />
              <Field label="담당자" value={quote.supplierContactName} />
              <Field label="연락처" value={quote.supplierContactPhone} />
            </dl>
          </>}
        </section>
      </div>
      <div className={styles.intro}>
        <span>{quote.subjectText || "아래와 같이 견적서를 제출합니다."}</span>
        <span>{slots.vatPolicy ?? quote.vatPolicyLabel ?? `단위: 원 / VAT ${quote.vatIncluded ? "포함" : "별도"}`}</span>
      </div>
      {slots.items ?? <table className={styles.items} aria-label="품목">
        <colgroup><col style={{ width: "6%" }} /><col style={{ width: "41%" }} /><col style={{ width: "10%" }} /><col style={{ width: "21%" }} /><col style={{ width: "22%" }} /></colgroup>
        <thead><tr><th>No.</th><th>품목 / 세부내역</th><th>수량</th><th>단가</th><th>공급가액</th></tr></thead>
        <tbody>{(quote.lineItems ?? []).map((line, index) => <tr key={`${index}-${line.itemCode}`}>
          <td>{line.lineNumber ?? index + 1}</td>
          <td><strong>{line.itemName}</strong>{line.itemDescription && <p>{line.itemDescription}</p>}</td>
          <td>{line.quantity ?? "–"}{line.quantityUnit}</td>
          <td>{money(line.unitPrice)}</td><td>{lineAmount(line)}</td>
        </tr>)}</tbody>
      </table>}
      <div className={styles.totals} aria-label="견적 합계">
        <div><span>공급가액</span><span>{money(quote.subtotalAmount)} 원</span></div>
        <div><span>부가세{quote.vatIncluded ? "" : " (10%)"}</span><span>{quote.vatIncluded ? "포함" : `${money(quote.vatAmount)} 원`}</span></div>
        {Boolean(quote.discountAmount) && <div><span>할인</span><span>{money(quote.discountAmount)} 원</span></div>}
        <div className={styles.grandTotal}><strong>총 견적금액 (VAT 포함)</strong><strong>{money(quote.grandTotalAmount)} 원</strong></div>
        {quote.pendingAmountNote && <p className={styles.pending}>{quote.pendingAmountNote}</p>}
        {slots.addenda}
      </div>
      <div className={styles.notes}>
        {slots.notes ?? <>
          {quote.generalNotes && <section><h3>기타사항</h3><p>{quote.generalNotes}</p></section>}
          {quote.specialTerms && <section><h3>특약사항</h3><p>{quote.specialTerms}</p></section>}
        </>}
      </div>
      <footer className={styles.footer}>
        <span>{quote.supplierBusinessName}</span>
        <span title={title || undefined}>{documentNumber}</span>
      </footer>
    </article>
  )
}
