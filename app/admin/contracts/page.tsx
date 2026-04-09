"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { RefreshCw, Trash2, X, PenLine, Copy, Check, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Contract, ContractStatus, Partner } from "@/lib/supabase/database.types"

const DUMMY_MODE = false

const DUMMY_PARTNERS_MAP: Record<string, string> = {
  p1: "삼성초등학교", p2: "판교중학교", p3: "해운대여자고등학교", p4: "서초과학기술원", p5: "강동초등학교",
}
const DUMMY_CONTRACTS_LIST = [
  { id: "c1", contract_number: "C-2026-001", quote_id: "q1", partner_id: "p1", title: "ClassIn Board 납품 계약",    status: "partner_signed", total_amount: 25000000, content_html: "<h2>ClassIn Board 납품 계약서</h2><p>본 계약은 삼성초등학교(이하 '갑')와 ClassIn(이하 '을') 사이에 체결된 납품 계약입니다.</p>", notes: null,                  valid_from: "2026-03-10", valid_until: "2026-12-31", sign_token: "tok_demo_abc123", partner_signed_at: "2026-03-12T14:30:00Z", partner_signature_url: null, partner_signed_ip: "1.2.3.4", admin_signed_at: null,               admin_signature_url: null, admin_signed_by: null, created_by: null, created_at: "2026-03-10T00:00:00Z", updated_at: "2026-03-12T00:00:00Z" },
  { id: "c3", contract_number: "C-2026-002", quote_id: "q3", partner_id: "p3", title: "CB-75 납품 및 설치 계약",   status: "completed",      total_amount: 12000000, content_html: "<p>CB-75 3대 납품 계약서</p>", notes: null, valid_from: "2026-02-20", valid_until: "2026-12-31", sign_token: "tok_demo_ghi789", partner_signed_at: "2026-02-22T10:00:00Z", partner_signature_url: null, partner_signed_ip: "5.6.7.8",  admin_signed_at: "2026-02-23T09:00:00Z", admin_signature_url: null, admin_signed_by: null, created_by: null, created_at: "2026-02-20T00:00:00Z", updated_at: "2026-02-23T00:00:00Z" },
  { id: "c2", contract_number: "C-2026-003", quote_id: null, partner_id: "p4", title: "서초과기원 유지보수 계약",   status: "completed",      total_amount: 18000000, content_html: null,                                                                                                                                                                                    notes: "연간 유지보수", valid_from: "2026-01-01", valid_until: "2026-12-31", sign_token: "tok_demo_def456", partner_signed_at: "2026-01-20T10:00:00Z", partner_signature_url: null, partner_signed_ip: "9.9.9.9",  admin_signed_at: "2026-01-21T09:00:00Z", admin_signature_url: null, admin_signed_by: null, created_by: null, created_at: "2026-01-18T00:00:00Z", updated_at: "2026-01-21T00:00:00Z" },
] satisfies Array<Omit<Contract, "version">>

