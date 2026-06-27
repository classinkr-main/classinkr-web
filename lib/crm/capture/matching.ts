import { normalizeCrmName } from "@/lib/crm-source-linking"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"
import { extractEmail, extractPhone, type ParsedRow } from "./parsers"

// 캡처 행 ↔ 기존 통합 고객(leads + neo accounts) 매칭(capture-layer §11). 순수 함수.
// 보수적으로: 전화/이메일 정확 단일 매칭만 자동 확정. 그 외는 사람이 확인.

export type CaptureMatchStatus =
  | "confirmed_customer"
  | "confirmed_lead"
  | "multiple_candidates"
  | "new_lead_candidate"
  | "needs_review"
  | "duplicate_in_batch"

export type CaptureTargetType = "lead" | "neo_account" | "customer" | "deal"

export interface CaptureMatchCandidate {
  targetType: CaptureTargetType
  targetId: string
  label: string
  contact: string | null
  strategy: "phone" | "email" | "org" | "org_region"
}

export interface MatchedRow extends ParsedRow {
  matchStatus: CaptureMatchStatus
  matchedTargetType: CaptureTargetType | null
  matchedTargetId: string | null
  matchedTargetLabel: string | null
  matchCandidates: CaptureMatchCandidate[]
}

export function normalizePhoneKey(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, "")
  return digits.length >= 9 ? digits : null
}

function entityIdFromKey(key: string): string {
  const idx = key.indexOf(":")
  return idx >= 0 ? key.slice(idx + 1) : key
}

function targetTypeForSource(source: CrmUnifiedCustomerRow["source"]): CaptureTargetType {
  return source === "neo_account" ? "neo_account" : "lead"
}

interface CustomerIndex {
  byPhone: Map<string, CrmUnifiedCustomerRow[]>
  byEmail: Map<string, CrmUnifiedCustomerRow[]>
  byOrg: Map<string, CrmUnifiedCustomerRow[]>
}

function pushInto(map: Map<string, CrmUnifiedCustomerRow[]>, key: string, row: CrmUnifiedCustomerRow) {
  const list = map.get(key)
  if (list) list.push(row)
  else map.set(key, [row])
}

export function buildCustomerIndex(customers: CrmUnifiedCustomerRow[]): CustomerIndex {
  const byPhone = new Map<string, CrmUnifiedCustomerRow[]>()
  const byEmail = new Map<string, CrmUnifiedCustomerRow[]>()
  const byOrg = new Map<string, CrmUnifiedCustomerRow[]>()
  for (const customer of customers) {
    const contact = customer.contact ?? ""
    const phone = normalizePhoneKey(extractPhone(contact))
    if (phone) pushInto(byPhone, phone, customer)
    const email = extractEmail(contact)
    if (email) pushInto(byEmail, email.toLowerCase(), customer)
    const orgKey = normalizeCrmName(customer.name)
    if (orgKey) pushInto(byOrg, orgKey, customer)
  }
  return { byPhone, byEmail, byOrg }
}

function toCandidate(row: CrmUnifiedCustomerRow, strategy: CaptureMatchCandidate["strategy"]): CaptureMatchCandidate {
  return {
    targetType: targetTypeForSource(row.source),
    targetId: entityIdFromKey(row.key),
    label: row.name,
    contact: row.contact,
    strategy,
  }
}

function confirmedStatus(row: CrmUnifiedCustomerRow): CaptureMatchStatus {
  return row.source === "lead" ? "confirmed_lead" : "confirmed_customer"
}

export function matchCaptureRows(rows: ParsedRow[], customers: CrmUnifiedCustomerRow[]): MatchedRow[] {
  const index = buildCustomerIndex(customers)
  const seenPhone = new Set<string>()
  const seenEmail = new Set<string>()
  const seenOrg = new Set<string>()

  return rows.map((row) => {
    const phoneKey = normalizePhoneKey(row.phone)
    const emailKey = row.email ? row.email.toLowerCase() : null
    const orgKey = normalizeCrmName(row.organizationName)

    // 배치 내 중복: 같은 연락처/기관이 앞선 행에 이미 있으면 중복으로 표시
    const isDuplicate =
      (phoneKey != null && seenPhone.has(phoneKey)) ||
      (emailKey != null && seenEmail.has(emailKey)) ||
      (orgKey !== "" && seenOrg.has(orgKey) && phoneKey == null && emailKey == null)
    if (phoneKey) seenPhone.add(phoneKey)
    if (emailKey) seenEmail.add(emailKey)
    if (orgKey) seenOrg.add(orgKey)

    if (isDuplicate) {
      return { ...row, matchStatus: "duplicate_in_batch", matchedTargetType: null, matchedTargetId: null, matchedTargetLabel: null, matchCandidates: [] }
    }

    // 1) 전화 정확 일치
    const phoneHits = phoneKey ? index.byPhone.get(phoneKey) ?? [] : []
    if (phoneHits.length === 1) {
      const hit = phoneHits[0]
      return { ...row, matchStatus: confirmedStatus(hit), matchedTargetType: targetTypeForSource(hit.source), matchedTargetId: entityIdFromKey(hit.key), matchedTargetLabel: hit.name, matchCandidates: [toCandidate(hit, "phone")] }
    }
    if (phoneHits.length > 1) {
      return { ...row, matchStatus: "multiple_candidates", matchedTargetType: null, matchedTargetId: null, matchedTargetLabel: null, matchCandidates: phoneHits.map((c) => toCandidate(c, "phone")) }
    }

    // 2) 이메일 정확 일치
    const emailHits = emailKey ? index.byEmail.get(emailKey) ?? [] : []
    if (emailHits.length === 1) {
      const hit = emailHits[0]
      return { ...row, matchStatus: confirmedStatus(hit), matchedTargetType: targetTypeForSource(hit.source), matchedTargetId: entityIdFromKey(hit.key), matchedTargetLabel: hit.name, matchCandidates: [toCandidate(hit, "email")] }
    }
    if (emailHits.length > 1) {
      return { ...row, matchStatus: "multiple_candidates", matchedTargetType: null, matchedTargetId: null, matchedTargetLabel: null, matchCandidates: emailHits.map((c) => toCandidate(c, "email")) }
    }

    // 3) 기관명 정규화 일치(자동 확정하지 않음 — 후보로 검토)
    const orgHits = orgKey ? index.byOrg.get(orgKey) ?? [] : []
    if (orgHits.length >= 1) {
      const regionNarrowed = row.regionLabel
        ? orgHits.filter((c) => c.name && row.regionLabel && c.name.includes(row.regionLabel))
        : []
      const strategy = regionNarrowed.length ? "org_region" : "org"
      const candidates = (regionNarrowed.length ? regionNarrowed : orgHits).map((c) => toCandidate(c, strategy))
      return { ...row, matchStatus: candidates.length > 1 ? "multiple_candidates" : "needs_review", matchedTargetType: null, matchedTargetId: null, matchedTargetLabel: null, matchCandidates: candidates }
    }

    // 4) 매칭 없음: 기관/연락처가 있으면 신규 리드 후보, 없으면 확인 필요
    const hasIdentity = Boolean(row.organizationName || row.phone || row.email || row.contactName)
    return { ...row, matchStatus: hasIdentity ? "new_lead_candidate" : "needs_review", matchedTargetType: null, matchedTargetId: null, matchedTargetLabel: null, matchCandidates: [] }
  })
}
