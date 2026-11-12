import type { LeadSource } from "@/lib/lead-types"

/** 문의 폼(/contact)이 보낼 수 있는 리드 source. */
export type ContactLeadSource = Extract<LeadSource, "contact_page" | "chatbot">

/**
 * `/contact?source=...` 쿼리 → 문의 폼이 제출할 리드 source.
 *
 * 챗봇 상담 연결(ConsultationBridge)은 `?source=chatbot` 으로 보낸다. 예전에는 폼이 이 값을
 * 버리고 항상 contact_page 로 제출해 챗봇 경유 리드가 집계에서 사라졌다. 그 외 값(seminar·
 * event 같은 행사 진입 표시, 임의 문자열)은 리드 source 를 바꾸지 않는다 — 공개 쿼리라
 * 아무 값이나 source 로 실으면 집계가 오염된다.
 */
export function resolveContactLeadSource(sourceParam: string | null | undefined): ContactLeadSource {
  return sourceParam?.trim().toLowerCase() === "chatbot" ? "chatbot" : "contact_page"
}