const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "초안", sent: "발송됨", partner_signed: "파트너서명완료",
  admin_signed: "어드민서명완료", completed: "완료", cancelled: "취소",
}
const STATUS_COLOR: Record<ContractStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-[#ECFDF5] text-[#084734]",
  partner_signed: "bg-yellow-50 text-yellow-700",
  admin_signed: "bg-[#D1FAE5] text-[#065c41]",
  completed: "bg-[#D1FAE5] text-[#065c41] font-semibold",
  cancelled: "bg-[#FEF3EE] text-[#B85C33]",
}

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawing.current = true
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = "#1a1a1a"
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function stop() { drawing.current = false }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
  }

  function save() {
    onSave(canvasRef.current!.toDataURL("image/png"))
  }

  return (
    <div className="space-y-2">
      <div className="border border-dashed border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={480}
          height={160}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
      </div>
      <p className="text-xs text-[#1a1a1a]/40 text-center">서명 후 아래 박스에 드래그하세요</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>다시 그리기</Button>
        <Button type="button" size="sm" onClick={save}>서명 적용</Button>
      </div>
    </div>
  )
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Contract | null>(null)
  const [showSign, setShowSign] = useState(false)
  const [signing, setSigning] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (DUMMY_MODE) {
      setContracts(DUMMY_CONTRACTS_LIST.map((contract) => ({ ...contract, version: 1 })))
      setLoading(false)
      return
    }
    setLoading(true)
    const [cRes, pRes] = await Promise.all([
      adminFetch("/api/admin/contracts"),
      adminFetch("/api/admin/partners"),
    ])
    if (cRes.ok) setContracts((await cRes.json()).contracts ?? [])
    if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true

    const initialize = async () => {
      if (DUMMY_MODE) {
        setContracts(DUMMY_CONTRACTS_LIST.map((contract) => ({ ...contract, version: 1 })))
        setLoading(false)
        return
      }

      setLoading(true)
      const [cRes, pRes] = await Promise.all([
        adminFetch("/api/admin/contracts"),
        adminFetch("/api/admin/partners"),
      ])
      if (!alive) return
      if (cRes.ok) setContracts((await cRes.json()).contracts ?? [])
      if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
      if (alive) setLoading(false)
    }

    void initialize()

    return () => {
      alive = false
    }
  }, [])

  const partnerName = (id: string) => DUMMY_MODE ? (DUMMY_PARTNERS_MAP[id] ?? id) : (partners.find((p) => p.id === id)?.name ?? id)

  function copySignLink(contract: Contract) {
    const url = `${window.location.origin}/partner/sign/${contract.sign_token}`
    navigator.clipboard.writeText(url)
    setCopied(contract.id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleSend(contract: Contract) {
    const res = await adminFetch(`/api/admin/contracts/${contract.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "sent" }),
    })
    if (res.ok) load()
  }

  async function handleAdminSign(dataUrl: string) {
    if (!selected) return
    setSigning(true)
    const res = await adminFetch(`/api/admin/contracts/${selected.id}/sign`, {
      method: "POST",
      body: JSON.stringify({ signature_data: dataUrl, admin_user_id: "" }),
    })
    if (res.ok) {
      setShowSign(false)
      setSelected(null)
      load()
    } else {
      const err = await res.json()
      alert(err.error ?? "서명 실패")
    }
    setSigning(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("계약서를 삭제하시겠습니까?")) return
    await adminFetch(`/api/admin/contracts/${id}`, { method: "DELETE" })
    load()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">계약서</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{contracts.length}건</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : contracts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">계약서가 없습니다 — 견적서에서 전환하세요</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["번호", "파트너사", "제목", "총액", "상태", "파트너 서명", "어드민 서명", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{c.contract_number}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(c.partner_id)}</td>
                  <td className="px-4 py-3 font-medium text-[#1a1a1a]">{c.title}</td>
                  <td className="px-4 py-3 font-medium">{c.total_amount.toLocaleString()}원</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.partner_signed_at
                      ? <span className="text-green-600">✓ {new Date(c.partner_signed_at).toLocaleDateString("ko")}</span>
                      : <span className="text-[#1a1a1a]/30">대기중</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.admin_signed_at
                      ? <span className="text-green-600">✓ {new Date(c.admin_signed_at).toLocaleDateString("ko")}</span>
                      : <span className="text-[#1a1a1a]/30">대기중</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {c.status === "draft" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#084734]" onClick={() => handleSend(c)}>
                          <Send className="w-3.5 h-3.5 mr-1" />발송
                        </Button>
                      )}
                      {["sent", "draft"].includes(c.status) && c.sign_token && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => copySignLink(c)}>
                          {copied === c.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      {c.status === "partner_signed" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#615D59]"
                          onClick={() => { setSelected(c); setShowSign(true) }}>
                          <PenLine className="w-3.5 h-3.5 mr-1" />서명
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#B85C33]" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 어드민 서명 모달 */}
      {showSign && selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <div>
                <h2 className="text-base font-semibold">어드민 서명</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{selected.contract_number} — {selected.title}</p>
              </div>
              <button onClick={() => { setShowSign(false); setSelected(null) }} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {signing ? (
                <div className="py-8 text-center text-sm text-[#1a1a1a]/50">서명 처리 중...</div>
              ) : (
                <SignatureCanvas onSave={handleAdminSign} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
