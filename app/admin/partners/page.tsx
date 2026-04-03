"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Plus, Mail, Phone, RefreshCw, Trash2, X, UserPlus,
  Building2, PenLine, Copy, Check, Send, FileSignature,
  ExternalLink, ChevronRight, Calendar, MapPin, User,
  ClipboardList, ScrollText, Receipt, StickyNote, ArrowRight,
  CheckCircle2, Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type {
  Partner, PartnerStatus, PipelineStage,
  Quote, QuoteStatus,
  Contract, ContractStatus,
  Receipt as ReceiptType, PaymentMethod,
} from "@/lib/supabase/database.types"

// ── 파이프라인 상수 ──────────────────────────────────────────

const PIPELINE_STAGES: { id: PipelineStage; label: string; color: string; dot: string }[] = [
  { id: "prospect",   label: "새 고객",   color: "bg-[#f0f0ec] text-[#1a1a1a]/50",  dot: "bg-[#ccc]" },
  { id: "quoting",    label: "견적 진행", color: "bg-blue-50 text-blue-600",         dot: "bg-blue-400" },
  { id: "contracted", label: "계약 완료", color: "bg-green-50 text-green-700",       dot: "bg-green-500" },
  { id: "installing", label: "설치 중",   color: "bg-yellow-50 text-yellow-700",     dot: "bg-yellow-400" },
  { id: "completed",  label: "완료",      color: "bg-emerald-50 text-emerald-700",   dot: "bg-emerald-500" },
  { id: "cancelled",  label: "취소",      color: "bg-red-50 text-red-400",           dot: "bg-red-300" },
]

const STAGE_MAP = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, s])) as Record<PipelineStage, typeof PIPELINE_STAGES[0]>

const STAGE_ORDER: PipelineStage[] = ["prospect", "quoting", "contracted", "installing", "completed"]

const NEXT_STAGE_CTA: Partial<Record<PipelineStage, { label: string; next: PipelineStage }>> = {
  prospect:   { label: "견적서 작성",   next: "quoting" },
  quoting:    { label: "계약 완료 처리", next: "contracted" },
  contracted: { label: "설치 일정 등록", next: "installing" },
  installing: { label: "설치 완료 처리", next: "completed" },
}

// ── 기타 상수 ────────────────────────────────────────────────

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "초안", sent: "발송됨", accepted: "수락", rejected: "거절", expired: "만료", converted: "계약전환",
}
const QUOTE_STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50", sent: "bg-blue-50 text-blue-600",
  accepted: "bg-green-50 text-green-700", rejected: "bg-red-50 text-red-500",
  expired: "bg-[#f0f0ec] text-[#1a1a1a]/40", converted: "bg-purple-50 text-purple-600",
}
const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "초안", sent: "발송됨", partner_signed: "파트너서명",
  admin_signed: "어드민서명", completed: "완료", cancelled: "취소",
}
const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50", sent: "bg-blue-50 text-blue-600",
  partner_signed: "bg-yellow-50 text-yellow-700", admin_signed: "bg-green-50 text-green-700",
  completed: "bg-green-100 text-green-800", cancelled: "bg-red-50 text-red-400",
}
const PAYMENT_LABEL: Record<PaymentMethod, string> = { bank_transfer: "계좌이체", card: "카드", cash: "현금" }

type PanelTab = "timeline" | "docs" | "install" | "info"

// ── 더미 데이터 ───────────────────────────────────────────────

const DUMMY_MODE = false

