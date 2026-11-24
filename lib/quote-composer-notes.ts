import type { PartnerQuoteDetailsInput } from "@/lib/partners-types"
import {
  appendQuoteNoteLine,
  isPendingQuoteLine,
  quoteNoteHasLine,
  type StandardQuoteOptionSelections,
} from "@/lib/standard-quote-template"

export const AUTOMATIC_QUOTE_NOTE_IDS = ["general_validity", "general_vat", "general_delivery_cost"] as const
export type AutomaticQuoteNoteId = (typeof AUTOMATIC_QUOTE_NOTE_IDS)[number]

export const QUOTE_PAYMENT_NOTE_DAYS = [7, 15, 30] as const
export type QuotePaymentNoteDays = (typeof QUOTE_PAYMENT_NOTE_DAYS)[number]

function paymentNote(days: QuotePaymentNoteDays) {
  return `결제 조건: 세금계산서 발행 후 ${days}일 이내 입금`
}

export function removeQuoteNoteLines(value: string, lines: string[]) {
  return value.split("\n").filter((line) => !lines.includes(line.trim())).join("\n").trim()
}

export function readQuotePaymentNote(value: string) {
  return QUOTE_PAYMENT_NOTE_DAYS.find((days) => quoteNoteHasLine(value, paymentNote(days)))
}

export function replaceQuotePaymentNote(value: string, days?: QuotePaymentNoteDays) {
  const remaining = removeQuoteNoteLines(value, QUOTE_PAYMENT_NOTE_DAYS.map(paymentNote))
  return days ? appendQuoteNoteLine(remaining, paymentNote(days)) : remaining
}

export function readAutomaticQuoteNotes(selections: StandardQuoteOptionSelections | undefined) {
  return AUTOMATIC_QUOTE_NOTE_IDS.filter((id) => selections?.[id] === true)
}

export function writeAutomaticQuoteNotes(
  selections: StandardQuoteOptionSelections,
  selected: AutomaticQuoteNoteId[]
) {
  const next = { ...selections }
  for (const id of AUTOMATIC_QUOTE_NOTE_IDS) {
    if (selected.includes(id)) next[id] = true
    else delete next[id]
  }
  return next
}

export function getAutomaticQuoteNoteLines(quote: PartnerQuoteDetailsInput, id: AutomaticQuoteNoteId): string[] {
  switch (id) {
    case "general_vat":
      return [`상기 금액은 부가세 ${quote.vatIncluded === false ? "별도" : "포함"} 금액입니다.`]
    case "general_validity":
      return [`견적 유효기간: ${quote.validUntil ? `${quote.validUntil}까지` : "기한 없음"}`]
    case "general_delivery_cost":
      return [...new Set((quote.lineItems ?? []).flatMap((line) => {
        if (
          line.lineStatus === "informational" ||
          !(line.itemType === "shipping" || line.itemType === "installation" || line.optionGroupId === "installation_mode")
        ) return []
        const name = line.itemName.replace(/[\r\n]+/g, " ").trim()
        if (!name) return []
        if (line.lineStatus === "separate_billing" || line.billingMode === "separate_invoice") {
          return [`${name}: 별도 청구 예정`]
        }
        return [`${name}: ${isPendingQuoteLine(line) ? "추후 협의" : "견적 포함"}`]
      }))]
  }
}

export function writeQuoteGeneralNotes(
  value: string,
  quote: PartnerQuoteDetailsInput,
  automatic: AutomaticQuoteNoteId[]
) {
  return automatic.flatMap((id) => getAutomaticQuoteNoteLines(quote, id))
    .reduce((notes, line) => appendQuoteNoteLine(notes, line), value)
}

export function readQuoteGeneralNotes(quote: PartnerQuoteDetailsInput, automatic: AutomaticQuoteNoteId[]) {
  return removeQuoteNoteLines(
    quote.generalNotes ?? "",
    automatic.flatMap((id) => getAutomaticQuoteNoteLines(quote, id))
  )
}
