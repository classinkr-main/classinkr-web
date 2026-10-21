import { STANDARD_QUOTE_TEMPLATES, type StandardQuoteTemplateId } from "@/lib/standard-quote-template"

export function normalizeQuoteQuickAction(raw: string | null): "new" | StandardQuoteTemplateId | null {
  if (raw === "new" || raw === "quick" || raw === "quote") return "new"
  return STANDARD_QUOTE_TEMPLATES.find((template) => template.id === raw)?.id ?? null
}

/** 작성 의도는 한 번만 소비한다. 닫고 새로고침해도 작성기가 다시 열리지 않는다. */
export function clearQuoteComposerIntent(url: URL): URL {
  const next = new URL(url)
  for (const key of ["action", "quick", "dealId", "deal", "customerId", "customer", "customerName"]) {
    next.searchParams.delete(key)
  }
  return next
}

export type QuoteComposerMode = "software" | "hardware" | "suite"

export function quoteComposerMode(templateId: StandardQuoteTemplateId): QuoteComposerMode {
  if (templateId === "online_suite") return "suite"
  if (templateId === "business_recharge") return "software"
  return "hardware"
}