const DUMMY_PARTNERS: Partner[] = [
  { id: "p1", name: "삼성초등학교", contact_name: "김민준", email: "minjun@samsung-es.kr", phone: "010-1234-5678", address: "서울시 강남구 테헤란로 123", business_number: null, status: "active", pipeline_stage: "contracted", deal_amount: 25000000, installation_date: "2026-04-15", installation_address: "서울시 강남구 테헤란로 123 (교실 1-3층)", installer_name: "박설치", notes: "1~3층 각 교실 1대씩, 도서관 2대", created_by: null, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-12T00:00:00Z" },
  { id: "p2", name: "판교중학교", contact_name: "이서연", email: "seoyeon@pankyo-ms.kr", phone: "031-123-4567", address: "경기도 성남시 분당구 판교로 45", business_number: null, status: "active", pipeline_stage: "quoting", deal_amount: 50000000, installation_date: null, installation_address: null, installer_name: null, notes: null, created_by: null, created_at: "2026-03-18T00:00:00Z", updated_at: "2026-03-20T00:00:00Z" },
  { id: "p3", name: "해운대여자고등학교", contact_name: "박지훈", email: "jihoon@haeundae.hs.kr", phone: "051-555-1234", address: "부산시 해운대구 센텀중앙로 55", business_number: null, status: "active", pipeline_stage: "installing", deal_amount: 12000000, installation_date: "2026-04-08", installation_address: "부산시 해운대구 센텀중앙로 55 (전 교실)", installer_name: "이설치", notes: "설치 중, 2교실 남음", created_by: null, created_at: "2026-02-10T00:00:00Z", updated_at: "2026-04-01T00:00:00Z" },
  { id: "p4", name: "서초과학기술원", contact_name: "최현우", email: "hw@seochotech.kr", phone: "02-9999-1234", address: "서울시 서초구 방배로 100", business_number: null, status: "active", pipeline_stage: "completed", deal_amount: 18000000, installation_date: "2026-02-20", installation_address: "서울시 서초구 방배로 100", installer_name: "박설치", notes: null, created_by: null, created_at: "2026-01-15T00:00:00Z", updated_at: "2026-03-01T00:00:00Z" },
  { id: "p5", name: "강동초등학교", contact_name: "정수진", email: null, phone: "02-111-2222", address: "서울시 강동구 천호대로 200", business_number: null, status: "active", pipeline_stage: "prospect", deal_amount: null, installation_date: null, installation_address: null, installer_name: null, notes: "CRM 문의 전환", created_by: null, created_at: "2026-04-02T00:00:00Z", updated_at: "2026-04-02T00:00:00Z" },
]

const DUMMY_QUOTES: Record<string, Quote[]> = {
  p1: [{ id: "q1", quote_number: "Q-2026-001", partner_id: "p1", title: "ClassIn Board 86인치 5대 납품", status: "converted", valid_until: "2026-04-30", subtotal: 22727272, discount_amount: 0, tax_amount: 2272728, total_amount: 25000000, notes: "설치비 포함", created_by: null, sent_at: "2026-03-01T00:00:00Z", accepted_at: "2026-03-05T00:00:00Z", converted_to_contract_id: "c1", created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-05T00:00:00Z" }],
  p2: [{ id: "q3", quote_number: "Q-2026-002", partner_id: "p2", title: "ClassIn Board 10대 공급", status: "sent", valid_until: "2026-04-20", subtotal: 45454545, discount_amount: 0, tax_amount: 4545455, total_amount: 50000000, notes: null, created_by: null, sent_at: "2026-03-20T00:00:00Z", accepted_at: null, converted_to_contract_id: null, created_at: "2026-03-18T00:00:00Z", updated_at: "2026-03-20T00:00:00Z" }],
  p3: [{ id: "q4", quote_number: "Q-2026-003", partner_id: "p3", title: "CB-75 3대 납품", status: "converted", valid_until: null, subtotal: 10909090, discount_amount: 0, tax_amount: 1090910, total_amount: 12000000, notes: null, created_by: null, sent_at: "2026-02-15T00:00:00Z", accepted_at: "2026-02-18T00:00:00Z", converted_to_contract_id: "c3", created_at: "2026-02-12T00:00:00Z", updated_at: "2026-02-18T00:00:00Z" }],
  p4: [], p5: [],
}

const DUMMY_CONTRACTS: Record<string, Contract[]> = {
  p1: [{ id: "c1", contract_number: "C-2026-001", quote_id: "q1", partner_id: "p1", title: "ClassIn Board 납품 계약", status: "partner_signed", total_amount: 25000000, content_html: "<p>ClassIn Board 86인치 5대 납품 계약서입니다.</p>", notes: null, valid_from: "2026-03-10", valid_until: "2026-12-31", sign_token: "tok_demo_abc123", partner_signed_at: "2026-03-12T14:30:00Z", partner_signature_url: null, partner_signed_ip: "1.2.3.4", admin_signed_at: null, admin_signature_url: null, admin_signed_by: null, created_by: null, created_at: "2026-03-10T00:00:00Z", updated_at: "2026-03-12T00:00:00Z" }],
  p2: [], p3: [{ id: "c3", contract_number: "C-2026-003", quote_id: "q4", partner_id: "p3", title: "CB-75 납품 및 설치 계약", status: "completed", total_amount: 12000000, content_html: "<p>납품계약</p>", notes: null, valid_from: "2026-02-20", valid_until: "2026-12-31", sign_token: "tok_demo_ghi789", partner_signed_at: "2026-02-22T10:00:00Z", partner_signature_url: null, partner_signed_ip: "5.6.7.8", admin_signed_at: "2026-02-23T09:00:00Z", admin_signature_url: null, admin_signed_by: null, created_by: null, created_at: "2026-02-20T00:00:00Z", updated_at: "2026-02-23T00:00:00Z" }],
  p4: [], p5: [],
}

const DUMMY_RECEIPTS: Record<string, ReceiptType[]> = {
  p1: [], p2: [], p3: [],
  p4: [{ id: "r1", receipt_number: "R-2026-001", contract_id: null, partner_id: "p4", amount: 16363636, tax_amount: 1636364, total_amount: 18000000, payment_method: "bank_transfer", paid_at: "2026-02-25T00:00:00Z", cash_receipt_type: null, cash_receipt_id: null, notes: null, created_by: null, created_at: "2026-02-25T00:00:00Z", updated_at: "2026-02-25T00:00:00Z" }],
  p5: [],
}

// ── API helper ───────────────────────────────────────────────

function adminFetch(url: string, options?: RequestInit) {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("admin_password") ?? "" : ""
  return fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers } })
}

// ── 진행 바 ──────────────────────────────────────────────────

function PipelineProgress({ stage }: { stage: PipelineStage }) {
  if (stage === "cancelled") return (
    <span className="text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full">취소됨</span>
  )
  const idx = STAGE_ORDER.indexOf(stage)
  return (
    <div className="flex items-center gap-1">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className={`h-1.5 rounded-full flex-1 transition-colors ${
          i <= idx ? STAGE_MAP[s]?.dot ?? "bg-gray-300" : "bg-[#e8e8e4]"
        }`} />
      ))}
    </div>
  )
}

// ── 타임라인 탭 ──────────────────────────────────────────────

type TimelineEvent = { id: string; date: string; type: "quote" | "contract" | "receipt" | "install" | "note"; title: string; subtitle?: string; link?: string }

function buildTimeline(quotes: Quote[], contracts: Contract[], receipts: ReceiptType[], partner: Partner): TimelineEvent[] {
  const events: TimelineEvent[] = []
  quotes.forEach((q) => {
    events.push({ id: `q-${q.id}`, date: q.created_at, type: "quote", title: `견적서 작성 — ${q.quote_number}`, subtitle: q.title, link: `/partner/quote/${q.id}` })
    if (q.sent_at) events.push({ id: `qs-${q.id}`, date: q.sent_at, type: "quote", title: `견적서 발송 — ${q.quote_number}`, subtitle: `${q.total_amount.toLocaleString()}원` })
    if (q.accepted_at) events.push({ id: `qa-${q.id}`, date: q.accepted_at, type: "quote", title: `견적 수락 — ${q.quote_number}`, subtitle: `${q.total_amount.toLocaleString()}원` })
  })
  contracts.forEach((c) => {
    events.push({ id: `c-${c.id}`, date: c.created_at, type: "contract", title: `계약서 생성 — ${c.contract_number}`, subtitle: c.title, link: `/partner/sign/${c.sign_token}` })
    if (c.partner_signed_at) events.push({ id: `cp-${c.id}`, date: c.partner_signed_at, type: "contract", title: `파트너 서명 완료 — ${c.contract_number}` })
    if (c.admin_signed_at) events.push({ id: `ca-${c.id}`, date: c.admin_signed_at, type: "contract", title: `어드민 서명 완료 — ${c.contract_number}`, subtitle: "계약 체결 완료" })
  })
  receipts.forEach((r) => {
    if (r.paid_at) events.push({ id: `r-${r.id}`, date: r.paid_at, type: "receipt", title: `영수증 발행 — ${r.receipt_number}`, subtitle: `${r.total_amount.toLocaleString()}원 (${PAYMENT_LABEL[r.payment_method as PaymentMethod] ?? r.payment_method})` })
  })
  if (partner.installation_date) {
    events.push({ id: "install", date: partner.installation_date + "T00:00:00Z", type: "install", title: "설치 예정일", subtitle: partner.installation_address ?? undefined })
  }
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

const TYPE_ICON: Record<TimelineEvent["type"], React.ReactNode> = {
  quote:    <ClipboardList className="w-3.5 h-3.5" />,
  contract: <ScrollText className="w-3.5 h-3.5" />,
  receipt:  <Receipt className="w-3.5 h-3.5" />,
  install:  <Package className="w-3.5 h-3.5" />,
  note:     <StickyNote className="w-3.5 h-3.5" />,
}
const TYPE_COLOR: Record<TimelineEvent["type"], string> = {
  quote: "bg-blue-50 text-blue-500", contract: "bg-purple-50 text-purple-500",
  receipt: "bg-green-50 text-green-600", install: "bg-yellow-50 text-yellow-600", note: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}

function TimelineTab({ partner, quotes, contracts, receipts }: { partner: Partner; quotes: Quote[]; contracts: Contract[]; receipts: ReceiptType[] }) {
  const events = buildTimeline(quotes, contracts, receipts, partner)
  if (events.length === 0) return <div className="py-12 text-center text-sm text-[#1a1a1a]/40">아직 활동 내역이 없습니다</div>
  return (
    <div className="space-y-3">
      {events.map((ev) => (
        <div key={ev.id} className="flex gap-3">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${TYPE_COLOR[ev.type]}`}>
            {TYPE_ICON[ev.type]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-[#1a1a1a] leading-snug">{ev.title}</p>
              {ev.link && (
                <Link href={ev.link} target="_blank" className="shrink-0 text-[#1a1a1a]/30 hover:text-[#1a1a1a]">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
            {ev.subtitle && <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{ev.subtitle}</p>}
            <p className="text-xs text-[#1a1a1a]/30 mt-0.5">{new Date(ev.date).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 문서 탭 ──────────────────────────────────────────────────

function DocsTab({ partner, quotes, contracts, receipts, onRefresh }: { partner: Partner; quotes: Quote[]; contracts: Contract[]; receipts: ReceiptType[]; onRefresh: () => void }) {
  const [converting, setConverting] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleConvert(id: string) {
    if (DUMMY_MODE) { alert("더미 모드: 계약 전환 시뮬레이션"); return }
    if (!confirm("견적서를 계약서로 전환하시겠습니까?")) return
    setConverting(id)
    const res = await adminFetch(`/api/admin/quotes/${id}/convert`, { method: "POST", body: JSON.stringify({}) })
    if (res.ok) { alert("계약서가 생성되었습니다."); onRefresh() }
    else { const err = await res.json(); alert(err.error ?? "전환 실패") }
    setConverting(null)
  }

  function copySignLink(contract: Contract) {
    const url = `${window.location.origin}/partner/sign/${contract.sign_token}`
    navigator.clipboard.writeText(url)
    setCopied(contract.id); setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-5">
      {/* 견적서 */}
      {quotes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#1a1a1a]/30 uppercase tracking-wider mb-2">견적서</p>
          <div className="space-y-2">
            {quotes.map((q) => (
              <div key={q.id} className="border border-[#e8e8e4] rounded-xl p-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-[#1a1a1a]/40">{q.quote_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${QUOTE_STATUS_COLOR[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
                    </div>
                    <p className="text-sm font-medium text-[#1a1a1a] mt-0.5 truncate">{q.title}</p>
                    <p className="text-sm font-semibold mt-0.5">{q.total_amount.toLocaleString()}원</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Link href={`/partner/quote/${q.id}`} target="_blank" className="inline-flex items-center gap-1 h-6 px-2 text-xs text-[#1a1a1a]/50 hover:text-[#1a1a1a] rounded hover:bg-[#f0f0ec]">
                      <ExternalLink className="w-3 h-3" />미리보기
                    </Link>
                    {!["converted","rejected","expired"].includes(q.status) && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-purple-600"
                        onClick={() => handleConvert(q.id)} disabled={converting === q.id}>
                        <FileSignature className="w-3 h-3 mr-1" />{converting === q.id ? "처리중" : "계약전환"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 계약서 */}
      {contracts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#1a1a1a]/30 uppercase tracking-wider mb-2">계약서</p>
          <div className="space-y-2">
            {contracts.map((c) => (
              <div key={c.id} className="border border-[#e8e8e4] rounded-xl p-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-[#1a1a1a]/40">{c.contract_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONTRACT_STATUS_COLOR[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
                    </div>
                    <p className="text-sm font-medium text-[#1a1a1a] mt-0.5 truncate">{c.title}</p>
                    <p className="text-sm font-semibold mt-0.5">{c.total_amount.toLocaleString()}원</p>
                    <div className="flex gap-3 mt-1">
                      <span className={`text-xs ${c.partner_signed_at ? "text-green-600" : "text-[#1a1a1a]/30"}`}>파트너 {c.partner_signed_at ? "✓" : "미서명"}</span>
                      <span className={`text-xs ${c.admin_signed_at ? "text-green-600" : "text-[#1a1a1a]/30"}`}>어드민 {c.admin_signed_at ? "✓" : "미서명"}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Link href={`/partner/sign/${c.sign_token}`} target="_blank" className="inline-flex items-center gap-1 h-6 px-2 text-xs text-[#1a1a1a]/50 hover:text-[#1a1a1a] rounded hover:bg-[#f0f0ec]">
                      <ExternalLink className="w-3 h-3" />열기
                    </Link>
                    {c.sign_token && (
                      <button onClick={() => copySignLink(c)} className="inline-flex items-center gap-1 h-6 px-2 text-xs text-[#1a1a1a]/50 hover:text-[#1a1a1a] rounded hover:bg-[#f0f0ec]">
                        {copied === c.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copied === c.id ? "복사됨" : "링크 복사"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 영수증 */}
      {receipts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#1a1a1a]/30 uppercase tracking-wider mb-2">영수증</p>
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="border border-[#e8e8e4] rounded-xl p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs text-[#1a1a1a]/40">{r.receipt_number}</span>
                    <p className="text-sm font-semibold mt-0.5">{r.total_amount.toLocaleString()}원</p>
                    <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{PAYMENT_LABEL[r.payment_method as PaymentMethod]} · {r.paid_at ? new Date(r.paid_at).toLocaleDateString("ko") : "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quotes.length === 0 && contracts.length === 0 && receipts.length === 0 && (
        <div className="py-12 text-center text-sm text-[#1a1a1a]/40">아직 문서가 없습니다</div>
      )}
    </div>
  )
}

// ── 설치 탭 ──────────────────────────────────────────────────

function InstallTab({ partner, onUpdated }: { partner: Partner; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    installation_date: partner.installation_date ?? "",
    installation_address: partner.installation_address ?? "",
    installer_name: partner.installer_name ?? "",
    deal_amount: partner.deal_amount ?? 0,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (DUMMY_MODE) { setEditing(false); return }
    setSaving(true)
    const res = await adminFetch(`/api/admin/partners/${partner.id}`, { method: "PUT", body: JSON.stringify(form) })
    if (res.ok) { setEditing(false); onUpdated() }
    setSaving(false)
  }

  if (!editing) return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => setEditing(true)}>편집</Button>
      </div>
      <dl className="space-y-4">
        <div className="flex gap-3">
          <dt className="flex items-center gap-1.5 text-xs text-[#1a1a1a]/40 w-24 shrink-0"><Calendar className="w-3.5 h-3.5" />설치 예정일</dt>
          <dd className="text-sm text-[#1a1a1a]">{partner.installation_date ?? <span className="text-[#1a1a1a]/30">미정</span>}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="flex items-center gap-1.5 text-xs text-[#1a1a1a]/40 w-24 shrink-0"><MapPin className="w-3.5 h-3.5" />설치 주소</dt>
          <dd className="text-sm text-[#1a1a1a]">{partner.installation_address ?? <span className="text-[#1a1a1a]/30">—</span>}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="flex items-center gap-1.5 text-xs text-[#1a1a1a]/40 w-24 shrink-0"><User className="w-3.5 h-3.5" />설치 담당자</dt>
          <dd className="text-sm text-[#1a1a1a]">{partner.installer_name ?? <span className="text-[#1a1a1a]/30">—</span>}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="flex items-center gap-1.5 text-xs text-[#1a1a1a]/40 w-24 shrink-0"><Receipt className="w-3.5 h-3.5" />계약 금액</dt>
          <dd className="text-sm font-semibold text-[#1a1a1a]">{partner.deal_amount ? `${partner.deal_amount.toLocaleString()}원` : <span className="text-[#1a1a1a]/30 font-normal">—</span>}</dd>
        </div>
      </dl>
    </div>
  )

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">설치 예정일</label>
        <input type="date" value={form.installation_date} onChange={e => setForm({ ...form, installation_date: e.target.value })}
          className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
      </div>
      <div>
        <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">설치 주소</label>
        <input value={form.installation_address} onChange={e => setForm({ ...form, installation_address: e.target.value })}
          className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
      </div>
      <div>
        <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">설치 담당자</label>
        <input value={form.installer_name} onChange={e => setForm({ ...form, installer_name: e.target.value })}
          className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
      </div>
      <div>
        <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">계약 금액</label>
        <input type="number" min={0} value={form.deal_amount || ""} onChange={e => setForm({ ...form, deal_amount: +e.target.value })}
          className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] text-right" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>취소</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
      </div>
    </form>
  )
}

// ── 기본정보 탭 ──────────────────────────────────────────────

function InfoTab({ partner, onUpdated }: { partner: Partner; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: partner.name, contact_name: partner.contact_name ?? "",
    email: partner.email ?? "", phone: partner.phone ?? "",
    address: partner.address ?? "", notes: partner.notes ?? "",
  })
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (DUMMY_MODE) { setEditing(false); return }
    setSaving(true)
    const res = await adminFetch(`/api/admin/partners/${partner.id}`, { method: "PUT", body: JSON.stringify(form) })
    if (res.ok) { setEditing(false); onUpdated() }
    setSaving(false)
  }

  if (!editing) return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => setEditing(true)}>편집</Button>
      </div>
      <dl className="space-y-3 text-sm">
        {([["기관명", partner.name], ["담당자", partner.contact_name], ["이메일", partner.email], ["전화번호", partner.phone], ["주소", partner.address], ["메모", partner.notes]] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="text-xs text-[#1a1a1a]/40 w-20 shrink-0 pt-0.5">{label}</dt>
            <dd className="text-[#1a1a1a] break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )

  return (
    <form onSubmit={handleSave} className="space-y-3">
      {([{ label: "기관명", key: "name", required: true }, { label: "담당자", key: "contact_name" }, { label: "이메일", key: "email" }, { label: "전화번호", key: "phone" }, { label: "주소", key: "address" }] as { label: string; key: keyof typeof form; required?: boolean }[]).map(({ label, key, required }) => (
        <div key={key}>
          <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">{label}{required && " *"}</label>
          <input required={required} value={form[key] as string} onChange={e => setForm({ ...form, [key]: e.target.value })}
            className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
        </div>
      ))}
      <div>
        <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
          className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>취소</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>
      </div>
    </form>
  )
}

// ── 견적서 작성 모달 ─────────────────────────────────────────

type QuoteItemDraft = { product_name: string; description: string; quantity: number; unit_price: number; discount_rate: number; amount: number }
const emptyItem = (): QuoteItemDraft => ({ product_name: "", description: "", quantity: 1, unit_price: 0, discount_rate: 0, amount: 0 })
function calcItem(item: QuoteItemDraft) { return Math.round(item.quantity * item.unit_price * (1 - item.discount_rate / 100)) }

function NewQuoteModal({ partner, onClose, onSaved }: { partner: Partner; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<QuoteItemDraft[]>([emptyItem()])
  const [form, setForm] = useState({ title: "", valid_until: "", notes: "" })
  const [saving, setSaving] = useState(false)

  function updateItem(idx: number, field: keyof QuoteItemDraft, value: string | number) {
    setItems((prev: QuoteItemDraft[]) => {
      const next = [...prev]; next[idx] = { ...next[idx], [field]: value }
      next[idx].amount = calcItem(next[idx]); return next
    })
  }
  const subtotal = items.reduce((s: number, i: QuoteItemDraft) => s + i.amount, 0)
  const taxAmount = Math.round(subtotal * 0.1)
  const totalAmount = subtotal + taxAmount

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (DUMMY_MODE) { alert("더미 모드: 견적서 저장 시뮬레이션"); onClose(); return }
    setSaving(true)
    const res = await adminFetch("/api/admin/quotes", {
      method: "POST",
      body: JSON.stringify({ ...form, partner_id: partner.id, status: "draft", subtotal, tax_amount: taxAmount, total_amount: totalAmount, discount_amount: 0, items: items.map((item, idx) => ({ ...item, sort_order: idx })) }),
    })
    if (res.ok) { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
          <div><h2 className="text-base font-semibold">견적서 작성</h2><p className="text-xs text-[#1a1a1a]/50 mt-0.5">{partner.name}</p></div>
          <button onClick={onClose} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleCreate} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">제목 *</label>
              <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: ClassIn Board 10대 설치 견적"
                className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">유효기간</label>
              <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })}
                className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#1a1a1a]/60">품목</label>
              <button type="button" onClick={() => setItems([...items, emptyItem()])} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                <Plus className="w-3 h-3" />추가
              </button>
            </div>
            <div className="border border-[#e8e8e4] rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[#f7f7f5]"><tr>{["품목명","설명","수량","단가","할인%","금액",""].map(h => <th key={h} className="px-2 py-2 text-left font-medium text-[#1a1a1a]/50">{h}</th>)}</tr></thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-[#f0f0ec]">
                      <td className="px-2 py-1.5"><input value={item.product_name} onChange={e => updateItem(idx, "product_name", e.target.value)} placeholder="ClassIn Board" className="w-24 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none" /></td>
                      <td className="px-2 py-1.5"><input value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="86인치" className="w-20 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none" /></td>
                      <td className="px-2 py-1.5"><input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", +e.target.value)} className="w-12 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" /></td>
                      <td className="px-2 py-1.5"><input type="number" min={0} value={item.unit_price} onChange={e => updateItem(idx, "unit_price", +e.target.value)} className="w-24 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" /></td>
                      <td className="px-2 py-1.5"><input type="number" min={0} max={100} value={item.discount_rate} onChange={e => updateItem(idx, "discount_rate", +e.target.value)} className="w-12 border border-[#e8e8e4] rounded px-2 py-1 focus:outline-none text-right" /></td>
                      <td className="px-2 py-1.5 text-right font-medium">{item.amount.toLocaleString()}</td>
                      <td className="px-2 py-1.5">{items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-[#1a1a1a]/30 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="text-xs space-y-1 text-right">
                <div className="text-[#1a1a1a]/50">공급가액 <span className="font-medium text-[#1a1a1a]">{subtotal.toLocaleString()}원</span></div>
                <div className="text-[#1a1a1a]/50">부가세(10%) <span className="font-medium text-[#1a1a1a]">{taxAmount.toLocaleString()}원</span></div>
                <div className="text-sm font-bold text-[#1a1a1a]">합계 {totalAmount.toLocaleString()}원</div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving}>{saving ? "저장 중..." : "견적서 저장"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 상세 패널 ────────────────────────────────────────────────

function DetailPanel({ partner, onClose, onRefresh }: { partner: Partner; onClose: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<PanelTab>("timeline")
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [receipts, setReceipts] = useState<ReceiptType[]>([])
  const [showNewQuote, setShowNewQuote] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const load = useCallback(async () => {
    if (DUMMY_MODE) {
      setQuotes(DUMMY_QUOTES[partner.id] ?? [])
      setContracts(DUMMY_CONTRACTS[partner.id] ?? [])
      setReceipts(DUMMY_RECEIPTS[partner.id] ?? [])
      return
    }
    const [qRes, cRes, rRes] = await Promise.all([
      adminFetch(`/api/admin/quotes?partner_id=${partner.id}`),
      adminFetch(`/api/admin/contracts?partner_id=${partner.id}`),
      adminFetch(`/api/admin/receipts?partner_id=${partner.id}`),
    ])
    if (qRes.ok) setQuotes((await qRes.json()).quotes ?? [])
    if (cRes.ok) setContracts((await cRes.json()).contracts ?? [])
    if (rRes.ok) setReceipts((await rRes.json()).receipts ?? [])
  }, [partner.id])

  useEffect(() => { load() }, [load])

  const cta = NEXT_STAGE_CTA[partner.pipeline_stage]

  async function handleAdvance() {
    if (!cta) return
    if (cta.next === "quoting") { setShowNewQuote(true); return }
    if (DUMMY_MODE) { alert(`더미 모드: 단계 → ${STAGE_MAP[cta.next].label}`); return }
    if (!confirm(`단계를 "${STAGE_MAP[cta.next].label}"(으)로 변경하시겠습니까?`)) return
    setAdvancing(true)
    const res = await adminFetch(`/api/admin/partners/${partner.id}`, { method: "PUT", body: JSON.stringify({ pipeline_stage: cta.next }) })
    if (res.ok) onRefresh()
    setAdvancing(false)
  }

  const TABS: { id: PanelTab; label: string }[] = [
    { id: "timeline", label: "타임라인" },
    { id: "docs", label: "문서" },
    { id: "install", label: "설치" },
    { id: "info", label: "기본정보" },
  ]

  const stage = STAGE_MAP[partner.pipeline_stage]

  return (
    <div className="flex-1 border-l border-[#e8e8e4] bg-white flex flex-col sticky top-0 h-screen overflow-hidden">
      {/* 패널 헤더 */}
      <div className="px-6 pt-5 border-b border-[#e8e8e4] shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#f0f0ec] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-[#1a1a1a]/50" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#1a1a1a] truncate">{partner.name}</h2>
              {partner.contact_name && <p className="text-xs text-[#1a1a1a]/40">{partner.contact_name}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-[#1a1a1a]/30 hover:text-[#1a1a1a] shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {/* 단계 + 진행바 */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${stage.color}`}>{stage.label}</span>
            {partner.deal_amount && <span className="text-sm font-bold text-[#1a1a1a]">{partner.deal_amount.toLocaleString()}원</span>}
          </div>
          <PipelineProgress stage={partner.pipeline_stage} />
        </div>

        {/* 탭 */}
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px ${tab === t.id ? "border-[#1a1a1a] text-[#1a1a1a]" : "border-transparent text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 패널 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "timeline" && <TimelineTab partner={partner} quotes={quotes} contracts={contracts} receipts={receipts} />}
        {tab === "docs" && <DocsTab partner={partner} quotes={quotes} contracts={contracts} receipts={receipts} onRefresh={load} />}
        {tab === "install" && <InstallTab key={partner.id} partner={partner} onUpdated={onRefresh} />}
        {tab === "info" && <InfoTab key={partner.id} partner={partner} onUpdated={onRefresh} />}
      </div>

      {/* 다음 단계 CTA */}
      {cta && partner.pipeline_stage !== "cancelled" && (
        <div className="px-6 py-4 border-t border-[#e8e8e4] shrink-0 bg-white">
          <button onClick={handleAdvance} disabled={advancing}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#1a1a1a] text-white text-sm font-medium hover:bg-[#111] transition-colors disabled:opacity-50">
            <ArrowRight className="w-4 h-4" />
            {advancing ? "처리 중..." : cta.label}
          </button>
        </div>
      )}
      {partner.pipeline_stage === "completed" && (
        <div className="px-6 py-4 border-t border-[#e8e8e4] shrink-0">
          <div className="flex items-center justify-center gap-2 py-2.5 text-emerald-600 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />설치 완료
          </div>
        </div>
      )}

      {showNewQuote && <NewQuoteModal partner={partner} onClose={() => setShowNewQuote(false)} onSaved={() => { load(); onRefresh() }} />}
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────

const EMPTY_FORM = { name: "", contact_name: "", email: "", phone: "", address: "", notes: "", pipeline_stage: "prospect" as PipelineStage }

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState<PipelineStage | "all">("all")
  const [selected, setSelected] = useState<Partner | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    if (DUMMY_MODE) { setPartners(DUMMY_PARTNERS); setLoading(false); return }
    const res = await adminFetch("/api/admin/partners")
    if (res.ok) setPartners((await res.json()).partners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = stageFilter === "all" ? partners : partners.filter(p => p.pipeline_stage === stageFilter)

  const stageCounts = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s.id] = partners.filter(p => p.pipeline_stage === s.id).length
    return acc
  }, {} as Record<PipelineStage, number>)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (DUMMY_MODE) { setShowForm(false); setForm(EMPTY_FORM); return }
    setSaving(true)
    const res = await adminFetch("/api/admin/partners", { method: "POST", body: JSON.stringify(form) })
    if (res.ok) { setShowForm(false); setForm(EMPTY_FORM); load() }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("고객사를 삭제하시겠습니까?")) return
    if (DUMMY_MODE) { if (selected?.id === id) setSelected(null); return }
    await adminFetch(`/api/admin/partners/${id}`, { method: "DELETE" })
    if (selected?.id === id) setSelected(null)
    load()
  }

  // selected 파트너가 목록 새로고침 후 반영되도록 sync
  useEffect(() => {
    if (selected) {
      const updated = partners.find(p => p.id === selected.id)
      if (updated) setSelected(updated)
    }
  }, [partners])

  return (
    <div className="flex min-h-screen">
      {/* 목록 */}
      <div className={`flex flex-col transition-all duration-200 ${selected ? "w-[400px] shrink-0" : "flex-1"}`}>
        <div className="p-6 space-y-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[#1a1a1a]">고객사 관리</h1>
              <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{partners.length}개 고객사</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="w-4 h-4 mr-1" />고객사 추가
              </Button>
            </div>
          </div>

          {/* 단계 필터 */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setStageFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${stageFilter === "all" ? "bg-[#1a1a1a] text-white" : "bg-[#f0f0ec] text-[#1a1a1a]/60 hover:bg-[#e8e8e4]"}`}>
              전체 {partners.length}
            </button>
            {PIPELINE_STAGES.map(s => stageCounts[s.id] > 0 && (
              <button key={s.id} onClick={() => setStageFilter(s.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${stageFilter === s.id ? "bg-[#1a1a1a] text-white" : `${s.color} hover:opacity-80`}`}>
                {s.label} {stageCounts[s.id]}
              </button>
            ))}
          </div>

          {/* 목록 */}
          <div className="space-y-2">
            {loading ? (
              <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-[#1a1a1a]/40">해당 단계의 고객사가 없습니다</div>
            ) : (
              filtered.map(p => {
                const stage = STAGE_MAP[p.pipeline_stage]
                const isSelected = selected?.id === p.id
                return (
                  <div key={p.id}
                    className={`border rounded-xl p-4 cursor-pointer transition-all ${isSelected ? "border-[#1a1a1a] bg-[#fafafa]" : "border-[#e8e8e4] bg-white hover:border-[#ccc] hover:bg-[#fafafa]"}`}
                    onClick={() => setSelected(p)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
                            {stage.label}
                          </span>
                          {p.installation_date && p.pipeline_stage === "installing" && (
                            <span className="text-xs text-[#1a1a1a]/40 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{p.installation_date}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-[#1a1a1a] mt-1.5">{p.name}</p>
                        {p.contact_name && <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{p.contact_name}{p.phone && ` · ${p.phone}`}</p>}
                        {!selected && p.address && <p className="text-xs text-[#1a1a1a]/40 mt-0.5 truncate">{p.address}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {p.deal_amount && <p className="text-sm font-bold text-[#1a1a1a]">{(p.deal_amount / 10000).toFixed(0)}만원</p>}
                        <button onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                          className="mt-2 text-[#1a1a1a]/20 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {!selected && <div className="mt-3"><PipelineProgress stage={p.pipeline_stage} /></div>}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* 상세 패널 */}
      {selected && (
        <DetailPanel
          key={selected.id}
          partner={selected}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}

      {/* 고객사 추가 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <h2 className="text-base font-semibold">고객사 추가</h2>
              <button onClick={() => setShowForm(false)} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">기관명 *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="예: 삼성초등학교"
                  className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">담당자</label>
                  <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">전화번호</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">이메일</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">주소</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
              </div>
              <div>
                <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">초기 단계</label>
                <select value={form.pipeline_stage} onChange={e => setForm({ ...form, pipeline_stage: e.target.value as PipelineStage })}
                  className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]">
                  {PIPELINE_STAGES.filter(s => !["completed","cancelled"].includes(s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
                <Button type="submit" disabled={saving}>{saving ? "저장 중..." : "추가"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
